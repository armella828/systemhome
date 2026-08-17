/* ============================================================
   SYSTEMHOME - Módulo Alertas
   SH-I03: Alertas de stock mínimo
   SH-M02: Alertas de mantenimiento vencido/próximo
   ============================================================ */

const AlertsModule = {
    init() {
        this.render();
    },

    render() {
        const container = document.getElementById('alerts-view');
        if (!container) return;

        const stockAlerts = DB.getStockAlerts();
        const maintAlerts = DB.getMaintenanceAlerts();
        const inventory = DB.getInventory();
        const maintenances = DB.getMaintenance();
        const clients = DB.getClients();

        // Stock bajo actual (no solo alertas registradas)
        const lowStockItems = inventory.filter(i => i.stock <= i.minStock);

        container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <h3 style="font-size:16px;font-weight:600;">🔔 Centro de Alertas</h3>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3>📦 Alertas de Stock Mínimo (SH-I03)</h3>
            <span class="badge badge-rechazado"><span class="dot"></span> ${lowStockItems.length} productos bajos</span>
          </div>
          <div class="card-body" style="padding:0 24px;">
            ${lowStockItems.length === 0 ? '<div style="text-align:center;padding:30px;color:var(--gray-400);">✅ No hay productos con stock bajo.</div>' : `
              <ul class="recent-list">
                ${lowStockItems.map(i => `
                  <li>
                    <div class="recent-icon">📦</div>
                    <div class="recent-info">
                      <strong>${this.escapeHtml(i.name)}</strong>
                      <span>Stock actual: <strong style="color:var(--danger);">${i.stock}</strong> · Stock mínimo: ${i.minStock}</span>
                    </div>
                    <span class="badge badge-rechazado"><span class="dot"></span> Bajo</span>
                  </li>`).join('')}
              </ul>
            `}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>🛠️ Alertas de Mantenimiento (SH-M02)</h3>
          </div>
          <div class="card-body" style="padding:0 24px;">
            ${maintAlerts.length === 0 ? '<div style="text-align:center;padding:30px;color:var(--gray-400);">No hay alertas de mantenimiento registradas.</div>' : `
              <ul class="recent-list">
                ${maintAlerts.slice(0, 10).map(a => {
                  const client = clients.find(c => c.id === a.client_id);
                  return `
                  <li>
                    <div class="recent-icon">🛠️</div>
                    <div class="recent-info">
                      <strong>${client ? this.escapeHtml(client.name) : 'Cliente'}</strong>
                      <span>${this.escapeHtml(a.item_name || 'Equipo')} · Mantenimiento: ${DB.formatDate(a.next_maintenance_date)}</span>
                    </div>
                    <span class="badge badge-enviado"><span class="dot"></span> ${a.alert_type}</span>
                  </li>`;
                }).join('')}
              </ul>
            `}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="card-header">
          <h3>📋 Historial de Alertas de Stock</h3>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock Actual</th>
                  <th>Stock Mínimo</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${stockAlerts.length === 0 ? `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--gray-400);">Sin alertas registradas.</td></tr>` : stockAlerts.map(a => `
                  <tr>
                    <td><strong>${this.escapeHtml(a.item_name)}</strong></td>
                    <td style="color:var(--danger);font-weight:600;">${a.stock_current}</td>
                    <td>${a.stock_min}</td>
                    <td>${DB.formatDateTime(a.created_at)}</td>
                    <td><span class="badge ${a.status === 'pendiente' ? 'badge-rechazado' : 'badge-aprobado'}"><span class="dot"></span> ${a.status === 'pendiente' ? 'Pendiente' : 'Atendida'}</span></td>
                    <td>
                      ${a.status === 'pendiente' ? `<button class="btn btn-sm btn-success" onclick="AlertsModule.resolve(${a.id})">✅ Atender</button>` : '-'}
                    </td>
                  </tr>`).join('')}
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

    resolve(id) {
        if (confirm('¿Marcar esta alerta de stock como atendida?')) {
            DB.resolveStockAlert(id);
            App.showToast('Alerta atendida', 'success');
            this.render();
        }
    }
};