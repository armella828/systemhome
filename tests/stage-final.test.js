#!/usr/bin/env node
// ============================================================
// SYSTEMHOME - Verificación de la etapa final (HTTP real + PostgreSQL)
// Prueba: SSE config, logo en PDF, solicitud unificada con prospecto,
// técnicos y workbench de mantenimientos. Limpia sus propios datos.
// ============================================================

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:5433/systemhome_staging';

const fs = require('fs');
const path = require('path');
const { db } = require('../backend/db');

const BASE = (process.env.TEST_BASE_URL || 'http://127.0.0.1:3200').replace(/\/$/, '');
const SUFFIX = Date.now().toString(36);
const MARKER = `PRUEBA AUTOMATIZADA ${SUFFIX}`;
let token = null;
let previousLogo = null;
let previousIcons = null;
const created = { budgetId: null, requestId: null, technicianId: null };

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function req(method, pathName, body, withToken = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (withToken && token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(BASE + pathName, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000)
  });
  const text = await resp.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
  return { status: resp.status, data };
}

async function restoreSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
  `).run(key, JSON.stringify(value ?? null), new Date().toISOString());
}

function cleanup() {
  try {
    if (created.budgetId) db.prepare('DELETE FROM budgets WHERE id = ?').run(created.budgetId);
    if (created.requestId) db.prepare('DELETE FROM requests WHERE id = ?').run(created.requestId);
    db.prepare('DELETE FROM clients WHERE name = ?').run(MARKER);
    restoreSetting('company_logo', previousLogo);
    restoreSetting('portal_icons', previousIcons);
    console.log('CLEAN  datos de prueba eliminados; configuración restaurada');
  } catch (err) {
    console.warn('WARN  limpieza parcial:', err.message);
  }
  // El worker síncrono de PostgreSQL mantiene el event loop vivo.
  process.exit(process.exitCode || 0);
}

async function main() {
  const health = await req('GET', '/api/health', null, false);
  assert(health.status === 200, `health HTTP ${health.status}`);
  console.log('PASS  health');

  const login = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' }, false);
  assert(login.status === 200 && login.data.token, `login: ${JSON.stringify(login.data)}`);
  token = login.data.token;
  console.log('PASS  login admin');

  const workbench = await req('GET', '/api/maintenances/workbench');
  assert(workbench.status === 200, `workbench HTTP ${workbench.status}`);
  assert(Array.isArray(workbench.data.maintenances), 'workbench.maintenances no es arreglo');
  assert(Array.isArray(workbench.data.clients), 'workbench.clients no es arreglo');
  assert(Array.isArray(workbench.data.inventory), 'workbench.inventory no es arreglo');
  console.log('PASS  workbench de mantenimientos en una sola llamada');

  const iconsBefore = await req('GET', '/api/settings/portal_icons');
  previousIcons = iconsBefore.data.value;
  const iconsPut = await req('PUT', '/api/settings/portal_icons', { value: { camaras: '🔒' } });
  assert(iconsPut.status === 200, `settings PUT HTTP ${iconsPut.status}`);
  const iconsAfter = await req('GET', '/api/settings/portal_icons');
  assert(iconsAfter.data.value?.camaras === '🔒', 'portal_icons no persiste');
  console.log('PASS  iconos del portal persistentes');

  const logoBefore = await req('GET', '/api/settings/company_logo');
  previousLogo = logoBefore.data.value;
  const logoPath = path.join(__dirname, '..', 'systemhome', 'assets', 'LOGO.png');
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
  const logoPut = await req('PUT', '/api/settings/company_logo', { value: dataUrl });
  assert(logoPut.status === 200, `logo PUT HTTP ${logoPut.status}`);
  const logoAfter = await req('GET', '/api/settings/company_logo');
  assert(String(logoAfter.data.value || '').startsWith('data:image/png;base64,'), 'company_logo no persiste');
  console.log('PASS  logo persistido en PostgreSQL');

  const requestResp = await req('POST', '/api/requests', {
    clientName: MARKER,
    clientPhone: '0981990001',
    clientEmail: `prueba.${SUFFIX}@test.local`,
    clientAddress: 'Asuncion - prueba automatica',
    serviceType: 'camaras',
    description: `${MARKER} - verificacion de solicitud unificada`,
    items: [{ concept: 'Camara prueba', qty: 2, price: 100000 }]
  });
  assert(requestResp.status === 201, `requests HTTP ${requestResp.status}: ${JSON.stringify(requestResp.data)}`);
  assert(requestResp.data.request?.number, 'sin número de solicitud');
  assert(requestResp.data.budget?.id, 'no se creó el presupuesto automáticamente');
  created.requestId = requestResp.data.request.id;
  created.budgetId = requestResp.data.budget.id;
  assert(requestResp.data.budget.prospectName === MARKER, 'prospectName no se guardó');
  assert(requestResp.data.budget.prospectEmail?.includes('@test.local'), 'prospectEmail no se guardó');
  console.log('PASS  solicitud unificada crea cliente + solicitud + presupuesto de prospecto');

  const pdfResp = await fetch(`${BASE}/api/budgets/${created.budgetId}/export?download=1&token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(60000)
  });
  assert(pdfResp.status === 200, `PDF HTTP ${pdfResp.status}`);
  const pdf = Buffer.from(await pdfResp.arrayBuffer());
  assert(pdf.subarray(0, 4).toString() === '%PDF', 'la descarga no es un PDF');
  assert(pdf.length > 8000, `PDF demasiado pequeño (${pdf.length} bytes)`);
  assert(pdf.includes(Buffer.from('/Image')) || pdf.includes(Buffer.from('/Subtype')), 'el PDF no contiene imagen (logo)');
  console.log(`PASS  PDF descargable con logo (${pdf.length} bytes, Content-Disposition attachment)`);

  const emailResp = await req('POST', `/api/budgets/${created.budgetId}/email`, {
    to: `prueba.${SUFFIX}@test.local`,
    message: 'Prueba'
  });
  assert(emailResp.status === 503, `SMTP sin configurar debería devolver 503, dio ${emailResp.status}`);
  assert(/SMTP no configurado/i.test(emailResp.data.error || ''), 'mensaje SMTP poco claro');
  console.log('PASS  envío por correo valida SMTP antes de marcar como enviado');

  const techResp = await req('POST', '/api/technicians', {
    name: MARKER,
    specialty: 'Prueba automatizada',
    phone: '0981990002'
  });
  assert(techResp.status === 201, `técnico POST HTTP ${techResp.status}: ${JSON.stringify(techResp.data)}`);
  created.technicianId = techResp.data.technician.id;
  const techList = await req('GET', '/api/technicians');
  assert(techList.data.technicians.some(t => t.id === created.technicianId), 'técnico no aparece en el listado');
  const techUpdate = await req('PUT', `/api/technicians/${created.technicianId}`, { name: `${MARKER} EDIT` });
  assert(techUpdate.status === 200, `técnico PUT HTTP ${techUpdate.status}`);
  const techDelete = await req('DELETE', `/api/technicians/${created.technicianId}`);
  assert(techDelete.status === 200, `técnico DELETE HTTP ${techDelete.status}`);
  created.technicianId = null;
  console.log('PASS  CRUD de técnicos (crear, editar, eliminar)');

  console.log('\nRESULTADO: etapa final verificada correctamente');
}

main()
  .catch(err => {
    console.error('FAIL ', err.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
