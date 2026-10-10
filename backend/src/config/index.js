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
};

export default config;
