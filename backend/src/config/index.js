import crypto from 'node:crypto';
import dotenv from 'dotenv';

// Load .env as early as possible so every other module sees the variables.
dotenv.config();

const env = process.env.NODE_ENV || 'development';

// In production a missing or weak JWT secret is a hard failure: tokens would
// be forgeable, which is worse than not shipping auth at all. In development
// we fall back to an ephemeral random secret so the app still boots, with a
// loud warning that all tokens die on restart.
function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET || '';

  if (secret) {
    if (env === 'production' && secret.length < 32) {
      throw new Error(
        'JWT_SECRET must be at least 32 characters in production. ' +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
      );
    }
    return { secret, generated: false };
  }

  if (env === 'production') {
    throw new Error(
      'JWT_SECRET is required in production. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }

  console.warn(
    '[config] JWT_SECRET is not set — using an ephemeral development secret. ' +
      'Tokens will be rejected after a restart. Set JWT_SECRET in backend/.env.'
  );
  return { secret: crypto.randomBytes(48).toString('hex'), generated: true };
}

const jwtSecret = resolveJwtSecret();

const config = {
  env,
  port: Number(process.env.PORT) || 3001,
  databaseUrl: process.env.DATABASE_URL || '',
  jwt: {
    secret: jwtSecret.secret,
    // Short-lived by default: a leaked token should stop working quickly.
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
  // Cost factor for bcrypt. Raising it makes cracking slower but login
  // slower too; 10 is a reasonable default for an MVP, and the seed uses
  // the same value so hashes stay comparable.
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,

  // The single administrator account, created by the seed. Exactly one admin
  // exists: registration only offers the RESTAURANT and CHARITY roles, so
  // there is no self-service path to this role and no way to grow a second
  // admin by accident.
  //
  // The password is required to come from the environment. A committed
  // default would be the most-attacked string in the repository, and the
  // admin is the only account that can verify organizations and read every
  // tenant's data. Development falls back to a well-known throwaway value
  // with a warning; production refuses to seed without one.
  admin: {
    email: process.env.ADMIN_EMAIL || 'nema.admin@example.com',
    password: process.env.ADMIN_PASSWORD || '',
    firstName: process.env.ADMIN_FIRST_NAME || 'Nema',
    lastName: process.env.ADMIN_LAST_NAME || 'Admin',
  },
};

export default config;
