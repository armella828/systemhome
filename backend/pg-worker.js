// ============================================================
// SYSTEMHOME - Worker de PostgreSQL
// Escribe respuestas en SharedArrayBuffer para no depender de
// que el hilo principal procese eventos (Atomics.wait lo bloquea).
// ============================================================
const { parentPort } = require('worker_threads');
const { Pool } = require('pg');

const conn = process.env.DATABASE_URL || '';
const needsSSL = /sslmode=require|render\.com|neon\.tech|supabase|elephantsql|heroku/i.test(conn);

const pool = new Pool({
  connectionString: conn,
  ...(needsSSL ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

function respond(ctrlSab, dataSab, payload) {
  const ctrl = new Int32Array(ctrlSab);
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const view = new Uint8Array(dataSab);
  const len = Math.min(bytes.length, view.length);
  view.set(bytes.subarray(0, len), 0);
  Atomics.store(ctrl, 1, len);
  Atomics.store(ctrl, 0, 1);
  Atomics.notify(ctrl, 0);
}

parentPort.on('message', async ({ sql, params, ctrlSab, dataSab }) => {
  try {
    const result = await pool.query(sql, params || []);
    respond(ctrlSab, dataSab, { rows: result.rows || [], rowCount: result.rowCount || 0 });
  } catch (err) {
    respond(ctrlSab, dataSab, { error: err.message, rows: [], rowCount: 0 });
  }
});

pool.on('error', (err) => console.error('PG pool error:', err.message));
