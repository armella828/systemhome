#!/usr/bin/env node
// ============================================================
// SYSTEMHOME - Pruebas de integracion de API (HTTP real)
// Uso: node tests/api.test.js
// Variables: TEST_BASE_URL, TEST_ADMIN_USER, TEST_ADMIN_PASSWORD,
//            TEST_RATE_LIMIT=1 para probar bloqueo por intentos.
// Crea y elimina un usuario temporal; no modifica datos de negocio.
// ============================================================

const BASE = (process.env.TEST_BASE_URL || 'http://127.0.0.1:3200').replace(/\/$/, '');
const ADMIN_USER = process.env.TEST_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD || 'admin123';
const SUFFIX = Date.now().toString(36);
const TEMP_USER = `test_api_${SUFFIX}`;
const TEMP_EMAIL = `${TEMP_USER}@test.local`;
const PASS_1 = 'ClaveInicial123!';
const PASS_2 = 'ClaveCambiada456!';
const PASS_3 = 'ClaveReset789!';

let adminToken = null;
let tempUserId = null;
const tests = [];

function test(name, fn) { tests.push({ name, fn }); }

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const text = await resp.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
  return { status: resp.status, data, headers: resp.headers };
}

async function login(username, password) {
  return req('POST', '/api/auth/login', { username, password });
}

// ---------------- Pruebas ----------------

test('health responde', async () => {
  const r = await req('GET', '/api/health');
  assert(r.status === 200, `HTTP ${r.status}`);
  assert(r.data.status === 'ok' || r.data.ok === true, JSON.stringify(r.data));
});

test('cabeceras de seguridad presentes', async () => {
  const r = await req('GET', '/api/health');
  assert(r.headers.get('x-content-type-options') === 'nosniff', 'falta nosniff');
  assert(!!r.headers.get('x-frame-options'), 'falta X-Frame-Options');
  assert(!r.headers.get('x-powered-by'), 'expone X-Powered-By');
});

test('CORS rechaza origen desconocido', async () => {
  const resp = await fetch(BASE + '/api/health', { headers: { Origin: 'https://evil.example.com' }, signal: AbortSignal.timeout(20000) });
  assert(!resp.headers.get('access-control-allow-origin'), 'permitio origen malicioso');
});

test('login admin correcto', async () => {
  const r = await login(ADMIN_USER, ADMIN_PASS);
  assert(r.status === 200, `HTTP ${r.status}: ${JSON.stringify(r.data)}`);
  assert(!!r.data.token, 'sin token');
  adminToken = r.data.token;
});

test('login con contraseña incorrecta es 401', async () => {
  const r = await login(ADMIN_USER, 'contraseña-incorrecta-test');
  assert(r.status === 401, `HTTP ${r.status}`);
});

test('lectura de clientes y ventas con token', async () => {
  const clients = await req('GET', '/api/clients', null, adminToken);
  const sales = await req('GET', '/api/sales', null, adminToken);
  assert(clients.status === 200 && Array.isArray(clients.data.clients), 'clientes inválidos');
  assert(sales.status === 200 && Array.isArray(sales.data.sales), 'ventas inválidas');
});

test('dashboard devuelve metricas', async () => {
  const r = await req('GET', '/api/dashboard', null, adminToken);
  assert(r.status === 200 && !!r.data.dashboard, 'dashboard vacío');
});

test('rol cliente no puede listar clientes (403)', async () => {
  const r = await login('cliente', 'cliente123');
  assert(r.status === 200, `login cliente HTTP ${r.status}`);
  const clients = await req('GET', '/api/clients', null, r.data.token);
  assert(clients.status === 403, `HTTP ${clients.status} (esperado 403)`);
});

test('crear usuario temporal', async () => {
  const r = await req('POST', '/api/users', {
    username: TEMP_USER, password: PASS_1, name: 'Usuario Prueba API',
    email: TEMP_EMAIL, phone: '000', role: 'vendedor',
  }, adminToken);
  assert(r.status === 201, `HTTP ${r.status}: ${JSON.stringify(r.data)}`);
  tempUserId = r.data.user.id;
});

test('cambio de contraseña autenticado', async () => {
  const first = await login(TEMP_USER, PASS_1);
  assert(first.status === 200, `login inicial HTTP ${first.status}`);
  const change = await req('POST', '/api/auth/change-password', {
    currentPassword: PASS_1, newPassword: PASS_2,
  }, first.data.token);
  assert(change.status === 200, `cambio HTTP ${change.status}: ${JSON.stringify(change.data)}`);
  assert((await login(TEMP_USER, PASS_1)).status === 401, 'clave vieja sigue vigente');
  assert((await login(TEMP_USER, PASS_2)).status === 200, 'clave nueva no funciona');
});

test('recuperacion por token: validar, resetear y rechazar reuso', async () => {
  const forgot = await req('POST', '/api/auth/forgot-password', { email: TEMP_EMAIL });
  assert(forgot.status === 200, `forgot HTTP ${forgot.status}: ${JSON.stringify(forgot.data)}`);
  const token = forgot.data.devToken;
  assert(!!token, 'sin devToken (SMTP configurado: usar correo real)');
  const valid = await req('GET', `/api/auth/validate-reset?token=${encodeURIComponent(token)}`);
  assert(valid.data.valid === true, 'token no valido');
  const reset = await req('POST', '/api/auth/reset-password', { token, password: PASS_3 });
  assert(reset.status === 200, `reset HTTP ${reset.status}: ${JSON.stringify(reset.data)}`);
  assert((await login(TEMP_USER, PASS_3)).status === 200, 'clave reseteada no funciona');
  const reuse = await req('POST', '/api/auth/reset-password', { token, password: 'OtraClave999!' });
  assert(reuse.status === 400, `reuso HTTP ${reuse.status} (esperado 400)`);
});

test('logout revoca el token', async () => {
  const r = await login(TEMP_USER, PASS_3);
  const token = r.data.token;
  const out = await req('POST', '/api/auth/logout', null, token);
  assert(out.status === 200, `logout HTTP ${out.status}`);
  const after = await req('GET', '/api/clients', null, token);
  assert(after.status === 401, `token revocado HTTP ${after.status} (esperado 401)`);
});

test('SYSTEMHOME INTELLIGENCE ejecuta y persiste', async () => {
  const run = await req('POST', '/api/intelligence/run', null, adminToken);
  assert(run.status === 200, `run HTTP ${run.status}: ${JSON.stringify(run.data)}`);
  assert(run.data.status === 'completed', 'estado no completado');
  assert(run.data.recordsProcessed > 0, 'sin registros procesados');
  assert(['day', 'month'].includes(run.data.forecast.grain), 'granularidad invalida');
  assert(run.data.forecast.forecast.length === 3, 'pronostico incompleto');
  const metrics = await req('GET', '/api/intelligence/metrics', null, adminToken);
  const insights = await req('GET', '/api/intelligence/insights', null, adminToken);
  assert(metrics.data.metrics.length > 0, 'sin metricas persistidas');
  assert(insights.data.insights.length > 0, 'sin insights persistidos');
});

test('rate limit de login bloquea tras exceso (opt-in)', async () => {
  if (process.env.TEST_RATE_LIMIT !== '1') return;
  let blocked = false;
  for (let i = 0; i < 15; i++) {
    const r = await login('usuario-inexistente-test', 'clave-mala');
    if (r.status === 429) { blocked = true; break; }
  }
  assert(blocked, 'no se activo el bloqueo por intentos');
});

// ---------------- Ejecucion ----------------

(async () => {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`PASS  ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`FAIL  ${t.name} :: ${err.message}`);
      failed++;
    }
  }

  if (tempUserId && adminToken) {
    try {
      await req('DELETE', `/api/users/${tempUserId}`, null, adminToken);
      console.log('CLEAN  usuario temporal eliminado');
    } catch (e) {
      console.log('WARN  no se pudo eliminar usuario temporal: ' + e.message);
    }
  }

  console.log(`\nRESULTADO: ${passed} pasadas, ${failed} fallidas`);
  process.exit(failed ? 1 : 0);
})();
