// ============================================================
// SYSTEMHOME INTELLIGENCE - Modelos analiticos (JavaScript puro)
// Regresion lineal, RFM, riesgo de stock y desempeno por tecnico.
// ============================================================
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

function linearRegression(points) {
  const n = points.length;
  if (n < 2) {
    const y = n ? points[0].y : 0;
    return { slope: 0, intercept: y, r2: 0, predict: () => y };
  }
  const sx = points.reduce((a, p) => a + p.x, 0);
  const sy = points.reduce((a, p) => a + p.y, 0);
  const sxx = points.reduce((a, p) => a + p.x * p.x, 0);
  const sxy = points.reduce((a, p) => a + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const meanY = sy / n;
  const ssTot = points.reduce((a, p) => a + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((a, p) => a + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : round(1 - ssRes / ssTot, 4);
  return { slope: round(slope, 2), intercept: round(intercept, 2), r2, predict: (x) => slope * x + intercept };
}

function movingAverage(values, window = 3) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    out.push(round(slice.reduce((a, b) => a + b, 0) / slice.length, 2));
  }
  return out;
}

function groupByMonth(rows, dateField, valueField) {
  const map = {};
  for (const row of rows) {
    const d = new Date(row[dateField]);
    if (isNaN(d.getTime())) continue;
    const key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    map[key] = (map[key] || 0) + num(row[valueField]);
  }
  return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([month, total]) => ({ month, total: round(total) }));
}

function revenueMetrics(data) {
  const { sales = [], payments = [], invoices = [], budgets = [] } = data;
  const totalSales = sales.reduce((a, s) => a + num(s.total), 0);
  const totalPaid = payments.reduce((a, p) => a + num(p.amount), 0);
  const approved = budgets.filter((b) => String(b.status).toLowerCase() === 'aprobado').length;
  return {
    totalRevenue: round(totalSales),
    totalCollected: round(totalPaid),
    collectionRate: totalSales ? round(totalPaid / totalSales * 100, 1) : 0,
    avgTicket: sales.length ? round(totalSales / sales.length) : 0,
    salesCount: sales.length,
    invoicesCount: invoices.length,
    budgetsCount: budgets.length,
    approvedBudgets: approved,
    conversionRate: budgets.length ? round(sales.length / budgets.length * 100, 1) : 0,
  };
}

function forecastSales(sales = []) {
  let series = groupByMonth(sales, 'created_at', 'total');
  let grain = 'month';
  if (series.length < 2) {
    // Con menos de 2 meses, usar granularidad diaria para tener suficientes puntos
    const byDay = {};
    for (const s of sales) {
      const d = new Date(s.created_at);
      if (isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] || 0) + num(s.total);
    }
    series = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, total]) => ({ month: day, total: round(total) }));
    grain = 'day';
  }
  const points = series.map((m, i) => ({ x: i, y: m.total }));
  const reg = linearRegression(points);
  const forecast = [];
  for (let i = 1; i <= 3; i++) {
    const x = points.length - 1 + i;
    forecast.push({ periodsAhead: i, predicted: round(Math.max(0, reg.predict(x))) });
  }
  return {
    grain,
    monthly: series,
    movingAverage: movingAverage(series.map((m) => m.total)),
    trend: reg.slope,
    r2: reg.r2,
    forecast,
  };
}

function rfm(clients = [], sales = []) {
  const now = Date.now();
  const map = {};
  for (const s of sales) {
    if (!s.client_id) continue;
    const id = Number(s.client_id);
    const t = new Date(s.created_at).getTime();
    if (!map[id]) map[id] = { last: 0, count: 0, total: 0 };
    map[id].count++;
    map[id].total += num(s.total);
    if (t > map[id].last) map[id].last = t;
  }
  const rows = clients.map((c) => {
    const m = map[Number(c.id)] || { last: 0, count: 0, total: 0 };
    return {
      clientId: Number(c.id),
      name: c.name,
      recencyDays: m.last ? Math.floor((now - m.last) / 86400000) : 9999,
      frequency: m.count,
      monetary: round(m.total),
    };
  });
  const maxF = Math.max(1, ...rows.map((r) => r.frequency));
  const maxM = Math.max(1, ...rows.map((r) => r.monetary));
  for (const r of rows) {
    const recencyScore = r.recencyDays >= 9999 ? 0 : Math.max(0, 1 - r.recencyDays / 365) * 5;
    r.score = round((recencyScore + (r.frequency / maxF) * 5 + (r.monetary / maxM) * 5) / 3, 1);
    r.segment = r.score >= 3.5 ? 'VIP' : r.score >= 2 ? 'Activo' : 'En riesgo';
  }
  return rows.sort((a, b) => b.score - a.score);
}

function stockRisk(products = [], saleItems = []) {
  const sold = {};
  for (const si of saleItems) {
    if (!si.item_id) continue;
    const id = Number(si.item_id);
    sold[id] = (sold[id] || 0) + num(si.quantity);
  }
  return products.map((p) => {
    const id = Number(p.id);
    const qty = sold[id] || 0;
    const stock = num(p.stock);
    const min = num(p.min_stock);
    const coverage = qty > 0 ? Math.round(stock / (qty / 30)) : 999;
    const risk = stock <= min ? 'CRITICO' : coverage < 30 ? 'ALTO' : coverage < 90 ? 'MEDIO' : 'BAJO';
    return { itemId: id, name: p.name, stock, minStock: min, soldUnits: qty, coverageDays: coverage, risk };
  }).filter((r) => r.risk !== 'BAJO').sort((a, b) => a.coverageDays - b.coverageDays);
}

function technicianPerformance(workOrders = [], technicians = []) {
  const counts = {};
  for (const w of workOrders) {
    if (!w.technician_id) continue;
    const id = Number(w.technician_id);
    counts[id] = counts[id] || { orders: 0, completed: 0 };
    counts[id].orders++;
    if (['completada', 'cerrada', 'finalizada', 'completado'].includes(String(w.status).toLowerCase())) {
      counts[id].completed++;
    }
  }
  return technicians.map((t) => {
    const c = counts[Number(t.id)] || { orders: 0, completed: 0 };
    return { id: Number(t.id), name: t.name, orders: c.orders, completed: c.completed };
  }).sort((a, b) => b.orders - a.orders);
}

module.exports = {
  linearRegression, movingAverage, groupByMonth, revenueMetrics,
  forecastSales, rfm, stockRisk, technicianPerformance,
};
