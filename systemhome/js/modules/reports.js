/* ============================================================
   SYSTEMHOME - Módulo Reportes de Servicios (SH-R02)
   Consulta de servicios por tipo, filtros y exportación
   PDF / Excel (CSV).
   ============================================================ */

const ReportsModule = {
    init() {
        this.render();
    },

    render() {
        const container = document.getElementById('reports-view');
        if (!container) return;

        const clients = DB.getClients();
        const services = [
            { id: 'camaras', name: 'Cámaras de Vigilancia' },
            { id: 'alarma', name: 'Sistemas de Alarma' },
            { id: 'ac', name: 'Aire Acondicionado' },
            { id: 'cerca', name: 'Cerca Eléctrica' },
            { id: 'video', name: 'Video Portero' },
            { id: 'electricidad', name: 'Electricidad' },
            { id: 'cableado', name: 'Cableado Estructurado' },
            { id: 'redes', name: 'Redes e Internet' },
            { id: 'otro', name: 'Otros' }
        ];

        container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <h3 style="font-size:16px;font-weight:600;">📊 Reporte de Servicios por Tipo</h3>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-secondary" onclick="ReportsModule.exportReport('pdf')">📄 Exportar PDF</button>
          <button class="btn btn-secondary" onclick="ReportsModule.exportReport('excel')">📊 Exportar Excel</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>🔍 Filtros</h3>
        </div>
        <div class="card-body">
          <div class="form-row-3">
            <div class="form-group">
              <label>Tipo de Servicio</label>
              <select class="form-control" id="reportServiceType">
                <option value="all">Todos</option>
                ${services.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Cliente</label>
              <select class="form-control" id="reportClient">
                <option value="all">Todos</option>
                ${clients.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Estado</label>
              <select class="form-control" id="reportStatus">
                <option value="all">Todos</option>
                <option value="borrador">Borrador</option>
                <option value="enviado">Enviado</option>
                <option value="aprobado">Aprobado</option>
                <option value="rechazado">Rechazado</option>
              </select>
            </div>
          </div>
          <div class="form-row-3">
            <div class="form-group">
              <label>Desde</label>
              <input type="date" class="form-control" id="reportFrom">
            </div>
            <div class="form-group">
              <label>Hasta</label>
              <input type="date" class="form-control" id="reportTo">
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end;">
              <button class="btn btn-primary" onclick="ReportsModule.applyFilters()">🔍 Aplicar Filtros</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="card-header">
          <h3>📋 Resultados</h3>
          <span style="font-size:13px;color:var(--gray-500);" id="reportCount">0 registros</span>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Servicio</th>
                  <th>Cliente</th>
                  <th>Descripción</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody id="reportTableBody">
                <tr><td colspan="7" style="text-align:center;padding:30px;color:var(--gray-400);">Aplique filtros para ver resultados.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    getFilters() {
        return {
            serviceType: document.getElementById('reportServiceType')?.value || 'all',
            clientId: document.getElementById('reportClient')?.value || 'all',
            status: document.getElementById('reportStatus')?.value || 'all',
            from: document.getElementById('reportFrom')?.value || '',
            to: document.getElementById('reportTo')?.value || ''
        };
    },

    applyFilters() {
        const filters = this.getFilters();
        const report = DB.getServiceReport(filters);
        const tbody = document.getElementById('reportTableBody');
        const count = document.getElementById('reportCount');

        if (count) count.textContent = `${report.length} registros`;

        if (!tbody) return;
        if (report.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--gray-400);">No se encontraron resultados.</td></tr>`;
            return;
        }

        const statusMap = { borrador: 'badge-borrador', enviado: 'badge-enviado', aprobado: 'badge-aprobado', rechazado: 'badge-rechazado' };

        tbody.innerHTML = report.map(r => `
          <tr>
            <td><strong>${this.escapeHtml(r.number)}</strong></td>
            <td>${this.escapeHtml(r.service_name || r.service_type || '-')}</td>
            <td>${this.escapeHtml(r.client_name || '-')}</td>
            <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.escapeHtml(r.description || '-')}</td>
            <td><strong>${DB.formatCurrency(r.total || 0)}</strong></td>
            <td><span class="badge ${statusMap[r.status] || 'badge-enviado'}"><span class="dot"></span> ${r.status}</span></td>
            <td>${DB.formatDate(r.created_at)}</td>
          </tr>`).join('');
    },

    async exportReport(format) {
        const filters = this.getFilters();
        if (format === 'excel') {
            try {
                const result = await DB.exportServiceReport(filters);
                App.showToast(`Reporte exportado: ${result.filename}`, 'success');
            } catch (err) {
                App.showToast(err.message || 'No se pudo exportar el reporte a Excel', 'error');
            }
            return;
        } else {
            // PDF: exportar como CSV con extensión .pdf no es ideal; usamos la vista de impresión
            // Para PDF real, generamos un documento imprimible
            const report = DB.getServiceReport(filters);
            const win = window.open('', '_blank');
            if (!win) { App.showToast('Permita ventanas emergentes para exportar PDF', 'warning'); return; }
            win.document.write(`
              <html><head><title>Reporte de Servicios - SYSTEMHOME</title>
              <style>
                body{font-family:Arial,sans-serif;padding:30px;color:#333;}
                h1{color:#0f4c81;text-align:center;}
                h2{color:#0f4c81;}
                table{width:100%;border-collapse:collapse;margin-top:20px;}
                th,td{border:1px solid #ccc;padding:8px;font-size:12px;text-align:left;}
                th{background:#0f4c81;color:#fff;}
                .total{font-weight:bold;text-align:right;margin-top:20px;}
              </style></head><body>
              <h1>SYSTEMHOME</h1>
              <h2>Reporte de Servicios por Tipo</h2>
              <p>Generado: ${new Date().toLocaleString('es-PY')}</p>
              <table>
                <thead><tr><th>N°</th><th>Servicio</th><th>Cliente</th><th>Descripción</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead>
                <tbody>
                  ${report.map(r => `<tr><td>${r.number}</td><td>${r.service_name || r.service_type || ''}</td><td>${r.client_name || ''}</td><td>${r.description || ''}</td><td>${Number(r.total || 0).toLocaleString('es-PY')}</td><td>${r.status}</td><td>${r.created_at}</td></tr>`).join('')}
                </tbody>
              </table>
              <div class="total">Total registros: ${report.length}</div>
              <script>window.print();<\/script>
              </body></html>
            `);
            win.document.close();
        }
    }
};