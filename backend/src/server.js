import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { assertRequiredEnv, env, featureStatus } from './config/env.js';
import { ensureIndexes } from './config/indexes.js';
import { recoverOrphanedJobs } from './jobs/analyzeReport.js';

async function start() {
  // In development we boot even without a database so the UI is workable while
  // you are still setting up Atlas. Anything touching a model will fail loudly;
  // in production a missing/unreachable database is fatal at startup instead.
  if (env.nodeEnv === 'production') {
    assertRequiredEnv();
    await connectDB();
    await ensureIndexes();
    await recoverOrphanedJobs();
  } else {
    try {
      assertRequiredEnv();
      await connectDB();
      await ensureIndexes({ verbose: true });
      await recoverOrphanedJobs();
    } catch (err) {
      console.warn(`[server] starting WITHOUT a database: ${err.message}`);
      console.warn('[server] routes that read or write data will fail until this is fixed.');
    }
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port} (${env.nodeEnv})`);

    const features = featureStatus();
    const off = Object.entries(features)
      .filter(([, on]) => !on)
      .map(([name]) => name);
    if (off.length) {
      console.warn(`[server] not configured (features disabled): ${off.join(', ')}`);
    }
  });

  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Don't hang forever if a connection refuses to close.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('[server] failed to start:', err.message);
  process.exit(1);
});
