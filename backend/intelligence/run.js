// ============================================================
// SYSTEMHOME INTELLIGENCE - Orquestador y persistencia
// Ejecuta ETL + modelos y guarda metricas/insights en PostgreSQL.
// ============================================================
const { run, get, all } = require('../db');
const { extract, writeDatasets } = require('./etl');
const models = require('./models');

const nowIso = () => new Date().toISOString();

function lastRun() {
  try { return get('SELECT * FROM intel_runs ORDER BY id DESC LIMIT 1') || null; } catch (e) { return null; }
}

function getMetrics(runId) {
  try {
    const id = runId || lastRun()?.id;
    if (!id) return [];
    return all('SELECT key, value, payload FROM intel_metrics WHERE run_id = ? ORDER BY key', [id]);
  } catch (e) { return []; }
}

function getInsights(runId) {
  try {
    const id = runId || lastRun()?.id;
    if (!id) return [];
    return all('SELECT category, title, detail, score FROM intel_insights WHERE run_id = ? ORDER BY score DESC NULLS LAST', [id]);
  } catch (e) {
    try {
      const id = runId || lastRun()?.id;
      return all('SELECT category, title, detail, score FROM intel_insights WHERE run_id = ? ORDER BY id', [id]);
    } catch (e2) { return []; }
  }
}

function flatten(result) {
  const out = [];
  for (const [k, v] of Object.entries(result.revenue)) {
    if (typeof v === 'number') out.push([`revenue.${k}`, v, null]);
  }
  out.push(['forecast.trend', result.forecast.trend, null]);
  out.push(['forecast.r2', result.forecast.r2, null]);
  result.forecast.forecast.forEach((f, i) => out.push([`forecast.month${i + 1}`, f.predicted, null]));
  out.push(['rfm.vipClients', result.rfm.filter((r) => r.segment === 'VIP').length, null]);
  out.push(['rfm.activeClients', result.rfm.filter((r) => r.segment === 'Activo').length, null]);
  out.push(['rfm.atRiskClients', result.rfm.filter((r) => r.segment === 'En riesgo').length, null]);
  out.push(['stock.criticalItems', result.stockRisk.filter((r) => r.risk === 'CRITICO').length, null]);
  out.push(['stock.highRiskItems', result.stockRisk.filter((r) => r.risk === 'ALTO').length, null]);
  out.push(['technicians.totalOrders', result.technicians.reduce((a, t) => a + t.orders, 0), null]);
  out.push(['dataset.records', result.recordsProcessed, null]);
  return out;
}

function buildInsights(result) {
  const list = [];
  const m = result.revenue;
  const fmt = (v) => Number(v || 0).toLocaleString('es-PY');
  list.push({
    category: 'VENTAS', title: 'Rendimiento comercial',
    detail: `Se registraron ${m.salesCount} ventas por ${fmt(m.totalRevenue)}. Ticket promedio: ${fmt(m.avgTicket)}.`,
    score: m.totalRevenue,
  });
  if (m.collectionRate < 100) {
    list.push({
      category: 'COBROS', title: 'Tasa de cobranza',
      detail: `Se ha cobrado el ${m.collectionRate}% de lo facturado. Revisar cobros pendientes.`,
      score: m.collectionRate,
    });
  }
  const f = result.forecast;
  if (f.monthly.length >= 2) {
    list.push({
      category: 'PRONOSTICO', title: 'Tendencia de ingresos',
      detail: `Tendencia ${f.trend > 0 ? 'creciente' : 'decreciente'} (${f.trend} por mes), R²=${f.r2}. Pronóstico a 3 meses: ${f.forecast.map((x) => fmt(x.predicted)).join(' / ')}.`,
      score: Math.abs(f.trend),
    });
  }
  const vip = result.rfm.filter((r) => r.segment === 'VIP');
  const risk = result.rfm.filter((r) => r.segment === 'En riesgo');
  if (vip.length) {
    list.push({
      category: 'CLIENTES', title: 'Clientes VIP',
      detail: `${vip.length} cliente(s) de alto valor: ${vip.slice(0, 5).map((r) => r.name).join(', ')}.`,
      score: vip.length,
    });
  }
  if (risk.length) {
    list.push({
      category: 'RETENCION', title: 'Clientes en riesgo',
      detail: `${risk.length} cliente(s) con baja recencia/frecuencia. Se recomienda contactarlos.`,
      score: risk.length,
    });
  }
  const critical = result.stockRisk.filter((r) => r.risk === 'CRITICO');
  if (critical.length) {
    list.push({
      category: 'INVENTARIO', title: 'Productos con stock crítico',
      detail: `${critical.length} producto(s) bajo el mínimo: ${critical.slice(0, 5).map((r) => r.name).join(', ')}.`,
      score: critical.length,
    });
  }
  const top = result.technicians[0];
  if (top && top.orders) {
    list.push({
      category: 'OPERACIONES', title: 'Técnico con mayor carga',
      detail: `${top.name}: ${top.orders} orden(es), ${top.completed} completada(s).`,
      score: top.orders,
    });
  }
  return list;
}

function execute() {
  const startedAt = nowIso();
  const t0 = Date.now();
  const inserted = run('INSERT INTO intel_runs (started_at, status) VALUES (?, ?)', [startedAt, 'running']);
  const runId = inserted.lastInsertRowid;
  try {
    const data = extract();
    const manifest = writeDatasets(data);
    const recordsProcessed = Object.values(data).reduce((a, rows) => a + rows.length, 0);

    const result = {
      revenue: models.revenueMetrics(data),
      forecast: models.forecastSales(data.sales),
      rfm: models.rfm(data.clients, data.sales),
      stockRisk: models.stockRisk(data.products, data.saleItems),
      technicians: models.technicianPerformance(data.workOrders, data.technicians),
      recordsProcessed,
    };

    for (const [key, value, payload] of flatten(result)) {
      run('INSERT INTO intel_metrics (run_id, key, value, payload, created_at) VALUES (?, ?, ?, ?, ?)',
        [runId, key, value, payload, nowIso()]);
    }
    for (const insight of buildInsights(result)) {
      run('INSERT INTO intel_insights (run_id, category, title, detail, score, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [runId, insight.category, insight.title, insight.detail, insight.score, nowIso()]);
    }

    run('UPDATE intel_runs SET finished_at = ?, status = ?, records_processed = ?, duration_ms = ? WHERE id = ?',
      [nowIso(), 'completed', recordsProcessed, Date.now() - t0, runId]);

    return {
      runId,
      status: 'completed',
      recordsProcessed,
      durationMs: Date.now() - t0,
      datasets: manifest.datasets,
      revenue: result.revenue,
      forecast: result.forecast,
      insights: buildInsights(result),
      rfm: result.rfm,
      stockRisk: result.stockRisk,
      technicians: result.technicians,
    };
  } catch (err) {
    try {
      run('UPDATE intel_runs SET finished_at = ?, status = ?, error = ?, duration_ms = ? WHERE id = ?',
        [nowIso(), 'failed', err.message, Date.now() - t0, runId]);
    } catch (e) { /* noop */ }
    throw err;
  }
}

module.exports = { execute, lastRun, getMetrics, getInsights };
