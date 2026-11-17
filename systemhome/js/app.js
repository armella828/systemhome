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
  },

  showLogin() {
    document.getElementById('loginFormContainer').style.display = 'block';
    document.getElementById('registerFormContainer').style.display = 'none';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('loginForm').reset();
  },

  handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const errorEl = document.getElementById('registerError');

    if (!name || !email || !username || !password) {
      errorEl.textContent = 'Por favor complete todos los campos obligatorios.';
      errorEl.style.display = 'block';
      return false;
    }

    if (password.length < 6) {
      errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      errorEl.style.display = 'block';
      return false;
    }

    if (password !== confirmPassword) {
      errorEl.textContent = 'Las contraseñas no coinciden.';
      errorEl.style.display = 'block';
      return false;
    }

    if (DB.isUsernameDuplicate(username)) {
      errorEl.textContent = 'El nombre de usuario ya está en uso. Elija otro.';
      errorEl.style.display = 'block';
      return false;
    }

    errorEl.style.display = 'none';

    const newUser = DB.addUser({
      username: username,
      password: password,
      name: name,
      email: email,
      phone: phone,
      role: 'cliente'
    });

    if (newUser) {
      App.showNotification('¡Cuenta de cliente creada exitosamente!', 'success');
      this.login(newUser);
    } else {
      errorEl.textContent = 'Error al registrar la cuenta. Intente nuevamente.';
      errorEl.style.display = 'block';
    }
    return false;
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
      admin: ['dashboard', 'clients', 'requests', 'budgets', 'sales', 'warranties', 'workorders', 'inventory', 'maintenances', 'alerts', 'reports', 'audit', 'backup', 'users', 'settings', 'notifications'],
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
      if (secType === 'operations' && role === 'vendedor') sec.style.display = 'none';
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
    try { AuditModule?.init?.(); } catch (e) {}
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
      reports: { title: 'Reportes y Métricas', bread: 'Análisis / Reportes' },
      audit: { title: 'Registro de Auditoría', bread: 'Análisis / Auditoría' },
      backup: { title: 'Copias de Seguridad (Backup)', bread: 'Sistema / Backup' },
      users: { title: 'Gestión de Usuarios', bread: 'Sistema / Usuarios' },
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
    else if (view === 'reports') ReportsModule.render(container);
    else if (view === 'audit') AuditModule.render(container);
    else if (view === 'backup') BackupModule.render(container);
    else if (view === 'users') this.renderUsers(container);
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
      if (res) {
        App.showNotification(`Usuario "${username}" actualizado exitosamente`, 'success');
        document.getElementById('userFormModalOverlay')?.remove();
        App.renderUsers(document.getElementById('users-view'));
      } else {
        App.showNotification('Error al actualizar usuario', 'error');
      }
    } else {
      if (!password || password.trim().length < 6) {
        App.showNotification('La contraseña debe tener al menos 6 caracteres', 'warning');
        if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Usuario'; }
        return false;
      }
      payload.password = password.trim();
      const res = DB.addUserByAdmin(payload);
      if (res) {
        App.showNotification(`🎉 ¡Usuario "${username}" creado exitosamente!`, 'success');
        document.getElementById('userFormModalOverlay')?.remove();
        App.renderUsers(document.getElementById('users-view'));
      } else {
        App.showNotification('Error al crear usuario. Compruebe que el nombre de usuario no esté duplicado.', 'error');
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

  renderSettings(container) {
    const user = Auth.getCurrentUser();
    const qrValue = App.getQRCode();
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

        <div class="card">
          <div class="card-header">
            <h3>📱 QR de Cobranzas</h3>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label>URL o imagen del QR para pagos</label>
              <input type="text" id="qrCodeUrl" class="form-control" placeholder="https://... o data:image/..." value="${qrValue}">
            </div>
            <div class="form-group">
              <label for="qrCodeFile">Subir imagen desde el equipo</label>
              <input type="file" id="qrCodeFile" class="form-control" accept="image/*" onchange="App.handleQRCodeUpload(event)">
            </div>
            <div id="qrPreview" style="margin:20px 0;text-align:center;">
              ${qrValue ? '<img src="' + qrValue + '" style="max-width:200px;border-radius:8px;border:2px solid #00d4ff;" alt="QR Preview">' : '<div style="color:#64748b;padding:40px;background:#0f172a;border-radius:8px;">Vista previa del QR</div>'}
            </div>
            <button class="btn btn-primary" onclick="App.updateQRCode()">💾 Guardar QR de Cobranzas</button>
          </div>
        </div>
      </div>
    `;
  },

  handleQRCodeUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      App.showNotification('Seleccione un archivo de imagen válido', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      localStorage.setItem('sh_qr_code_url', result);
      const input = document.getElementById('qrCodeUrl');
      if (input) input.value = result;
      App.showNotification('QR cargado correctamente', 'success');
      setTimeout(() => App.renderSettings(document.getElementById('settings-view')), 300);
    };
    reader.readAsDataURL(file);
  },

  updateQRCode() {
    const qrUrl = document.getElementById('qrCodeUrl')?.value.trim();
    if (!qrUrl) {
      App.showNotification('Ingrese una URL o imagen válida para el QR', 'warning');
      return;
    }
    localStorage.setItem('sh_qr_code_url', qrUrl);
    App.showNotification('✅ QR de cobranzas actualizado correctamente', 'success');
    setTimeout(() => {
      const settingsView = document.getElementById('settings-view');
      if (settingsView) App.renderSettings(settingsView);
    }, 250);
  },

  getQRCode() {
    return localStorage.getItem('sh_qr_code_url') || '';
  },

  saveProfile() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    const name = document.getElementById('setFullName')?.value.trim();
    const email = document.getElementById('setEmail')?.value.trim();
    const phone = document.getElementById('setPhone')?.value.trim();

    const res = DB.updateUser(user.id, { name, email, phone });
    if (res) {
      Auth.setCurrentUser(res);
      Auth.updateUserUI(res);
      App.showNotification('Perfil actualizado', 'success');
    }
  },

  initLogoUpload() {},

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