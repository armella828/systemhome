#!/usr/bin/env node
// Permisos de configuración/solicitudes y cadena completa de notificaciones:
// solicitud -> administrador, cotización enviada -> cliente, visto bueno ->
// administrador + orden + técnico asignado (sin difusión a todos los técnicos).

const fs = require('fs');
const path = require('path');
const { db } = require('../backend/db');

const BASE = (process.env.TEST_BASE_URL || 'http://127.0.0.1:3200').replace(/\/$/, '');
let failures = 0;
const createdTechIds = [];
let restoreActive = [];

function ok(cond, label) {
  if (cond) console.log('PASS  ' + label);
  else { failures++; console.error('FAIL  ' + label); }
}

async function api(method, urlPath, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(BASE + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await resp.text();
  let data = {};
  try { data = JSON.parse(text); } catch (e) { data = { raw: text.slice(0, 200) }; }
  return { status: resp.status, data };
}

async function login(username, password) {
  const res = await api('POST', '/api/auth/login', { username, password });
  ok(res.status === 200, `login ${username}`);
  return res.data.token;
}

function notifOf(list, type, key, value) {
  return (list || []).find(n => {
    if (n.type !== type) return false;
    let data = n.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = {}; } }
    return data && String(data[key]) === String(value);
  });
}

async function notifications(token) {
  const res = await api('GET', '/api/notifications', undefined, token);
  return res.status === 200 ? (res.data.notifications || []) : [];
}

async function createRequest(token, marker) {
  const res = await api('POST', '/api/requests', {
    serviceType: 'camaras',
    description: `${marker} - verificación de notificaciones`,
    address: 'Yacuiba, Bolivia',
    createBudget: true,
    items: [{ concept: 'Cámara QA', qty: 1, price: 100 }]
  }, token);
  ok(res.status === 201, `crear solicitud con cotización: HTTP ${res.status}`);
  return { requestId: res.data.request?.id, budgetId: res.data.budget?.id, number: res.data.request?.number };
}

(async () => {
  const suffix = Date.now().toString(36);
  const marker = `QA NOTIF ${suffix}`;

  const adminToken = await login('admin', 'admin123');
  const clientToken = await login('cliente', 'cliente123');
  const techToken = await login('tecnico', 'tecnico123');
  const sellerToken = await login('vendedor', 'vendedor123');
  if (!adminToken || !clientToken || !techToken || !sellerToken) throw new Error('Faltan credenciales QA');

  // --- 1. UI y permisos: iconos/QR solo administrador, solicitudes sin técnico.
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'systemhome', 'js', 'app.js'), 'utf8');
  ok(/tecnico:\s*\[[^\]]*\]/.test(appJs) && !/tecnico:\s*\[[^\]]*'requests'/.test(appJs),
    'el menú del técnico ya no incluye Solicitudes');
  ok(/\$\{isAdmin \? `\s*<div class="card">[\s\S]*QR de Cobranzas[\s\S]*Iconos del Portal del Cliente[\s\S]*` : ''\}/.test(appJs),
    'QR e iconos del portal aparecen solo para administrador');

  const qrBefore = await api('GET', '/api/settings/payment_qr', undefined, adminToken);
  ok(qrBefore.status === 200, 'admin puede leer la configuración');

  const techPut = await api('PUT', '/api/settings/payment_qr', { value: 'data:image/png;base64,AAAA' }, techToken);
  ok(techPut.status === 403, `técnico NO puede modificar settings: HTTP ${techPut.status}`);
  const sellerPut = await api('PUT', '/api/settings/portal_icons', { value: {} }, sellerToken);
  ok(sellerPut.status === 403, `vendedor NO puede modificar iconos: HTTP ${sellerPut.status}`);

  const techRequests = await api('GET', '/api/requests', undefined, techToken);
  ok(techRequests.status === 403, `técnico NO ve el listado de solicitudes: HTTP ${techRequests.status}`);
  const sellerRequests = await api('GET', '/api/requests', undefined, sellerToken);
  ok(sellerRequests.status === 200, `vendedor conserva su acceso a solicitudes: HTTP ${sellerRequests.status}`);

  // --- 2. Solicitud -> aviso al administrador, nunca al técnico.
  const first = await createRequest(clientToken, marker);
  if (!first.requestId || !first.budgetId) throw new Error('La solicitud QA no generó cotización');

  const adminAfterRequest = await notifications(adminToken);
  ok(!!notifOf(adminAfterRequest, 'nueva_solicitud', 'requestId', first.requestId),
    'la nueva solicitud genera notificación al administrador');

  const techAfterRequest = await notifications(techToken);
  ok(!notifOf(techAfterRequest, 'nueva_solicitud', 'requestId', first.requestId),
    'la nueva solicitud NO se difunde a técnicos');

  const requestDetail = await api('GET', `/api/requests/${first.requestId}`, undefined, techToken);
  ok(requestDetail.status === 403, `técnico NO puede abrir una solicitud: HTTP ${requestDetail.status}`);
  const requestFile = await api('POST', `/api/requests/${first.requestId}/files`, { filename: 'x.png', mimeType: 'image/png', data: 'AAAA' }, techToken);
  ok(requestFile.status === 403, `técnico NO puede adjuntar archivos a solicitudes: HTTP ${requestFile.status}`);

  // --- 3. Cotización enviada -> notificación al cliente dueño.
  const sent = await api('POST', `/api/budgets/${first.budgetId}/send`, {}, adminToken);
  ok(sent.status === 200, `enviar cotización al cliente: HTTP ${sent.status}`);
  const clientAfterSend = await notifications(clientToken);
  ok(!!notifOf(clientAfterSend, 'cotizacion_enviada', 'budgetId', first.budgetId),
    'el cliente recibe la notificación de cotización enviada');

  // --- 4. Visto bueno del cliente -> admin + orden + técnico asignado.
  // Se crea un técnico con perfil y se le deja como primer activo para comprobar
  // que el aviso va solo a él. Los estados originales se restauran al final.
  const techName = `QA ASIGNADO ${suffix}`;
  const otherName = `QA NO ASIGNADO ${suffix}`;
  const mkTech = async (name) => {
    const username = `qa_notif_${name.includes('NO') ? 'b' : 'a'}_${suffix}`;
    const res = await api('POST', '/api/technicians', {
      name, specialty: 'QA', phone: '0981000099', username, password: 'Tecnico123'
    }, adminToken);
    ok(res.status === 201, `crear técnico con perfil ${name}: HTTP ${res.status}`);
    if (res.data.technician) createdTechIds.push(res.data.technician.id);
    return { id: res.data.technician?.id, username, token: null };
  };

  let assigned;
  let other;
  try {
    assigned = await mkTech(techName);
    other = await mkTech(otherName);
    if (!assigned.id || !other.id) throw new Error('No se pudieron crear los técnicos QA');

    const assignedLogin = await login(assigned.username, 'Tecnico123');
    const otherLogin = await login(other.username, 'Tecnico123');
    assigned.token = assignedLogin;
    other.token = otherLogin;

    const lowerActive = db.prepare('SELECT id, active FROM technicians WHERE active = 1 AND id < ?').all(assigned.id);
    restoreActive = lowerActive.map(t => t.id);
    lowerActive.forEach(t => db.prepare('UPDATE technicians SET active = 0 WHERE id = ?').run(t.id));

    const approved = await api('POST', `/api/budgets/${first.budgetId}/approve`, {}, clientToken);
    ok(approved.status === 200, `cliente aprueba la cotización: HTTP ${approved.status}`);
    const orderId = approved.data.workOrderId;
    ok(!!orderId, 'la aprobación genera orden de trabajo');

    const adminAfterApprove = await notifications(adminToken);
    ok(!!notifOf(adminAfterApprove, 'cotizacion_aprobada', 'budgetId', first.budgetId),
      'la aprobación genera notificación al administrador');

    const clientAfterApprove = await notifications(clientToken);
    ok(!!notifOf(clientAfterApprove, 'cotizacion_aprobada', 'budgetId', first.budgetId),
      'el cliente confirma su visto bueno y la orden generada');

    const assignedNotifications = await notifications(assigned.token);
    ok(!!notifOf(assignedNotifications, 'orden_asignada', 'orderId', orderId),
      'solo el técnico asignado recibe la orden');

    const otherNotifications = await notifications(other.token);
    ok(!notifOf(otherNotifications, 'orden_asignada', 'orderId', orderId),
      'los demás técnicos NO reciben la orden de otro');
  } finally {
    restoreActive.forEach(id => db.prepare('UPDATE technicians SET active = 1 WHERE id = ?').run(id));
  }

  // --- 5. Rechazo -> aviso al administrador.
  const rejected = await createRequest(clientToken, `RECHAZO ${suffix}`);
  const rejectResp = await api('POST', `/api/budgets/${rejected.budgetId}/reject`, { reason: 'QA' }, clientToken);
  ok(rejectResp.status === 200, `cliente rechaza cotización: HTTP ${rejectResp.status}`);
  const adminAfterReject = await notifications(adminToken);
  ok(!!notifOf(adminAfterReject, 'cotizacion_rechazada', 'budgetId', rejected.budgetId),
    'el rechazo genera notificación al administrador');

  // Baja lógica de los técnicos QA: no se borra ningún dato.
  for (const id of createdTechIds) {
    await api('DELETE', `/api/technicians/${id}`, undefined, adminToken);
  }

  console.log('\nRESULTADO: ' + (failures ? `${failures} FALLOS` : 'Permisos y notificaciones verificados'));
  process.exitCode = failures ? 1 : 0;
})().catch(err => {
  console.error('ERROR', err);
  process.exitCode = 1;
});
