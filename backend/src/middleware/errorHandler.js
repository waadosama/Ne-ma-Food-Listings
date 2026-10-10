import { ApiError } from '../utils/errors.js';

// Centralized error handler. Express picks this up automatically because it
// takes four arguments. Any thrown/rejected error in a route lands here.
//
// Every failure leaves the API in the same shape:
//
//   { "error": "Bad Request", "code": "VALIDATION_ERROR",
//     "message": "...", "details": [{ "field": "email", "message": "..." }] }
//
// `code` is stable and safe to switch on; `message` is human-readable.

// PostgreSQL error codes that are really client mistakes, not server bugs.
// Translating them here keeps raw database internals out of the response and
// gives each a meaningful HTTP status.
const PG_ERROR_MAP = {
  // 23505 — duplicate key. Most commonly a registration with a taken email.
  '23505': (err) => {
    if (err.constraint === 'users_email_key') {
      return new ApiError(409, 'EMAIL_ALREADY_REGISTERED', 'That email address is already registered.');
    }
    if (err.constraint === 'organizations_name_city_key') {
      return new ApiError(
        409,
        'ORGANIZATION_NAME_IN_USE',
        'An organization with that name already exists in that city.'
      );
    }
    return new ApiError(409, 'CONFLICT', 'That record already exists.');
  },
  // 23503 — referenced row missing or still referenced.
  '23503': () =>
    new ApiError(409, 'RELATED_RECORD_MISSING', 'A record this operation depends on is missing or still in use.'),
  // 23502 — NOT NULL violated.
  '23502': () => new ApiError(400, 'VALIDATION_ERROR', 'A required field was missing.'),
  // 23514 — CHECK constraint violated (e.g. a non-bcrypt password_hash).
  '23514': () => new ApiError(400, 'VALIDATION_ERROR', 'A value failed a database integrity rule.'),
  // 22P02 — invalid input syntax, typically a non-numeric :id in the URL.
  '22P02': () => new ApiError(400, 'INVALID_PARAMETER', 'A path or query parameter was malformed.'),
};

export function errorHandler(err, req, res, next) {
  // Log the stack in development so failures are easy to trace.
  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  // An error we threw on purpose: trust its status, code and message.
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.name,
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // A database constraint we can translate into something client-friendly.
  const translate = PG_ERROR_MAP[err.code];
  if (translate) {
    const apiError = translate(err);
    return res.status(apiError.status).json({
      error: apiError.name,
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
    });
  }

  // Express' body parser signals malformed JSON this way.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Bad Request',
      code: 'INVALID_JSON',
      message: 'Request body is not valid JSON.',
    });
  }

  const status = err.status || 500;

  res.status(status).json({
    error: err.name || 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR',
    message:
      status === 500 && process.env.NODE_ENV === 'production'
        ? 'Something went wrong'
        : err.message,
  });
}
