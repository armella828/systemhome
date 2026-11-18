/* ============================================================
   SYSTEMHOME - Aplicación Principal (Core Controller)
   Sistema Integral de Gestión Comercial, Técnica y Seguridad
   ============================================================ */

/* === CURRENT SESSION === */
let currentUser = null;

/* === AUTH SYSTEM === */
const Auth = {
  getCurrentUser() {
    if (currentUser) return currentUser;
    const stored = localStorage.getItem('sh_current_user');
    if (stored) {
      try {
        currentUser = JSON.parse(stored);
        return currentUser;
      } catch (e) {
        return null;
      }
    }
    return null;
  },

  setCurrentUser(user) {
    currentUser = user;
    if (user) localStorage.setItem('sh_current_user', JSON.stringify(user));
    else localStorage.removeItem('sh_current_user');
  },

  clearCurrentUser() {
    currentUser = null;
    localStorage.removeItem('sh_current_user');
    localStorage.removeItem('sh_token');
  },

  getRoleLabel(role) {
    const value = (role || '').toLowerCase();
    if (value === 'cliente' || value === 'client') return 'Cliente';
    if (value === 'admin' || value === 'administrador') return 'Administrador';
    if (value === 'tecnico' || value === 'técnico') return 'Técnico';
    if (value === 'vendedor') return 'Vendedor';
    return 'Usuario';
  },

  isClientRole(user) {
    const value = (user?.role || '').toLowerCase();
    return value === 'cliente' || value === 'client';
  },

  fillDemo(username, password) {
    const uInput = document.getElementById('loginUsername');
    const pInput = document.getElementById('loginPassword');
    if (uInput && pInput) {
      uInput.value = username;
      pInput.value = password;
      const btn = document.getElementById('loginSubmitBtn');
      if (btn) btn.click();
    }
  },

  handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    if (!username || !password) {
      errorEl.textContent = 'Por favor ingrese usuario y contraseña.';
      errorEl.style.display = 'block';
      return false;
    }

    const res = DB.login(username, password);
    if (!res || !res.user) {
      errorEl.textContent = res?.error || 'Usuario o contraseña incorrectos.';
      errorEl.style.display = 'block';
      return false;
    }

    errorEl.style.display = 'none';
    this.setCurrentUser(res.user);
    this.login(res.user);
    return false;
  },

  login(user) {
    document.getElementById('loginPage').style.display = 'none';
    this.updateUserUI(user);
    if (typeof RealtimeModule !== 'undefined') RealtimeModule.reconnect();

    if (this.isClientRole(user)) {
      document.getElementById('adminPortal').style.display = 'none';
      document.getElementById('clientPortal').style.display = 'flex';
      ClientPortal.init();
    } else {
      document.getElementById('adminPortal').style.display = 'flex';
      document.getElementById('clientPortal').style.display = 'none';
      App.init();
    }
  },

  logout() {
    if (!confirm('¿Desea cerrar la sesión actual?')) return;
    if (typeof RealtimeModule !== 'undefined') RealtimeModule.disconnect();
    this.clearCurrentUser();
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('adminPortal').style.display = 'none';
    document.getElementById('clientPortal').style.display = 'none';
    Auth.showLogin();
    Auth.updateLoginLogo();
  },

  updateUserUI(user) {
    if (!user) return;
    const initial = user.name ? user.name.charAt(0).toUpperCase() : (user.username ? user.username.charAt(0).toUpperCase() : 'U');
    const sidebarAvatar = document.getElementById('sidebarUserAvatar');
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarRole = document.getElementById('sidebarUserRole');
    const headerAvatar = document.getElementById('headerUserAvatar');
    const headerName = document.getElementById('headerUserName');
    const headerRole = document.getElementById('headerUserRole');
    const clientNameDisplay = document.getElementById('clientUserNameDisplay');
    const roleLabel = this.getRoleLabel(user.role);

    if (sidebarAvatar) sidebarAvatar.textContent = initial;
    if (sidebarName) sidebarName.textContent = user.name || user.username;
    if (sidebarRole) {
      sidebarRole.textContent = roleLabel;
      sidebarRole.className = 'user-role-badge role-' + (user.role || 'user');
    }
    if (headerAvatar) headerAvatar.textContent = initial;
    if (headerName) headerName.textContent = user.name || user.username;
    if (headerRole) headerRole.textContent = roleLabel;
    if (clientNameDisplay) clientNameDisplay.textContent = user.name || user.username;
  },

  showForgotPassword() {
    const modal = document.getElementById('forgotPasswordModal');
    if (!modal) return;
    modal.style.display = 'flex';
    const msg = document.getElementById('forgotMessage');
    if (msg) msg.style.display = 'none';
    const input = document.getElementById('forgotEmail');
    if (input) setTimeout(() => input.focus(), 50);
  },

  hideForgotPassword() {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) modal.style.display = 'none';
  },

  async submitForgotPassword(event) {
    event.preventDefault();
    const email = (document.getElementById('forgotEmail')?.value || '').trim();
    const msg = document.getElementById('forgotMessage');
    if (!msg) return false;
    msg.style.display = 'none';
    try {
      const base = (window.API_BASE_URL || '/api').replace(/\/$/, '');
      const resp = await fetch(base + '/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await resp.json();
      if (!resp.ok) {
        msg.textContent = data.error || 'No se pudo enviar el correo.';
        msg.style.display = 'block';
        return false;
      }
      msg.textContent = data.message || 'Si el correo está registrado, enviamos las instrucciones.';
      msg.style.display = 'block';
      msg.style.color = '#065f46';
      if (data.devToken) {
        msg.innerHTML += '<br><small>Modo desarrollo: <a href="/reset-password?token=' + encodeURIComponent(data.devToken) + '">Abrir enlace de restablecimiento</a></small>';
      }
    } catch (err) {
      msg.textContent = 'Error de conexión con el servidor.';
      msg.style.display = 'block';
    }
    return false;
  },

  showRegister() {
    document.getElementById('loginFormContainer').style.display = 'none';
    document.getElementById('registerFormContainer').style.display = 'block';
    document.getElementById('registerError').style.display = 'none';
    const success = document.getElementById('registerSuccess');
    if (success) success.style.display = 'none';
  },

  showLogin() {
    document.getElementById('loginFormContainer').style.display = 'block';
    document.getElementById('registerFormContainer').style.display = 'none';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('loginForm').reset();
  },

  async handleRegister(event) {
    event.preventDefault();
    const value = id => (document.getElementById(id)?.value || '').trim();
    const name = value('regName');
    const email = value('regEmail');
    const phone = value('regPhone');
    const username = value('regUsername');
    const password = document.getElementById('regPassword')?.value || '';
    const confirmPassword = document.getElementById('regConfirmPassword')?.value || '';
    const errorEl = document.getElementById('registerError');
    const successEl = document.getElementById('registerSuccess');
    const btn = document.getElementById('registerSubmitBtn');

    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    const fail = message => {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      return false;
    };

    if (!name || !email || !username || !password) {
      return fail('Por favor complete los campos obligatorios (*).');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail('Ingrese un correo electrónico válido.');
    }
    if (!/^[A-Za-z0-9._-]{4,20}$/.test(username)) {
      return fail('El usuario debe tener entre 4 y 20 caracteres (letras, números, punto, guion o guion bajo).');
    }
    if (password.length < 8) {
      return fail('La contraseña debe tener al menos 8 caracteres.');
    }
    if (password !== confirmPassword) {
      return fail('Las contraseñas no coinciden.');
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="login-btn-text"><strong>Creando cuenta...</strong></span>'; }
    try {
      const result = await DB.registerUser({
        username,
        password,
        name,
        email,
        phone,
        documentId: value('regDocumentId'),
        clientType: value('regClientType') || 'persona',
        address: value('regAddress'),
        city: value('regCity')
      });
      if (result?.error) throw new Error(result.error);
      if (!result?.user) throw new Error('El servidor no confirmó la creación de la cuenta.');

      const base = (window.API_BASE_URL || '/api').replace(/\/$/, '');
      const safeEmail = App.escapeHtml(email);
      let html = `<strong>✓ Cuenta creada correctamente.</strong><br>`;
      html += result.emailSent
        ? `Revise su correo (<strong>${safeEmail}</strong>) y haga clic en el enlace de verificación para poder ingresar.`
        : `No se pudo enviar el correo de verificación. Contacte al administrador o intente reenviarlo.`;
      if (result.devToken) {
        html += `<br><small>Modo desarrollo: <a href="${base}/auth/verify-email?token=${encodeURIComponent(result.devToken)}">verificar cuenta ahora</a>.</small>`;
      }
      html += `<br><button type="button" class="btn btn-sm btn-secondary" data-resend style="margin-top:8px;">Reenviar correo de verificación</button>`;
      successEl.innerHTML = html;
      successEl.style.display = 'block';
      successEl.querySelector('[data-resend]')?.addEventListener('click', () => this.resendVerification(email));
      document.getElementById('registerForm')?.reset();
      App.showNotification('Cuenta creada. Verifique su correo antes de ingresar.', 'success');
    } catch (err) {
      return fail(err.message || 'No se pudo registrar la cuenta. Intente nuevamente.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span class="login-btn-text"><strong>Crear Mi Cuenta</strong></span>';
      }
    }
    return false;
  },

  async resendVerification(email) {
    const successEl = document.getElementById('registerSuccess');
    try {
      const result = await DB.resendVerification(email);
      if (result?.error) throw new Error(result.error);
      App.showToast(result.message || 'Solicitud de reenvío procesada', result.message?.includes('enviado') ? 'success' : 'warning');
      if (result.devToken && successEl) {
        const base = (window.API_BASE_URL || '/api').replace(/\/$/, '');
        successEl.innerHTML += `<br><small>Nuevo enlace de desarrollo: <a href="${base}/auth/verify-email?token=${encodeURIComponent(result.devToken)}">verificar cuenta</a>.</small>`;
      }
    } catch (err) {
      App.showToast(err.message || 'No se pudo reenviar el correo', 'error');
    }
  },

  updateLoginLogo() {
    const logo = localStorage.getItem('sh_logo');
    const loginLogo = document.getElementById('loginLogoDisplay');
    if (loginLogo) {
      loginLogo.innerHTML = logo ? `<img src="${logo}" alt="SYSTEMHOME">` : '<img src="assets/LOGO.png" alt="SYSTEMHOME">';
    }
  }
};

/* === MAIN APP (Admin, Vendedor, Técnico) === */
const App = {
  currentView: 'dashboard',

  init() {
    this.loadSystemSettings();
    this.loadSettings();
    this.initNavigation();
    this.initModules();
    this.initLogoUpload();

    const user = Auth.getCurrentUser();
    const role = (user?.role || '').toLowerCase();

    // Default landing view per role
    if (role === 'tecnico') {
      this.navigate('workorders');
    } else {
      this.navigate('dashboard');
    }
  },

  loadSettings() {
    const logo = localStorage.getItem('sh_logo') || 'assets/LOGO.png';
    if (logo) {
      document.querySelectorAll('.logo-placeholder, .client-logo-mini').forEach(el => {
        el.innerHTML = `<img src="${logo}" alt="SYSTEMHOME Logo">`;
      });
    }
    Auth.updateLoginLogo();
  },

  initNavigation() {
    const role = (Auth.getCurrentUser()?.role || '').toLowerCase();
    const allowedViews = {
      admin: ['dashboard', 'clients', 'requests', 'budgets', 'sales', 'warranties', 'workorders', 'inventory', 'maintenances', 'alerts', 'intelligence', 'reports', 'audit', 'backup', 'users', 'technicians', 'settings', 'notifications'],
      vendedor: ['dashboard', 'clients', 'requests', 'budgets', 'sales', 'warranties', 'inventory', 'reports', 'settings', 'notifications'],
      tecnico: ['workorders', 'maintenances', 'requests', 'alerts', 'notifications', 'settings']
    };

    const allowed = allowedViews[role] || allowedViews.admin;
    document.querySelectorAll('.nav-item').forEach(item => {
      const view = item.dataset.view;
      if (view) {
        item.style.display = allowed.includes(view) ? 'flex' : 'none';
        item.onclick = (e) => {
          e.preventDefault();
          this.navigate(view);
          if (window.innerWidth <= 768) this.toggleSidebar(false);
        };
      }
    });

    // Hide/show sidebar sections based on role
    document.querySelectorAll('.nav-section').forEach(sec => {
      const secType = sec.dataset.section;
      if (secType === 'admin-only' && role !== 'admin') sec.style.display = 'none';
      if (secType === 'system-only' && role !== 'admin') sec.style.display = 'none';
      // El vendedor sí debe ver Inventario (está en su lista permitida);
      // solo se ocultan las operaciones técnicas que no tiene asignadas.
      if (secType === 'operations' && role === 'vendedor') sec.style.display = 'block';
      if (secType === 'commercial' && role === 'tecnico') sec.style.display = 'none';
    });
  },

  toggleSidebar(force) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      if (force !== undefined) {
        sidebar.classList.toggle('open', force);
      } else {
        sidebar.classList.toggle('open');
      }
    }
  },

  initModules() {
    try { ClientsModule?.init?.(); } catch (e) {}
    try { RequestsModule?.init?.(); } catch (e) {}
    try { BudgetsModule?.init?.(); } catch (e) {}
    try { WarrantiesModule?.init?.(); } catch (e) {}
    try { WorkOrdersModule?.init?.(); } catch (e) {}
    try { InventoryModule?.init?.(); } catch (e) {}
    try { MaintenancesModule?.init?.(); } catch (e) {}
    try { AlertsModule?.init?.(); } catch (e) {}
    try { ReportsModule?.init?.(); } catch (e) {}
    // Auditoría e Intelligence son exclusivos de admin: evitar 403 en otros roles.
    if ((Auth.getCurrentUser()?.role || '').toLowerCase() === 'admin') {
      try { IntelligenceModule?.init?.(); } catch (e) {}
      try { AuditModule?.init?.(); } catch (e) {}
    }
    try { NotificationsModule?.init?.(); } catch (e) {}
    this.updateNotificationsBadge();
  },

  updateNotificationsBadge() {
    try {
      const count = DB.getUnreadNotificationsCount();
      const dot = document.getElementById('headerNotifDot');
      if (dot) {
        dot.style.display = count > 0 ? 'inline-block' : 'none';
        dot.textContent = count > 99 ? '99+' : count;
      }
    } catch (e) { /* noop */ }
  },

  refreshCurrentView() {
    const btn = document.getElementById('globalRefreshBtn');
    if (btn) btn.classList.add('refreshing');

    setTimeout(() => {
      this.navigate(this.currentView, true);
      this.updateNotificationsBadge();
      if (btn) btn.classList.remove('refreshing');
      this.showNotification(`Vista "${this.currentView}" actualizada`, 'info');
    }, 250);
  },

  navigate(view, forceRefresh = false) {
    this.currentView = view;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });

    // Show/hide sections
    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.toggle('active', section.id === view + '-view');
    });

    // Update header
    const headerTitle = document.getElementById('headerTitle');
    const breadcrumb = document.getElementById('breadcrumb');

    const titles = {
      dashboard: { title: 'Panel de Control Gerencial', bread: 'Inicio / Dashboard' },
      clients: { title: 'Gestión de Clientes', bread: 'Comercial / Clientes' },
      requests: { title: 'Solicitudes de Cotización', bread: 'Comercial / Solicitudes' },
      budgets: { title: 'Cotizaciones y Presupuestos', bread: 'Comercial / Cotizaciones' },
      sales: { title: 'Ventas, Cobros y Facturación', bread: 'Comercial / Ventas' },
      warranties: { title: 'Control de Garantías', bread: 'Comercial / Garantías' },
      workorders: { title: 'Órdenes de Trabajo', bread: 'Operaciones / Órdenes' },
      inventory: { title: 'Inventario y Catálogo', bread: 'Operaciones / Inventario' },
      maintenances: { title: 'Programación de Mantenimientos', bread: 'Operaciones / Mantenimientos' },
      alerts: { title: 'Alertas del Sistema', bread: 'Operaciones / Alertas' },
      intelligence: { title: 'SYSTEMHOME INTELLIGENCE', bread: 'Análisis / Ciencia de Datos' },
      reports: { title: 'Reportes y Métricas', bread: 'Análisis / Reportes' },
      audit: { title: 'Registro de Auditoría', bread: 'Análisis / Auditoría' },
      backup: { title: 'Copias de Seguridad (Backup)', bread: 'Sistema / Backup' },
      users: { title: 'Gestión de Usuarios', bread: 'Sistema / Usuarios' },
      technicians: { title: 'Gestión de Técnicos', bread: 'Sistema / Técnicos' },
      settings: { title: 'Configuración del Sistema', bread: 'Sistema / Configuración' },
      notifications: { title: 'Notificaciones', bread: 'Sistema / Notificaciones' }
    };

    const info = titles[view] || { title: 'SYSTEMHOME', bread: 'Inicio' };
    if (headerTitle) headerTitle.textContent = info.title;
    if (breadcrumb) breadcrumb.textContent = info.bread;

    // Render module content
    const container = document.getElementById(view + '-view');
    if (!container) return;

    if (view === 'dashboard') this.renderDashboard();
    else if (view === 'clients') ClientsModule.render(container);
    else if (view === 'requests') RequestsModule.render(container);
    else if (view === 'budgets') BudgetsModule.render(container);
    else if (view === 'sales') SalesModule.render(container);
    else if (view === 'warranties') WarrantiesModule.render(container);
    else if (view === 'workorders') WorkOrdersModule.render(container);
    else if (view === 'inventory') InventoryModule.render(container);
    else if (view === 'maintenances') MaintenancesModule.render(container);
    else if (view === 'alerts') AlertsModule.render(container);
    else if (view === 'intelligence') IntelligenceModule.render(container);
    else if (view === 'reports') ReportsModule.render(container);
    else if (view === 'audit') AuditModule.render(container);
    else if (view === 'backup') BackupModule.render(container);
    else if (view === 'users') this.renderUsers(container);
    else if (view === 'technicians') this.renderTechnicians(container);
    else if (view === 'settings') this.renderSettings(container);
    else if (view === 'notifications') NotificationsModule.render(container);
  },

  renderDashboard() {
    const container = document.getElementById('dashboard-view');
    if (!container) return;

    const data = DB.getDashboardData();

    const stat = (icon, label, value, sub, colorClass = '') => `
      <div class="stat-card ${colorClass}">
        <div class="stat-icon">${icon}</div>
        <div class="stat-info">
          <h4>${label}</h4>
          <div class="stat-number">${value}</div>
          ${sub ? `<div class="stat-label">${sub}</div>` : ''}
        </div>
      </div>`;

    container.innerHTML = `
      <div class="stats-grid">
        ${stat('👥', 'Clientes Activos', data.totalClients || 0, 'Registrados')}
        ${stat('📝', 'Solicitudes Pendientes', data.pendingRequests || 0, `Total: ${data.totalRequests || 0}`, 'stat-warning')}
        ${stat('📋', 'Cotizaciones Aprobadas', data.approvedBudgets || 0, `Total: ${data.totalBudgets || 0}`, 'stat-success')}
        ${stat('🔧', 'Órdenes en Ejecución', data.inProgressOrders || 0, `Pendientes: ${data.pendingOrders || 0}`, 'stat-info')}
        ${stat('💰', 'Recaudación Total', (Number(data.totalRevenue || 0)).toLocaleString('es-PY') + ' Bs', `${data.totalSales || 0} ventas`, 'stat-success')}
        ${stat('📦', 'Stock Crítico', data.lowStock || 0, 'Items en alerta', data.lowStock > 0 ? 'stat-danger' : '')}
        ${stat('🛠️', 'Mantenimientos Próximos', data.upcomingMaintenances || 0, `${data.overdueMaintenances || 0} vencidos`, data.overdueMaintenances > 0 ? 'stat-danger' : 'stat-warning')}
        ${stat('🛡️', 'Garantías Vigentes', data.activeWarranties || 0, 'Equipos protegidos', 'stat-primary')}
      </div>

      <div class="dashboard-grid" style="margin-top:1.5rem;">
        <!-- Top Services -->
        <div class="card">
          <div class="card-header">
            <h3>📈 Servicios más Solicitados</h3>
          </div>
          <div class="card-body">
            ${(data.topServices || []).length === 0 ? '<p class="text-muted text-center">Sin datos de servicios aún</p>' : (data.topServices || []).map(s => `
              <div class="dash-bar-row">
                <div class="dash-bar-labels">
                  <span>${s.name}</span>
                  <strong>${s.count} cotizaciones</strong>
                </div>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" style="width:${Math.min(100, (s.count / Math.max(1, data.totalBudgets || 1)) * 100)}%;"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Top Technicians -->
        <div class="card">
          <div class="card-header">
            <h3>👷 Técnicos con Mayor Carga</h3>
          </div>
          <div class="card-body">
            ${(data.topTechnicians || []).length === 0 ? '<p class="text-muted text-center">Sin asignaciones registradas</p>' : (data.topTechnicians || []).map(t => `
              <div class="tech-card-row">
                <div class="user-avatar-sm">👷</div>
                <div style="flex:1;">
                  <strong>${t.name}</strong>
                  <div class="text-muted text-sm">${t.jobs} órdenes asignadas</div>
                </div>
                <span class="badge badge-info">${t.jobs} trabajos</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="dashboard-grid" style="margin-top:1.5rem;">
        <!-- Low Stock Items Alert Box -->
        <div class="card">
          <div class="card-header">
            <h3>📦 Alerta de Stock Mínimo</h3>
            <button class="btn btn-sm btn-secondary" onclick="App.navigate('inventory')">Ver Inventario</button>
          </div>
          <div class="card-body">
            ${(data.lowStockItems || []).length === 0 ? '<p class="text-success text-center">✅ Todos los productos tienen stock saludable</p>' : `
              <div class="table-responsive">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Stock Actual</th>
                      <th>Mínimo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(data.lowStockItems || []).map(i => `
                      <tr>
                        <td><strong>${i.name}</strong></td>
                        <td><span class="text-danger"><strong>${i.stock} unid.</strong></span></td>
                        <td>${i.min_stock} unid.</td>
                        <td><span class="badge badge-danger">Crítico</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>

        <!-- Upcoming Maintenances -->
        <div class="card">
          <div class="card-header">
            <h3>🛠️ Mantenimientos Próximos</h3>
            <button class="btn btn-sm btn-secondary" onclick="App.navigate('maintenances')">Ver Calendario</button>
          </div>
          <div class="card-body">
            ${(data.upcomingMaintList || []).length === 0 ? '<p class="text-muted text-center">No hay mantenimientos pendientes</p>' : `
              <div class="table-responsive">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Cliente</th>
                      <th>Equipo / Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(data.upcomingMaintList || []).map(m => `
                      <tr>
                        <td><strong>${m.next_maintenance_date}</strong></td>
                        <td>${m.client_name || 'Cliente'}</td>
                        <td>${m.equipment_name || m.maintenance_type}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  },

  renderUsers(container) {
    const users = DB.getUsers();
    container.innerHTML = `
      <div class="module-header">
        <div>
          <h2>Gestión de Usuarios del Sistema</h2>
          <p class="module-subtitle">Administración de credenciales, roles (Admin, Vendedor, Técnico, Cliente) y estados de acceso</p>
        </div>
        <div class="module-actions">
          <button class="btn btn-secondary" onclick="App.navigate('users')">🔄 Actualizar</button>
          <button class="btn btn-primary" onclick="App.showUserModal()">➕ Nuevo Usuario</button>
        </div>
      </div>

      <div class="card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre Completo</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td><strong>${u.username}</strong></td>
                  <td>${u.name || '-'}</td>
                  <td>${u.email || '-'}</td>
                  <td>${u.phone || '-'}</td>
                  <td><span class="user-role-badge role-${u.role}">${Auth.getRoleLabel(u.role)}</span></td>
                  <td><span class="badge ${u.active ? 'badge-success' : 'badge-danger'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td>
                    <button class="btn btn-sm btn-secondary" onclick="App.showUserModal(${u.id})">✏️ Editar</button>
                    ${u.username !== 'admin' ? `
                      <button class="btn btn-sm btn-danger" onclick="App.deleteUser(${u.id})">🗑️</button>
                    ` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  showUserModal(userId = null) {
    const users = DB.getUsers();
    const user = userId ? users.find(u => u.id === userId) : null;

    // Remove any previous modal
    document.getElementById('userFormModalOverlay')?.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'userFormModalOverlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:540px;">
        <div class="modal-header">
          <h3>${user ? '✏️ Editar Usuario: ' + user.username : '➕ Nuevo Usuario del Sistema'}</h3>
          <button class="modal-close" onclick="document.getElementById('userFormModalOverlay').remove()">✕</button>
        </div>
        <form onsubmit="return App.saveUser(event, ${userId || 'null'})">
          <div class="modal-body">
            <div class="form-group">
              <label class="required">Nombre de Usuario (Login)</label>
              <input type="text" id="mUserUsername" class="form-control" value="${user ? user.username : ''}" placeholder="Ej: marcos_tecnico" required>
            </div>
            <div class="form-group">
              <label class="required">Nombre Completo</label>
              <input type="text" id="mUserName" class="form-control" value="${user ? user.name : ''}" placeholder="Ej: Marcos Valenzuela" required>
            </div>
            <div class="form-group">
              <label>Correo Electrónico</label>
              <input type="email" id="mUserEmail" class="form-control" value="${user ? user.email : ''}" placeholder="usuario@systemhome.com">
            </div>
            <div class="form-group">
              <label>Teléfono de Contacto</label>
              <input type="text" id="mUserPhone" class="form-control" value="${user ? user.phone : ''}" placeholder="0981 123 456">
            </div>
            <div class="form-group">
              <label class="required">Rol de Acceso</label>
              <select id="mUserRole" class="form-control">
                <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>👑 Administrador (Acceso Total)</option>
                <option value="vendedor" ${user?.role === 'vendedor' ? 'selected' : ''}>💼 Vendedor Comercial</option>
                <option value="tecnico" ${user?.role === 'tecnico' ? 'selected' : ''}>🛠️ Técnico de Campo</option>
                <option value="cliente" ${user?.role === 'cliente' ? 'selected' : ''}>👤 Cliente</option>
              </select>
            </div>
            <div class="form-group">
              <label class="${user ? '' : 'required'}">Contraseña ${user ? '(Dejar en blanco para no cambiar)' : '(Obligatoria, mín. 6 caracteres)'}</label>
              <input type="password" id="mUserPassword" class="form-control" placeholder="••••••••" ${user ? '' : 'required minlength="6"'}>
            </div>
            <div class="form-group" style="display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem;">
              <input type="checkbox" id="mUserActive" ${!user || user.active ? 'checked' : ''}>
              <label for="mUserActive" style="margin:0;font-weight:600;">Usuario Activo (Permitir inicio de sesión)</label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('userFormModalOverlay').remove()">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="btnSaveUser">💾 Guardar Usuario</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  saveUser(e, userId) {
    e.preventDefault();
    const username = document.getElementById('mUserUsername').value.trim();
    const name = document.getElementById('mUserName').value.trim();
    const email = document.getElementById('mUserEmail').value.trim();
    const phone = document.getElementById('mUserPhone').value.trim();
    const role = document.getElementById('mUserRole').value;
    const password = document.getElementById('mUserPassword').value;
    const active = document.getElementById('mUserActive').checked;

    if (!username || !name) {
      App.showNotification('Complete los campos obligatorios (*)', 'warning');
      return false;
    }

    const payload = { username, name, email, phone, role, active };
    if (password && password.trim().length >= 6) {
      payload.password = password.trim();
    }

    const btn = document.getElementById('btnSaveUser');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    if (userId) {
      const res = DB.updateUser(userId, payload);
      if (res?.user) {
        App.showNotification(`Usuario "${username}" actualizado exitosamente`, 'success');
        document.getElementById('userFormModalOverlay')?.remove();
        App.renderUsers(document.getElementById('users-view'));
      } else {
        App.showNotification(res?.error || 'Error al actualizar usuario', 'error');
      }
    } else {
      if (!password || password.trim().length < 6) {
        App.showNotification('La contraseña debe tener al menos 6 caracteres', 'warning');
        if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Usuario'; }
        return false;
      }
      payload.password = password.trim();
      const res = DB.addUserByAdmin(payload);
      if (res?.user) {
        App.showNotification(`🎉 ¡Usuario "${username}" creado exitosamente!`, 'success');
        document.getElementById('userFormModalOverlay')?.remove();
        App.renderUsers(document.getElementById('users-view'));
      } else {
        App.showNotification(res?.error || 'No se pudo crear el usuario', 'error');
      }
    }
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Usuario'; }
    return false;
  },

  deleteUser(userId) {
    const user = DB.getUser(userId);
    if (!confirm(`¿Está seguro de eliminar o desactivar al usuario "${user ? user.username : userId}"?`)) return;
    DB.deleteUser(userId);
    App.showNotification('Usuario eliminado', 'info');
    App.renderUsers(document.getElementById('users-view'));
  },

  renderTechnicians(container) {
    const technicians = DB.getTechnicians();
    container.innerHTML = `
      <div class="module-header">
        <div>
          <h2>Gestión de Técnicos</h2>
          <p class="module-subtitle">Alta, edición y eliminación del equipo técnico y su acceso al sistema</p>
        </div>
        <div>
          <button class="btn btn-primary" onclick="App.openTechnicianModal()">➕ Nuevo Técnico</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>Equipo Técnico</h3>
          <span style="font-size:13px;color:var(--gray-500);">Total: <strong>${technicians.length}</strong></span>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th><th>Especialidad</th><th>Teléfono</th><th>Correo</th><th>Usuario</th><th>Estado</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${technicians.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--gray-500);">No hay técnicos registrados.</td></tr>' : technicians.map(t => `
                  <tr>
                    <td><strong>${this.escapeHtml(t.name)}</strong></td>
                    <td>${this.escapeHtml(t.specialty || '-')}</td>
                    <td>${this.escapeHtml(t.phone || '-')}</td>
                    <td>${this.escapeHtml(t.email || '-')}</td>
                    <td>${this.escapeHtml(t.username || 'Sin acceso')}</td>
                    <td><span class="badge ${t.active ? 'badge-aprobado' : 'badge-inactive'}"><span class="dot"></span> ${t.active ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                      <div class="actions" style="display:flex;gap:4px;">
                        <button class="btn btn-sm btn-secondary" onclick="App.openTechnicianModal(${t.id})" title="Editar">✏️</button>
                        <button class="btn btn-sm btn-danger" onclick="App.deleteTechnician(${t.id})" title="Eliminar">🗑️</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  async openTechnicianModal(technicianId = null) {
    let technician = null;
    if (technicianId) {
      technician = DB.getTechnicians().find(t => t.id === technicianId) || null;
      if (!technician) return;
    }
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'technicianModal';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${technician ? 'Editar Técnico' : 'Nuevo Técnico'}</h3>
          <button class="modal-close" onclick="document.getElementById('technicianModal').remove()">✕</button>
        </div>
        <form onsubmit="return App.saveTechnician(event, ${technician?.id || 'null'})">
          <div class="modal-body">
            <div class="form-group">
              <label class="required">Nombre Completo</label>
              <input type="text" id="techName" class="form-control" value="${this.escapeHtml(technician?.name || '')}" required>
            </div>
            <div class="form-group">
              <label>Especialidad</label>
              <input type="text" id="techSpecialty" class="form-control" value="${this.escapeHtml(technician?.specialty || '')}" placeholder="Ej: Cámaras y redes">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Teléfono / WhatsApp</label>
                <input type="text" id="techPhone" class="form-control" value="${this.escapeHtml(technician?.phone || '')}">
              </div>
              <div class="form-group">
                <label>Correo Electrónico</label>
                <input type="email" id="techEmail" class="form-control" value="${this.escapeHtml(technician?.email || '')}">
              </div>
            </div>
            ${technician?.user_id ? '' : `
              <div class="form-row">
                <div class="form-group">
                  <label>Usuario de acceso (opcional)</label>
                  <input type="text" id="techUsername" class="form-control" placeholder="Ej: tecnico2">
                </div>
                <div class="form-group">
                  <label>Contraseña (mín. 6)</label>
                  <input type="password" id="techPassword" class="form-control" minlength="6" placeholder="••••••••">
                </div>
              </div>
            `}
            ${technician?.user_id ? `
              <div class="form-group">
                <label>Nueva contraseña (dejar en blanco para no cambiar)</label>
                <input type="password" id="techPassword" class="form-control" minlength="6">
              </div>
            ` : ''}
            <div class="form-group" style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="techActive" ${technician ? (technician.active ? 'checked' : '') : 'checked'}>
              <label for="techActive" style="margin:0;">Técnico activo</label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('technicianModal').remove()">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="btnSaveTechnician">💾 Guardar</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async saveTechnician(event, technicianId) {
    event.preventDefault();
    const payload = {
      name: document.getElementById('techName').value.trim(),
      specialty: document.getElementById('techSpecialty').value.trim(),
      phone: document.getElementById('techPhone').value.trim(),
      email: document.getElementById('techEmail').value.trim(),
      active: document.getElementById('techActive').checked,
      username: document.getElementById('techUsername')?.value.trim() || undefined,
      password: document.getElementById('techPassword')?.value || undefined
    };
    if (!payload.name) {
      App.showToast('Ingrese el nombre del técnico', 'warning');
      return false;
    }
    const btn = document.getElementById('btnSaveTechnician');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
    try {
      if (technicianId) await DB.updateTechnician(technicianId, payload);
      else await DB.addTechnician(payload);
      document.getElementById('technicianModal')?.remove();
      App.showNotification(technicianId ? 'Técnico actualizado correctamente' : 'Técnico creado correctamente', 'success');
      App.renderTechnicians(document.getElementById('technicians-view'));
    } catch (err) {
      App.showNotification(err.message || 'No se pudo guardar el técnico', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
    }
    return false;
  },

  async deleteTechnician(technicianId) {
    if (!confirm('¿Eliminar este técnico? Sus órdenes quedarán sin asignar, pero no se borrarán.')) return;
    try {
      await DB.deleteTechnician(technicianId);
      App.showNotification('Técnico eliminado', 'info');
      App.renderTechnicians(document.getElementById('technicians-view'));
    } catch (err) {
      App.showNotification(err.message || 'No se pudo eliminar el técnico', 'error');
    }
  },

  escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  },

  renderSettings(container) {
    const user = Auth.getCurrentUser();
    const qrValue = App.getQRCode();
    const isAdmin = (user?.role || '').toLowerCase() === 'admin';
    const logoValue = localStorage.getItem('sh_logo') || 'assets/LOGO.png';
    container.innerHTML = `
      <div class="module-header">
        <div>
          <h2>Configuración del Perfil y Sistema</h2>
          <p class="module-subtitle">Ajustes de cuenta, preferencias y personalización de marca</p>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3>👤 Mi Perfil</h3>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label>Nombre de Usuario</label>
              <input type="text" class="form-control" value="${user?.username || ''}" disabled>
            </div>
            <div class="form-group">
              <label>Nombre Completo</label>
              <input type="text" id="setFullName" class="form-control" value="${user?.name || user?.fullName || ''}">
            </div>
            <div class="form-group">
              <label>Correo Electrónico</label>
              <input type="email" id="setEmail" class="form-control" value="${user?.email || ''}">
            </div>
            <div class="form-group">
              <label>Teléfono</label>
              <input type="text" id="setPhone" class="form-control" value="${user?.phone || ''}">
            </div>
            <button class="btn btn-primary" onclick="App.saveProfile()">Guardar Cambios</button>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>🏢 Información de la Empresa</h3>
          </div>
          <div class="card-body">
            <p><strong>Empresa:</strong> SYSTEMHOME Security</p>
            <p><strong>Rubros:</strong> Cámaras, Alarmas, Climatización, Cercas, Video Portero, Redes</p>
            <p><strong>WhatsApp de Atención:</strong> +591 64595762</p>
            <p><strong>Ubicación Central:</strong> Asunción, Paraguay</p>
          </div>
        </div>

        ${isAdmin ? `
        <div class="card">
          <div class="card-header">
            <h3>🖼️ Logo de la Empresa</h3>
          </div>
          <div class="card-body">
            <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">
              Este logo aparece en el encabezado de los presupuestos PDF y en el portal del cliente.
            </p>
            <div id="companyLogoPreview" style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px;margin-bottom:16px;">
              <img src="${logoValue}" alt="Logo de la empresa" style="max-height:90px;max-width:90%;object-fit:contain;">
            </div>
            <div class="form-group">
              <label for="companyLogoFile">Subir logo (PNG o JPG · máx. 2 MB)</label>
              <input type="file" id="companyLogoFile" class="form-control" accept="image/png,image/jpeg" onchange="App.handleLogoUpload(event)">
            </div>
            <button class="btn btn-secondary" onclick="App.resetCompanyLogo()">↩️ Restaurar logo original</button>
          </div>
        </div>
        ` : ''}

        <div class="card">
          <div class="card-header">
            <h3>📱 QR de Cobranzas</h3>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label for="qrCodeFile">Seleccione la imagen del QR desde su equipo <span class="text-muted">(obligatorio)</span></label>
              <input type="file" id="qrCodeFile" class="form-control" accept="image/png,image/jpeg,image/webp" onchange="App.handleQRCodeUpload(event)">
              <small class="form-text text-muted">Formatos permitidos: PNG, JPG o WEBP. La imagen se guarda en la base de datos, no solo en este navegador.</small>
              <input type="hidden" id="qrCodeUrl" value="${this.escapeHtml(qrValue)}">
            </div>
            <div id="qrPreview" style="margin:20px 0;text-align:center;">
              ${qrValue ? '<img src="' + qrValue + '" style="max-width:200px;border-radius:8px;border:2px solid #00d4ff;" alt="QR Preview">' : '<div style="color:#64748b;padding:40px;background:#0f172a;border-radius:8px;">Vista previa del QR</div>'}
            </div>
            <button class="btn btn-primary" onclick="App.updateQRCode()">💾 Guardar QR de Cobranzas</button>
          </div>
        </div>

        <div class="card" style="grid-column:1 / -1;">
          <div class="card-header">
            <h3>🎨 Iconos del Portal del Cliente</h3>
          </div>
          <div class="card-body">
            <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px;">
              Seleccione la imagen de cada icono desde su equipo. Se optimiza a 128×128 px y se guarda en la base de datos;
              <strong>no se aceptan URL externas</strong>. Deje un icono sin imagen para usar el SVG profesional incluido.
              Los iconos cargados antes por URL o emoji se conservan hasta que los reemplace.
            </p>
            <div id="portalIconsEditor" class="form-row-3"></div>
            <button class="btn btn-primary" onclick="App.savePortalIcons()">💾 Guardar iconos del portal</button>
            <button class="btn btn-secondary" onclick="App.resetPortalIcons()">↩️ Restaurar originales</button>
          </div>
        </div>
      </div>
    `;
    this.loadPortalIcons();
  },

  PORTAL_ICON_LABELS: {
    camaras: 'Cámaras', ac: 'Aire Acondicionado', alarma: 'Alarmas',
    cerca: 'Cerca Eléctrica', video: 'Video Portero', electricidad: 'Electricidad',
    cableado: 'Cableado', redes: 'Redes'
  },

  async loadPortalIcons() {
    try {
      const value = await DB.getSetting('portal_icons', {});
      App.portalIcons = value && typeof value === 'object' ? value : {};
    } catch (e) {
      App.portalIcons = {};
    }
    const editor = document.getElementById('portalIconsEditor');
    if (!editor) return;
    editor.innerHTML = Object.entries(this.PORTAL_ICON_LABELS).map(([key, label]) => `
      <div class="form-group">
        <label>${label}</label>
        <div style="display:flex;align-items:center;gap:8px;">
          <div id="portalIconPreview_${key}" style="width:44px;height:44px;flex:0 0 44px;display:flex;align-items:center;justify-content:center;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;">
            ${this.renderPortalIconPreview(App.portalIcons[key])}
          </div>
          <div style="flex:1;min-width:0;">
            <input type="file" class="form-control" id="portalIconFile_${key}"
              accept="image/png,image/jpeg,image/webp"
              onchange="App.onPortalIconSelected(event, '${key}')">
            <small class="form-text text-muted">PNG, JPG o WEBP · máx. 8 MB · se guarda en BD</small>
          </div>
          <button type="button" class="btn btn-sm btn-secondary" onclick="App.removePortalIcon('${key}')" title="Quitar imagen y usar SVG original">✕</button>
        </div>
      </div>
    `).join('');
  },

  renderPortalIconPreview(value) {
    const src = String(value || '');
    if (/^data:image\/(png|jpeg|webp);base64,/i.test(src) || /^https?:\/\//i.test(src)) {
      return `<img src="${this.escapeHtml(src)}" alt="" style="width:32px;height:32px;object-fit:contain;">`;
    }
    if (src) return `<span style="font-size:26px;line-height:1;">${this.escapeHtml(src)}</span>`;
    return '<span style="font-size:11px;color:var(--gray-500);">SVG</span>';
  },

  updatePortalIconPreview(key, value) {
    const preview = document.getElementById('portalIconPreview_' + key);
    if (preview) preview.innerHTML = this.renderPortalIconPreview(value);
  },

  // Convierte el archivo elegido en un PNG pequeño listo para guardar en BD.
  resizePortalIcon(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('La imagen seleccionada no es válida'));
        img.onload = () => {
          try {
            const size = 128;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, size, size);
            const scale = Math.min(size / img.width, size / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
            resolve(canvas.toDataURL('image/png'));
          } catch (err) {
            reject(new Error('No se pudo procesar la imagen'));
          }
        };
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  },

  async onPortalIconSelected(event, key) {
    const input = event.target;
    const file = input?.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      App.showNotification('Seleccione una imagen PNG, JPG o WEBP', 'warning');
      input.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      App.showNotification('La imagen del icono no debe superar 8 MB', 'warning');
      input.value = '';
      return;
    }
    try {
      const dataUrl = await this.resizePortalIcon(file);
      App.portalIcons[key] = dataUrl;
      this.updatePortalIconPreview(key, dataUrl);
      App.showNotification(`Icono de ${this.PORTAL_ICON_LABELS[key] || key} listo. Presione «Guardar iconos del portal».`, 'success');
    } catch (err) {
      App.showNotification(err.message || 'No se pudo procesar la imagen', 'error');
    }
    input.value = '';
  },

  removePortalIcon(key) {
    delete App.portalIcons[key];
    this.updatePortalIconPreview(key, '');
    App.showNotification(`Icono de ${this.PORTAL_ICON_LABELS[key] || key} restaurado al SVG original. No olvide guardar.`, 'info');
  },

  async savePortalIcons() {
    const icons = {};
    Object.keys(this.PORTAL_ICON_LABELS).forEach(key => {
      const value = App.portalIcons[key];
      if (value) icons[key] = value;
    });
    try {
      const result = await DB.saveSetting('portal_icons', icons);
      if (!result || result.error) throw new Error(result?.error || 'El servidor no confirmó el guardado');
      App.portalIcons = icons;
      if (typeof ClientPortal !== 'undefined') ClientPortal.portalIcons = icons;
      App.showNotification('Iconos del portal guardados en la base de datos', 'success');
    } catch (err) {
      App.showNotification(err.message || 'No se pudieron guardar los iconos', 'error');
    }
  },

  async resetPortalIcons() {
    try {
      const result = await DB.saveSetting('portal_icons', {});
      if (!result || result.error) throw new Error(result?.error || 'No se pudo restaurar');
      App.portalIcons = {};
      if (typeof ClientPortal !== 'undefined') ClientPortal.portalIcons = {};
      this.loadPortalIcons();
      App.showNotification('Iconos originales restaurados', 'info');
    } catch (err) {
      App.showNotification(err.message || 'No se pudieron restaurar los iconos', 'error');
    }
  },

  handleQRCodeUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      App.showNotification('Seleccione una imagen PNG, JPG o WEBP', 'warning');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      App.showNotification('La imagen del QR no debe superar 8 MB', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const result = String(reader.result || '');
      const input = document.getElementById('qrCodeUrl');
      if (input) input.value = result;
      // Se guarda de inmediato en la BD; no basta con localStorage.
      await App.updateQRCode();
    };
    reader.readAsDataURL(file);
  },

  async updateQRCode() {
    const qrValue = document.getElementById('qrCodeUrl')?.value.trim();
    if (!qrValue || !/^data:image\/(png|jpeg|webp);base64,/i.test(qrValue)) {
      App.showNotification('Seleccione una imagen de QR desde su equipo antes de guardar', 'warning');
      return false;
    }
    try {
      const result = await DB.saveSetting('payment_qr', qrValue);
      if (!result || result.error) {
        App.showNotification(result?.error || 'No se pudo guardar el QR en la base de datos', 'error');
        return false;
      }
      localStorage.setItem('sh_qr_code_url', qrValue);
      App._qrCode = qrValue;
      document.getElementById('qrPreview').innerHTML =
        `<img src="${qrValue}" style="max-width:200px;border-radius:8px;border:2px solid #00d4ff;" alt="QR Preview">`;
      App.showNotification('✅ QR de cobranzas guardado en la base de datos', 'success');
      return true;
    } catch (err) {
      App.showNotification('No se pudo guardar el QR: ' + (err.message || 'error de conexión'), 'error');
      return false;
    }
  },

  getQRCode() {
    return App._qrCode || localStorage.getItem('sh_qr_code_url') || '';
  },

  // Carga configuración persistente desde PostgreSQL al iniciar sesión.
  loadSystemSettings() {
    try {
      const qr = DB.getSetting('payment_qr', '');
      if (qr) {
        App._qrCode = qr;
        localStorage.setItem('sh_qr_code_url', qr);
      }
      const logo = DB.getSetting('company_logo', '');
      if (logo) {
        localStorage.setItem('sh_logo', logo);
      }
    } catch (err) {
      console.warn('No se pudo cargar configuración persistente:', err.message);
    }
  },

  saveProfile() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    const name = document.getElementById('setFullName')?.value.trim();
    const email = document.getElementById('setEmail')?.value.trim();
    const phone = document.getElementById('setPhone')?.value.trim();

    const res = DB.updateOwnProfile({ name, email, phone });
    if (res?.user) {
      Auth.setCurrentUser(res.user);
      Auth.updateUserUI(res.user);
      if (res.needsVerification) {
        let msg = 'Perfil actualizado. El correo cambió: verifique la nueva dirección antes de volver a ingresar.';
        if (res.devToken) {
          const base = (window.API_BASE_URL || '/api').replace(/\/$/, '');
          msg += ' Modo desarrollo: ' + base + '/auth/verify-email?token=' + encodeURIComponent(res.devToken);
        }
        Auth.clearCurrentUser();
        DB._setToken(null);
        Auth.showLogin();
        document.getElementById('loginPage').style.display = 'flex';
        document.getElementById('adminPortal').style.display = 'none';
        document.getElementById('clientPortal').style.display = 'none';
        App.showNotification(msg, 'warning');
      } else {
        App.showNotification('Perfil actualizado', 'success');
      }
    } else {
      App.showNotification(res?.error || 'No se pudo actualizar el perfil', 'error');
    }
  },

  initLogoUpload() {
    // El logo se carga desde localStorage o desde la configuración persistida en el servidor.
    this.loadCompanyLogoFromServer();
  },

  async loadCompanyLogoFromServer() {
    try {
      const value = await DB.getSetting('company_logo', null);
      if (typeof value === 'string' && value.startsWith('data:image') && !localStorage.getItem('sh_logo')) {
        localStorage.setItem('sh_logo', value);
        this.loadSettings();
      }
    } catch (e) {
      console.warn('[SYSTEMHOME] No se pudo cargar el logo remoto:', e.message);
    }
  },

  handleLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/i.test(file.type)) {
      App.showToast('Use una imagen PNG o JPG (compatible con los PDF)', 'warning');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      App.showToast('El logo debe pesar menos de 2 MB', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      localStorage.setItem('sh_logo', dataUrl);
      App.loadSettings();
      const preview = document.getElementById('companyLogoPreview');
      if (preview) preview.innerHTML = `<img src="${dataUrl}" alt="Logo de la empresa" style="max-height:90px;max-width:90%;object-fit:contain;">`;
      try {
        await DB.saveSetting('company_logo', dataUrl);
        App.showToast('Logo guardado. Aparecerá en el sistema y en los presupuestos PDF.', 'success');
      } catch (err) {
        App.showToast('Logo aplicado localmente, pero no se pudo guardar en el servidor: ' + err.message, 'warning');
      }
    };
    reader.readAsDataURL(file);
  },

  async resetCompanyLogo() {
    localStorage.removeItem('sh_logo');
    App.loadSettings();
    const preview = document.getElementById('companyLogoPreview');
    if (preview) preview.innerHTML = '<img src="assets/LOGO.png" alt="Logo SYSTEMHOME" style="max-height:90px;max-width:90%;object-fit:contain;">';
    try {
      await DB.saveSetting('company_logo', null);
      App.showToast('Logo original restaurado', 'info');
    } catch (err) {
      App.showToast('Logo original restaurado localmente', 'warning');
    }
  },

  showNotification(message, type = 'info') {
    this.showToast(message, type);
  },

  showToast(message, type = 'info') {
    const existing = document.querySelector('.sh-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `sh-toast toast-${type}`;
    const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : (type === 'warning' ? '⚠️' : 'ℹ️'));
    toast.innerHTML = `<span class="toast-icon">${icon}</span> <span class="toast-msg">${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
};

/* === AUTO INITIALIZATION ON PAGE LOAD === */
document.addEventListener('DOMContentLoaded', () => {
  const user = Auth.getCurrentUser();
  if (user) {
    Auth.login(user);
  } else {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('adminPortal').style.display = 'none';
    document.getElementById('clientPortal').style.display = 'none';
    Auth.showLogin();
  }
});