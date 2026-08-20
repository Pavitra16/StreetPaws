import dotenv from 'dotenv';

dotenv.config();

/**
 * Central env access. Reading process.env anywhere else in the codebase makes it
 * impossible to tell at a glance what configuration the app actually needs.
 */
export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  mongodbUri: process.env.MONGODB_URI,

  /**
   * Skips loading the local CLIP model entirely. For hosts where the ~677 MB
   * runtime + model cannot fit (Render free tier is 512 MB): an OOM there kills
   * the process mid-job, recoverOrphanedJobs() re-queues the same report at
   * boot, and it OOMs again — a crash loop, not a degraded feature. With the
   * flag set, matching runs on attributes + geo + time, which the eval showed
   * carry the combined score (see backend/eval/README.md).
   */
  disableLocalEmbeddings:
    process.env.DISABLE_LOCAL_EMBEDDINGS === '1' ||
    process.env.DISABLE_LOCAL_EMBEDDINGS === 'true',

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'streetdog',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },

  ollama: {
    baseUrl: (process.env.OLLAMA_BASE_URL || '').replace(/\/$/, ''),
    model: process.env.OLLAMA_MODEL || 'llava',
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET,
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'StreetPaws <no-reply@streetpaws.local>',
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },

  /**
   * Which gateway to use when both are configured.
   *
   * Explicit rather than inferred from whichever keys happen to be present:
   * with two sets of credentials in an environment, "whichever loads first"
   * is not something anyone should have to read the code to discover.
   */
  paymentProvider: process.env.PAYMENT_PROVIDER,
};

export const isProd = env.nodeEnv === 'production';

/**
 * Only MONGODB_URI is required to boot. Everything else degrades: an unconfigured
 * Cloudinary means uploads fail with a clear message, an unconfigured Gemini key
 * means reports save without AI analysis. That keeps the app runnable while you
 * are still collecting keys.
 */
export function assertRequiredEnv() {
  const missing = [];
  if (!env.mongodbUri) missing.push('MONGODB_URI');
  // Without a secret, every session token would be forgeable — this is not
  // something to default to a placeholder.
  if (!env.auth.jwtSecret) missing.push('JWT_SECRET');

  /**
   * clientOrigin defaults to localhost so development needs no setup. In
   * production that default is worse than useless: CORS would reject every
   * browser request, and the failure surfaces as a generic network error in
   * the console rather than anything pointing at configuration. Fail at boot
   * instead, where the message can say what is wrong.
   */
  if (isProd && !process.env.CLIENT_ORIGIN) missing.push('CLIENT_ORIGIN');

  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy backend/.env.example to backend/.env and fill it in.'
    );
  }
}

export function featureStatus() {
  return {
    cloudinary: Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret),
    gemini: Boolean(env.gemini.apiKey),
    razorpay: Boolean(env.razorpay.keyId && env.razorpay.keySecret),
    stripe: Boolean(env.stripe.secretKey),
    email: Boolean(env.smtp.host && env.smtp.user && env.smtp.pass),
    ollama: Boolean(env.ollama.baseUrl),
    localEmbeddings: !env.disableLocalEmbeddings,
  };
}
