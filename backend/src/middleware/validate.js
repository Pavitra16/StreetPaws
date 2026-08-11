import { ApiError } from './errorHandler.js';

/**
 * Validates req[source] against a zod schema and REPLACES it with the parsed
 * result, so controllers work with coerced, trimmed, defaulted values rather
 * than raw strings off the wire.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        details[issue.path.join('.') || '_'] = issue.message;
      }
      return next(ApiError.badRequest('Validation failed', details));
    }
    // req.query is a getter in Express 5 — assigning to it throws, so define instead.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}
