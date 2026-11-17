/* ============================================================
   SYSTEMHOME - Módulo SYSTEMHOME INTELLIGENCE (Ciencia de Datos)
   ============================================================ */

const IntelligenceModule = {
  lastResult: null,

  init() {
    // Los datos se cargan al renderizar la vista para evitar llamadas innecesarias
  },

  esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  money(value) {
    const n = Number(value || 0);
    return n.toLocaleString('es-PY', { maximumFractionDigits: 0 });
  },

  render(container) {
    const user = Auth.getCurrentUser();
    if (!user || user.role !== 'admin') {
      container.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-icon">🔒</div>
          <h3>Acceso Restringido</h3>
          <p>SYSTEMHOME INTELLIGENCE está disponible solo para administradores generales.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="intel-hero">
        <h2>🧠 SYSTEMHOME INTELLIGENCE</h2>
        <p>Motor de ciencia de datos sobre información real: ingesta ETL, métricas de negocio, pronósticos, segmentación de clientes (RFM), riesgo de inventario y desempeño operativo.</p>
        <span class="intel-hero-badge">Datos reales · PostgreSQL · Sin dependencias externas</span>
      </div>

      <div class="module-header">
        <div>
          <h2>Panel Analítico Ejecutivo</h2>
          <p class="module-subtitle">Ejecute el motor para procesar todas las tablas del sistema y generar datasets y hallazgos accionables</p>
        </div>
        <div class="module-actions">
          <button class="btn btn-secondary" onclick="IntelligenceModule.refresh()">🔄 Actualizar Estado</button>
          <button class="btn btn-primary" id="btnIntelRun" onclick="IntelligenceModule.run()">⚡ Ejecutar Análisis</button>
        </div>
      </div>

      <div class="intel-kpis" id="intelKpis"></div>

      <div class="intel-grid">
        <div class="card">
          <div class="card-header"><h3>📈 Serie ingresos y pronóstico</h3></div>
          <div class="card-body"><div id="intelChart" class="intel-empty">Cargando…</div></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>💡 Insights accionables</h3></div>
          <div class="card-body"><div id="intelInsights" class="intel-empty">Cargando…</div></div>
        </div>
      </div>

      <div class="intel-grid">
        <div class="card">
          <div class="card-header"><h3>👥 Segmentación de clientes (RFM)</h3></div>
          <div class="card-body"><div id="intelRfm" class="intel-empty">Ejecute un análisis para ver la segmentación.</div></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>⚙️ Operaciones e inventario</h3></div>
          <div class="card-body"><div id="intelOperations" class="intel-empty">Ejecute un análisis para ver riesgo de stock y técnicos.</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>📂 Datasets generados (CSV)</h3></div>
        <div class="card-body"><div id="intelDatasets" class="intel-empty">Cargando…</div></div>
      </div>
    `;

    this.loadState();
  },

  refresh() {
    this.loadState();
    App.showNotification('Estado de INTELLIGENCE actualizado', 'info');
  },

  loadState() {
    const status = DB.getIntelligenceStatus();
    const run = status.run || null;
    const metrics = DB.getIntelligenceMetrics();
    const insights = DB.getIntelligenceInsights();

    const set = (key, fallback = '-') => {
      const row = metrics.find(m => m.key === key);
      return row && row.value !== null && row.value !== undefined ? row.value : fallback;
    };

    this.renderKpis({
      totalRevenue: Number(set('revenue.totalRevenue', 0)),
      salesCount: Number(set('revenue.salesCount', 0)),
      collectionRate: Number(set('revenue.collectionRate', 0)),
      trend: Number(set('forecast.trend', 0)),
      records: run ? Number(run.records_processed || 0) : 0,
      status: run ? run.status : null,
      duration: run ? run.duration_ms : null,
      finished: run ? run.finished_at : null,
    });

    const insightsBox = document.getElementById('intelInsights');
    if (insightsBox) {
      if (!insights.length) {
        insightsBox.className = 'intel-empty';
        insightsBox.innerHTML = '<div class="empty-icon">💡</div>No hay insights todavía. Ejecute el motor de análisis.';
      } else {
        insightsBox.className = '';
        insightsBox.innerHTML = insights.map(i => `
          <div class="intel-insight">
            <span class="intel-chip">${this.esc(i.category)}</span>
            <h4>${this.esc(i.title)}</h4>
            <p>${this.esc(i.detail)}</p>
          </div>`).join('');
      }
    }

    this.renderDatasets(status.datasets);

    if (this.lastResult) {
      this.renderChart(this.lastResult.forecast);
      this.renderRfm(this.lastResult.rfm);
      this.renderOperations(this.lastResult.stockRisk, this.lastResult.technicians);
    }
  },

  renderKpis(m) {
    const box = document.getElementById('intelKpis');
    if (!box) return;
    const stateBadge = m.status
      ? `<span class="badge ${m.status === 'completed' ? 'badge-primary' : 'badge-danger'}">${this.esc(m.status)}</span>`
      : '<span class="badge badge-info">Sin ejecuciones</span>';
    box.innerHTML = `
      <div class="intel-kpi">
        <div class="kpi-label">Facturación total</div>
        <div class="kpi-value">Bs. ${this.money(m.totalRevenue)}</div>
        <div class="kpi-hint">${m.salesCount} ventas registradas</div>
      </div>
      <div class="intel-kpi">
        <div class="kpi-label">Tasa de cobranza</div>
        <div class="kpi-value">${this.money(m.collectionRate)}%</div>
        <div class="kpi-hint">Cobros sobre facturación</div>
      </div>
      <div class="intel-kpi">
        <div class="kpi-label">Tendencia</div>
        <div class="kpi-value">${this.money(m.trend)}</div>
        <div class="kpi-hint">Variación por período</div>
      </div>
      <div class="intel-kpi">
        <div class="kpi-label">Registros procesados</div>
        <div class="kpi-value">${this.money(m.records)}</div>
        <div class="kpi-hint">${stateBadge} ${m.duration !== null && m.duration !== undefined ? '· ' + m.duration + ' ms' : ''}</div>
      </div>`;
  },

  renderChart(forecast) {
    const box = document.getElementById('intelChart');
    if (!box) return;
    if (!forecast || !forecast.monthly || !forecast.monthly.length) {
      box.className = 'intel-empty';
      box.innerHTML = '<div class="empty-icon">📈</div>Sin datos de ventas para graficar.';
      return;
    }
    const series = forecast.monthly;
    const preds = forecast.forecast || [];
    const allValues = [...series.map(p => p.total), ...preds.map(p => p.predicted)];
    const max = Math.max(1, ...allValues);
    const bars = [
      ...series.map(p => ({ label: p.month, value: p.total, forecast: false })),
      ...preds.map(p => ({ label: 'P' + p.periodsAhead, value: p.predicted, forecast: true })),
    ];
    box.className = '';
    box.innerHTML = `
      <div class="intel-bars">
        ${bars.map(b => `
          <div class="intel-bar-col" title="${this.esc(b.label)}: Bs. ${this.money(b.value)}">
            <div class="intel-bar ${b.forecast ? 'forecast' : ''}" style="height:${Math.max(2, (b.value / max) * 132)}px"></div>
            <div class="intel-bar-label">${this.esc(b.label)}</div>
          </div>`).join('')}
      </div>
      <p style="margin:14px 0 0;color:#64748b;font-size:.78rem;">
        Granularidad: <strong>${this.esc(forecast.grain === 'day' ? 'diaria' : 'mensual')}</strong> ·
        R²: <strong>${this.esc(forecast.r2)}</strong> ·
        Barras punteadas = pronóstico a 3 períodos
      </p>`;
  },

  renderRfm(rows) {
    const box = document.getElementById('intelRfm');
    if (!box) return;
    if (!rows || !rows.length) {
      box.className = 'intel-empty';
      box.innerHTML = 'Sin clientes para segmentar.';
      return;
    }
    box.className = '';
    box.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Cliente</th><th>Segmento</th><th>Recencia</th><th>Compras</th><th>Monto</th><th>Score</th></tr></thead>
          <tbody>
            ${rows.slice(0, 12).map(r => `
              <tr>
                <td>${this.esc(r.name)}</td>
                <td><span class="badge ${r.segment === 'VIP' ? 'badge-primary' : r.segment === 'Activo' ? 'badge-info' : 'badge-danger'}">${this.esc(r.segment)}</span></td>
                <td>${r.recencyDays >= 9999 ? 'Sin compras' : r.recencyDays + ' días'}</td>
                <td>${r.frequency}</td>
                <td>Bs. ${this.money(r.monetary)}</td>
                <td><strong>${r.score}</strong></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  },

  renderOperations(stock, technicians) {
    const box = document.getElementById('intelOperations');
    if (!box) return;
    const stockRows = stock || [];
    const techRows = technicians || [];
    box.className = '';
    box.innerHTML = `
      <h4 style="margin:0 0 10px;color:var(--navy);font-size:.92rem;">📦 Riesgo de stock</h4>
      ${stockRows.length ? `
        <div class="table-responsive"><table class="data-table">
          <thead><tr><th>Producto</th><th>Stock</th><th>Mínimo</th><th>Cobertura</th><th>Riesgo</th></tr></thead>
          <tbody>${stockRows.slice(0, 8).map(r => `
            <tr><td>${this.esc(r.name)}</td><td>${r.stock}</td><td>${r.minStock}</td>
            <td>${r.coverageDays >= 999 ? 'N/D' : r.coverageDays + ' días'}</td>
            <td><span class="badge ${r.risk === 'CRITICO' ? 'badge-danger' : 'badge-info'}">${this.esc(r.risk)}</span></td></tr>`).join('')}</tbody>
        </table></div>` : '<p style="color:#64748b;font-size:.85rem;">Sin productos en riesgo.</p>'}
      <h4 style="margin:18px 0 10px;color:var(--navy);font-size:.92rem;">🔧 Desempeño de técnicos</h4>
      ${techRows.length ? `
        <div class="table-responsive"><table class="data-table">
          <thead><tr><th>Técnico</th><th>Órdenes</th><th>Completadas</th></tr></thead>
          <tbody>${techRows.map(t => `
            <tr><td>${this.esc(t.name)}</td><td>${t.orders}</td><td>${t.completed}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p style="color:#64748b;font-size:.85rem;">Sin datos de órdenes.</p>'}`;
  },

  renderDatasets(datasets) {
    const box = document.getElementById('intelDatasets');
    if (!box) return;
    const entries = datasets ? Object.entries(datasets) : [];
    if (!entries.length) {
      box.className = 'intel-empty';
      box.innerHTML = 'No hay datasets generados. Ejecute el motor para crear los archivos CSV.';
      return;
    }
    box.className = '';
    box.innerHTML = `
      <div class="table-responsive"><table class="data-table">
        <thead><tr><th>Dataset</th><th>Archivo</th><th>Registros</th><th>Tamaño</th></tr></thead>
        <tbody>${entries.map(([name, d]) => `
          <tr><td><strong>${this.esc(name)}</strong></td><td><code>${this.esc(d.file)}</code></td>
          <td>${d.rows}</td><td>${d.bytes} bytes</td></tr>`).join('')}</tbody>
      </table></div>`;
  },

  run() {
    const btn = document.getElementById('btnIntelRun');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Procesando datos…'; }
    try {
      const result = DB.runIntelligence();
      if (!result || result.error) {
        throw new Error(result?.error || 'No se pudo ejecutar el motor');
      }
      this.lastResult = result;
      App.showNotification(`Análisis completado: ${result.recordsProcessed} registros en ${result.durationMs} ms`, 'success');
      this.loadState();
      this.renderChart(result.forecast);
      this.renderRfm(result.rfm);
      this.renderOperations(result.stockRisk, result.technicians);
    } catch (err) {
      App.showNotification('Error al ejecutar INTELLIGENCE: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⚡ Ejecutar Análisis'; }
    }
  }
};
