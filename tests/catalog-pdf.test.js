#!/usr/bin/env node
// Catálogo PDF: endpoint público, firma PDF, paginación, productos reales,
// encabezado Yacuiba, filtro por categoría y cero texto superpuesto.

const BASE = (process.env.TEST_BASE_URL || 'http://127.0.0.1:3200').replace(/\/$/, '');
let failures = 0;

function ok(cond, label) {
  if (cond) console.log('PASS  ' + label);
  else { failures++; console.error('FAIL  ' + label); }
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
    if (!/\bBT\b/.test(stream) || (!/\bTj\b/.test(stream) && !/\bTJ\b/.test(stream))) continue;
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

async function fetchPdf(query) {
  const resp = await fetch(`${BASE}/api/catalog/pdf?${query}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  return { resp, buf, text: decodedText(buf) };
}

(async () => {
  const catalogRes = await fetch(`${BASE}/api/catalog`);
  ok(catalogRes.status === 200, 'endpoint público /api/catalog');
  const catalog = (await catalogRes.json()).catalog || [];
  ok(catalog.length > 0, 'productos publicados en el catálogo');
  if (!catalog.length) throw new Error('El catálogo está vacío');

  // ── Catálogo completo ──────────────────────────────────────────────────
  const full = await fetchPdf('download=1');
  const pages = countPages(full.buf);
  ok(full.resp.status === 200, `catálogo PDF completo: HTTP ${full.resp.status}`);
  ok((full.resp.headers.get('content-type') || '').includes('application/pdf'), 'content-type PDF');
  ok((full.resp.headers.get('content-disposition') || '').includes('attachment'), 'descarga forzada con download=1');
  ok(full.buf.slice(0, 4).toString() === '%PDF', 'firma %PDF');
  ok(full.buf.length > 5000, `PDF no vacío (${full.buf.length} bytes)`);
  ok(/CATALOGO|CATÁLOGO/i.test(full.text), 'título CATÁLOGO DE PRODUCTOS');
  ok(/yacuiba/i.test(full.text) && /bolivia/i.test(full.text), 'encabezado Yacuiba, Bolivia');
  ok(!/asunci/i.test(full.text), 'sin Asunción en el encabezado');
  ok(!full.text.includes('80099887') && !full.text.includes('16548920'), 'sin RUC/Timbrado de Paraguay');
  ok(full.text.includes('Bs.'), 'precios en Bolivianos (Bs.)');
  ok(full.text.includes('SYSTEMHOME'), 'identidad corporativa repetida en encabezado/pie');
  ok(full.text.includes(catalog[0].name), 'primer producto presente');
  ok(full.text.includes(catalog[catalog.length - 1].name), 'último producto presente');
  ok(pages >= 2, `PDF multipágina con ${catalog.length} productos: ${pages} páginas`);
  ok(countOverlaps(full.buf) === 0, 'sin texto superpuesto en catálogo completo');

  // ── Filtro por categoría ───────────────────────────────────────────────
  const category = catalog.some(i => i.category === 'camaras') ? 'camaras' : catalog[0].category;
  const filteredItems = catalog.filter(i => i.category === category);
  const filtered = await fetchPdf(`download=1&category=${encodeURIComponent(category)}`);
  ok(filtered.resp.status === 200, `catálogo filtrado por ${category}: HTTP ${filtered.resp.status}`);
  ok(filtered.buf.slice(0, 4).toString() === '%PDF', `firma %PDF del filtro ${category}`);
  ok(/Categor.a:/.test(filtered.text), 'la categoría aparece en los metadatos');
  ok(filtered.text.includes(filteredItems[0].name), 'producto de la categoría filtrada presente');
  const other = catalog.find(i => i.category !== category);
  if (other) ok(!filtered.text.includes(other.name), 'producto de otra categoría no aparece en el filtro');
  ok(countOverlaps(filtered.buf) === 0, 'sin texto superpuesto en catálogo filtrado');

  console.log('\nRESULTADO: ' + (failures ? `${failures} FALLOS` : 'Catálogo PDF verificado'));
  process.exitCode = failures ? 1 : 0;
})().catch(err => { console.error('ERROR', err); process.exitCode = 1; });
