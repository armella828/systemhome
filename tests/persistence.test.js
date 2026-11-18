#!/usr/bin/env node
// Regresión: el seed no debe borrar inventario real y los datos deben
// persistir al volver a consultarlos (simulando recarga de página).

const fs = require('fs');
const path = require('path');

const BASE = (process.env.TEST_BASE_URL || 'http://127.0.0.1:3200').replace(/\/$/, '');
const PASS = Date.now().toString(36);
const PRODUCT_NAME = `PRUEBA_PERSISTENCIA_${PASS}`;

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function req(method, urlPath, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(BASE + urlPath, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  return { status: resp.status, data };
}

(async () => {
  const dbSource = fs.readFileSync(path.join(__dirname, '..', 'backend', 'db.js'), 'utf8');
  assert(!/DELETE\s+FROM\s+inventory_items/i.test(dbSource), 'El seed aún elimina inventario');
  assert(!/invCount\s*<\s*10/.test(dbSource), 'El seed aún se dispara con menos de 10 productos');
  assert(/invCount === 0/.test(dbSource), 'El seed no exige tabla vacía');
  console.log('PASS  seed nunca borra inventario y solo siembra tabla vacía');

  const login = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  assert(login.status === 200, `login HTTP ${login.status}`);
  const token = login.data.token;

  const created = await req('POST', '/api/inventory', {
    name: PRODUCT_NAME, category: 'pruebas', brand: 'QA', model: 'PERSIST',
    stock: 2, price: 123.45, showInCatalog: false,
  }, token);
  assert(created.status === 201, `crear producto HTTP ${created.status}: ${JSON.stringify(created.data)}`);
  const id = created.data.inventoryItem.id;

  const before = await req('GET', '/api/inventory', null, token);
  assert(before.status === 200, `listar HTTP ${before.status}`);
  assert(before.data.inventory.some(i => i.id === id), 'producto no aparece en inventario');

  // "Recarga": nuevo login con token distinto y nueva lectura.
  const relogin = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  assert(relogin.status === 200, `relogin HTTP ${relogin.status}`);
  const after = await req('GET', '/api/inventory', null, relogin.data.token);
  assert(after.data.inventory.some(i => i.id === id), 'producto desapareció tras reiniciar sesión');

  const del = await req('DELETE', `/api/inventory/${id}`, null, relogin.data.token);
  assert(del.status === 200, `limpieza HTTP ${del.status}`);
  const final = await req('GET', '/api/inventory', null, relogin.data.token);
  assert(!final.data.inventory.some(i => i.id === id), 'producto de prueba no se limpió');
  console.log('PASS  producto creado, persistido tras relogin y consulta; prueba limpiada');
  console.log('\nRESULTADO: persistencia verificada');
})().catch(err => {
  console.error('FAIL ', err.message);
  process.exit(1);
});
