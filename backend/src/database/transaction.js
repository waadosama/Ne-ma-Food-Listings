import { getPool } from './pool.js';

// Runs `fn(client)` inside a single transaction on a dedicated connection.
//
// This exists because the reservation rules span several rows — the listing
// and the request must move together — and a rule spread across separate
// autocommit statements is only ever true if nothing fails in between.
// Everything the callback writes commits or rolls back as one unit.
//
// The callback receives a checked-out client and must do all of its queries
// through it. Using the shared `query()` helper inside would silently hop to
// a different connection, escaping the transaction (and its locks) without
// any error to say so.
//
// ROLLBACK in the catch is deliberately best-effort: if the connection died,
// there is no transaction left to roll back, and masking the original error
// with a second failure would hide the real cause.
export async function withTransaction(fn) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* the original error is the one worth reporting */
    }
    throw error;
  } finally {
    client.release();
  }
}
