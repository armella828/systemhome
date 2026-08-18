/* ============================================================
   SYSTEMHOME - Data Store (Backend API Connector)
   ============================================================ */

const DB = {
  _baseUrl: (window.API_BASE_URL || localStorage.getItem('sh_api_url') || '/api').replace(/\/$/, ''),
  _token: null,

  _getToken() {
    if (this._token) return this._token;
    const stored = localStorage.getItem('sh_token');
    if (stored) {
      this._token = stored;
      return stored;
    }
    return null;
  },

  _setToken(token) {
    this._token = token;
    if (token) localStorage.setItem('sh_token', token);
    else localStorage.removeItem('sh_token');
  },

  _request(method, path, body = null) {
    const token = this._getToken();
    const xhr = new XMLHttpRequest();
    xhr.open(method, this._baseUrl + path, false); // Synchronous for compatibility
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    try {
      xhr.send(body ? JSON.stringify(body) : null);
    } catch (e) {
      console.error('API Request failed:', method, path, e);
      return null;
    }

    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        return xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch (e) {
        return {};
      }
    }

    if (xhr.status === 401 && path !== '/auth/login' && path !== '/auth/register') {
      localStorage.removeItem('sh_current_user');
      localStorage.removeItem('sh_token');
      this._token = null;
    }

    try {
      return JSON.parse(xhr.responseText);
    } catch (e) {
      return { error: xhr.statusText || 'Error en la solicitud' };
    }
  },

  async _requestAsync(method, path, body = null) {
    const token = this._getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const resp = await fetch(this._baseUrl + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `Error ${resp.status}: ${resp.statusText}`);
      }
      return data;
    } catch (err) {
      console.error('Async API Error:', method, path, err.message);
      throw err;
    }
  },

  // --- Users / Authentication ---
  getUsers() {
    const result = this._request('GET', '/users');
    return result?.users || [];
  },

  getUser(id) {
    const users = this.getUsers();
    return users.find(u => u.id === id) || null;
  },

  getUserByUsername(username) {
    const users = this.getUsers();
    return users.find(u => (u.username || '').toLowerCase() === (username || '').toLowerCase()) || null;
  },

  login(username, password) {
    const result = this._request('POST', '/auth/login', { username, password });
    if (result?.token) {
      this._setToken(result.token);
      localStorage.setItem('sh_current_user', JSON.stringify(result.user));
    }
    return result;
  },

  addUser(user) {
    const result = this._request('POST', '/auth/register', user);
    if (result?.token) {
      this._setToken(result.token);
      localStorage.setItem('sh_current_user', JSON.stringify(result.user));
    }
    return result?.user || null;
  },

  updateUser(id, data) {
    const result = this._request('PUT', `/users/${id}`, data);
    return result?.user || null;
  },

  deleteUser(id) {
    return this._request('DELETE', `/users/${id}`);
  },

  addUserByAdmin(data) {
    const result = this._request('POST', '/users', data);
    return result?.user || null;
  },

  isUsernameDuplicate(username, excludeId) {
    const result = this._request('GET', `/auth/check-username?username=${encodeURIComponent(username)}`);
    return result?.exists || false;
  },

  getRoles() {
    const result = this._request('GET', '/roles');
    return result?.roles || [
      { id: 1, name: 'admin', description: 'Administrador' },
      { id: 2, name: 'vendedor', description: 'Vendedor' },
      { id: 3, name: 'tecnico', description: 'Técnico' },
      { id: 4, name: 'cliente', description: 'Cliente' }
    ];
  },

  // --- Clients ---
  getClients() {
    const result = this._request('GET', '/clients');
    return result?.clients || [];
  },

  isClientDuplicate(field, value, excludeId) {
    const clients = this.getClients();
    return clients.some(c => {
      if (excludeId && c.id === excludeId) return false;
      return String(c[field] || '').toLowerCase() === String(value || '').toLowerCase();
    });
  },

  getClient(id) {
    const clients = this.getClients();
    return clients.find(c => c.id === id) || null;
  },

  addClient(data) {
    const result = this._request('POST', '/clients', data);
    return result?.client || null;
  },

  updateClient(id, data) {
    const result = this._request('PUT', `/clients/${id}`, data);
    return result?.client || null;
  },

  deleteClient(id) {
    return this._request('DELETE', `/clients/${id}`);
  },

  getClientHistory(clientId) {
    const result = this._request('GET', `/clients/${clientId}/history`);
    return result || { client: null, history: [], requests: [], budgets: [], orders: [], maintenances: [], warranties: [], sales: [], invoices: [] };
  },

  getMyHistory() {
    const result = this._request('GET', '/me/history');
    return result || { client: null, history: [], requests: [], budgets: [], orders: [], maintenances: [], warranties: [], sales: [], invoices: [] };
  },

  getMyOrders() {
    const result = this._request('GET', '/workorders');
    return result?.workOrders || [];
  },

  getMyMaintenances() {
    const result = this._request('GET', '/maintenances');
    return result?.maintenances || [];
  },

  // --- Solicitudes de Cotización (Requests) ---
  getRequests() {
    const result = this._request('GET', '/requests');
    return result?.requests || [];
  },

  getMyRequests() {
    const result = this._request('GET', '/requests/mine');
    return result?.requests || [];
  },

  getRequest(id) {
    const result = this._request('GET', `/requests/${id}`);
    return result?.request || null;
  },

  addRequest(data) {
    const result = this._request('POST', '/requests', data);
    return result?.request || null;
  },

  updateRequest(id, data) {
    const result = this._request('PUT', `/requests/${id}`, data);
    return result?.request || null;
  },

  // --- Cotizaciones (Budgets) ---
  getBudgets() {
    const result = this._request('GET', '/budgets');
    return result?.budgets || [];
  },

  getMyBudgets() {
    const result = this._request('GET', '/budgets/mine');
    return result?.budgets || [];
  },

  getBudget(id) {
    const budgets = this.getBudgets();
    return budgets.find(b => b.id === id) || null;
  },

  addBudget(data) {
    const result = this._request('POST', '/budgets', data);
    return result?.budget || null;
  },

  updateBudget(id, data) {
    const result = this._request('PUT', `/budgets/${id}`, data);
    return result?.budget || null;
  },

  sendBudget(id) {
    const result = this._request('POST', `/budgets/${id}/send`);
    return result?.budget || null;
  },

  approveBudget(id) {
    const result = this._request('POST', `/budgets/${id}/approve`);
    return result;
  },

  rejectBudget(id, reason = '') {
    const result = this._request('POST', `/budgets/${id}/reject`, { reason });
    return result?.budget || null;
  },

  exportBudgetPdf(id) {
    const token = this._getToken();
    window.open(`${this._baseUrl}/budgets/${id}/export?token=${encodeURIComponent(token || '')}`, '_blank');
  },

  // --- Órdenes de Trabajo (Work Orders) ---
  getWorkOrders(filters = {}) {
    let query = [];
    if (filters.clientId) query.push(`clientId=${encodeURIComponent(filters.clientId)}`);
    if (filters.technicianId) query.push(`technicianId=${encodeURIComponent(filters.technicianId)}`);
    if (filters.serviceType) query.push(`serviceType=${encodeURIComponent(filters.serviceType)}`);
    if (filters.status) query.push(`status=${encodeURIComponent(filters.status)}`);
    if (filters.from) query.push(`from=${encodeURIComponent(filters.from)}`);
    if (filters.to) query.push(`to=${encodeURIComponent(filters.to)}`);

    const qStr = query.length ? '?' + query.join('&') : '';
    const result = this._request('GET', `/workorders${qStr}`);
    return result?.workOrders || [];
  },

  getWorkOrder(id) {
    const result = this._request('GET', `/workorders/${id}`);
    return result?.workOrder || null;
  },

  getWorkOrderDetail(id) {
    return this._request('GET', `/workorders/${id}`);
  },

  addWorkOrder(data) {
    const result = this._request('POST', '/workorders', data);
    return result?.workOrder || null;
  },

  updateWorkOrder(id, data) {
    const result = this._request('PUT', `/workorders/${id}`, data);
    return result?.workOrder || null;
  },

  startWorkOrder(id) {
    const result = this._request('POST', `/workorders/${id}/start`);
    return result?.workOrder || null;
  },

  finishWorkOrder(id, data) {
    const result = this._request('POST', `/workorders/${id}/finish`, data);
    return result?.workOrder || null;
  },

  closeWorkOrder(id, data = {}) {
    const result = this._request('POST', `/workorders/${id}/close`, data);
    return result?.workOrder || null;
  },

  exportWorkOrderPdf(id) {
    const token = this._getToken();
    window.open(`${this._baseUrl}/workorders/${id}/export?token=${encodeURIComponent(token || '')}`, '_blank');
  },

  // --- Técnicos ---
  getTechnicians() {
    const result = this._request('GET', '/technicians');
    return result?.technicians || [];
  },

  // --- Inventario y Catálogo ---
  getCatalog() {
    const result = this._request('GET', '/catalog');
    return result?.catalog || [];
  },

  getInventory() {
    const result = this._request('GET', '/inventory');
    return result?.inventory || [];
  },

  getInventoryItem(id) {
    const items = this.getInventory();
    return items.find(i => i.id === id) || null;
  },

  addInventoryItem(data) {
    const result = this._request('POST', '/inventory', data);
    return result?.inventoryItem || null;
  },

  updateInventoryItem(id, data) {
    const result = this._request('PUT', `/inventory/${id}`, data);
    return result?.inventoryItem || null;
  },

  deleteInventoryItem(id) {
    return this._request('DELETE', `/inventory/${id}`);
  },

  uploadInventoryImage(id, filename, base64Data) {
    const result = this._request('POST', `/inventory/${id}/image`, { filename, data: base64Data });
    return result?.inventoryItem || null;
  },

  getInventoryMovements() {
    const result = this._request('GET', '/inventory/movements');
    return result?.movements || [];
  },

  addInventoryMovement(data) {
    const result = this._request('POST', '/inventory/movements', data);
    return result;
  },

  // --- Ventas y Facturas (Sales & Invoices) ---
  getSales() {
    const result = this._request('GET', '/sales');
    return result?.sales || [];
  },

  registerSale(data) {
    const result = this._request('POST', '/sales', data);
    return result;
  },

  getInvoices() {
    const result = this._request('GET', '/invoices');
    return result?.invoices || [];
  },

  exportInvoicePdf(id) {
    const token = this._getToken();
    window.open(`${this._baseUrl}/invoices/${id}/pdf?token=${encodeURIComponent(token || '')}`, '_blank');
  },

  // --- Mantenimientos ---
  getMaintenances() {
    const result = this._request('GET', '/maintenances');
    return result?.maintenances || [];
  },

  // Alias singular usado por maintenances.js y alerts.js
  getMaintenance() {
    return this.getMaintenances();
  },

  addMaintenance(data) {
    const result = this._request('POST', '/maintenances', data);
    return result?.maintenance || null;
  },

  updateMaintenance(id, data) {
    const result = this._request('PUT', `/maintenances/${id}`, data);
    return result?.maintenance || null;
  },

  completeMaintenance(id, data) {
    const result = this._request('POST', `/maintenances/${id}/complete`, data);
    return result?.maintenance || null;
  },

  getMaintenanceAlerts() {
    const result = this._request('GET', '/maintenance-alerts');
    return result?.alerts || [];
  },

  // --- Garantías ---
  getWarranties() {
    const result = this._request('GET', '/warranties');
    return result?.warranties || [];
  },

  getMyWarranties() {
    const result = this._request('GET', '/warranties/mine');
    return result?.warranties || [];
  },

  addWarranty(data) {
    const result = this._request('POST', '/warranties', data);
    return result?.warranty || null;
  },

  updateWarranty(id, data) {
    const result = this._request('PUT', `/warranties/${id}`, data);
    return result?.warranty || null;
  },

  getWarrantyClaims(warrantyId) {
    const result = this._request('GET', `/warranties/${warrantyId}/claims`);
    return result?.claims || [];
  },

  claimWarranty(id, description) {
    const result = this._request('POST', `/warranties/${id}/claims`, { description });
    return result?.claim || null;
  },

  addWarrantyClaim(id, description) {
    return this.claimWarranty(id, description);
  },

  // --- Servicios y Resumen ---
  getServices() {
    const result = this._request('GET', '/services');
    return result?.services || [];
  },

  getDashboardData() {
    const result = this._request('GET', '/dashboard');
    return result?.dashboard || {};
  },

  getSummary() {
    const result = this._request('GET', '/summary');
    return result?.summary || {};
  },

  // --- Backup ---
  createBackup() {
    return this._request('GET', '/backup');
  },

  getBackupsList() {
    const result = this._request('GET', '/backup/list');
    return result?.backups || [];
  },

  downloadBackup(filename) {
    const token = this._getToken();
    window.open(`${this._baseUrl}/backup/download/${encodeURIComponent(filename)}?token=${encodeURIComponent(token || '')}`, '_blank');
  },

  deleteBackup(filename) {
    return this._request('DELETE', `/backup/${encodeURIComponent(filename)}`);
  },

  // --- Alertas de Stock ---
  getStockAlerts() {
    const result = this._request('GET', '/stock-alerts');
    return result?.alerts || [];
  },

  resolveStockAlert(id) {
    const result = this._request('POST', `/stock-alerts/${id}/resolve`);
    return result;
  },

  // --- Reportes de Servicios ---
  getServiceReport(filters = {}) {
    let query = [];
    if (filters.serviceType) query.push(`serviceType=${encodeURIComponent(filters.serviceType)}`);
    if (filters.clientId) query.push(`clientId=${encodeURIComponent(filters.clientId)}`);
    if (filters.status) query.push(`status=${encodeURIComponent(filters.status)}`);
    if (filters.from) query.push(`from=${encodeURIComponent(filters.from)}`);
    if (filters.to) query.push(`to=${encodeURIComponent(filters.to)}`);
    const qStr = query.length ? '?' + query.join('&') : '';
    const result = this._request('GET', `/reports/services${qStr}`);
    return result?.report || [];
  },

  exportServiceReport(filters = {}) {
    const token = this._getToken();
    let query = [];
    if (filters.serviceType) query.push(`serviceType=${encodeURIComponent(filters.serviceType)}`);
    if (filters.clientId) query.push(`clientId=${encodeURIComponent(filters.clientId)}`);
    if (filters.status) query.push(`status=${encodeURIComponent(filters.status)}`);
    if (filters.from) query.push(`from=${encodeURIComponent(filters.from)}`);
    if (filters.to) query.push(`to=${encodeURIComponent(filters.to)}`);
    const qStr = query.length ? '?' + query.join('&') : '';
    window.open(`${this._baseUrl}/reports/services/export${qStr}?token=${encodeURIComponent(token || '')}`, '_blank');
  },

  // --- Auditoría y Notificaciones ---
  getAuditLogs() {
    const result = this._request('GET', '/audit');
    return result?.logs || [];
  },

  getNotifications() {
    const result = this._request('GET', '/notifications');
    return result?.notifications || [];
  },

  getUnreadNotificationsCount() {
    const result = this._request('GET', '/notifications/unread-count');
    return result?.count || 0;
  },

  markNotificationAsRead(id) {
    return this._request('POST', `/notifications/${id}/read`);
  },

  markAllNotificationsAsRead() {
    return this._request('POST', '/notifications/read-all');
  },

  // Alias de compatibilidad (el módulo de notificaciones usa markNotificationRead)
  markNotificationRead(id) {
    return this.markNotificationAsRead(id);
  },

  // ============================================================
  // HELPERS DE FORMATEO (agregados para compatibilidad)
  // ============================================================

  formatDateTime(value) {
    if (!value) return '-';
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return String(value);
    }
  },

  formatDate(value) {
    if (!value) return '-';
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString('es-PY');
    } catch (e) {
      return String(value);
    }
  },

  formatCurrency(value) {
    const num = Number(value || 0);
    return num.toLocaleString('es-PY') + ' Bs';
  }
};
