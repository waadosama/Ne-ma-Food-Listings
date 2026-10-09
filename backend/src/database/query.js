import { getPool } from './pool.js';

// Thin helper so services can run parameterized queries without touching
// the pool directly. Always use $1/$2 placeholders — never string
// interpolation — to avoid SQL injection.
export async function query(text, params) {
  return getPool().query(text, params);
}
