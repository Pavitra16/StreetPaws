/**
 * Creates or resets the admin account.
 *
 *   npm run create-admin
 *
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD from .env, or takes them as arguments:
 *   node src/scripts/createAdmin.js you@example.com 'your-password'
 *
 * There is deliberately no "first user becomes admin" rule and no admin signup
 * endpoint — the only way to mint an admin is to have shell access to the server.
 */
import { connectDB, disconnectDB } from '../config/db.js';
import { assertRequiredEnv, env } from '../config/env.js';
import { User } from '../models/index.js';
import { hashPassword, generateTempPassword } from '../services/authService.js';

async function main() {
  assertRequiredEnv();
  await connectDB();

  const email = (process.argv[2] ?? env.auth.adminEmail ?? '').trim().toLowerCase();
  let password = process.argv[3] ?? env.auth.adminPassword;

  if (!email) {
    console.error('No admin email. Set ADMIN_EMAIL in .env or pass it as an argument.');
    process.exit(1);
  }

  let generated = false;
  if (!password) {
    password = generateTempPassword();
    generated = true;
  }

  if (password.length < 10) {
    console.error('Admin password must be at least 10 characters.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const existing = await User.findOne({ email });

  if (existing) {
    existing.role = 'admin';
    existing.passwordHash = passwordHash;
    existing.active = true;
    existing.mustChangePassword = generated;
    await existing.save();
    console.log(`[admin] reset password for existing account: ${email}`);
  } else {
    await User.create({
      name: 'Administrator',
      email,
      role: 'admin',
      passwordHash,
      mustChangePassword: generated,
    });
    console.log(`[admin] created: ${email}`);
  }

  if (generated) {
    console.log(`[admin] generated password: ${password}`);
    console.log('[admin] you will be asked to change it on first sign-in.');
  } else {
    console.log('[admin] using the password from ADMIN_PASSWORD / argument.');
  }

  console.log('[admin] sign in at /login');
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('[admin] failed:', err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
