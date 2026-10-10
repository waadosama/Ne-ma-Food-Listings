import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { query } from '../database/query.js';
import { ApiError, unauthorized, forbidden, notFoundError } from '../utils/errors.js';

// Three layers of protection, composed per route:
//
//   authenticate            — proves who you are (valid JWT + live user row)
//   requireRole(...)        — proves you have the right role
//   requireVerifiedOrg(...) — proves your organization may participate
//
// The JWT deliberately carries only an identity (user id). Everything else —
// role, active flag, organization, verification status — is re-read from the
// database on every request. A stale or revoked token therefore cannot keep
// acting as an admin, and an organization suspended a second ago is treated
// as suspended right now. That costs one indexed primary-key lookup per
// request, which is the right trade against trusting a claim that may be
// hours old.

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw unauthorized(
        'MISSING_TOKEN',
        'This endpoint requires a Bearer token. Send it as: Authorization: Bearer <token>'
      );
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch (error) {
      // Deliberately vague: distinguishing "expired" from "forged" would
      // leak which tokens were once valid. Expired tokens get a clearer hint
      // because that is a normal, actionable condition.
      throw unauthorized(
        error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        error.name === 'TokenExpiredError'
          ? 'Your session has expired. Please sign in again.'
          : 'The access token is invalid.'
      );
    }

    const { rows } = await query(
      `SELECT u.id, u.role, u.email, u.first_name, u.last_name, u.phone,
              u.is_active, u.organization_id,
              o.verification_status, o.name AS organization_name,
              o.type AS organization_type
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
        WHERE u.id = $1`,
      [payload.sub]
    );

    // The row can vanish while a token is still live (deleted user).
    if (rows.length === 0) {
      throw unauthorized('INVALID_TOKEN', 'The access token is invalid.');
    }

    const user = rows[0];

    // Checked here rather than only at login, so a deactivated account stops
    // working on its very next request.
    if (!user.is_active) {
      throw forbidden('ACCOUNT_DISABLED', 'This account has been deactivated.');
    }

    req.user = {
      id: user.id,
      role: user.role,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      organizationId: user.organization_id,
      organizationName: user.organization_name,
      organizationType: user.organization_type,
      verificationStatus: user.verification_status,
    };

    next();
  } catch (error) {
    next(error);
  }
}

// requireRole('ADMIN') or requireRole('RESTAURANT', 'CHARITY').
// A 403 (not 401): we know exactly who you are, you simply may not do this.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(unauthorized('MISSING_TOKEN', 'Authentication is required.'));
    }
    if (!roles.includes(req.user.role)) {
      return next(
        forbidden(
          'INSUFFICIENT_ROLE',
          `This endpoint requires the ${roles.join(' or ')} role. Your role is ${req.user.role}.`
        )
      );
    }
    next();
  };
}

// Gate for anything that moves food. Admins bypass it (they administer the
// platform rather than operate within an organization); everyone else needs
// an organization that an admin has actually verified.
//
// This is the single choke point behind "new restaurant and charity accounts
// require admin verification before participating in donations" — the rule
// is enforced here, in one place, instead of being remembered in each
// handler.
export function requireVerifiedOrg(req, res, next) {
  if (!req.user) {
    return next(unauthorized('MISSING_TOKEN', 'Authentication is required.'));
  }

  if (req.user.role === 'ADMIN') return next();

  if (!req.user.organizationId) {
    return next(
      forbidden(
        'NO_ORGANIZATION',
        'Your account is not linked to an organization, so it cannot participate in donations.'
      )
    );
  }

  if (req.user.verificationStatus !== 'VERIFIED') {
    return next(
      forbidden(
        'ORGANIZATION_NOT_VERIFIED',
        `Your organization is ${req.user.verificationStatus ?? 'unverified'}. ` +
          'An administrator must verify it before you can participate in donations.'
      )
    );
  }

  next();
}

// The check behind "users must not access or modify another organization's
// private resources". Callers pass the organization id a resource belongs
// to; admins are exempt because they oversee every organization.
export function assertOwnsOrganization(req, organizationId) {
  if (req.user.role === 'ADMIN') return;
  if (Number(req.user.organizationId) !== Number(organizationId)) {
    throw forbidden(
      'NOT_YOUR_ORGANIZATION',
      'You do not have permission to access this organization\'s resources.'
    );
  }
}

// Wraps an async handler so a rejected promise reaches the error handler.
// Without this an async route that throws simply hangs the request.
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export { ApiError, notFoundError };
