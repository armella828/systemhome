#!/usr/bin/env node
// ============================================================
// SYSTEMHOME - Rotacion de credenciales demo
// Lee contraseñas desde variables de entorno. Si faltan, genera
// valores aleatorios fuertes y los muestra UNA SOLA VEZ.
// Nunca guardar contraseñas reales en el repositorio.
// ============================================================
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, initSchema } = require('./db');

const ACCOUNTS = [
  { username: 'admin', envKey: 'ADMIN_PASSWORD' },
  { username: 'vendedor', envKey: 'VENDEDOR_PASSWORD' },
  { username: 'tecnico', envKey: 'TECNICO_PASSWORD' },
  { username: 'cliente', envKey: 'CLIENTE_PASSWORD' },
];

function main() {
  initSchema();
  const generated = {};
  for (const account of ACCOUNTS) {
    let password = process.env[account.envKey];
    if (!password) {
      password = crypto.randomBytes(15).toString('base64url') + 'Aa1!';
      generated[account.username] = password;
    }
    if (password.length < 12) {
      throw new Error(`${account.envKey} debe tener al menos 12 caracteres`);
    }
    const hash = bcrypt.hashSync(password, 12);
    const result = db.prepare(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE LOWER(username) = LOWER(?)'
    ).run(hash, new Date().toISOString(), account.username);
    console.log(`Rotada contraseña de '${account.username}' (filas: ${result.changes})`);
  }

  if (Object.keys(generated).length) {
    console.log('\n=== CONTRASEÑAS GENERADAS — GUARDAR EN GESTOR SEGURO ===');
    for (const [user, pass] of Object.entries(generated)) {
      console.log(`${user}: ${pass}`);
    }
    console.log('========================================================\n');
  }
  console.log('Rotacion completada. Las sesiones activas siguen validas hasta expirar.');
}

try {
  main();
} catch (err) {
  console.error('Error en rotacion:', err.message);
  process.exit(1);
}
