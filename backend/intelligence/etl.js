// ============================================================
// SYSTEMHOME INTELLIGENCE - ETL
// Extrae datos reales de PostgreSQL/SQLite y genera datasets CSV.
// ============================================================
const fs = require('fs');
const path = require('path');
const { all } = require('../db');

const DATASETS_DIR = path.join(__dirname, 'datasets');

const QUERIES = {
  sales: 'SELECT * FROM sales ORDER BY created_at',
  saleItems: 'SELECT * FROM sale_items ORDER BY id',
  clients: 'SELECT * FROM clients ORDER BY id',
  products: 'SELECT * FROM inventory_items ORDER BY id',
  movements: 'SELECT * FROM inventory_movements ORDER BY created_at',
  budgets: 'SELECT * FROM budgets ORDER BY created_at',
  workOrders: 'SELECT * FROM work_orders ORDER BY created_at',
  payments: 'SELECT * FROM payments ORDER BY created_at',
  invoices: 'SELECT * FROM invoices ORDER BY created_at',
  requests: 'SELECT * FROM requests ORDER BY created_at',
  technicians: 'SELECT * FROM technicians ORDER BY id',
};

function extract() {
  const data = {};
  for (const [name, sql] of Object.entries(QUERIES)) {
    try { data[name] = all(sql); } catch (e) { data[name] = []; }
  }
  return data;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

function writeDatasets(data) {
  fs.mkdirSync(DATASETS_DIR, { recursive: true });
  const manifest = { generatedAt: new Date().toISOString(), datasets: {} };
  for (const [name, rows] of Object.entries(data)) {
    const file = path.join(DATASETS_DIR, `${name}.csv`);
    fs.writeFileSync(file, toCsv(rows), 'utf8');
    manifest.datasets[name] = { rows: rows.length, file: `${name}.csv`, bytes: fs.statSync(file).size };
  }
  fs.writeFileSync(path.join(DATASETS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

function listDatasets() {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(DATASETS_DIR, 'manifest.json'), 'utf8'));
    return manifest;
  } catch (e) {
    return { generatedAt: null, datasets: {} };
  }
}

module.exports = { extract, writeDatasets, toCsv, listDatasets, DATASETS_DIR };
