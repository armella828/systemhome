// ============================================================
// SYSTEMHOME - Modulo de seguridad centralizado
// CORS estricto, cabeceras, rate limit, logout y validacion de archivos.
// ============================================================
const cors = require('cors');
let helmet = null;
try { helmet = require('helmet'); } catch (e) { /* fallback manual */ }

// ---------- Fail-fast de secretos en produccion ----------
function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  const secret = process.env.JWT_SECRET || '';
  const Weak = ['dev-secret-systemhome-2026', 'secret', 'changeme', 'test'];
  if (!secret || secret.length < 32 || Weak.includes(secret.toLowerCase())) {
    throw new Error('SEGURIDAD: JWT_SECRET ausente o debil en produccion. Use al menos 32 caracteres aleatorios.');
  }
}

// ---------- Rate limit en memoria (por IP) ----------
const buckets = new Map();
function rateLimiter({ windowMs = 15 * 60 * 1000, max = 10, prefix = 'general' } = {}) {
  return function (req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${prefix}:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.reset) {
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.reset - now) / 1000));
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intente nuevamente más tarde.' });
    }
    next();
  };
}

// Los limites por defecto son de produccion; pueden ampliarse solo en pruebas
const loginLimiter = rateLimiter({
  windowMs: Number(process.env.LOGIN_RATE_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.LOGIN_RATE_MAX || 10),
  prefix: 'login',
});
const recoveryLimiter = rateLimiter({
  windowMs: Number(process.env.RECOVERY_RATE_WINDOW_MS || 60 * 60 * 1000),
  max: Number(process.env.RECOVERY_RATE_MAX || 5),
  prefix: 'recovery',
});
const apiLimiter = rateLimiter({ windowMs: 60 * 1000, max: 120, prefix: 'api' });

// ---------- Revocacion de tokens (logout) ----------
const revoked = new Map();
function revokeToken(token) {
  if (token) revoked.set(token, Date.now() + 12 * 3600 * 1000);
}
function isRevoked(token) {
  if (!token) return false;
  const expiry = revoked.get(token);
  if (!expiry) return false;
  if (expiry < Date.now()) { revoked.delete(token); return false; }
  return true;
}

// ---------- CORS + cabeceras ----------
function configureSecurity(app) {
  assertProductionSecrets();
  app.disable('x-powered-by');

  if (helmet) {
    app.use(helmet({
      contentSecurityPolicy: false, // El frontend carga fuentes/imagenes externas
      crossOriginEmbedderPolicy: false,
    }));
  } else {
    app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });
  }

  const allowed = [process.env.FRONTEND_URL, process.env.APP_URL].filter(Boolean);
  const isDev = process.env.NODE_ENV !== 'production';

  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        return callback(null, true);
      }
      // Sin header CORS: el navegador bloquea la respuesta (evita 500 ruidoso)
      return callback(null, false);
    },
    credentials: true,
  }));
}

// ---------- Validacion de archivos base64 ----------
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function validateUpload({ filename, mimeType, data }) {
  if (!filename || !data) return { ok: false, error: 'Archivo no recibido' };
  const mime = String(mimeType || 'application/octet-stream').toLowerCase();
  if (!ALLOWED_MIMES.has(mime)) {
    return { ok: false, error: 'Tipo de archivo no permitido. Use PDF, imágenes o documentos Word.' };
  }
  const clean = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) {
    return { ok: false, error: 'Contenido base64 inválido' };
  }
  const size = Buffer.byteLength(clean, 'base64');
  if (size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'El archivo supera el límite de 10 MB' };
  }
  const ext = String(filename).toLowerCase().split('.').pop();
  const extMimeMap = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', txt: 'text/plain',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  if (extMimeMap[ext] && extMimeMap[ext] !== mime) {
    return { ok: false, error: 'La extensión no coincide con el tipo de archivo' };
  }
  return { ok: true, size, data: clean };
}

module.exports = {
  configureSecurity,
  assertProductionSecrets,
  rateLimiter,
  loginLimiter,
  recoveryLimiter,
  apiLimiter,
  revokeToken,
  isRevoked,
  validateUpload,
};
