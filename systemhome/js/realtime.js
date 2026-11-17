/* ============================================================
   SYSTEMHOME - Cliente SSE (sincronización inmediata)
   Escucha cambios de requests, cotizaciones, órdenes, técnicos,
   mantenimientos y notificaciones sin recargar la página.
   ============================================================ */

const RealtimeModule = {
  source: null,
  connected: false,
  lastHandled: 0,

  getBaseUrl() {
    return (window.API_BASE_URL || localStorage.getItem('sh_api_url') || '/api').replace(/\/$/, '');
  },

  init() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.connected) this.connect();
    });
    this.connect();
  },

  connect() {
    const token = localStorage.getItem('sh_token');
    if (!token || this.source) return;

    try {
      const url = this.getBaseUrl() + '/events?token=' + encodeURIComponent(token);
      const source = new EventSource(url);
      this.source = source;

      source.addEventListener('connected', () => {
        this.connected = true;
        console.info('[SYSTEMHOME] Sincronización en tiempo real conectada');
      });

      source.addEventListener('notification', (event) => {
        this.safeHandle(() => {
          if (typeof App !== 'undefined' && document.getElementById('adminPortal')?.style.display !== 'none') {
            App.updateNotificationsBadge?.();
            if (App.currentView === 'notifications') {
              NotificationsModule?.render?.();
            }
          }
          const data = this.parse(event);
          App?.showToast?.(`🔔 ${data.title || 'Nueva notificación'}`, 'info');
        });
      });

      source.addEventListener('sh-update', (event) => {
        this.safeHandle(() => this.handleUpdate(this.parse(event)));
      });

      source.onerror = () => {
        this.connected = false;
      };
    } catch (err) {
      console.warn('[SYSTEMHOME] No se pudo iniciar SSE:', err.message);
    }
  },

  disconnect() {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    this.connected = false;
  },

  reconnect() {
    this.disconnect();
    this.connect();
  },

  parse(event) {
    try { return JSON.parse(event.data || '{}'); } catch (e) { return {}; }
  },

  safeHandle(fn) {
    try { fn(); } catch (err) { console.warn('[SYSTEMHOME] SSE handler:', err.message); }
  },

  handleUpdate(data) {
    const now = Date.now();
    if (now - this.lastHandled < 500) return;
    this.lastHandled = now;

    const entity = data.entity;
    const adminVisible = typeof App !== 'undefined' && document.getElementById('adminPortal')?.style.display !== 'none';
    const clientVisible = typeof ClientPortal !== 'undefined' && document.getElementById('clientPortal')?.style.display !== 'none';

    const viewByEntity = {
      requests: 'requests',
      budgets: 'budgets',
      workorders: 'workorders',
      maintenances: 'maintenances',
      technicians: 'technicians',
      inventory: 'inventory'
    };
    const labelByEntity = {
      requests: 'Nueva solicitud recibida',
      budgets: 'Cotización actualizada',
      workorders: 'Orden de trabajo actualizada',
      maintenances: 'Mantenimiento actualizado',
      technicians: 'Equipo técnico actualizado',
      inventory: 'Inventario actualizado'
    };

    if (adminVisible) {
      App.updateNotificationsBadge?.();
      if (entity === 'notifications' || !entity) return;
      const targetView = viewByEntity[entity];
      if (targetView && App.currentView === targetView) {
        App.navigate(App.currentView, true);
      }
      if (['requests', 'budgets', 'workorders'].includes(entity)) {
        App.showToast?.(`🔄 ${labelByEntity[entity] || 'Datos actualizados'}`, 'info');
      }
    }

    if (clientVisible && ['budgets', 'workorders', 'notifications'].includes(entity)) {
      ClientPortal.refresh?.();
      App.showToast?.('🔄 Su información fue actualizada', 'info');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => RealtimeModule.init());
