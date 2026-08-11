/**
 * Seeds login accounts and the data behind every signed-in screen.
 *
 *   npm run seed:accounts          # accounts + demo data (safe to re-run)
 *   npm run seed:accounts -- --reset-passwords
 *
 * Split from seed.js because that one builds the *public* world (reports,
 * organisations, listings) while this builds the *authenticated* one: users,
 * pending applications for the admin queue, adoption enquiries for the rescuer
 * inbox, and paid donations so the fund page is not all zeroes.
 *
 * Run `npm run seed` first — this attaches accounts to the organisations it creates.
 */
import { connectDB, disconnectDB } from '../config/db.js';
import { assertRequiredEnv, env } from '../config/env.js';
import {
  User,
  Organization,
  AdoptionListing,
  AdoptionApplication,
  Donation,
  Disbursement,
  Alert,
  DogReport,
} from '../models/index.js';
import { hashPassword } from '../services/authService.js';
import { toPoint } from '../utils/geo.js';

/** One password for every demo account. Development convenience, never production. */
const DEMO_PASSWORD = 'streetpaws2026';

// Applications sitting in the admin queue so the review screen has something to do.
const PENDING_APPLICATIONS = [
  {
    name: 'Sanjeevani Animal Trust',
    kind: 'ngo',
    description: 'Community shelter running an ambulance and a small clinic in East Delhi.',
    lat: 28.628, lng: 77.295, city: 'New Delhi', state: 'Delhi',
    phone: '+919845612300', email: 'sanjeevani@example.org',
    serviceRadiusKm: 14, capacity: 18,
    specializations: ['injury', 'surgery', 'shelter', 'sterilization'],
    registrationNumber: 'S/DL/2016/8871', contactPersonName: 'Anil Verma', yearsActive: 9,
  },
  {
    name: 'Kavita Rao',
    kind: 'private_helper',
    description: 'I foster puppies at home and drive injured dogs to clinics on weekends.',
    lat: 28.549, lng: 77.201, city: 'New Delhi', state: 'Delhi',
    phone: '+919833344455', email: 'kavita.rao@example.com',
    serviceRadiusKm: 7, capacity: 3,
    specializations: ['puppies', 'transport'],
    contactPersonName: 'Kavita Rao', yearsActive: 2,
  },
];

const REJECTED_APPLICATION = {
  name: 'Quick Pet Supplies',
  kind: 'ngo',
  description: 'We sell pet food and accessories.',
  lat: 28.61, lng: 77.23, city: 'New Delhi', state: 'Delhi',
  phone: '+919800011122', email: 'quickpet@example.com',
  serviceRadiusKm: 10, capacity: 5,
  specializations: [],
  contactPersonName: 'Sales Team', yearsActive: 1,
};

const ADOPTION_ENQUIRIES = [
  {
    applicant: { name: 'Rohan Mehta', phone: '+919811122233', email: 'rohan.m@example.com' },
    city: 'New Delhi', homeType: 'independent_house', hasOutdoorSpace: true,
    hasOtherPets: true, otherPetsDetail: 'One older Indie, very relaxed.',
    householdAdults: 2, hasChildren: false,
    experience: 'Had dogs all my life, fostered two litters last year.',
    reason: 'We lost our older dog in March and the house is too quiet.',
    status: 'submitted',
  },
  {
    applicant: { name: 'Sneha Iyer', phone: '+919822233344', email: 'sneha.i@example.com' },
    city: 'Gurugram', homeType: 'apartment', hasOutdoorSpace: false,
    hasOtherPets: false, householdAdults: 3, hasChildren: true,
    experience: 'First-time adopter, but my parents kept dogs.',
    reason: 'My daughter has been asking for a rescue dog for two years.',
    status: 'reviewing',
  },
  {
    applicant: { name: 'Imran Sheikh', phone: '+919844455566' },
    city: 'New Delhi', homeType: 'apartment', hasOutdoorSpace: false,
    hasOtherPets: false, householdAdults: 1, hasChildren: false,
    reason: 'Work from home, plenty of time for a dog.',
    status: 'submitted',
  },
];

const DONATIONS = [
  { amountInr: 2500, donor: { name: 'Ananya K.', email: 'ananya@example.com' }, target: 'platform_fund', message: 'For the puppies under the car.' },
  { amountInr: 1000, donor: { name: 'Anonymous', anonymous: true }, target: 'platform_fund' },
  { amountInr: 5000, donor: { name: 'Vikram D.', email: 'vikram@example.com' }, target: 'platform_fund', message: 'Keep going.' },
  { amountInr: 500, donor: { name: 'Priya S.' }, target: 'platform_fund' },
  { amountInr: 3000, donor: { name: 'Rahul M.', email: 'rahul@example.com' }, target: 'organization' },
  { amountInr: 750, donor: { name: 'Neha G.' }, target: 'organization' },
];

const DISBURSEMENTS = [
  { amountInr: 2200, purpose: 'surgery', note: 'Fracture repair for the dog hit near Lajpat Nagar market.' },
  { amountInr: 1400, purpose: 'treatment', note: 'Two weeks of mange treatment, four dogs.' },
  { amountInr: 900, purpose: 'transport', note: 'Ambulance fuel for three pickups.' },
];

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

async function main() {
  assertRequiredEnv();
  await connectDB();

  const resetPasswords = process.argv.includes('--reset-passwords');
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const credentials = [];

  // ---- Admin -------------------------------------------------------------
  const adminEmail = (env.auth.adminEmail || 'admin@streetpaws.local').toLowerCase();
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name: 'Administrator', email: adminEmail, role: 'admin',
      passwordHash, mustChangePassword: false,
    });
  } else if (resetPasswords) {
    admin.passwordHash = passwordHash;
    admin.mustChangePassword = false;
    admin.role = 'admin';
    await admin.save();
  }
  credentials.push({ role: 'Admin', email: adminEmail, org: '—' });

  // ---- One login per approved organisation --------------------------------
  const orgs = await Organization.find({ applicationStatus: 'approved' });
  if (!orgs.length) {
    console.warn('[accounts] no approved organisations found — run `npm run seed` first.');
  }

  for (const org of orgs) {
    let user = await User.findOne({ email: org.email });
    if (!user) {
      user = await User.create({
        name: org.contactPersonName ?? org.name,
        email: org.email,
        phone: org.phone,
        role: org.kind === 'ngo' ? 'ngo' : 'helper',
        organizationId: org._id,
        passwordHash,
        // Demo accounts skip the forced password change, or every sign-in
        // would land on the change-password screen instead of the dashboard.
        mustChangePassword: false,
      });
    } else if (resetPasswords) {
      user.passwordHash = passwordHash;
      user.mustChangePassword = false;
      user.organizationId = org._id;
      user.role = org.kind === 'ngo' ? 'ngo' : 'helper';
      await user.save();
    }

    if (!org.ownerUserId) {
      org.ownerUserId = user._id;
      await org.save();
    }

    credentials.push({
      role: org.kind === 'ngo' ? 'NGO' : 'Rescuer',
      email: org.email,
      org: `${org.name}${org.verified ? ' (verified)' : ' (unverified)'}`,
    });
  }

  // ---- Applications awaiting admin review ---------------------------------
  let pendingCreated = 0;
  for (const app of PENDING_APPLICATIONS) {
    if (await Organization.findOne({ email: app.email })) continue;
    await Organization.create({
      ...app,
      location: toPoint({ lat: app.lat, lng: app.lng, address: `${app.city}`, city: app.city, state: app.state }),
      applicationStatus: 'pending',
      active: false,
      verified: false,
    });
    pendingCreated++;
  }

  if (!(await Organization.findOne({ email: REJECTED_APPLICATION.email }))) {
    await Organization.create({
      ...REJECTED_APPLICATION,
      location: toPoint({
        lat: REJECTED_APPLICATION.lat, lng: REJECTED_APPLICATION.lng,
        city: REJECTED_APPLICATION.city, state: REJECTED_APPLICATION.state,
      }),
      applicationStatus: 'rejected',
      active: false,
      verified: false,
      reviewedAt: daysAgo(4),
      reviewNote: 'Commercial retailer, not an animal welfare organisation.',
    });
  }

  // ---- Adoption enquiries for the rescuer inbox ---------------------------
  const listings = await AdoptionListing.find({ status: 'available' }).limit(ADOPTION_ENQUIRIES.length);
  let enquiriesCreated = 0;
  for (let i = 0; i < Math.min(listings.length, ADOPTION_ENQUIRIES.length); i++) {
    const listing = listings[i];
    const enquiry = ADOPTION_ENQUIRIES[i];
    const exists = await AdoptionApplication.findOne({
      listingId: listing._id,
      'applicant.phone': enquiry.applicant.phone,
    });
    if (exists) continue;

    await AdoptionApplication.create({
      ...enquiry,
      listingId: listing._id,
      organizationId: listing.organizationId,
      createdAt: daysAgo(i + 1),
    });
    enquiriesCreated++;
  }

  // ---- Paid donations and payouts, so the fund page shows real numbers ----
  const firstOrg = orgs[0];
  let donationsCreated = 0;
  for (const d of DONATIONS) {
    const exists = await Donation.findOne({ 'donor.name': d.donor.name, amountPaise: d.amountInr * 100 });
    if (exists) continue;
    await Donation.create({
      amountPaise: d.amountInr * 100,
      currency: 'INR',
      donor: { ...d.donor, anonymous: Boolean(d.donor.anonymous) },
      target:
        d.target === 'organization' && firstOrg
          ? { type: 'organization', organizationId: firstOrg._id }
          : { type: 'platform_fund' },
      message: d.message,
      // Marked paid directly. In the real flow only the signature-verified
      // Razorpay webhook may set this — see donationController.js.
      status: 'paid',
      paidAt: daysAgo(Math.floor(Math.random() * 20) + 1),
      razorpay: { orderId: `order_seed_${Math.random().toString(36).slice(2, 12)}` },
    });
    donationsCreated++;
  }

  let payoutsCreated = 0;
  if (firstOrg) {
    for (const p of DISBURSEMENTS) {
      const exists = await Disbursement.findOne({ note: p.note });
      if (exists) continue;
      await Disbursement.create({
        organizationId: orgs[payoutsCreated % orgs.length]._id,
        amountPaise: p.amountInr * 100,
        purpose: p.purpose,
        note: p.note,
        disbursedAt: daysAgo(payoutsCreated * 3 + 2),
        recordedByUserId: admin._id,
      });
      payoutsCreated++;
    }
  }

  // ---- Repair denormalised counters ---------------------------------------
  // Organization.responseStats is a cache over the Alert collection. Anything
  // that writes alerts without updating it — a reset, a failed job, a manual
  // fix — leaves the two disagreeing, and the symptom is nonsense like a 378%
  // acceptance rate. Alerts are the source of truth, so recompute from them.
  let repaired = 0;
  for (const org of await Organization.find({})) {
    const [alertRows, resolvedCount] = await Promise.all([
      Alert.find({ organizationId: org._id }).select('status sentAt respondedAt'),
      DogReport.countDocuments({
        assignedOrganizationId: org._id,
        status: { $in: ['resolved', 'reunited'] },
      }),
    ]);

    const accepted = alertRows.filter((a) => a.status === 'accepted');
    const responded = accepted.filter((a) => a.respondedAt && a.sentAt);
    const avg = responded.length
      ? Math.round(
          responded.reduce((s, a) => s + (a.respondedAt - a.sentAt) / 60000, 0) / responded.length
        )
      : null;

    const next = {
      assigned: alertRows.length,
      accepted: accepted.length,
      resolved: resolvedCount,
      avgResponseMinutes: avg,
    };

    const current = org.responseStats ?? {};
    if (
      current.assigned !== next.assigned ||
      current.accepted !== next.accepted ||
      current.resolved !== next.resolved
    ) {
      org.responseStats = next;
      org.activeCaseCount = await DogReport.countDocuments({
        assignedOrganizationId: org._id,
        status: { $in: ['assigned', 'in_treatment'] },
      });
      await org.save();
      repaired++;
    }
  }

  // ---- Report --------------------------------------------------------------
  console.log('\n' + '='.repeat(78));
  console.log('SIGN-IN CREDENTIALS');
  console.log('='.repeat(78));
  console.log(`Password for every account below:  ${DEMO_PASSWORD}\n`);
  console.log('  ROLE      EMAIL                              ORGANISATION');
  console.log('  ' + '-'.repeat(74));
  for (const c of credentials) {
    console.log(`  ${c.role.padEnd(9)} ${c.email.padEnd(34)} ${c.org}`);
  }
  console.log('\n  Sign in at http://localhost:5173/login');
  console.log('='.repeat(78));

  console.log('\nSeeded:');
  console.log(`  ${credentials.length} login accounts (1 admin, ${credentials.length - 1} organisation)`);
  console.log(`  ${pendingCreated} applications awaiting review  → /admin`);
  console.log(`  ${enquiriesCreated} adoption enquiries            → rescuer inbox`);
  console.log(`  ${donationsCreated} paid donations, ${payoutsCreated} payouts   → /donate`);
  console.log(`  ${repaired} organisations had drifted response stats recomputed from alerts`);

  if (!resetPasswords && credentials.length > 1) {
    console.log('\nExisting accounts keep their current password.');
    console.log('Re-run with `-- --reset-passwords` to force them all to the demo password.');
  }

  await disconnectDB();
}

main().catch(async (err) => {
  console.error('[accounts] failed:', err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
