#!/usr/bin/env node
// Perfiles individuales de técnicos: acceso propio, asignaciones aisladas
// y creación de perfil para técnicos históricos sin usuario.

const BASE = (process.env.TEST_BASE_URL || 'http://127.0.0.1:3200').replace(/\/$/, '');
const { db } = require('../backend/db');
let failures = 0;
const createdTechIds = [];

function ok(cond, label) {
  if (cond) console.log('PASS  ' + label);
  else { failures++; console.error('FAIL  ' + label); }
}

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await resp.text();
  let data = {};
  try { data = JSON.parse(text); } catch (e) { data = { raw: text.slice(0, 200) }; }
  return { status: resp.status, data };
}

(async () => {
  const suffix = Date.now().toString(36);
  const admin = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  ok(admin.status === 200, 'login admin');
  const adminToken = admin.data.token;
  if (!adminToken) throw new Error('Sin token admin');

  const mkTech = async (label) => {
    const username = `qa_${label}_${suffix}`;
    const password = 'Tecnico123';
    const res = await api('POST', '/api/technicians', {
      name: `QA ${label.toUpperCase()} ${suffix}`,
      specialty: 'Prueba automatizada',
      phone: '0981000001',
      username,
      password
    }, adminToken);
    ok(res.status === 201, `crear técnico ${label} con perfil propio: HTTP ${res.status}`);
    if (res.data.technician) createdTechIds.push(res.data.technician.id);
    return { id: res.data.technician?.id, username, password };
  };

  const techA = await mkTech('a');
  const techB = await mkTech('b');
  if (!techA.id || !techB.id) throw new Error('No se pudieron crear los técnicos QA');

  const loginA = await api('POST', '/api/auth/login', { username: techA.username, password: techA.password });
  ok(loginA.status === 200, `${techA.username} inicia sesión con su perfil`);
  const tokenA = loginA.data.token;

  const mkOrder = async (techId) => {
    const res = await api('POST', '/api/workorders', {
      technicianId: techId,
      serviceType: 'Cámaras de Vigilancia',
      priority: 'normal',
      scheduledDate: new Date().toISOString().slice(0, 10),
      description: `Orden QA perfil ${techId}`
    }, adminToken);
    ok(res.status === 201, `crear orden asignada a técnico ${techId}: HTTP ${res.status}`);
    return res.data.workOrder?.id;
  };

  const orderA = await mkOrder(techA.id);
  const orderB = await mkOrder(techB.id);

  const mine = await api('GET', '/api/workorders', undefined, tokenA);
  const ids = (mine.data.workOrders || []).map(o => Number(o.id));
  ok(mine.status === 200, 'listado de órdenes del técnico');
  ok(ids.includes(Number(orderA)), 'el técnico ve su propia orden');
  ok(!ids.includes(Number(orderB)), 'el técnico NO ve la orden de otro técnico');

  const foreignGet = await api('GET', `/api/workorders/${orderB}`, undefined, tokenA);
  ok(foreignGet.status === 404, `detalle de orden ajena bloqueado: HTTP ${foreignGet.status}`);

  const foreignStart = await api('POST', `/api/workorders/${orderB}/start`, {}, tokenA);
  ok(foreignStart.status === 404, `iniciar orden ajena bloqueado: HTTP ${foreignStart.status}`);

  const ownStart = await api('POST', `/api/workorders/${orderA}/start`, {}, tokenA);
  ok(ownStart.status === 200, `iniciar propia orden permitido: HTTP ${ownStart.status}`);

  // Técnico histórico sin user_id: el panel debe poder crearle el perfil.
  const legacyName = `QA HISTORICO ${suffix}`;
  const now = new Date().toISOString();
  const inserted = db.prepare(`
    INSERT INTO technicians (name, specialty, phone, email, user_id, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, 1, ?, ?)
  `).run(legacyName, 'Histórico', '0981000002', '', now, now);
  const legacyId = inserted.lastInsertRowid;
  createdTechIds.push(legacyId);

  const legacyUsername = `qa_historico_${suffix}`;
  const added = await api('PUT', `/api/technicians/${legacyId}`, {
    username: legacyUsername,
    password: 'Historico123'
  }, adminToken);
  ok(added.status === 200, `crear perfil a técnico histórico: HTTP ${added.status}`);

  const loginLegacy = await api('POST', '/api/auth/login', {
    username: legacyUsername,
    password: 'Historico123'
  });
  ok(loginLegacy.status === 200, 'el técnico histórico ya puede iniciar sesión');

  const techList = await api('GET', '/api/technicians', undefined, adminToken);
  const row = (techList.data.technicians || []).find(t => Number(t.id) === Number(legacyId));
  ok(!!row && row.username === legacyUsername, 'el listado muestra el usuario del técnico');

  // Baja lógica de la QA: se conservan los datos, solo se desactivan.
  for (const id of createdTechIds) {
    await api('DELETE', `/api/technicians/${id}`, undefined, adminToken);
  }

  console.log('\nRESULTADO: ' + (failures ? `${failures} FALLOS` : 'Perfiles de técnicos verificados'));
  process.exitCode = failures ? 1 : 0;
})().catch(err => { console.error('ERROR', err); process.exitCode = 1; });
