/* ============================================================
   SYSTEMHOME - Módulo de Copias de Seguridad (Backup & Export)
   ============================================================ */

const BackupModule = {
  render(container) {
    const user = Auth.getCurrentUser();
    if (!user || user.role !== 'admin') {
      container.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-icon">🔒</div>
          <h3>Acceso Restringido</h3>
          <p>Solo los administradores generales tienen permisos para gestionar las copias de seguridad.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="module-header">
        <div>
          <h2>Copias de Seguridad (Backup del Sistema)</h2>
          <p class="module-subtitle">Generación, descarga y resguardo seguro de bases de datos SQLite y volcados completos en JSON</p>
        </div>
        <div class="module-actions">
          <button class="btn btn-secondary" onclick="BackupModule.refresh()">🔄 Actualizar Lista</button>
          <button class="btn btn-primary" id="btnCreateBackup" onclick="BackupModule.createBackup()">
            💾 Crear Nueva Copia de Seguridad
          </button>
        </div>
      </div>

      <div class="backup-info-card card" style="margin-bottom:1.5rem;">
        <div class="card-body" style="display:flex;align-items:center;gap:1.5rem;">
          <div style="font-size:2.5rem;">🛡️</div>
          <div>
            <h4 style="margin:0 0 0.3rem 0;">Seguridad y Resguardo Integral</h4>
            <p style="margin:0;color:#64748b;font-size:0.9rem;">
              Cada copia de seguridad contiene el archivo SQLite físico de SYSTEMHOME y un volcado estructurado en JSON con todas las tablas (clientes, cotizaciones, órdenes, inventario, ventas, facturas, mantenimientos, auditoría).
            </p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>📂 Archivos de Copia de Seguridad Disponibles</h3>
        </div>
        <div class="card-body">
          <div id="backupListContainer"></div>
        </div>
      </div>
    `;

    this.renderBackupList();
  },

  refresh() {
    this.renderBackupList();
    App.showNotification('Lista de copias de seguridad actualizada', 'info');
  },

  renderBackupList() {
    const container = document.getElementById('backupListContainer');
    if (!container) return;

    const backups = DB.getBackupsList();
    if (!backups || backups.length === 0) {
      container.innerHTML = `
        <div class="empty-state-box" style="padding:2rem;">
          <div class="empty-icon">📦</div>
          <h4>No hay copias de seguridad creadas aún</h4>
          <p>Haga clic en "Crear Nueva Copia de Seguridad" para generar un respaldo inmediato.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nombre de Archivo</th>
              <th>Tipo de Respaldo</th>
              <th>Tamaño</th>
              <th>Fecha de Creación</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${backups.map(b => `
              <tr>
                <td><strong>${b.name}</strong></td>
                <td>
                  <span class="badge ${b.name.endsWith('.sqlite') ? 'badge-primary' : 'badge-info'}">
                    ${b.type}
                  </span>
                </td>
                <td>${b.sizeFormatted}</td>
                <td>${new Date(b.modified).toLocaleDateString('es-PY')} ${new Date(b.modified).toLocaleTimeString('es-PY')}</td>
                <td>
                  <button class="btn btn-sm btn-primary" onclick="DB.downloadBackup('${b.name}')" title="Descargar archivo">
                    📥 Descargar
                  </button>
                  <button class="btn btn-sm btn-danger" onclick="BackupModule.deleteBackup('${b.name}')" title="Eliminar copia">
                    🗑️ Eliminar
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  createBackup() {
    const btn = document.getElementById('btnCreateBackup');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando respaldo...'; }

    setTimeout(() => {
      const res = DB.createBackup();
      if (res && res.ok) {
        App.showNotification(`¡Copia de seguridad generada con éxito! Archivos: ${res.sqliteFile}`, 'success');
        this.renderBackupList();
      } else {
        App.showNotification(res?.error || 'Error al generar la copia de seguridad', 'error');
      }
      if (btn) { btn.disabled = false; btn.textContent = '💾 Crear Nueva Copia de Seguridad'; }
    }, 400);
  },

  deleteBackup(filename) {
    if (!confirm(`¿Está seguro de eliminar permanentemente la copia de seguridad "${filename}"?`)) return;

    const res = DB.deleteBackup(filename);
    if (res && res.ok) {
      App.showNotification(`Copia "${filename}" eliminada`, 'info');
      this.renderBackupList();
    } else {
      App.showNotification(res?.error || 'Error al eliminar la copia', 'error');
    }
  }
};
