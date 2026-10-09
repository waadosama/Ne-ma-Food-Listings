import pg from 'pg';
import databaseConfig from '../config/database.js';

// One shared connection pool for the whole app. pg reads the connection
// string from databaseConfig and handles reconnects/pooling for us.
const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool(databaseConfig);
  }
  return pool;
}

// Closes the pool cleanly so tests and shutdown hooks can release it.
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
