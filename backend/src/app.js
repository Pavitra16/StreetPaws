import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';

import { env, featureStatus, isProd } from './config/env.js';
import { activeProvider } from './services/paymentService.js';
import { attachUser } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import searchRouter from './routes/search.js';
import reportsRouter from './routes/reports.js';
import uploadsRouter from './routes/uploads.js';
import organizationsRouter from './routes/organizations.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import adoptionsRouter from './routes/adoptions.js';
import donationsRouter from './routes/donations.js';

export function createApp() {
  const app = express();

  /**
   * Render, Railway and Fly all terminate TLS at a proxy and forward with
   * X-Forwarded-For. Without this, express-rate-limit v8 refuses to start on
   * the first request (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR) because every client
   * would otherwise share the proxy's IP and one visitor could exhaust the
   * limit for everyone. `secure` cookies depend on it too.
   *
   * 1, not `true`: trusting every hop lets a client spoof its own IP by setting
   * the header, which would defeat the rate limiter it is meant to fix.
   */
  if (isProd) app.set('trust proxy', 1);

  // Sensible security headers. contentSecurityPolicy is off because this app
  // serves only JSON — the CSP that matters belongs to whoever hosts the
  // frontend, and a default-src policy here would do nothing but confuse.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());

  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  /**
   * `verify` hands us the exact bytes before they are parsed. The Razorpay
   * webhook signature is an HMAC over those bytes, and re-serialising the parsed
   * JSON changes key order and whitespace — so the HMAC would never match.
   * Capturing here means the parser can still run normally for every route.
   */
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, res, buf) => {
        // Both gateways sign the raw bytes, so both paths need them kept.
        if (
          req.originalUrl === '/api/donations/webhook' ||
          req.originalUrl === '/api/donations/stripe/webhook'
        ) {
          req.rawBody = buf;
        }
      },
    })
  );
  app.use(cookieParser());
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use(attachUser);

  app.get('/api/health', (req, res) => {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    res.json({
      ok: true,
      env: env.nodeEnv,
      db: states[mongoose.connection.readyState] ?? 'unknown',
      features: featureStatus(),
      // 'demo' means donations are recorded but no money moves.
      paymentProvider: activeProvider(),
      time: new Date().toISOString(),
    });
  });

  app.use('/api/search', searchRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/organizations', organizationsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/adoptions', adoptionsRouter);
  app.use('/api/donations', donationsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
