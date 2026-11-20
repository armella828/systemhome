#!/usr/bin/env node
// Regresión: conservación de datos y página real de verificación de correo.
// Las comprobaciones de código no escriben en la base. Las HTTP son de solo lectura.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = (process.env.TEST_BASE_URL || 'http://127.0.0.1:3200').replace(/\/$/, '');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function pass(msg) { console.log('PASS  ' + msg); }

(async () => {
  const server = read('backend/server.js');
  const db = read('backend/db.js');
  const backup = read('backend/backup.js');
  const migration = read('backend/migrate_sqlite_to_pg.py');
  const render = read('render.yaml');
  const index = read('systemhome/index.html');
  const app = read('systemhome/js/app.js');
  const verifyPage = read('systemhome/verify-email.html');

  assert(!/DELETE\s+FROM\s+users\b/i.test(server), 'server.js aún borra usuarios');
  assert(!/DELETE\s+FROM\s+clients\b/i.test(server), 'server.js aún borra clientes');
  assert(!/DELETE\s+FROM\s+technicians\b/i.test(server), 'server.js aún borra técnicos');
  assert(!/DELETE\s+FROM\s+work_order_assignments\b/i.test(server), 'server.js aún borra asignaciones');
  assert(!/DELETE\s+FROM\s+budget_items\b/i.test(server), 'server.js aún borra líneas de cotización');
  assert(/UPDATE users SET active = 0/.test(server), 'falta baja lógica de usuarios');
  assert(/UPDATE clients SET active = 0/.test(server), 'falta baja lógica de clientes');
  assert(/UPDATE technicians SET active = 0/.test(server), 'falta baja lógica de técnicos');
  assert(/SET active = 0, superseded_at/.test(server), 'falta historial de versiones de cotización');
  assert(/SELECT \* FROM clients WHERE active = 1/.test(server), 'el listado no oculta clientes dados de baja');
  pass('borrados de negocio convertidos en baja lógica');

  assert(/addColumnIfNotExists\('budget_items', 'active'/.test(db), 'falta la columna active en budget_items');
  assert(/addColumnIfNotExists\('budget_items', 'superseded_at'/.test(db), 'falta superseded_at en budget_items');
  pass('migración idempotente añade columnas de historial');

  assert(/BACKUP_RETENTION_DAYS \|\| 0/.test(backup), 'la retención de backups no está desactivada por defecto');
  assert(/RETENTION_DAYS <= 0/.test(backup), 'applyRetention no respeta retención desactivada');
  assert(/BACKUP_RETENTION_DAYS\s*\n\s*value: "0"/.test(render), 'Render no conserva todos los respaldos');
  assert(/ALLOW_DESTRUCTIVE_MIGRATION/.test(migration), 'la migración destructiva no tiene guardia');
  pass('respaldos y migraciones no borran sin autorización explícita');

  assert(fs.existsSync(path.join(ROOT, 'systemhome', 'verify-email.html')), 'falta verify-email.html');
  assert(/api\/auth\/verify-email\?token=/.test(verifyPage), 'la página no llama al endpoint de verificación');
  assert(/Correo verificado correctamente/.test(verifyPage), 'la página no confirma el éxito');
  assert(/api\/auth\/resend-verification/.test(verifyPage), 'la página no permite reenviar el correo');
  assert(!/\/auth\/verify-email\?token=/.test(app), 'quedó un enlace de desarrollo que apunta a la API');
  pass('página de verificación y enlaces correctos');

  for (const [id, label] of [
    ['regName', 'Nombre completo'],
    ['regClientType', 'Tipo de cliente'],
    ['regDocumentId', 'CI / RUC'],
    ['regEmail', 'Correo electrónico'],
    ['regPhone', 'Teléfono / WhatsApp'],
    ['regCity', 'Ciudad'],
    ['regAddress', 'Dirección'],
    ['regUsername', 'Nombre de usuario'],
    ['regPassword', 'Contraseña'],
    ['regConfirmPassword', 'Confirmar contraseña']
  ]) {
    assert(index.includes('for="' + id + '"'), `falta el campo ${id}`);
    assert(index.includes(label), `falta la etiqueta "${label}"`);
  }
  assert(!index.includes('Cómo llenarlo'), 'quedó texto de ayuda "Cómo llenarlo"');
  assert(!index.includes('register-help'), 'quedaron ayudas extensas por campo');
  assert(index.includes('Verificar mi correo'), 'falta la nota de verificación');
  pass('etiquetas claras y directas en el formulario de registro');

  const health = await fetch(BASE + '/api/health').then(r => r.json()).catch(() => null);
  if (health) {
    assert(health.status === 'ok', 'health no responde ok');
    assert(health.version === '2.1.0-no-delete-verify', `versión desplegada incorrecta: ${health.version}`);
    pass('health reporta la versión sin-borrado/verificación');

    const page = await fetch(BASE + '/verify-email?token=prueba');
    const html = await page.text();
    assert(page.ok, `GET /verify-email HTTP ${page.status}`);
    assert(html.includes('Verificación de correo electrónico'), '/verify-email no sirve la página correcta');
    assert(!html.includes('INICIO DE SESIÓN'), '/verify-email cayó al index.html');
    pass('GET /verify-email sirve la página de verificación');
  } else {
    console.log('INFO  servidor no disponible en ' + BASE + '; se omitieron pruebas HTTP');
  }

  console.log('\nRESULTADO: conservación de datos y verificación verificadas');
})().catch(err => {
  console.error('FAIL  ' + err.message);
  process.exit(1);
});
