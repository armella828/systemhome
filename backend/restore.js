#!/usr/bin/env node
// ============================================================
// SYSTEMHOME - Restauracion de backup cifrado
// Uso: node backend/restore.js [archivo.dump.enc] [--yes] [--db URL]
// Requiere: BACKUP_ENCRYPTION_KEY y DATABASE_URL (o RESTORE_DATABASE_URL)
// ADVERTENCIA: --clean --if-exists sobrescribe los datos de la BD destino.
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const readline = require('readline');

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, 'backups');
const KEY = process.env.BACKUP_ENCRYPTION_KEY;
const args = process.argv.slice(2);
const AUTO = args.includes('--yes');
const dbIndex = args.indexOf('--db');
const TARGET_URL = dbIndex >= 0 ? args[dbIndex + 1] : (process.env.RESTORE_DATABASE_URL || process.env.DATABASE_URL);

function log(msg) { console.log(`[restore ${new Date().toISOString()}] ${msg}`); }

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

function deriveKey(secret) {
  if (!secret || secret.length < 16) throw new Error('BACKUP_ENCRYPTION_KEY inválida');
  return crypto.createHash('sha256').update(secret).digest();
}

function latestBackup() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('systemhome-') && f.endsWith('.dump.enc'))
    .map((f) => ({ f, m: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!files.length) throw new Error('No hay backups cifrados en ' + BACKUP_DIR);
  return path.join(BACKUP_DIR, files[0].f);
}

function decrypt(input, output, key) {
  const buf = fs.readFileSync(input);
  if (buf.subarray(0, 4).toString('utf8') !== 'SHBK') throw new Error('Formato de backup inválido');
  const iv = buf.subarray(4, 20);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const raw = Buffer.concat([decipher.update(buf.subarray(20)), decipher.final()]);
  fs.writeFileSync(output, raw);
}

function confirm(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message + ' (escriba SI para continuar): ', (answer) => {
      rl.close(); resolve(answer.trim().toUpperCase() === 'SI');
    });
  });
}

async function main() {
  const fileArg = args.find((a) => a.endsWith('.dump.enc'));
  const backupFile = fileArg ? (path.isAbsolute(fileArg) ? fileArg : path.join(BACKUP_DIR, fileArg)) : latestBackup();
  if (!fs.existsSync(backupFile)) throw new Error('No existe: ' + backupFile);
  if (!TARGET_URL) throw new Error('Defina DATABASE_URL o RESTORE_DATABASE_URL');
  if (!AUTO) {
    const ok = await confirm(`VA A SOBRESCRIBIR la base destino desde ${path.basename(backupFile)}.`);
    if (!ok) { log('Restauración cancelada'); return; }
  }

  const key = deriveKey(KEY);
  const pgRestore = findBinary('pg_restore');
  const tmp = path.join(require('os').tmpdir(), `systemhome-restore-${Date.now()}.dump`);
  log('Descifrando backup...');
  decrypt(backupFile, tmp, key);
  try {
    log('Restaurando en base destino...');
    execFileSync(pgRestore, [
      '--clean', '--if-exists', '--no-owner', '--no-privileges',
      '--dbname', TARGET_URL, tmp,
    ], { stdio: 'inherit' });
    log('Restauración completada correctamente');
  } finally {
    fs.unlinkSync(tmp);
  }
}

main().catch((err) => { console.error('ERROR restore:', err.message); process.exit(1); });
