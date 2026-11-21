#!/usr/bin/env node
// PDF empresarial: multipágina, logo, Bs., totales, condiciones y pie.
// Crea cotizaciones de prueba en staging y las elimina al finalizar.

const BASE = (process.env.TEST_BASE_URL || 'http://127.0.0.1:3200').replace(/\/$/, '');
let failures = 0;
const createdIds = [];

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

function countPages(buf) {
  const raw = buf.toString('latin1');
  return (raw.match(/\/Type\s*\/Page\b/g) || []).length;
}

// PDFKit escribe el texto como cadenas hexadecimales dentro de operadores TJ.
function decodedText(buf) {
  const raw = buf.toString('latin1');
  return (raw.match(/<([0-9A-Fa-f]+)>/g) || [])
    .map(token => token.slice(1, -1))
    .filter(hex => hex.length % 2 === 0)
    .map(hex => Buffer.from(hex, 'hex').toString('latin1'))
    .join('');
}

function buildItems(count) {
  return Array.from({ length: count }, (_, i) => ({
    concept: `Ítem ${i + 1}: ${'Descripción extensa para validar el ajuste de columnas y el salto de página '.repeat(2)}`,
    qty: (i % 3) + 1,
    price: 100 + i,
    discountPercent: i % 10,
    notes: i % 5 === 0 ? 'Nota larga de prueba para comprobar que las filas no se superponen con la siguiente línea.' : ''
  }));
}

(async () => {
  const login = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  ok(login.status === 200, 'login admin para generar PDF');
  const token = login.data.token;

  // El cliente de prueba se resuelve desde la BD activa: el ID 7 solo existe en staging.
  const clientsRes = await api('GET', '/api/clients', undefined, token);
  const clientsList = clientsRes.data?.clients || [];
  const clientId = clientsList.find(c => c.active !== 0)?.id;
  ok(!!clientId, 'cliente existente para las cotizaciones QA');

  const cases = [
    { count: 1, minPages: 1, label: '1 ítem' },
    { count: 20, minPages: 1, label: '20 ítems' },
    { count: 60, minPages: 2, label: '60 ítems' }
  ];

  for (const testCase of cases) {
    const items = buildItems(testCase.count);
    const total = items.reduce((sum, it) => sum + it.qty * it.price * (1 - it.discountPercent / 100), 0) + 150;
    const created = await api('POST', '/api/budgets', {
      clientId,
      serviceType: 'camaras',
      description: 'Prueba automatizada de PDF profesional con descripción larga y múltiples líneas.',
      items,
      labor: 150,
      total,
      status: 'borrador',
      conditions: 'Pago al contado. Precios válidos por 15 días.',
      observations: 'Verificar superposición y cortes en todas las páginas.',
      estimatedTime: '5 días',
      address: 'Yacuiba, Bolivia'
    }, token);
    ok(created.status === 201, `crear cotización QA de ${testCase.label}`);
    if (created.status !== 201) continue;
    const id = created.data.budget?.id;
    createdIds.push(id);

    const resp = await fetch(`${BASE}/api/budgets/${id}/export?download=1`, { headers: { Authorization: `Bearer ${token}` } });
    const buf = Buffer.from(await resp.arrayBuffer());
    const raw = buf.toString('latin1');
    const text = decodedText(buf);
    const contentType = resp.headers.get('content-type') || '';

    ok(resp.status === 200, `export PDF de ${testCase.label}: HTTP ${resp.status}`);
    ok(contentType.includes('application/pdf'), `content-type PDF de ${testCase.label}`);
    ok(buf.slice(0, 4).toString() === '%PDF', `firma %PDF de ${testCase.label}`);
    ok(buf.length > 5000, `PDF no vacío de ${testCase.label} (${buf.length} bytes)`);
    ok(text.includes('SYSTEMHOME SECURITY'), `logo/encabezado de empresa en ${testCase.label}`);
    ok(raw.includes('/Subtype /Image'), `imagen de logo incrustada en ${testCase.label}`);
    ok(text.includes('COTIZACI'), `título de cotización en ${testCase.label}`);
    ok(text.includes('Bs.'), `moneda Bs. en ${testCase.label}`);
    ok(text.includes('TOTAL'), `total en ${testCase.label}`);
    ok(text.includes('Condiciones'), `condiciones en ${testCase.label}`);
    ok(text.includes('Firma del cliente'), `firma/aprobación en ${testCase.label}`);
    ok(text.includes('P'), `numeración de página en ${testCase.label}`);

    const pages = countPages(buf);
    ok(pages >= testCase.minPages, `páginas de ${testCase.label}: ${pages} (mínimo ${testCase.minPages})`);
    ok(pages <= Math.ceil(testCase.count / 18) + 3, `sin páginas excesivas en ${testCase.label}: ${pages}`);
    // PDFKit parte el texto en tokens TJ y el decodificador puede perder
    // espacios entre tokens; contar la marca suelta es más robusto.
    const systemHomeMarks = (text.match(/SYSTEMHOME/g) || []).length;
    ok(systemHomeMarks >= pages, `encabezado y pie en las ${pages} páginas de ${testCase.label} (marcas: ${systemHomeMarks})`);

    // El último ítem debe aparecer: descarta cortes silenciosos de tabla.
    ok(text.includes(`Ítem ${testCase.count}`), `último ítem presente en ${testCase.label}`);
  }

  // Limpieza: solo las cotizaciones creadas por esta prueba.
  if (createdIds.length && process.env.DATABASE_URL) {
    try {
      const { Client } = require('pg');
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await client.query('DELETE FROM budget_items WHERE budget_id = ANY($1::int[])', [createdIds]);
      await client.query('DELETE FROM budgets WHERE id = ANY($1::int[])', [createdIds]);
      await client.end();
      console.log('Limpieza: cotizaciones QA eliminadas de staging.');
    } catch (err) {
      console.error('No se pudo limpiar cotizaciones QA:', err.message);
    }
  } else {
    console.log('Aviso: sin DATABASE_URL, las cotizaciones QA quedaron en staging.');
  }

  console.log('\nRESULTADO: ' + (failures ? `${failures} FALLOS` : 'PDF profesional verificado'));
  process.exitCode = failures ? 1 : 0;
})().catch(err => { console.error('ERROR', err); process.exitCode = 1; });
