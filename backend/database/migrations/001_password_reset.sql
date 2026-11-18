-- SYSTEMHOME: tabla para tokens de restablecimiento de contrasena
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_hash ON password_reset_tokens(token_hash);

-- Registro de envios de correo (auditoria)
CREATE TABLE IF NOT EXISTS mail_log (
  id SERIAL PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
