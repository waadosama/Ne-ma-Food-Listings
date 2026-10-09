import dotenv from 'dotenv';

// Load .env as early as possible so every other module sees the variables.
dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3001,
  databaseUrl: process.env.DATABASE_URL || '',
};

export default config;
