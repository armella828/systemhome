/**
 * SYSTEMHOME - Recuperacion de contrasena por correo real.
 * Usa la interfaz db existente (SQLite/Postgres) y el mailer SMTP.
 */
const crypto = require('crypto');
const { sendPasswordReset, isConfigured } = require('./mailer');

const TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES || 30);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function ensureTables(db, isPostgres) {
  const serial = isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id ${serial},
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
  `);
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_password_reset_hash ON password_reset_tokens(token_hash)'); } catch (e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id)'); } catch (e) {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS mail_log (
      id ${serial}, recipient TEXT NOT NULL, subject TEXT NOT NULL,
      type TEXT NOT NULL, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL
    )`);
  } catch (e) {}
}

function logMail(db, recipient, subject, type, status, error) {
  try {
    db.prepare('INSERT INTO mail_log (recipient, subject, type, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(recipient, subject, type, status, error || null, new Date().toISOString());
  } catch (e) { console.error('mail_log error:', e.message); }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function createResetRequest(db, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { accepted: true }; // no revelar si existe

  const user = db.prepare('SELECT id, full_name, email FROM users WHERE LOWER(email) = LOWER(?) AND active = 1').get(normalized);
  if (!user || !user.email) return { accepted: true }; // respuesta uniforme

  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + TTL_MINUTES * 60 * 1000);

  // Invalidar tokens anteriores del usuario
  try {
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL')
      .run(now.toISOString(), user.id);
  } catch (e) {}

  db.prepare('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(user.id, hashToken(token), expires.toISOString(), now.toISOString());

  let mailResult = { sent: false, reason: 'SMTP_NOT_CONFIGURED' };
  try {
    mailResult = await sendPasswordReset(user.email, user.full_name || user.email, token, TTL_MINUTES);
  } catch (err) {
    mailResult = { sent: false, reason: err.message };
  }
  logMail(db, user.email, 'Restablece tu contrasena', 'password_reset',
    mailResult.sent ? 'sent' : 'failed', mailResult.reason);

  // En desarrollo sin SMTP, devolver el token para poder probar el flujo.
  const expose = process.env.NODE_ENV !== 'production' && !isConfigured();
  return { accepted: true, devToken: expose ? token : undefined };
}

async function validateToken(db, token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL').get(hashToken(token));
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

async function resetPassword(db, token, newPassword, bcrypt) {
  const row = await validateToken(db, token);
  if (!row) return { ok: false, error: 'Enlace invalido o expirado' };
  if (String(newPassword || '').length < 8) {
    return { ok: false, error: 'La contrasena debe tener al menos 8 caracteres' };
  }
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, now, row.user_id);
  db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now, row.id);
  return { ok: true };
}

module.exports = { ensureTables, createResetRequest, validateToken, resetPassword, logMail };
