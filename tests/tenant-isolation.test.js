#!/usr/bin/env node
// Aislamiento real por cliente + registro con verificación.
// Usa datos ya existentes en staging; solo crea (y limpia) un usuario de prueba.

const BASE = (process.env.TEST_BASE_URL || 'http://127.0.0.1:3200').replace(/\/$/, '');
const PASS = Date.now().toString(36);
let failures = 0;

function ok(cond, label) {
  if (cond) console.log('PASS  ' + label);
  else { failures++; console.error('FAIL  ' + label); }
}

async function req(method, urlPath, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(BASE + urlPath, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await resp.text();
  let data = {};
  try { data = JSON.parse(text); } catch (e) { data = { raw: text.slice(0, 100) }; }
  return { status: resp.status, data };
}

(async () => {
  // --- 1. Cliente autenticado no puede tocar recursos ajenos ---
  const login = await req('POST', '/api/auth/login', { username: 'cliente', password: 'cliente123' });
  ok(login.status === 200, 'login cliente');
  const token = login.data.token;
  const ownClientId = login.data.user.clientId;
  ok(!!ownClientId, 'cliente tiene client_id vinculado al usuario');

  const foreignBudgets = [1, 2, 8]; // pertenecen a otros clientes en staging
  for (const id of foreignBudgets) {
    const exp = await req('GET', `/api/budgets/${id}/export`, undefined, token);
    ok(exp.status === 404, `export PDF cotización ajena ${id} bloqueado (HTTP ${exp.status})`);
    const appr = await req('POST', `/api/budgets/${id}/approve`, {}, token);
    ok(appr.status === 404, `aprobar cotización ajena ${id} bloqueado (HTTP ${appr.status})`);
    const rej = await req('POST', `/api/budgets/${id}/reject`, { reason: 'test' }, token);
    ok(rej.status === 404, `rechazar cotización ajena ${id} bloqueado (HTTP ${rej.status})`);
  }

  // Crear una cotización propia con el admin para comprobar que el acceso sí funciona.
  const adminLogin = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  const adminToken = adminLogin.data.token;
  const ownBudget = await req('POST', '/api/budgets', {
    clientId: ownClientId, serviceType: 'Prueba', description: 'Cotización propia QA',
    items: [{ concept: 'Prueba de aislamiento', qty: 1, price: 100 }], total: 100, status: 'borrador'
  }, adminToken);
  ok(ownBudget.status === 201, 'admin crea cotización del cliente QA');
  const ownExport = await req('GET', `/api/budgets/${ownBudget.data.budget.id}/export`, undefined, token);
  ok(ownExport.status === 200, 'export PDF de cotización propia permitido');

  const wo = await req('GET', '/api/workorders/1', undefined, token);
  ok(wo.status === 404, 'orden de trabajo ajena bloqueada (HTTP ' + wo.status + ')');
  const woPut = await req('PUT', '/api/workorders/1', { status: 'cerrada' }, token);
  ok(woPut.status === 404, 'modificar orden ajena bloqueado (HTTP ' + woPut.status + ')');

  const files = await req('POST', '/api/requests/9/files', { filename: 'x.txt', mimeType: 'text/plain', data: 'eA==' }, token);
  ok(files.status === 404, 'adjuntar archivo a solicitud ajena bloqueado (HTTP ' + files.status + ')');

  const settings = await req('GET', '/api/settings/internal_secret', undefined, token);
  ok(settings.status === 404, 'configuración interna bloqueada para cliente');

  const workbench = await req('GET', '/api/maintenances/workbench', undefined, token);
  ok(workbench.status === 403, 'workbench de mantenimientos bloqueado para cliente');

  // --- 2. QR de cobranza persiste en BD (no solo localStorage) ---
  const admin = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  ok(admin.status === 200, 'login admin');
  const at = admin.data.token;
  const qr = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
  const save = await req('PUT', '/api/settings/payment_qr', { value: qr }, at);
  ok(save.status === 200, 'guardar QR en base de datos');
  const readQr = await req('GET', '/api/settings/payment_qr', undefined, at);
  ok(readQr.data.value === qr, 'QR leído desde base de datos');

  // --- 3. Registro: rol forzado, duplicados, verificación ---
  const email = `qa_${PASS}@ejemplo.com`;
  const reg = await req('POST', '/api/auth/register', {
    username: `qa_${PASS}`, password: 'ClaveSegura123', name: 'QA Aislamiento',
    email, phone: '0981000001', role: 'admin'
  });
  ok(reg.status === 201, 'registro de cuenta nueva');
  ok(reg.data.user.role === 'cliente', 'registro no permite escalar a admin');
  ok(reg.data.needsVerification === true, 'registro queda pendiente de verificación');

  const preLogin = await req('POST', '/api/auth/login', { username: `qa_${PASS}`, password: 'ClaveSegura123' });
  ok(preLogin.status === 403 && preLogin.data.needsVerification, 'login bloqueado antes de verificar correo');

  const dup = await req('POST', '/api/auth/register', {
    username: `qa2_${PASS}`, password: 'ClaveSegura123', name: 'Duplicado', email
  });
  ok(dup.status === 409, 'correo duplicado rechazado');

  const weak = await req('POST', '/api/auth/register', {
    username: `qa3_${PASS}`, password: 'corta', name: 'Debil', email: `qa3_${PASS}@ejemplo.com`
  });
  ok(weak.status === 400, 'contraseña corta rechazada');

  const devToken = reg.data.devToken;
  if (devToken) {
    const verify = await req('GET', `/api/auth/verify-email?token=${encodeURIComponent(devToken)}`);
    ok(verify.status === 200, 'verificación de correo con token real');
    const postLogin = await req('POST', '/api/auth/login', { username: `qa_${PASS}`, password: 'ClaveSegura123' });
    ok(postLogin.status === 200, 'login correcto después de verificar');
    const reuse = await req('GET', `/api/auth/verify-email?token=${encodeURIComponent(devToken)}`);
    ok(reuse.status === 400, 'token de verificación no reutilizable');
  } else {
    ok(false, 'devToken disponible en modo desarrollo sin SMTP');
  }

  // Limpieza del usuario y cliente de prueba (el QR queda guardado a propósito).
  if (reg.data.user?.id) {
    await req('DELETE', `/api/users/${reg.data.user.id}`, undefined, at);
  }
  if (reg.data.user?.clientId) {
    const clean = await req('DELETE', `/api/clients/${reg.data.user.clientId}`, undefined, at);
    ok(clean.status === 200, 'limpieza del cliente de prueba');
  }

  console.log('\nRESULTADO: ' + (failures ? `${failures} FALLOS` : 'aislamiento y registro verificados'));
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error('ERROR', err); process.exit(1); });
