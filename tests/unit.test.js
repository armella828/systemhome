#!/usr/bin/env node
// ============================================================
// SYSTEMHOME - Pruebas unitarias (sin base de datos)
// Uso: node tests/unit.test.js
// ============================================================

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const security = require('../backend/security');
const models = require('../backend/intelligence/models');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`FAIL  ${name} :: ${err.message}`);
    failed++;
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

check('validar subida PDF permitida', () => {
  const r = security.validateUpload({ filename: 'factura.pdf', mimeType: 'application/pdf', data: 'aGVsbG8=' });
  assert(r.ok === true && r.size === 5, JSON.stringify(r));
});

check('rechazar ejecutable', () => {
  const r = security.validateUpload({ filename: 'virus.exe', mimeType: 'application/x-msdownload', data: 'aGVsbG8=' });
  assert(r.ok === false, 'permitio archivo peligroso');
});

check('rechazar base64 invalido', () => {
  const r = security.validateUpload({ filename: 'a.pdf', mimeType: 'application/pdf', data: '@@@' });
  assert(r.ok === false, 'permitio base64 invalido');
});

check('rechazar extension que no coincide con MIME', () => {
  const r = security.validateUpload({ filename: 'falso.pdf', mimeType: 'image/png', data: 'aGVsbG8=' });
  assert(r.ok === false, 'permitio extension falsificada');
});

check('rate limit permite 3 y bloquea el 4to intento', () => {
  const limiter = security.rateLimiter({ max: 3, windowMs: 60000, prefix: 'unit-' + Date.now() });
  const codes = [];
  for (let i = 0; i < 4; i++) {
    const res = {
      code: 200,
      setHeader() {},
      status(c) { this.code = c; return this; },
      json() { return this; },
    };
    limiter({ ip: '9.9.9.9', socket: { remoteAddress: '9.9.9.9' } }, res, () => {});
    codes.push(res.code);
  }
  assert(JSON.stringify(codes) === JSON.stringify([200, 200, 200, 429]), JSON.stringify(codes));
});

check('revocacion de token', () => {
  const token = 'test-token-' + Date.now();
  security.revokeToken(token);
  assert(security.isRevoked(token) === true, 'no se revoco');
});

check('regresion lineal perfecta', () => {
  const r = models.linearRegression([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }]);
  assert(r.slope === 2, `slope=${r.slope}`);
  assert(r.r2 === 1, `r2=${r.r2}`);
  assert(Math.round(r.predict(3)) === 7, 'prediccion incorrecta');
});

check('pronostico usa granularidad diaria con pocos meses', () => {
  const sales = [
    { created_at: '2026-08-15T10:00:00Z', total: 100 },
    { created_at: '2026-08-16T10:00:00Z', total: 300 },
  ];
  const f = models.forecastSales(sales);
  assert(f.grain === 'day', `grain=${f.grain}`);
  assert(f.monthly.length === 2, JSON.stringify(f.monthly));
  assert(f.forecast.length === 3, 'faltan periodos');
});

check('pronostico usa granularidad mensual con 2+ meses', () => {
  const sales = [
    { created_at: '2026-07-10T10:00:00Z', total: 100 },
    { created_at: '2026-08-10T10:00:00Z', total: 200 },
  ];
  const f = models.forecastSales(sales);
  assert(f.grain === 'month', `grain=${f.grain}`);
});

check('RFM clasifica clientes', () => {
  const now = new Date().toISOString();
  const clients = [{ id: 1, name: 'VIP' }, { id: 2, name: 'Inactivo' }];
  const sales = [{ client_id: 1, total: 100, created_at: now }];
  const r = models.rfm(clients, sales);
  assert(r.length === 2, 'clientes perdidos');
  assert(r[0].segment === 'VIP', `segmento=${r[0].segment}`);
  assert(r[1].segment === 'En riesgo', `segmento=${r[1].segment}`);
});

check('riesgo de stock critico', () => {
  const products = [{ id: 1, name: 'Producto', stock: 2, min_stock: 5 }];
  const r = models.stockRisk(products, [{ item_id: 1, quantity: 10 }]);
  assert(r.length === 1 && r[0].risk === 'CRITICO', JSON.stringify(r));
});

console.log(`\nRESULTADO: ${passed} pasadas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
