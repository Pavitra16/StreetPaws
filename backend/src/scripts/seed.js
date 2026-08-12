/**
 * Seed the database with a coherent, constraint-respecting dataset.
 *
 * Replaces the earlier pair of scripts (seed.js + seedAccounts.js). Those grew
 * organically and drifted: response statistics were written as literals rather
 * than derived, so the admin panel showed acceptance rates of 378% and 533%.
 * Nothing here is hand-written that can be computed:
 *
 *   - responseStats comes from the Alert rows, counted at the end
 *   - activeCaseCount comes from the reports actually assigned and still open
 *   - effectiveUrgency comes from the model's own pre-save hook
 *   - disbursements are capped at what the platform fund actually received
 *
 * If a number in the UI disagrees with the rows, the UI is wrong — not this file.
 *
 * Organisation names are fictional on purpose. Delhi has well-known real animal
 * charities, and attaching invented PANs, phone numbers and acceptance rates to
 * a real charity's name — in a public repository — is not something demo data
 * should do.
 *
 * Usage:  npm run seed
 *         npm run seed -- --keep-admin=someone@example.com
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

import { cloudinary, isCloudinaryConfigured, buildUrl, THUMB } from '../config/cloudinary.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { ensureIndexes } from '../config/indexes.js';
import {
  User,
  Organization,
  DogReport,
  Alert,
  AdoptionListing,
  AdoptionApplication,
  Donation,
  Disbursement,
} from '../models/index.js';
import { hashPassword } from '../services/authService.js';
import { toPoint, haversineKm } from '../utils/geo.js';
import { env } from '../config/env.js';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const ADMIN_EMAIL = (arg('keep-admin', env.adminEmail) ?? '').toLowerCase();
const PASSWORD = env.adminPassword ?? 'streetpaws2026';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms);

/* ------------------------------------------------------------------ *
 * Photographs
 *
 * DogReport requires at least one photo and that rule is right: a report
 * without an image cannot be triaged, matched or acted on. So the seed needs
 * real files rather than a way around the validator.
 *
 * Drop images into:
 *   seed-assets/reports/    — street dogs, any filename, matched in sort order
 *   seed-assets/adoption/   — named after the dog: laddoo.jpg, mishti.jpg, …
 *
 * They are uploaded to Cloudinary once and reused. Everything is checked
 * before a single document is deleted — a seed that wipes the database and
 * then fails halfway leaves you worse off than not running it.
 * ------------------------------------------------------------------ */
const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../seed-assets');
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

const listImages = (dir) => {
  const full = path.join(ASSETS, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter((f) => IMAGE_RE.test(f)).sort()
    .map((f) => ({ file: f, abs: path.join(full, f), stem: path.parse(f).name.toLowerCase() }));
};

async function upload(abs, publicId) {
  const res = await cloudinary.uploader.upload(abs, {
    folder: `${env.cloudinary?.uploadFolder ?? 'streetpaws'}/seed`,
    public_id: publicId,
    overwrite: true,
    resource_type: 'image',
  });
  return {
    cloudinaryPublicId: res.public_id,
    url: res.secure_url,
    thumbnailUrl: buildUrl(res.public_id, THUMB),
    resourceType: 'image',
    width: res.width,
    height: res.height,
    isPrimary: true,
  };
}

/* ------------------------------------------------------------------ *
 * Organisations
 *
 * PANs follow the real format (5 letters, 4 digits, 1 letter) and the 4th
 * character encodes entity type: T = trust, F = firm, C = company, P =
 * individual. Getting that right matters because the application form
 * validates the pattern, so a malformed one could never have been submitted.
 *
 * Individual rescuers carry one too — PAN is now required of every applicant,
 * so theirs use P in the fourth position and their surname initial in the fifth.
 * ------------------------------------------------------------------ */
const ORGS = [
  {
    name: 'Paws & Claws Animal Trust',
    kind: 'ngo',
    description:
      'Runs a small clinic in Lajpat Nagar. Handles road-accident cases and post-operative care, and does weekly sterilisation drives across South Delhi.',
    lat: 28.5677,
    lng: 77.2433,
    address: 'Ring Road, Lajpat Nagar IV',
    city: 'New Delhi',
    pincode: '110024',
    serviceRadiusKm: 15,
    capacity: 12,
    phone: '+91 98110 42317',
    email: 'contact@pawsandclawstrust.org',
    website: 'https://pawsandclawstrust.org',
    specializations: ['injury', 'surgery', 'sterilization'],
    pan: 'AACTP4821K',
    registrationNumber: 'S/RS/SW/1142/2014',
    darpanId: 'DL/2016/0104882',
    contactPersonName: 'Anjali Deshpande',
    yearsActive: 11,
    verified: true,
  },
  {
    name: 'Sahara Animal Shelter',
    kind: 'ngo',
    description:
      'The largest shelter on this platform, with kennel space for long-stay cases. Takes orphaned litters and skin-disease cases that need weeks of treatment.',
    lat: 28.7495,
    lng: 77.0565,
    address: 'Sector 22, Rohini',
    city: 'New Delhi',
    pincode: '110086',
    serviceRadiusKm: 20,
    capacity: 18,
    phone: '+91 99532 60148',
    email: 'help@saharashelter.org',
    website: 'https://saharashelter.org',
    specializations: ['shelter', 'puppies', 'skin_disease', 'sterilization'],
    pan: 'AAATS9036L',
    registrationNumber: 'S/DL/2008/61204',
    darpanId: 'DL/2017/0161093',
    contactPersonName: 'Vikram Sahni',
    yearsActive: 17,
    verified: true,
  },
  {
    name: 'Karuna Animal Aid Society',
    kind: 'ngo',
    description:
      'Two-vehicle ambulance service covering Saket and Mehrauli. Trained for bite cases and rabies protocol; transfers surgical cases onward.',
    lat: 28.5245,
    lng: 77.2066,
    address: 'Press Enclave Road, Saket',
    city: 'New Delhi',
    pincode: '110017',
    serviceRadiusKm: 12,
    capacity: 8,
    phone: '+91 97173 55890',
    email: 'response@karunaanimalaid.org',
    specializations: ['injury', 'rabies', 'transport'],
    pan: 'AABTK1574M',
    registrationNumber: 'S/DL/2012/47831',
    contactPersonName: 'Fatima Sheikh',
    yearsActive: 13,
    verified: true,
  },
  {
    name: 'Nirvana Street Dog Foundation',
    kind: 'ngo',
    description:
      'West Delhi sterilisation and vaccination programme. Newer organisation, still building surgical capacity.',
    lat: 28.5921,
    lng: 77.046,
    address: 'Sector 12, Dwarka',
    city: 'New Delhi',
    pincode: '110078',
    serviceRadiusKm: 18,
    capacity: 10,
    phone: '+91 88268 71034',
    email: 'info@nirvanastreetdogs.org',
    specializations: ['sterilization', 'surgery', 'shelter'],
    pan: 'AAETN6203N',
    registrationNumber: 'U85300DL2021NPL389442',
    darpanId: 'DL/2021/0298117',
    contactPersonName: 'Rohit Ahluwalia',
    yearsActive: 4,
    // Approved but NOT verified — works cases, cannot see reporter phone
    // numbers. The two grants are separate and the seed should show both.
    verified: false,
  },
  {
    name: 'Rhea Malviya',
    kind: 'private_helper',
    description:
      'Fosters orphaned puppies at home. Can bottle-feed and hand-rear, and drives cases to clinics when needed.',
    lat: 28.5494,
    lng: 77.2001,
    address: 'Hauz Khas',
    city: 'New Delhi',
    pincode: '110016',
    serviceRadiusKm: 6,
    capacity: 3,
    phone: '+91 98737 12206',
    email: 'rhea.malviya@example.com',
    specializations: ['puppies', 'transport'],
    pan: 'BKRPM8214J',
    contactPersonName: 'Rhea Malviya',
    yearsActive: 3,
    verified: true,
  },
  {
    name: 'Imran Qureshi',
    kind: 'private_helper',
    description:
      'Keeps a first-aid kit and a carrier in the car. Does wound dressing and transport around Karol Bagh; on call most evenings.',
    lat: 28.6519,
    lng: 77.1909,
    address: 'Karol Bagh',
    city: 'New Delhi',
    pincode: '110005',
    serviceRadiusKm: 8,
    capacity: 4,
    phone: '+91 95998 44172',
    email: 'imran.qureshi@example.com',
    specializations: ['injury', 'transport'],
    pan: 'CDLPQ5137F',
    contactPersonName: 'Imran Qureshi',
    yearsActive: 6,
    verified: true,
  },
  {
    name: 'Deepa Nair',
    kind: 'private_helper',
    description: 'Treats mange and tick fever cases in Vasant Kunj. Limited capacity — two dogs at a time.',
    lat: 28.52,
    lng: 77.1591,
    address: 'Vasant Kunj',
    city: 'New Delhi',
    pincode: '110070',
    serviceRadiusKm: 5,
    capacity: 2,
    phone: '+91 90158 33940',
    email: 'deepa.nair@example.com',
    specializations: ['skin_disease', 'puppies'],
    pan: 'EHTPN2960R',
    contactPersonName: 'Deepa Nair',
    yearsActive: 2,
    verified: false,
  },
  // Pending — so the admin console has something real to review.
  {
    name: 'Second Chance Animal Rescue',
    kind: 'ngo',
    description:
      'Applying to join. Runs a feeding programme in East Delhi and wants to start taking injury cases.',
    lat: 28.6304,
    lng: 77.2952,
    address: 'Preet Vihar',
    city: 'New Delhi',
    pincode: '110092',
    serviceRadiusKm: 10,
    capacity: 6,
    phone: '+91 87004 29615',
    email: 'apply@secondchancerescue.org',
    specializations: ['injury', 'shelter'],
    pan: 'AAJTS7710P',
    registrationNumber: 'S/DL/2023/88014',
    contactPersonName: 'Nusrat Jahan',
    yearsActive: 2,
    applicationStatus: 'pending',
  },
  {
    name: 'Tanvi Bhatt',
    kind: 'private_helper',
    description: 'Volunteer in Noida, applying after fostering two litters informally.',
    lat: 28.5708,
    lng: 77.326,
    address: 'Sector 18, Noida',
    city: 'Noida',
    state: 'Uttar Pradesh',
    pincode: '201301',
    serviceRadiusKm: 7,
    capacity: 2,
    phone: '+91 96547 20883',
    email: 'tanvi.bhatt@example.com',
    specializations: ['puppies'],
    pan: 'FJMPB4408L',
    contactPersonName: 'Tanvi Bhatt',
    yearsActive: 1,
    applicationStatus: 'pending',
  },
];

/* ------------------------------------------------------------------ *
 * Reports
 *
 * `condition` is what the person on the street selected. No aiAnalysis is
 * written: these have not been through the vision model, and inventing a
 * breed the model never produced is how the earlier seed ended up captioning
 * a border collie "Golden Retriever". Run `npm run seed:reanalyze` to fill it
 * in for real.
 * ------------------------------------------------------------------ */
const REPORTS = [
  // --- resolved / closed, gives the consoles some history ---
  { lat: 28.5661, lng: 77.2411, area: 'Lajpat Nagar II', condition: 'critical', breedGuess: 'Indian Pariah',
    description: 'Hit by a scooter near the flyover. Not standing, bleeding from a back leg.',
    reporter: 'Nikhil Prasad', phone: '+91 98219 66401', days: 12, status: 'resolved' },
  { lat: 28.5238, lng: 77.2094, area: 'Saket, near PVR', condition: 'injured', breedGuess: 'mixed',
    description: 'Deep cut across the shoulder, keeps licking it. Friendly, lets people close.',
    reporter: 'Sneha Iyer', phone: '+91 99715 30822', days: 9, status: 'resolved' },
  { lat: 28.7442, lng: 77.0621, area: 'Rohini Sector 24', condition: 'sick', breedGuess: 'Indian Pariah',
    description: 'Very thin, patchy fur across the back and neck. Scratching constantly.',
    reporter: 'Manav Chhabra', phone: '+91 97114 28855', days: 15, status: 'resolved' },
  { lat: 28.6488, lng: 77.1874, area: 'Karol Bagh, Ajmal Khan Road', condition: 'injured', breedGuess: 'mixed',
    description: 'Limping badly on the front right. Stays under a parked truck all day.',
    reporter: 'Ayesha Siddiqui', phone: '+91 98997 41230', days: 20, status: 'closed' },

  // --- currently being treated ---
  { lat: 28.5512, lng: 77.2032, area: 'Hauz Khas Village', condition: 'sick', breedGuess: 'Indian Pariah',
    description: 'Four puppies, mother not around since yesterday. Eyes barely open.',
    reporter: 'Karan Bedi', phone: '+91 90045 77192', days: 5, status: 'in_treatment' },
  { lat: 28.5261, lng: 77.1608, area: 'Vasant Kunj B Block', condition: 'sick', breedGuess: 'mixed',
    description: 'Severe mange, almost no hair left on the hind quarters. Still eating.',
    reporter: 'Priyanka Salvi', phone: '+91 93113 05674', days: 6, status: 'in_treatment' },
  { lat: 28.5889, lng: 77.0512, area: 'Dwarka Sector 10', condition: 'injured', breedGuess: 'Indian Pariah',
    description: 'Wound on the flank with flies around it. Growls if approached.',
    reporter: 'Sameer Kaul', phone: '+91 98186 20037', days: 3, status: 'in_treatment' },

  // --- assigned, rescuer on the way ---
  { lat: 28.5703, lng: 77.2478, area: 'Amar Colony, Lajpat Nagar', condition: 'critical', breedGuess: 'mixed',
    description: 'Collapsed by the market gate. Breathing but not responding to sound.',
    reporter: 'Ritu Bansal', phone: '+91 99534 81260', hours: 5, status: 'assigned' },
  { lat: 28.6541, lng: 77.1962, area: 'Pusa Road', condition: 'injured', breedGuess: 'Indian Pariah',
    description: 'Bleeding ear, looks like a dog fight. Moving around but shaking its head.',
    reporter: 'Gaurav Menon', phone: '+91 98713 44508', hours: 9, status: 'assigned' },

  // --- open, awaiting a rescuer ---
  { lat: 28.5688, lng: 77.2392, area: 'Lajpat Nagar Central Market', condition: 'critical', breedGuess: 'Indian Pariah',
    description: 'Hind leg looks broken, dragging it. Trying to hide behind the bins.',
    reporter: 'Ishaan Kohli', phone: '+91 90132 66741', hours: 1, status: 'open' },
  { lat: 28.5276, lng: 77.2118, area: 'Malviya Nagar', condition: 'injured', breedGuess: 'mixed',
    description: 'Wound on the neck, possibly from a collar that grew in. Very nervous.',
    reporter: 'Tara Menon', phone: '+91 97181 22930', hours: 4, status: 'open' },
  { lat: 28.7521, lng: 77.0498, area: 'Rohini Sector 16', condition: 'sick', breedGuess: 'Indian Pariah',
    description: 'Coughing badly, discharge from both eyes. Two others nearby look the same.',
    reporter: 'Harpreet Gill', phone: '+91 98991 07723', hours: 11, status: 'open' },
  { lat: 28.5455, lng: 77.1978, area: 'Green Park', condition: 'healthy', breedGuess: 'Labrador mix',
    description: 'Well fed and wearing a worn collar, no tag. Following people around — looks lost.',
    reporter: 'Devika Rao', phone: '+91 99900 51184', hours: 20, status: 'open' },
  { lat: 28.5934, lng: 77.0421, area: 'Dwarka Sector 12 market', condition: 'sick', breedGuess: 'mixed',
    description: 'Very lethargic, will not get up for food. Nose is dry and warm.',
    reporter: 'Aditya Naik', phone: '+91 98104 39926', days: 1, status: 'open' },
  { lat: 28.6272, lng: 77.2887, area: 'Preet Vihar', condition: 'injured', breedGuess: 'Indian Pariah',
    description: 'Puncture wounds on the shoulder. Keeps to itself near the bus stop.',
    reporter: 'Neha Wadhwa', phone: '+91 97119 60043', days: 1, status: 'open' },
  { lat: 28.5192, lng: 77.1554, area: 'Vasant Kunj C Block', condition: 'healthy', breedGuess: 'Indian Pariah',
    description: 'Pregnant, very close to term. Sleeping under the stairwell of C-4.',
    reporter: 'Mohit Tandon', phone: '+91 90993 18475', days: 2, status: 'open' },
  { lat: 28.6598, lng: 77.2205, area: 'Civil Lines', condition: 'sick', breedGuess: 'mixed',
    description: 'Swollen face on one side, probably an abscess. Not eating properly.',
    reporter: 'Farhan Ali', phone: '+91 98735 29061', days: 2, status: 'open' },

  // --- lost dogs, for the matching flow ---
  { kind: 'lost', lat: 28.5521, lng: 77.2087, area: 'Hauz Khas', condition: 'healthy', breedGuess: 'Beagle',
    dogName: 'Coco', description: 'Beagle, tricolour, red collar with a bell. Slipped out of the gate on Sunday evening.',
    reporter: 'Ananya Sharma', phone: '+91 98111 20394', days: 4, status: 'open' },
  { kind: 'lost', lat: 28.5712, lng: 77.2442, area: 'Lajpat Nagar', condition: 'healthy', breedGuess: 'Indie',
    dogName: 'Bruno', description: 'Brown indie, white patch on the chest, one ear folds over. Very shy of traffic.',
    reporter: 'Rajat Khurana', phone: '+91 99584 76610', days: 7, status: 'open' },
  { kind: 'lost', lat: 28.6467, lng: 77.1841, area: 'Karol Bagh', condition: 'healthy', breedGuess: 'Spitz',
    dogName: 'Simba', description: 'White Spitz, small, answers to Simba. Lost near the metro station.',
    reporter: 'Meenal Joshi', phone: '+91 98180 55271', days: 2, status: 'open' },
  { kind: 'lost', lat: 28.5251, lng: 77.2043, area: 'Saket', condition: 'healthy', breedGuess: 'Border Collie',
    dogName: 'Rocky', description: 'Black and white collie, greying around the muzzle, arthritic back legs so he cannot have gone far.',
    reporter: 'Vivek Anand', phone: '+91 97170 63328', days: 1, status: 'reunited' },
];

/**
 * Which photograph goes with which report, by index into REPORTS above.
 *
 * Not filename order. The reports describe specific animals — a mange case, a
 * litter of puppies, a lost Beagle — and handing photographs out in sort order
 * is how a border collie ended up captioned "Golden Retriever" in the last
 * seed. dog8 is the only visibly unwell street dog in the set, so it carries
 * the skin-disease and lethargy cases; the three pedigree photographs carry
 * the lost-pet reports, where a well-kept dog is the point.
 */
const REPORT_PHOTOS = [
  'dog6.jpg', // 0  hit by scooter, critical
  'dog7.jpg', // 1  cut across the shoulder
  'dog8.jpg', // 2  thin, patchy fur — the mange case
  'dog1.jpg', // 3  limping, front right
  'dog4.jpg', // 4  four orphaned puppies
  'dog8.jpg', // 5  severe mange, hind quarters
  'dog6.jpg', // 6  wound on the flank
  'dog7.jpg', // 7  collapsed by the market gate
  'dog1.jpg', // 8  bleeding ear
  'dog8.jpg', // 9  hind leg broken
  'dog6.jpg', // 10 embedded collar wound
  'dog7.jpg', // 11 coughing, eye discharge
  'dog5.jpg', // 12 well fed, worn collar — looks lost, so a pedigree
  'dog8.jpg', // 13 lethargic, will not get up
  'dog1.jpg', // 14 puncture wounds
  'dog7.jpg', // 15 pregnant, close to term
  'dog6.jpg', // 16 swollen face, abscess
  'dog3.jpg', // 17 LOST Coco — Beagle
  'dog6.jpg', // 18 LOST Bruno — brown indie, white chest
  'dog2.jpg', // 19 LOST Simba — white Spitz
  'dog5.jpg', // 20 LOST Rocky — black and white collie
];

/* Adoption listings. Media is deliberately empty — real photographs get
   attached separately (npm run seed:listing-images). A listing showing a stock
   photo of a dog that is not the dog is worse than a listing showing none. */
const LISTINGS = [
  { photo: 'dog4.jpg', org: 'Sahara Animal Shelter', name: 'Laddoo', breed: 'Indian Pariah',
    ageMonths: 3, sex: 'male', size: 'medium', vaccinated: true, sterilized: false,
    temperament: ['playful', 'energetic'],
    goodWith: { kids: true, dogs: true, cats: null }, adoptionFee: 0,
    story: 'Came in with his sister at three weeks old, after their mother was hit on the Rohini bypass. Hand-reared at the shelter. He is the cream one in front — first to the bowl, every single time. His sister Mishti is in the picture behind him.' },
  { photo: 'dog1.jpg', org: 'Sahara Animal Shelter', name: 'Mishti', breed: 'Indian Pariah',
    ageMonths: 4, sex: 'female', size: 'medium', vaccinated: true, sterilized: false,
    temperament: ['shy', 'affectionate'],
    goodWith: { kids: true, dogs: true, cats: true }, adoptionFee: 0,
    story: 'Tan and white with a speckled chest and ears that have not decided which way to go. Slower to trust than her brother — she will hide behind the furniture for the first week, then follow you from room to room. Best in a quiet home.' },
  { photo: 'dog6.jpg', org: 'Paws & Claws Animal Trust', name: 'Kabir', breed: 'Indian Pariah',
    ageMonths: 26, sex: 'male', size: 'large', vaccinated: true, sterilized: true,
    temperament: ['calm', 'protective'],
    goodWith: { kids: true, dogs: false, cats: null }, adoptionFee: 500,
    specialNeeds: 'Old fracture in the left hind leg. Walks normally but should not do stairs repeatedly.',
    story: 'Brought in after a road accident two years ago and never claimed. Fully recovered apart from a slight limp in the cold. Sits and waits like this for hours — the staff call him the doorman. Does not get on with other male dogs.' },
  { photo: 'dog7.jpg', org: 'Paws & Claws Animal Trust', name: 'Noor', breed: 'Indian Pariah',
    ageMonths: 18, sex: 'female', size: 'medium', vaccinated: true, sterilized: true,
    temperament: ['affectionate', 'shy'],
    goodWith: { kids: true, dogs: true, cats: null }, adoptionFee: 500,
    story: 'Treated for severe mange over four months; her white coat has grown back completely, which is why this photograph matters to us. The folded left ear is permanent. Nervous around vehicles, so a home off a main road would suit her.' },
  { photo: 'dog5.jpg', org: 'Karuna Animal Aid Society', name: 'Tipu', breed: 'Border Collie (mixed)',
    ageMonths: 14, sex: 'male', size: 'medium', vaccinated: true, sterilized: true,
    temperament: ['energetic', 'playful'],
    goodWith: { kids: false, dogs: true, cats: false }, adoptionFee: 0,
    story: 'Found tied outside the clinic gate one morning — a pedigree dog someone could no longer keep. Collies were bred to work all day and he has not been told otherwise. Wrong dog for an apartment; right dog for someone who runs.' },
  { photo: 'dog3.jpg', org: 'Karuna Animal Aid Society', name: 'Peanut', breed: 'Beagle',
    ageMonths: 36, sex: 'male', size: 'medium', vaccinated: true, sterilized: true,
    temperament: ['playful', 'affectionate'],
    goodWith: { kids: true, dogs: true, cats: null }, adoptionFee: 1000,
    story: 'Surrendered when his family relocated abroad. Already house-trained, walks in a harness, and will follow a smell straight into traffic if you let him — so a secure garden and a firm lead are non-negotiable.' },
  { photo: 'dog2.jpg', org: 'Nirvana Street Dog Foundation', name: 'Motu', breed: 'Pomeranian',
    ageMonths: 84, sex: 'male', size: 'small', vaccinated: true, sterilized: true,
    temperament: ['calm', 'affectionate'],
    goodWith: { kids: true, dogs: true, cats: true }, adoptionFee: 0,
    status: 'adopted',
    specialNeeds: 'Senior. Needs a dental check every six months and a soft bed off the floor.',
    story: 'Seven years old, found wandering in Dwarka Sector 12 with a matted coat and no tag. Nobody came forward. Went to a retired couple in Janakpuri last month — this listing stays up because people ask what happens to the older ones.' },
];

async function run() {
  await connectDB();
  await ensureIndexes();

  /* ---- preconditions: check everything BEFORE deleting anything ---- */
  const problems = [];
  if (!ADMIN_EMAIL) {
    problems.push('No admin email. Set ADMIN_EMAIL in .env or pass --keep-admin=you@example.com');
  }
  if (!isCloudinaryConfigured()) {
    problems.push('Cloudinary is not configured — photos cannot be uploaded. Fill CLOUDINARY_* in .env');
  }

  const reportPhotos = listImages('reports');
  const adoptionPhotos = listImages('adoption');

  // Each listing names its own photo, because which dog is in which file is a
  // judgement about the image, not something a filename convention can carry.
  const missingDogs = LISTINGS
    .map((l) => l.photo)
    .filter((f) => !adoptionPhotos.some((p) => p.file === f));
  if (missingDogs.length) {
    problems.push(`seed-assets/adoption/ is missing: ${missingDogs.join(', ')}`);
  }

  /* Reports are optional so the site can be seeded in two passes — adoption
     first, reports once their photographs exist. Skipping them is announced
     loudly rather than silently, because a Find tab with nothing in it looks
     like a bug rather than a pending step. */
  const withReports = reportPhotos.length > 0;

  if (REPORT_PHOTOS.length !== REPORTS.length) {
    problems.push(`REPORT_PHOTOS has ${REPORT_PHOTOS.length} entries but there are ${REPORTS.length} reports`);
  }
  if (withReports) {
    const missing = [...new Set(REPORT_PHOTOS)].filter((f) => !reportPhotos.some((p) => p.file === f));
    if (missing.length) {
      problems.push(`seed-assets/reports/ is missing: ${missing.join(', ')}`);
    }
  }

  if (problems.length) {
    console.error('\nNothing was changed. Fix these first:\n');
    for (const p of problems) console.error('  · ' + p);
    console.error(`\nAssets directory: ${ASSETS}\n`);
    await disconnectDB();
    process.exit(1);
  }

  /* ---- upload photos before the wipe, so a Cloudinary failure is harmless ---- */
  console.log(`uploading ${new Set(withReports ? REPORT_PHOTOS : []).size} report + ${LISTINGS.length} adoption photos…`);
  // Uploaded once per distinct file, not once per report — the same photograph
  // is reused across several reports and there is no reason to send it twice.
  const reportMedia = {};
  for (const file of new Set(withReports ? REPORT_PHOTOS : [])) {
    const p = reportPhotos.find((x) => x.file === file);
    reportMedia[file] = await upload(p.abs, `report-${path.parse(file).name}`);
  }
  const adoptionMedia = {};
  for (const l of LISTINGS) {
    const p = adoptionPhotos.find((x) => x.file === l.photo);
    adoptionMedia[l.photo] = await upload(p.abs, `adopt-${l.name.toLowerCase()}`);
  }
  console.log('uploads done');

  /* ---- wipe, keeping only the one admin login ---- */
  const admin = await User.findOne({ email: ADMIN_EMAIL, role: 'admin' });

  const wiped = {};
  for (const [name, Model] of Object.entries({
    Alert, DogReport, AdoptionApplication, AdoptionListing, Donation, Disbursement, Organization,
  })) {
    wiped[name] = (await Model.deleteMany({})).deletedCount;
  }
  wiped.User = (await User.deleteMany(
    admin ? { _id: { $ne: admin._id } } : { role: { $ne: 'admin' } }
  )).deletedCount;
  console.log('cleared:', wiped);

  if (!admin) {
    await User.create({
      name: 'Administrator',
      email: ADMIN_EMAIL,
      role: 'admin',
      passwordHash: await hashPassword(PASSWORD),
    });
    console.log(`created admin ${ADMIN_EMAIL}`);
  } else {
    console.log(`kept existing admin ${admin.email} (password unchanged)`);
  }

  /* ---- organisations ---- */
  const passwordHash = await hashPassword(PASSWORD);
  const orgs = [];

  for (const o of ORGS) {
    const status = o.applicationStatus ?? 'approved';
    const org = await Organization.create({
      name: o.name,
      kind: o.kind,
      description: o.description,
      location: toPoint({
        lat: o.lat, lng: o.lng, address: o.address,
        city: o.city, state: o.state ?? 'Delhi', pincode: o.pincode,
      }),
      serviceRadiusKm: o.serviceRadiusKm,
      phone: o.phone,
      email: o.email,
      website: o.website,
      capacity: o.capacity,
      specializations: o.specializations,
      pan: o.pan,
      registrationNumber: o.registrationNumber,
      darpanId: o.darpanId,
      contactPersonName: o.contactPersonName,
      yearsActive: o.yearsActive,
      applicationStatus: status,
      // A pending application has no account and is not active. Approval is
      // what creates the login — the seed must not short-circuit that.
      active: status === 'approved',
      verified: status === 'approved' ? Boolean(o.verified) : false,
      reviewedAt: status === 'approved' ? ago(40 * DAY) : undefined,
    });

    if (status === 'approved') {
      const user = await User.create({
        name: o.contactPersonName ?? o.name,
        email: o.email,
        phone: o.phone,
        role: o.kind === 'ngo' ? 'ngo' : 'helper',
        organizationId: org._id,
        passwordHash,
        lastLoginAt: ago(Math.random() * 5 * DAY),
      });
      org.ownerUserId = user._id;
      await org.save();
    }

    orgs.push(org);
  }

  const approved = orgs.filter((o) => o.applicationStatus === 'approved');
  const byName = Object.fromEntries(orgs.map((o) => [o.name, o]));
  console.log(`organisations: ${orgs.length} (${approved.length} approved, ${orgs.length - approved.length} pending)`);

  /* ---- reports ---- */
  const reports = [];
  for (const [i, r] of (withReports ? REPORTS : []).entries()) {
    const occurredAt = ago(r.days ? r.days * DAY : (r.hours ?? 1) * HOUR);
    const doc = new DogReport({
      kind: r.kind ?? 'found',
      media: [reportMedia[REPORT_PHOTOS[i]]],
      location: toPoint({
        lat: r.lat, lng: r.lng, address: r.area, city: 'New Delhi', state: 'Delhi',
      }),
      contact: { name: r.reporter, phone: r.phone, preferredChannel: 'phone' },
      description: r.description,
      condition: r.condition,
      dogName: r.dogName,
      breedGuess: r.breedGuess,
      occurredAt,
      // No aiAnalysis. `skipped` is honest: these were never sent to the model.
      analysisState: 'skipped',
      status: 'open',
      createdAt: occurredAt,
    });
    await doc.save();
    reports.push({ doc, seed: r });
  }
  console.log(
    withReports
      ? `reports: ${reports.length}`
      : `reports: SKIPPED — seed-assets/reports/ is empty, so Find and the rescuer queues will be empty. Add photos and re-run.`
  );

  /* ---- alerts, then the case outcomes that follow from them ----
   *
   * An alert only goes to an organisation that could actually have reached the
   * dog: within its own service radius, and approved. Anything else would make
   * the routing statistics meaningless.
   */
  const alerts = [];
  const assignedCount = new Map();

  for (const { doc: report, seed } of reports) {
    const here = { lat: seed.lat, lng: seed.lng };

    const reachable = approved
      .map((org) => ({
        org,
        km: haversineKm(here, { lat: org.location.coordinates[1], lng: org.location.coordinates[0] }),
      }))
      .filter(({ org, km }) => km <= org.serviceRadiusKm)
      .sort((a, b) => a.km - b.km);

    if (reachable.length === 0) continue;

    const sentAt = new Date(report.occurredAt.getTime() + 4 * 60_000);
    const finished = ['resolved', 'closed', 'reunited'].includes(seed.status);
    const working = ['assigned', 'in_treatment'].includes(seed.status);

    if (finished || working) {
      // The nearest org with spare capacity takes it; everyone else's alert
      // expires, which is what the controller does when a case is claimed.
      const taker = reachable.find(
        ({ org }) => (assignedCount.get(String(org._id)) ?? 0) < org.capacity
      ) ?? reachable[0];

      const responseMinutes = 8 + Math.floor(Math.random() * 50);
      const respondedAt = new Date(sentAt.getTime() + responseMinutes * 60_000);

      alerts.push({
        dogReportId: report._id, organizationId: taker.org._id,
        distanceKm: Number(taker.km.toFixed(2)), urgency: report.effectiveUrgency,
        channel: 'email', status: 'accepted', sentAt, viewedAt: respondedAt, respondedAt,
      });

      for (const { org, km } of reachable.slice(0, 4)) {
        if (String(org._id) === String(taker.org._id)) continue;
        alerts.push({
          dogReportId: report._id, organizationId: org._id,
          distanceKm: Number(km.toFixed(2)), urgency: report.effectiveUrgency,
          channel: 'email', status: 'expired', sentAt, respondedAt,
        });
      }

      report.assignedOrganizationId = taker.org._id;
      report.pushStatus('assigned', {
        note: 'Rescuer accepted the case', byOrganizationId: taker.org._id,
      });
      if (seed.status !== 'assigned') {
        report.pushStatus(seed.status === 'assigned' ? 'assigned' : seed.status === 'in_treatment' ? 'in_treatment' : seed.status, {
          byOrganizationId: taker.org._id,
        });
      }
      if (working) assignedCount.set(String(taker.org._id), (assignedCount.get(String(taker.org._id)) ?? 0) + 1);
      await report.save();
    } else {
      // Still open. Some alerts have been looked at, one has been declined —
      // a decline is a real outcome and the admin console needs to show it.
      reachable.slice(0, 3).forEach(({ org, km }, i) => {
        const declined = i === 2 && report.effectiveUrgency < 4;
        alerts.push({
          dogReportId: report._id, organizationId: org._id,
          distanceKm: Number(km.toFixed(2)), urgency: report.effectiveUrgency,
          channel: 'email',
          status: declined ? 'declined' : i === 0 ? 'viewed' : 'sent',
          declineReason: declined ? 'At capacity this week' : undefined,
          sentAt,
          viewedAt: i <= 1 ? new Date(sentAt.getTime() + 20 * 60_000) : undefined,
          respondedAt: declined ? new Date(sentAt.getTime() + 35 * 60_000) : undefined,
        });
      });
    }
  }

  await Alert.insertMany(alerts);
  const unreached = reports.length - new Set(alerts.map((a) => String(a.dogReportId))).size;
  console.log(`alerts: ${alerts.length}${unreached ? ` — ${unreached} report(s) reached nobody` : ''}`);

  /* ---- derive responseStats and activeCaseCount from the rows above ---- */
  for (const org of approved) {
    const mine = alerts.filter((a) => String(a.organizationId) === String(org._id));
    const accepted = mine.filter((a) => a.status === 'accepted');

    const minutes = accepted
      .map((a) => Math.round((a.respondedAt - a.sentAt) / 60_000))
      .filter((n) => Number.isFinite(n));

    const resolved = await DogReport.countDocuments({
      assignedOrganizationId: org._id,
      status: { $in: ['resolved', 'reunited', 'closed'] },
    });

    org.responseStats = {
      assigned: mine.length,
      accepted: accepted.length,
      resolved,
      avgResponseMinutes: minutes.length
        ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length)
        : null,
    };
    org.activeCaseCount = await DogReport.countDocuments({
      assignedOrganizationId: org._id,
      status: { $in: ['assigned', 'in_treatment'] },
    });
    await org.save();
  }

  /* ---- adoption ---- */
  const listings = [];
  for (const l of LISTINGS) {
    const org = byName[l.org];
    listings.push(
      await AdoptionListing.create({
        organizationId: org._id,
        name: l.name,
        story: l.story,
        media: [adoptionMedia[l.photo]],
        breed: l.breed,
        ageMonths: l.ageMonths,
        sex: l.sex,
        size: l.size,
        vaccinated: l.vaccinated,
        sterilized: l.sterilized,
        specialNeeds: l.specialNeeds,
        temperament: l.temperament,
        goodWith: l.goodWith,
        adoptionFee: l.adoptionFee,
        location: org.location,
        status: l.status ?? 'available',
      })
    );
  }

  const APPS = [
    { listing: 'Laddoo', name: 'Shruti Deshmukh', phone: '+91 98204 11763', email: 'shruti.deshmukh@example.com',
      city: 'New Delhi', homeType: 'apartment', hasOutdoorSpace: false, hasOtherPets: false,
      householdAdults: 2, hasChildren: false, status: 'reviewing',
      experience: 'Grew up with two indies at my parents’ place. First time adopting on my own.',
      reason: 'I work from home four days a week and have wanted a dog since moving into my own flat.' },
    { listing: 'Kabir', name: 'Arvind Pillai', phone: '+91 99456 20871', email: 'arvind.pillai@example.com',
      city: 'Gurugram', homeType: 'independent_house', hasOutdoorSpace: true, hasOtherPets: true,
      otherPetsDetail: 'One spayed female indie, 6 years old, very tolerant.', householdAdults: 3,
      hasChildren: true, status: 'approved',
      experience: 'Third rescue. Fostered for a shelter in Bengaluru for two years.',
      reason: 'We have the space and a ground floor, which suits his leg.' },
    { listing: 'Mishti', name: 'Ritika Bhalla', phone: '+91 98115 39902', email: 'ritika.bhalla@example.com',
      city: 'New Delhi', homeType: 'apartment', hasOutdoorSpace: false, hasOtherPets: false,
      householdAdults: 1, hasChildren: false, status: 'submitted',
      experience: 'None, but I have read a lot and would take time off to settle her in.',
      reason: 'A quiet flat and a quiet dog seemed like a good match.' },
    { listing: 'Tipu', name: 'Jasleen Kaur', phone: '+91 97180 46620', email: 'jasleen.kaur@example.com',
      city: 'New Delhi', homeType: 'independent_house', hasOutdoorSpace: true, hasOtherPets: true,
      otherPetsDetail: 'Two neutered male indies, both under three.', householdAdults: 2,
      hasChildren: false, status: 'rejected',
      reviewNote: 'Three young dogs in one home is a lot; we suggested waiting six months.',
      experience: 'Currently have two rescues, both adopted as puppies.',
      reason: 'We run every morning and he sounds like he would keep up.' },
  ];

  const listingByName = Object.fromEntries(listings.map((l) => [l.name, l]));
  for (const a of APPS) {
    const listing = listingByName[a.listing];
    await AdoptionApplication.create({
      listingId: listing._id,
      organizationId: listing.organizationId,
      applicant: { name: a.name, phone: a.phone, email: a.email },
      city: a.city,
      homeType: a.homeType,
      hasOutdoorSpace: a.hasOutdoorSpace,
      hasOtherPets: a.hasOtherPets,
      otherPetsDetail: a.otherPetsDetail,
      householdAdults: a.householdAdults,
      hasChildren: a.hasChildren,
      experience: a.experience,
      reason: a.reason,
      status: a.status,
      reviewNote: a.reviewNote,
      reviewedAt: ['approved', 'rejected'].includes(a.status) ? ago(2 * DAY) : undefined,
    });
  }
  console.log(`adoption: ${listings.length} listings, ${APPS.length} applications`);

  /* ---- money, in paise ---- */
  const DONATIONS = [
    { inr: 2500, target: 'platform_fund', name: 'Ashwin Raghavan', status: 'paid', days: 18 },
    { inr: 10000, target: 'platform_fund', name: 'Anonymous', anonymous: true, status: 'paid', days: 14 },
    { inr: 1000, target: 'platform_fund', name: 'Sunita Grover', status: 'paid', days: 9,
      message: 'For the puppies in Rohini.' },
    { inr: 5000, target: 'platform_fund', name: 'Deloitte India (matched giving)', status: 'paid', days: 6 },
    { inr: 3000, target: 'organization', org: 'Paws & Claws Animal Trust', name: 'Kavya Reddy', status: 'paid', days: 11 },
    { inr: 7500, target: 'organization', org: 'Sahara Animal Shelter', name: 'Anonymous', anonymous: true, status: 'paid', days: 7 },
    { inr: 1500, target: 'organization', org: 'Karuna Animal Aid Society', name: 'Zoya Hameed', status: 'paid', days: 4 },
    { inr: 2000, target: 'dog', reportIndex: 0, name: 'Rohan Mistry', status: 'paid', days: 10,
      message: 'Saw this one on the way to work. Please use it for his surgery.' },
    { inr: 500, target: 'platform_fund', name: 'Aman Sethi', status: 'failed', days: 3,
      failureReason: 'Payment declined by bank' },
    { inr: 1200, target: 'platform_fund', name: 'Leena Fernandes', status: 'created', days: 0 },
  ];

  let fundPaise = 0;
  for (const d of DONATIONS) {
    // A donation towards one dog's treatment cannot exist without the report.
    if (d.reportIndex != null && !reports[d.reportIndex]) continue;
    const paidAt = d.status === 'paid' ? ago(d.days * DAY) : undefined;
    if (d.status === 'paid' && d.target === 'platform_fund') fundPaise += d.inr * 100;
    await Donation.create({
      amountPaise: d.inr * 100,
      donor: { name: d.name, anonymous: Boolean(d.anonymous) },
      target: {
        type: d.target,
        organizationId: d.org ? byName[d.org]._id : null,
        dogReportId: d.reportIndex != null ? reports[d.reportIndex].doc._id : null,
      },
      status: d.status,
      paidAt,
      failureReason: d.failureReason,
      message: d.message,
      createdAt: ago((d.days + 0.02) * DAY),
    });
  }

  /* Disbursements can never exceed what the fund actually took in — that is
     the entire point of publishing the ledger. */
  const PAYOUTS = [
    { org: 'Paws & Claws Animal Trust', inr: 6000, purpose: 'surgery',
      note: 'Orthopaedic pinning, road-accident case from Lajpat Nagar', days: 10 },
    { org: 'Sahara Animal Shelter', inr: 4500, purpose: 'treatment',
      note: 'Eight weeks of mange treatment and medicated baths', days: 7 },
    { org: 'Karuna Animal Aid Society', inr: 3000, purpose: 'transport',
      note: 'Fuel and driver costs, April ambulance runs', days: 3 },
  ];

  let paidOut = 0;
  const adminUser = await User.findOne({ role: 'admin' });
  for (const p of PAYOUTS) {
    const paise = p.inr * 100;
    if (paidOut + paise > fundPaise) {
      console.log(`  skipped payout to ${p.org}: would exceed the fund balance`);
      continue;
    }
    paidOut += paise;
    await Disbursement.create({
      organizationId: byName[p.org]._id,
      amountPaise: paise,
      purpose: p.purpose,
      note: p.note,
      disbursedAt: ago(p.days * DAY),
      recordedByUserId: adminUser?._id ?? null,
    });
  }
  console.log(
    `money: fund received ₹${(fundPaise / 100).toLocaleString('en-IN')}, ` +
    `disbursed ₹${(paidOut / 100).toLocaleString('en-IN')}, ` +
    `balance ₹${((fundPaise - paidOut) / 100).toLocaleString('en-IN')}`
  );

  /* ---- credentials ---- */
  console.log('\nsign in with:');
  console.log(`  admin    ${ADMIN_EMAIL}  (your existing password)`);
  for (const org of approved) {
    console.log(`  ${org.kind === 'ngo' ? 'ngo   ' : 'helper'}   ${org.email}  /  ${PASSWORD}`);
  }

  await disconnectDB();
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
