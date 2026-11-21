#!/usr/bin/env node
// Factura PDF de cobro QR: encabezado de empresa, multipágina, ítems y total.
// Regresión del error de letras desordenadas/sobrepuestas.

const BASE = (process.env.TEST_BASE_URL || 'http://127.0.0.1:3200').replace(/\/$/, '');
let failures = 0;

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
  return (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
}

function decodedText(buf) {
  const raw = buf.toString('latin1');
  return (raw.match(/<([0-9A-Fa-f]+)>/g) || [])
    .map(token => token.slice(1, -1))
    .filter(hex => hex.length % 2 === 0)
    .map(hex => Buffer.from(hex, 'hex').toString('latin1'))
    .join('');
}

function countOverlaps(buf) {
  const raw = buf.toString('latin1');
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let streamMatch;
  let overlaps = 0;
  while ((streamMatch = streamRe.exec(raw))) {
    const stream = streamMatch[1];
    // Solo flujos de contenido de texto; los XObject de imagen son binarios.
    if (!/\bBT\b/.test(stream) || !/\bTj\b|\bTJ\b/.test(stream)) continue;
    const seen = new Map();
    const re = /1 0 0 1 ([\d.]+) ([\d.]+) Tm[\s\S]*?\[([\s\S]*?)\]\s*TJ/g;
    let m;
    while ((m = re.exec(stream))) {
      const key = Number(m[1]).toFixed(1) + '|' + Number(m[2]).toFixed(1);
      if (seen.has(key)) overlaps++;
      else seen.set(key, true);
    }
  }
  return overlaps;
}

(async () => {
  const login = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  ok(login.status === 200, 'login admin para factura PDF');
  const token = login.data.token;

  const invRes = await api('GET', '/api/inventory', undefined, token);
  const products = (invRes.data.items || invRes.data.inventory || []).filter(i => i.active !== 0);
  ok(products.length > 0, 'productos de inventario disponibles');
  const product = products.reduce((a, b) => (Number(b.stock || 0) > Number(a.stock || 0) ? b : a), products[0]);
  const originalStock = Number(product.stock || 0);

  const clientsRes = await api('GET', '/api/clients', undefined, token);
  const activeClients = (clientsRes.data.clients || []).filter(c => c.active !== 0);
  const client = activeClients.find(c => !/asunci/i.test(c.address || '') && !/asunci/i.test(c.name || '')) || activeClients[0];
  ok(!!client, 'cliente para la factura QA');

  for (const testCase of [{ count: 1, minPages: 1, label: '1 ítem' }, { count: 25, minPages: 2, label: '25 ítems' }]) {
    // El cobro descuenta stock: se asegura suficiente y se restaura al final.
    await api('PUT', `/api/inventory/${product.id}`, { stock: testCase.count + 5 }, token);
    const items = Array.from({ length: testCase.count }, (_, i) => ({
      itemId: product.id,
      name: `Artículo QA ${i + 1} con descripción extensa para validar columnas y salto de página`,
      quantity: 1,
      unitPrice: 100 + i
    }));
    try {
      const sale = await api('POST', '/api/sales', {
        clientId: client.id,
        items,
        paymentMethod: 'qr',
        qrReference: `QA-INVOICE-${Date.now()}`
      }, token);
      ok(sale.status === 201, `cobro QR de ${testCase.label}`);
      if (sale.status !== 201) continue;

      const invoices = await api('GET', '/api/invoices', undefined, token);
      const invoice = (invoices.data.invoices || []).find(i => i.invoiceNumber === sale.data.invoiceNumber);
      ok(!!invoice, `factura localizada para ${testCase.label}`);
      if (!invoice) continue;

      const resp = await fetch(`${BASE}/api/invoices/${invoice.id}/pdf?download=1`, { headers: { Authorization: `Bearer ${token}` } });
      const buf = Buffer.from(await resp.arrayBuffer());
      const text = decodedText(buf);
      const contentType = resp.headers.get('content-type') || '';
      const pages = countPages(buf);

      ok(resp.status === 200, `PDF factura ${testCase.label}: HTTP ${resp.status}`);
      ok(contentType.includes('application/pdf'), `content-type PDF ${testCase.label}`);
      ok(buf.slice(0, 4).toString() === '%PDF', `firma %PDF ${testCase.label}`);
      ok(text.includes('SYSTEMHOME'), `encabezado SYSTEMHOME en ${testCase.label}`);
      ok(/yacuiba/i.test(text) && /bolivia/i.test(text), `ubicación Yacuiba, Bolivia en ${testCase.label}`);
      ok(!/asunci/i.test(text), `sin Asunción en ${testCase.label}`);
      ok(!text.includes('80099887') && !text.includes('16548920'), `sin RUC/Timbrado de Paraguay en ${testCase.label}`);
      ok(text.includes('FACTURA') && text.includes('COMPROBANTE'), `título de factura en ${testCase.label}`);
      ok(text.includes('DATOS FISCALES'), `datos fiscales en ${testCase.label}`);
      ok(text.includes('DETALLE DE PRODUCTOS'), `detalle de productos en ${testCase.label}`);
      ok(text.includes('Bs.'), `moneda Bs. en ${testCase.label}`);
      ok(text.includes('TOTAL LIQUIDACION') || text.includes('TOTAL LIQUIDACIÓN'), `total en ${testCase.label}`);
      ok(text.includes('SIFEN'), `nota SIFEN en ${testCase.label}`);
      ok(text.includes(`Artículo QA ${testCase.count}`), `último ítem presente en ${testCase.label}`);
      ok(pages >= testCase.minPages, `páginas de ${testCase.label}: ${pages} (mínimo ${testCase.minPages})`);
      ok(countOverlaps(buf) === 0, `sin texto superpuesto en ${testCase.label}`);
    } finally {
      await api('PUT', `/api/inventory/${product.id}`, { stock: originalStock }, token);
    }
  }

  console.log('\nRESULTADO: ' + (failures ? `${failures} FALLOS` : 'Factura PDF QR verificada'));
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error('ERROR', err); process.exit(1); });
