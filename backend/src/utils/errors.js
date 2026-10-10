// A single error type for anything the API rejects on purpose. Controllers
// and services throw these; the centralized error handler turns them into a
// consistent JSON body:
//
//   { "error": "Bad Request", "code": "VALIDATION_ERROR", "message": "...", "details": [...] }
//
// `code` is the stable, machine-readable identifier clients switch on.
// `message` is human-readable and safe to show. `details` carries per-field
// validation problems when there are any.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details && details.length > 0) this.details = details;
  }
}

// Field-level validation failure. `details` is an array of
// `{ field, message }` so a form can highlight the offending inputs.
export function validationError(details, message = 'The request body is invalid.') {
  return new ApiError(400, 'VALIDATION_ERROR', message, details);
}

export function badRequest(code, message, details) {
  return new ApiError(400, code, message, details);
}

// 401 means "we do not know who you are". 403 means "we know who you are and
// you may not do this". Keeping them distinct matters: a 401 prompts a login,
// a 403 does not.
export function unauthorized(code, message) {
  return new ApiError(401, code, message);
}

export function forbidden(code, message) {
  return new ApiError(403, code, message);
}

export function notFoundError(code, message) {
  return new ApiError(404, code, message);
}

// 409 for "this would duplicate something that already exists" — chiefly a
// registration with an email that is already registered.
export function conflict(code, message, details) {
  return new ApiError(409, code, message, details);
}
