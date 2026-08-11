import { isProd } from '../config/env.js';

/** Throw this for any expected failure; anything else is treated as a 500. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }
  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }
  static conflict(message) {
    return new ApiError(409, message);
  }
  static unavailable(message) {
    return new ApiError(503, message);
  }
}

/**
 * Express 5 forwards rejected promises from async handlers automatically, but
 * wrapping keeps behaviour explicit and survives a downgrade to Express 4.
 */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
export function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  // Mongoose validation -> 400 with per-field messages
  if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = 'Validation failed';
    details = Object.fromEntries(
      Object.entries(err.errors).map(([field, e]) => [field, e.message])
    );
  }

  // Malformed ObjectId in a path param -> 400, not a confusing 500
  if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for "${err.path}"`;
  }

  if (err.code === 11000) {
    status = 409;
    message = 'Duplicate value';
    details = err.keyValue;
  }

  if (status >= 500) {
    console.error('[error]', err);
  }

  res.status(status).json({
    error: {
      message,
      ...(details ? { details } : {}),
      ...(isProd || status >= 500 ? {} : { stack: err.stack }),
    },
  });
}
