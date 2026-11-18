// ============================================================
// SYSTEMHOME INTELLIGENCE - API publica del modulo
// ============================================================
const { execute, lastRun, getMetrics, getInsights } = require('./run');
const { listDatasets, extract } = require('./etl');
const models = require('./models');

module.exports = { execute, lastRun, getMetrics, getInsights, listDatasets, extract, models };
