import { validationError } from './errors.js';

// Minimal, dependency-free request validation.
//
// Every function collects problems instead of throwing on the first one, so
// a form gets the whole list back in a single response rather than
// one-error-at-a-time.
//
// `assertNoUnknownFields` is the load-bearing piece for the security
// requirement that clients cannot smuggle `role`, `organization_id` or
// `verification_status` through a public endpoint. Anything not explicitly
// allowed is rejected outright rather than silently ignored, so a typo in a
// client never quietly becomes a no-op.

export class Validator {
  constructor(body) {
    this.body = body ?? {};
    this.values = {};
    this.problems = [];
  }

  // Rejects the request if the payload carries keys outside `allowed`.
  allowOnly(allowed) {
    if (typeof this.body !== 'object' || Array.isArray(this.body)) {
      this.problems.push({ field: '_body', message: 'Body must be a JSON object.' });
      return this;
    }

    const unknown = Object.keys(this.body).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      this.problems.push({
        field: unknown[0],
        message:
          `Unknown field(s): ${unknown.join(', ')}. ` +
          `Allowed fields: ${allowed.join(', ')}. ` +
          'Role and verification status cannot be set through this endpoint.',
      });
    }
    return this;
  }

  string(field, { required = true, min = 1, max = 1000, lower = false, trim = true } = {}) {
    const raw = this.body[field];

    if (raw === undefined || raw === null || raw === '') {
      if (required) this.problems.push({ field, message: `${field} is required.` });
      return this;
    }

    if (typeof raw !== 'string') {
      this.problems.push({ field, message: `${field} must be a string.` });
      return this;
    }

    const value = trim ? raw.trim() : raw;
    const normalized = lower ? value.toLowerCase() : value;

    if (normalized.length < min) {
      this.problems.push({ field, message: `${field} must be at least ${min} character(s).` });
      return this;
    }
    if (normalized.length > max) {
      this.problems.push({ field, message: `${field} must be at most ${max} character(s).` });
      return this;
    }

    this.values[field] = normalized;
    return this;
  }

  email(field = 'email') {
    const raw = this.body[field];

    if (raw === undefined || raw === null || raw === '') {
      this.problems.push({ field, message: `${field} is required.` });
      return this;
    }
    if (typeof raw !== 'string') {
      this.problems.push({ field, message: `${field} must be a string.` });
      return this;
    }

    // Lowercased at the boundary to match the schema's users_email_lowercase
    // CHECK — otherwise the database rejects the insert with a raw error.
    const value = raw.trim().toLowerCase();

    if (value.length > 254) {
      this.problems.push({ field, message: `${field} must be at most 254 characters.` });
      return this;
    }
    // Mirrors the regex used by the schema's CHECK constraints.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      this.problems.push({ field, message: `${field} must be a valid email address.` });
      return this;
    }

    this.values[field] = value;
    return this;
  }

  password(field = 'password', { required = true } = {}) {
    const raw = this.body[field];

    if (raw === undefined || raw === null || raw === '') {
      if (required) this.problems.push({ field, message: `${field} is required.` });
      return this;
    }
    if (typeof raw !== 'string') {
      this.problems.push({ field, message: `${field} must be a string.` });
      return this;
    }
    // Length beats complexity rules. 8 is the floor; a max guards against
    // bcrypt silently truncating at 72 bytes and against hashing DoS.
    if (raw.length < 8) {
      this.problems.push({ field, message: `${field} must be at least 8 characters.` });
      return this;
    }
    if (raw.length > 72) {
      this.problems.push({ field, message: `${field} must be at most 72 characters.` });
      return this;
    }

    this.values[field] = raw;
    return this;
  }

  oneOf(field, allowed, { required = true } = {}) {
    const raw = this.body[field];

    if (raw === undefined || raw === null || raw === '') {
      if (required) {
        this.problems.push({ field, message: `${field} is required. Allowed values: ${allowed.join(', ')}.` });
      }
      return this;
    }
    if (!allowed.includes(raw)) {
      this.problems.push({ field, message: `${field} must be one of: ${allowed.join(', ')}.` });
      return this;
    }

    this.values[field] = raw;
    return this;
  }

  number(field, { required = true, min, max } = {}) {
    const raw = this.body[field];

    if (raw === undefined || raw === null || raw === '') {
      if (required) this.problems.push({ field, message: `${field} is required.` });
      return this;
    }
    const value = Number(raw);
    if (Number.isNaN(value)) {
      this.problems.push({ field, message: `${field} must be a number.` });
      return this;
    }
    if (min !== undefined && value < min) {
      this.problems.push({ field, message: `${field} must be at least ${min}.` });
      return this;
    }
    if (max !== undefined && value > max) {
      this.problems.push({ field, message: `${field} must be at most ${max}.` });
      return this;
    }

    this.values[field] = value;
    return this;
  }

  // Parses an ISO-8601 timestamp and hands back a normalized string. Used
  // for pickup and use-by deadlines, where "is this even a date?" and "is it
  // in the future?" are separate questions — the future check needs the
  // surrounding context (e.g. a deadline being extended), so it stays with
  // the caller.
  isoDate(field, { required = true } = {}) {
    const raw = this.body[field];

    if (raw === undefined || raw === null || raw === '') {
      if (required) this.problems.push({ field, message: `${field} is required.` });
      return this;
    }
    if (typeof raw !== 'string') {
      this.problems.push({ field, message: `${field} must be an ISO-8601 timestamp string.` });
      return this;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      this.problems.push({
        field,
        message: `${field} must be a valid ISO-8601 timestamp, e.g. 2026-10-12T18:00:00Z.`,
      });
      return this;
    }

    this.values[field] = parsed.toISOString();
    return this;
  }

  // Throws a 400 carrying every collected problem, or hands back the
  // normalized values for the service layer to use.
  result() {
    if (this.problems.length > 0) throw validationError(this.problems);
    return this.values;
  }
}

export function validate(body) {
  return new Validator(body);
}
