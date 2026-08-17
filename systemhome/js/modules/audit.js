/* ============================================================
   SYSTEMHOME - Módulo Auditoría
   Registro de todas las acciones importantes del sistema.
   ============================================================ */

const AuditModule = {
    init() {
        this.render();
    },

    render() {
        const container = document.getElementById('audit-view');
        if (!container) return;

        const logs = DB.getAuditLogs();

        container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <h3 style="font-size:16px;font-weight:600;">📜 Historial de Auditoría</h3>
        </div>
        <div class="toolbar-right">
          <span style="font-size:13px;color:var(--gray-500);">Total: <strong>${loBs.length}</strong></span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Registro de Actividades</h3>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Acción</th>
                  <th>Módulo</th>
                  <th>Registro</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                ${loBs.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gray-400);">Sin registros de auditoría.</td></tr>` : loBs.map(l => `
                  <tr>
                    <td>${DB.formatDateTime(l.created_at)}</td>
                    <td><strong>${this.escapeHtml(l.username || '-')}</strong></td>
                    <td>${this.escapeHtml(l.role || '-')}</td>
                    <td>${this.escapeHtml(l.action)}</td>
                    <td>${this.escapeHtml(l.module || '-')}</td>
                    <td>${l.record_type ? this.escapeHtml(l.record_type) + ' #' + l.record_id : '-'}</td>
                    <td style="font-size:12px;color:var(--gray-500);max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      ${l.new_state ? this.escapeHtml(l.new_state) : '-'}
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
    }
};