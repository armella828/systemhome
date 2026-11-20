#!/usr/bin/env node
// ============================================================
// SYSTEMHOME - Backup cifrado de PostgreSQL
// Uso: node backend/backup.js
// Requiere: DATABASE_URL, BACKUP_ENCRYPTION_KEY
// Opcional: BACKUP_DIR, BACKUP_RETENTION_DAYS (0 = conservar siempre), PG_BIN
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, 'backups');
// Por defecto no se elimina ningún respaldo. Solo se activa la retención si el
// administrador define explícitamente un número mayor que cero.
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 0);
const KEY = process.env.BACKUP_ENCRYPTION_KEY;

function log(msg) { console.log(`[backup ${new Date().toISOString()}] ${msg}`); }

function findBinary(name) {
  const candidates = [
    process.env.PG_BIN ? path.join(process.env.PG_BIN, name + (process.platform === 'win32' ? '.exe' : '')) : null,
    path.join(__dirname, '..', '..', 'pg', 'pgsql', 'bin', name + (process.platform === 'win32' ? '.exe' : '')),
    name,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { execFileSync(candidate, ['--version'], { stdio: 'ignore' }); return candidate; } catch (e) { /* siguiente */ }
  }
  throw new Error(`No se encontró ${name}. Instale postgresql-client o defina PG_BIN.`);
}

function normalizeUrl(url) {
  if (!url) throw new Error('DATABASE_URL no configurada');
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/i.test(url);
  if (!isLocal && !/sslmode=/i.test(url)) {
    return url + (url.includes('?') ? '&' : '?') + 'sslmode=require';
  }
  return url;
}

function deriveKey(secret) {
  if (!secret || secret.length < 16) {
    throw new Error('BACKUP_ENCRYPTION_KEY debe tener al menos 16 caracteres');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptFile(inputPath, outputPath, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const input = fs.readFileSync(inputPath);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  // Cabecera: 4 bytes mágicos + IV + ciphertext
  const header = Buffer.from('SHBK', 'utf8');
  fs.writeFileSync(outputPath, Buffer.concat([header, iv, encrypted]));
}

function applyRetention(dir) {
  if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS <= 0) {
    log('Retención desactivada: se conservan todos los respaldos');
    return 0;
  }
  const now = Date.now();
  const cutoff = now - RETENTION_DAYS * 24 * 3600 * 1000;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('systemhome-') && f.endsWith('.dump.enc'));
  let removed = 0;
  for (const file of files) {
    const full = path.join(dir, file);
    if (fs.statSync(full).mtimeMs < cutoff) { fs.unlinkSync(full); removed++; }
  }
  log(`Retención ${RETENTION_DAYS} días: ${removed} backup(s) eliminado(s)`);
}

function main() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const key = deriveKey(KEY);
  const pgDump = findBinary('pg_dump');
  const url = normalizeUrl(process.env.DATABASE_URL);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rawPath = path.join(BACKUP_DIR, `systemhome-${stamp}.dump`);
  const encPath = `${rawPath}.enc`;
  const manifestPath = path.join(BACKUP_DIR, `manifest-${stamp}.json`);

  log('Iniciando pg_dump (formato custom)...');
  execFileSync(pgDump, ['--format=custom', '--no-owner', '--no-privileges', '--file', rawPath, url], { stdio: 'inherit' });

  log('Cifrando backup (AES-256-CBC)...');
  encryptFile(rawPath, encPath, key);
  fs.unlinkSync(rawPath);

  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(encPath)).digest('hex');
  const stats = fs.statSync(encPath);
  const manifest = {
    createdAt: new Date().toISOString(),
    file: path.basename(encPath),
    bytes: stats.size,
    sha256,
    encryption: 'AES-256-CBC (PBKDF2-derived key, SHA-256)',
    database: url.replace(/:\/\/[^@]+@/, '://***@'),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  log(`Backup creado: ${path.basename(encPath)} (${stats.size} bytes)`);
  log(`SHA256: ${sha256}`);
  log(`Manifest: ${path.basename(manifestPath)}`);
  applyRetention(BACKUP_DIR);
}

try { main(); } catch (err) { console.error('ERROR backup:', err.message); process.exit(1); }
