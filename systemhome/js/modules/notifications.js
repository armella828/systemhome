/* ============================================================
   SYSTEMHOME - Módulo Notificaciones
   Panel de notificaciones del sistema.
   ============================================================ */

const NotificationsModule = {
    init() {
        this.render();
    },

    render() {
        const container = document.getElementById('notifications-view');
        if (!container) return;

        const notifications = DB.getNotifications();

        container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <h3 style="font-size:16px;font-weight:600;">🔔 Notificaciones</h3>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-secondary" onclick="NotificationsModule.markAllRead()">✅ Marcar todas como leídas</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Centro de Notificaciones</h3>
          <span style="font-size:13px;color:var(--gray-500);">Total: <strong>${notifications.length}</strong></span>
        </div>
        <div class="card-body" style="padding:0 24px;">
          ${notifications.length === 0 ? '<div style="text-align:center;padding:40px;color:var(--gray-400);">No hay notificaciones.</div>' : `
            <ul class="recent-list">
              ${notifications.map(n => `
                <li style="${n.read ? 'opacity:0.6;' : ''}">
                  <div class="recent-icon">${n.type === 'nueva_solicitud' ? '📝' : n.type === 'cotizacion_aprobada' ? '✅' : n.type === 'cotizacion_rechazada' ? '❌' : n.type === 'stock_alerta' ? '📦' : n.type === 'mantenimiento_alerta' ? '🛠️' : '🔔'}</div>
                  <div class="recent-info">
                    <strong>${this.escapeHtml(n.title)}</strong>
                    <span>${this.escapeHtml(n.message || '')}</span>
                    <span style="font-size:12px;color:var(--gray-400);">${DB.formatDateTime(n.created_at)}</span>
                  </div>
                  ${!n.read ? `<button class="btn btn-sm btn-secondary" onclick="NotificationsModule.markRead(${n.id})">✓ Leída</button>` : ''}
                </li>`).join('')}
            </ul>
          `}
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

    markRead(id) {
        DB.markNotificationRead(id);
        this.render();
        App.updateNotificationsBadge();
    },

    markAllRead() {
        DB.markAllNotificationsRead();
        this.render();
        App.updateNotificationsBadge();
        App.showToast('Todas las notificaciones marcadas como leídas', 'success');
    }
};