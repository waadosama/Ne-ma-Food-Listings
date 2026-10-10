import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, closePool } from './pool.js';

// Applies db/schema.sql to the database in DATABASE_URL, then optionally
// loads the development seed data.
//
//   node src/database/setup.js          # schema only
//   node src/database/setup.js --seed   # schema + seed data
//
// schema.sql is idempotent — it drops and recreates every object — so this
// is safe to re-run and always yields a known-clean database. That is the
// reproducible setup: no manual DDL, no "works on my machine" drift.
const schemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/schema.sql'
);

async function applySchema(pool) {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log(`Applied schema from ${path.relative(process.cwd(), schemaPath)}`);
}

async function reportCounts(pool) {
  // Exact counts rather than pg_stat_user_tables' n_live_tup estimate, which
  // stays 0 until autovacuum analyzes the table and would under-report
  // immediately after a fresh seed.
  const { rows: tables } = await pool.query(`
    SELECT c.relname AS table_name
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND c.relname <> 'schema_migrations'
    ORDER BY c.relname
  `);

  for (const { table_name } of tables) {
    // Table names come from pg_class, not from user input. They are still
    // interpolated rather than bound because PostgreSQL does not accept
    // placeholders for identifiers.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS row_count FROM "${table_name}"`
    );
    console.log(`  ${table_name.padEnd(16)} ${rows[0].row_count} row(s)`);
  }
}

async function setup() {
  const withSeed = process.argv.includes('--seed');
  const pool = getPool();

  try {
    // Prove the connection works before touching anything, and fail with a
    // message that says what to fix rather than a raw driver error.
    await pool.query('SELECT 1');
    console.log(`Connected to ${redactConnectionString(pool.options.connectionString)}`);

    await applySchema(pool);

    if (withSeed) {
      const { default: runSeed } = await import('./seed.js');
      await runSeed();
    }

    console.log('\nFinal state:');
    await reportCounts(pool);
  } finally {
    await closePool();
  }
}

// Never print the password that is embedded in a connection string.
function redactConnectionString(connectionString = '') {
  try {
    const url = new URL(connectionString);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

setup().catch((error) => {
  console.error('Database setup failed:', error.message);
  process.exit(1);
});
