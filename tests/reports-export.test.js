#!/usr/bin/env node
// Exportación a Excel (CSV) del reporte de servicios: autenticación,
// filtros aplicados, BOM para Excel y compatibilidad con token por query.

const BASE = (process.env.TEST_BASE_URL || 'http://127.0.0.1:3200').replace(/\/$/, '');
let failures = 0;

function ok(cond, label) {
  if (cond) console.log('PASS  ' + label);
  else { failures++; console.error('FAIL  ' + label); }
}

function csvRows(text) {
  return text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
}

(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const auth = await login.json();
  ok(login.status === 200 && !!auth.token, 'login admin para exportar reporte');
  const token = auth.token;
  if (!token) throw new Error('Sin token');

  // Sin filtros: cabeceras correctas y BOM para que Excel lea acentos.
  const all = await fetch(`${BASE}/api/reports/services/export`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const allBytes = Buffer.from(await all.arrayBuffer());
  const allText = allBytes.toString('utf8');
  ok(all.status === 200, `export sin filtros: HTTP ${all.status}`);
  ok((all.headers.get('content-type') || '').includes('text/csv'), 'content-type text/csv');
  ok((all.headers.get('content-disposition') || '').includes('attachment'), 'descarga adjunta');
  ok(allBytes[0] === 0xEF && allBytes[1] === 0xBB && allBytes[2] === 0xBF, 'BOM UTF-8 para Excel');
  const allRows = csvRows(allText);
  ok(allRows[0].includes('Número') && allRows[0].includes('Total Bs'), 'cabeceras del CSV');

  // Con filtros: el CSV debe coincidir con la tabla de reportes.
  const status = 'aprobado';
  const tableResp = await fetch(`${BASE}/api/reports/services?status=${status}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const table = await tableResp.json();
  const expected = (table.report || []).length;

  const filtered = await fetch(`${BASE}/api/reports/services/export?status=${status}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const filteredText = await filtered.text();
  const actual = Math.max(0, csvRows(filteredText).length - 1);
  ok(filtered.status === 200, `export filtrado: HTTP ${filtered.status}`);
  ok(actual === expected, `filtrado por estado: ${actual} filas vs ${expected} en pantalla`);

  // Los navegadores no envían cabeceras en descargas antiguas: se conserva ?token=.
  const byQuery = await fetch(`${BASE}/api/reports/services/export?status=${status}&token=${encodeURIComponent(token)}`);
  ok(byQuery.status === 200, `export con token por query: HTTP ${byQuery.status}`);

  const noAuth = await fetch(`${BASE}/api/reports/services/export`);
  ok(noAuth.status === 401, `export sin token rechazado: HTTP ${noAuth.status}`);

  console.log('\nRESULTADO: ' + (failures ? `${failures} FALLOS` : 'Exportación a Excel verificada'));
  process.exitCode = failures ? 1 : 0;
})().catch(err => { console.error('ERROR', err); process.exitCode = 1; });
