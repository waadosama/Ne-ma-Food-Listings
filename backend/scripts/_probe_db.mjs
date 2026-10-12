import pg from 'pg';

const cands = ['postgres', 'password', 'admin', 'nema', '1234', 'root', 'Password1', ''];

for (const p of cands) {
  const c = new pg.Client({ host: 'localhost', port: 5432, user: 'postgres', password: p, database: 'postgres' });
  try {
    await c.connect();
    const dbs = await c.query(`SELECT datname FROM pg_database WHERE datname = 'nema'`);
    console.log('WORKS:', JSON.stringify(p), '| nema exists:', dbs.rows.length > 0);
    await c.end();
    process.exit(0);
  } catch (e) {
    try { await c.end(); } catch {}
  }
}
console.log('none worked');
process.exit(1);
