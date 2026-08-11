/**
 * Populates the database with a plausible city's worth of data so maps, filters
 * and the responder queue are never empty during development.
 *
 *   npm run seed          # wipes seeded collections and reloads
 *   npm run seed -- --keep  # adds without wiping
 */
import { connectDB, disconnectDB } from '../config/db.js';
import { assertRequiredEnv } from '../config/env.js';
import { ensureIndexes } from '../config/indexes.js';
import { Organization, DogReport, AdoptionListing } from '../models/index.js';
import { toPoint, jitter } from '../utils/geo.js';

const DELHI = { lat: 28.6139, lng: 77.209 };

// Placeholder imagery. Real photos arrive via Cloudinary in the next step.
const photo = (seed) => ({
  cloudinaryPublicId: `seed/${seed}`,
  url: `https://placedog.net/640/480?id=${seed}`,
  thumbnailUrl: `https://placedog.net/320/240?id=${seed}`,
  resourceType: 'image',
  width: 640,
  height: 480,
  isPrimary: true,
});

const ORGS = [
  {
    name: 'Friendicoes SECA',
    kind: 'ngo',
    area: 'Defence Colony',
    lat: 28.5729,
    lng: 77.2295,
    specializations: ['injury', 'surgery', 'shelter', 'sterilization'],
    capacity: 25,
    verified: true,
  },
  {
    name: 'Sanjay Gandhi Animal Care Centre',
    kind: 'ngo',
    area: 'Raja Garden',
    lat: 28.6562,
    lng: 77.1245,
    specializations: ['injury', 'surgery', 'rabies', 'shelter'],
    capacity: 40,
    verified: true,
  },
  {
    name: 'Red Paws Rescue',
    kind: 'ngo',
    area: 'Vasant Kunj',
    lat: 28.5203,
    lng: 77.1568,
    specializations: ['puppies', 'skin_disease', 'transport'],
    capacity: 12,
    verified: true,
  },
  {
    name: 'Meera Kapoor (independent rescuer)',
    kind: 'private_helper',
    area: 'Lajpat Nagar',
    lat: 28.5677,
    lng: 77.2434,
    specializations: ['puppies', 'transport'],
    capacity: 4,
    verified: true,
  },
  {
    name: 'Arjun Sethi (independent rescuer)',
    kind: 'private_helper',
    area: 'Rohini',
    lat: 28.7361,
    lng: 77.1218,
    specializations: ['injury', 'skin_disease'],
    capacity: 3,
    verified: false,
  },
];

const FOUND_DOGS = [
  { desc: 'Limping badly on the front-right leg, would not put weight on it. Sitting near the metro gate.', condition: 'injured', breed: 'Indian Pariah', urgency: 4 },
  { desc: 'Very thin, patchy fur, scratching constantly. Probably mange.', condition: 'sick', breed: 'Indian Pariah', urgency: 3 },
  { desc: 'Hit by a scooter, bleeding from the hind leg. Cannot stand.', condition: 'critical', breed: 'Indian Pariah', urgency: 5 },
  { desc: 'Friendly, healthy looking, has a faded collar. Might be someone’s.', condition: 'healthy', breed: 'Labrador mix', urgency: 1 },
  { desc: 'Litter of four puppies under a parked car, mother not around since morning.', condition: 'sick', breed: 'Indian Pariah', urgency: 4 },
  { desc: 'Large open wound on the flank, flies around it.', condition: 'critical', breed: 'Indian Pariah', urgency: 5 },
  { desc: 'Old dog, cloudy eyes, moving slowly but eating.', condition: 'sick', breed: 'Indian Pariah', urgency: 2 },
  { desc: 'Sitting outside the temple for three days, seems lost rather than hurt.', condition: 'healthy', breed: 'Golden Retriever', urgency: 2 },
  { desc: 'Puppy with a swollen paw, whimpering when touched.', condition: 'injured', breed: 'Indian Pariah', urgency: 4 },
  { desc: 'Skin completely bare on the back, raw and red.', condition: 'sick', breed: 'Indian Pariah', urgency: 3 },
  { desc: 'Caught in a fence near the construction site, freed but shaken.', condition: 'injured', breed: 'Indian Pariah', urgency: 3 },
  { desc: 'Healthy adult, very people-friendly, follows anyone with food.', condition: 'healthy', breed: 'Indian Pariah', urgency: 1 },
  { desc: 'Coughing continuously, nose running. Would not move from the shade.', condition: 'sick', breed: 'German Shepherd mix', urgency: 3 },
  { desc: 'Bleeding from the mouth, possible broken jaw after a fall.', condition: 'critical', breed: 'Indian Pariah', urgency: 5 },
  { desc: 'Well-groomed, wearing a red collar with no tag. Clearly a pet.', condition: 'healthy', breed: 'Beagle', urgency: 2 },
  { desc: 'Sleeping in the drain, very weak, not responding to food.', condition: 'critical', breed: 'Indian Pariah', urgency: 5 },
];

const LOST_DOGS = [
  { name: 'Bruno', breed: 'Labrador', desc: 'Golden Labrador, red collar, answers to Bruno. Slipped out of the gate on Tuesday evening.' },
  { name: 'Simba', breed: 'Golden Retriever', desc: 'Golden Retriever, three years old, very friendly, no collar.' },
  { name: 'Coco', breed: 'Beagle', desc: 'Tricolour Beagle, small white patch on the chest, missing since Sunday morning.' },
  { name: 'Rani', breed: 'Indian Pariah', desc: 'Tan Indie, one torn ear, timid around strangers.' },
];

const ADOPTABLE = [
  { name: 'Laddu', breed: 'Indian Pariah', ageMonths: 5, sex: 'male', size: 'medium', temperament: ['playful', 'affectionate'], story: 'Rescued from a drain at three weeks, hand-raised, now fully vaccinated and ready.' },
  { name: 'Nimbu', breed: 'Indian Pariah', ageMonths: 14, sex: 'female', size: 'medium', temperament: ['calm', 'shy'], story: 'Recovered from a road accident. Walks with a slight limp that does not slow her down.' },
  { name: 'Kaju', breed: 'Labrador mix', ageMonths: 24, sex: 'male', size: 'large', temperament: ['energetic', 'affectionate'], story: 'Abandoned when his family moved cities. House-trained and excellent with children.' },
  { name: 'Motu', breed: 'Indian Pariah', ageMonths: 8, sex: 'male', size: 'medium', temperament: ['playful', 'protective'], story: 'One of a litter of five. The last one still waiting for a home.' },
  { name: 'Pari', breed: 'Indian Pariah', ageMonths: 36, sex: 'female', size: 'small', temperament: ['calm', 'affectionate'], story: 'Street dog who chose a shelter volunteer and never left. Sterilised and vaccinated.' },
];

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function seed() {
  const keep = process.argv.includes('--keep');

  assertRequiredEnv();
  await connectDB();

  // Must happen before the geo queries anyone runs against this data — Mongoose
  // would otherwise build the 2dsphere index lazily, after the script has exited.
  await ensureIndexes({ verbose: true });

  if (!keep) {
    console.log('[seed] clearing existing organizations, reports and listings…');
    await Promise.all([
      Organization.deleteMany({}),
      DogReport.deleteMany({}),
      AdoptionListing.deleteMany({}),
    ]);
  }

  const orgs = await Organization.insertMany(
    ORGS.map((o) => ({
      name: o.name,
      kind: o.kind,
      description: `${o.kind === 'ngo' ? 'Animal welfare organisation' : 'Independent rescuer'} operating around ${o.area}, Delhi.`,
      location: toPoint({ lat: o.lat, lng: o.lng, address: `${o.area}, New Delhi`, city: 'New Delhi', state: 'Delhi' }),
      serviceRadiusKm: o.kind === 'ngo' ? 15 : 6,
      phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}`,
      email: `${o.name.split(' ')[0].toLowerCase()}@example.org`,
      capacity: o.capacity,
      activeCaseCount: Math.floor(Math.random() * Math.min(3, o.capacity)),
      specializations: o.specializations,
      verified: o.verified,
      // Seeded organisations skip the application flow — they exist so the
      // dashboard and routing have data on a fresh clone.
      applicationStatus: 'approved',
      contactPersonName: o.name.split(' (')[0],
      responseStats: {
        assigned: 20 + Math.floor(Math.random() * 40),
        accepted: 12 + Math.floor(Math.random() * 25),
        resolved: 8 + Math.floor(Math.random() * 20),
        avgResponseMinutes: 25 + Math.floor(Math.random() * 90),
      },
    }))
  );
  console.log(`[seed] ${orgs.length} organizations`);

  const foundReports = FOUND_DOGS.map((d, i) => {
    const at = jitter(DELHI.lat, DELHI.lng, 14);
    return {
      kind: 'found',
      media: [photo(100 + i)],
      location: toPoint({ ...at, address: 'New Delhi', city: 'New Delhi', state: 'Delhi' }),
      contact: {
        name: pick(['Priya S.', 'Rahul M.', 'Ananya K.', 'Vikram D.', 'Neha G.']),
        phone: `+9199${Math.floor(10000000 + Math.random() * 89999999)}`,
        preferredChannel: 'phone',
      },
      description: d.desc,
      condition: d.condition,
      occurredAt: daysAgo(Math.random() * 12),
      // Pre-filled so the responder queue sorts correctly before the AI step exists.
      analysisState: 'done',
      aiAnalysis: {
        breed: d.breed,
        breedConfidence: 0.6 + Math.random() * 0.35,
        colors: pick([['tan'], ['tan', 'white'], ['black', 'tan'], ['brown'], ['white']]),
        sizeEstimate: pick(['small', 'medium', 'large']),
        ageEstimate: pick(['puppy', 'young', 'adult', 'senior']),
        distinctiveMarks: [],
        injuries: d.condition === 'healthy' ? [] : [d.desc.split('.')[0]],
        urgency: d.urgency,
        generatedDescription: d.desc,
        modelUsed: 'seed',
        analyzedAt: new Date(),
      },
      status: pick(['open', 'open', 'open', 'assigned', 'in_treatment', 'resolved']),
    };
  });

  const lostReports = LOST_DOGS.map((d, i) => {
    const at = jitter(DELHI.lat, DELHI.lng, 14);
    return {
      kind: 'lost',
      media: [photo(200 + i)],
      location: toPoint({ ...at, address: 'New Delhi', city: 'New Delhi', state: 'Delhi' }),
      contact: {
        name: pick(['Sameer T.', 'Divya R.', 'Kabir N.', 'Ishaan P.']),
        phone: `+9197${Math.floor(10000000 + Math.random() * 89999999)}`,
        preferredChannel: 'phone',
      },
      dogName: d.name,
      breedGuess: d.breed,
      description: d.desc,
      condition: 'healthy',
      occurredAt: daysAgo(Math.random() * 10),
      analysisState: 'done',
      aiAnalysis: {
        breed: d.breed,
        breedConfidence: 0.8,
        colors: ['tan'],
        sizeEstimate: 'medium',
        ageEstimate: 'adult',
        distinctiveMarks: [],
        injuries: [],
        urgency: 1,
        generatedDescription: d.desc,
        modelUsed: 'seed',
        analyzedAt: new Date(),
      },
      status: 'open',
    };
  });

  const reports = await DogReport.insertMany([...foundReports, ...lostReports]);
  console.log(`[seed] ${reports.length} dog reports (${foundReports.length} found, ${lostReports.length} lost)`);

  const listings = await AdoptionListing.insertMany(
    ADOPTABLE.map((a, i) => {
      const org = orgs[i % orgs.length];
      return {
        organizationId: org._id,
        name: a.name,
        story: a.story,
        media: [photo(300 + i)],
        breed: a.breed,
        ageMonths: a.ageMonths,
        sex: a.sex,
        size: a.size,
        vaccinated: true,
        sterilized: a.ageMonths > 6,
        temperament: a.temperament,
        goodWith: { kids: true, dogs: true, cats: null },
        adoptionFee: 0,
        location: org.location,
        status: 'available',
      };
    })
  );
  console.log(`[seed] ${listings.length} adoption listings`);

  console.log('\n[seed] done. Try:');
  console.log('  curl "http://localhost:5000/api/health"');
  await disconnectDB();
}

seed().catch(async (err) => {
  console.error('[seed] failed:', err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
