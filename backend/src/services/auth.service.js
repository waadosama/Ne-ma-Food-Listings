import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { query } from '../database/query.js';
import { getPool } from '../database/pool.js';
import { unauthorized, forbidden, badRequest } from '../utils/errors.js';

// Registration creates a user AND, for non-admin roles, the organization
// that user will operate. The two are written in one transaction: a user
// without an organization would be unusable, and an organization without an
// owner would be unmanageable.
//
// SECURITY: `role` is restricted to RESTAURANT and CHARITY, and
// `verification_status` is never read from the request at all — the column
// is simply omitted from the INSERT so it takes the schema default of
// PENDING. There is no field a client can send to self-verify or to become
// an admin. Admin accounts are provisioned out of band (seed data today).
export async function register(input) {
  const { role, email, password, firstName, lastName, phone, organization } = input;

  if (role !== 'RESTAURANT' && role !== 'CHARITY') {
    throw badRequest(
      'ROLE_NOT_ALLOWED',
      'role must be RESTAURANT or CHARITY. Administrator accounts cannot be self-registered.'
    );
  }

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (role, email, password_hash, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [role, email, passwordHash, firstName, lastName, phone ?? null]
    );
    const userId = userResult.rows[0].id;

    // verification_status is intentionally absent: it defaults to PENDING.
    const orgResult = await client.query(
      `INSERT INTO organizations
         (type, name, description, contact_email, contact_phone, contact_name,
          address_line, city, region, postal_code, country, latitude, longitude,
          owner_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, verification_status`,
      [
        organization.type,
        organization.name,
        organization.description ?? null,
        organization.contactEmail ?? email,
        organization.contactPhone ?? phone ?? null,
        organization.contactName ?? `${firstName} ${lastName}`,
        organization.addressLine,
        organization.city,
        organization.region ?? null,
        organization.postalCode ?? null,
        organization.country ?? 'Saudi Arabia',
        organization.latitude ?? null,
        organization.longitude ?? null,
        userId,
      ]
    );

    await client.query('UPDATE users SET organization_id = $2 WHERE id = $1', [
      userId,
      orgResult.rows[0].id,
    ]);

    await client.query('COMMIT');

    const user = await findUserById(userId);
    return {
      user: toPublicUser(user),
      token: signToken(user),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// A hash to compare against when no user matches, so a login for an unknown
// email takes roughly as long as one for a real account. Without this, response
// timing reveals which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('nema-timing-equalizer', 10);

export async function login({ email, password }) {
  const user = await findUserByEmail(email);

  // Always run a comparison, even with no user, to keep timing flat.
  const hash = user?.password_hash ?? DUMMY_HASH;
  const matches = await bcrypt.compare(password, hash);

  if (!user || !matches) {
    // One message for both cases on purpose: "no such user" and "wrong
    // password" must be indistinguishable, or the endpoint becomes an email
    // oracle.
    throw unauthorized('INVALID_CREDENTIALS', 'Incorrect email or password.');
  }

  if (!user.is_active) {
    throw forbidden('ACCOUNT_DISABLED', 'This account has been deactivated. Contact an administrator.');
  }

  return {
    user: toPublicUser(user),
    token: signToken(user),
  };
}

export async function getProfile(userId) {
  const user = await findUserById(userId);
  return toPublicUser(user);
}

// Only the fields a person may reasonably change about themselves. Role,
// organization and active status are absent from both the allow-list and the
// UPDATE statement, so there is no path from this endpoint to privilege
// escalation.
export async function updateProfile(userId, input) {
  const { firstName, lastName, phone, currentPassword, newPassword } = input;

  if (newPassword !== undefined) {
    if (!currentPassword) {
      throw badRequest('CURRENT_PASSWORD_REQUIRED', 'currentPassword is required to change your password.');
    }
    const user = await findUserById(userId);
    const matches = await bcrypt.compare(currentPassword, user.password_hash ?? DUMMY_HASH);
    if (!matches) {
      throw unauthorized('INVALID_CREDENTIALS', 'Your current password is incorrect.');
    }
  }

  const passwordHash = newPassword ? await bcrypt.hash(newPassword, config.bcryptRounds) : null;

  await query(
    `UPDATE users
        SET first_name  = COALESCE($2, first_name),
            last_name   = COALESCE($3, last_name),
            phone       = COALESCE($4, phone),
            password_hash = COALESCE($5, password_hash)
      WHERE id = $1`,
    [userId, firstName ?? null, lastName ?? null, phone ?? null, passwordHash]
  );

  const user = await findUserById(userId);
  return toPublicUser(user);
}

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

function signToken(user) {
  // Only identity goes in the token. Role, organization and verification
  // status are re-read from the database on every request (see
  // middleware/auth.js), so a token can never outlive a deactivation or a
  // revoked verification.
  return jwt.sign({ sub: String(user.id) }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

async function findUserById(id) {
  const { rows } = await query(
    `SELECT u.*, o.name AS organization_name, o.type AS organization_type,
            o.verification_status, o.city AS organization_city,
            o.address_line AS organization_address_line
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = $1`,
    [id]
  );
  if (rows.length === 0) throw unauthorized('INVALID_TOKEN', 'The access token is invalid.');
  return rows[0];
}

async function findUserByEmail(email) {
  const { rows } = await query(
    `SELECT u.*, o.name AS organization_name, o.type AS organization_type,
            o.verification_status, o.city AS organization_city,
            o.address_line AS organization_address_line
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.email = $1`,
    [email]
  );
  return rows[0] ?? null;
}

// Shapes the row for the wire. `password_hash` is never included — it is
// selected only so password checks can use it, and dropped here.
function toPublicUser(user) {
  return {
    id: user.id,
    role: user.role,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.phone,
    isActive: user.is_active,
    createdAt: user.created_at,
    organization: user.organization_id
      ? {
          id: user.organization_id,
          name: user.organization_name,
          type: user.organization_type,
          city: user.organization_city,
          addressLine: user.organization_address_line,
          verificationStatus: user.verification_status,
        }
      : null,
  };
}
