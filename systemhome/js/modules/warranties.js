/* ============================================================
   SYSTEMHOME - Módulo Garantías (SH-M03)
   Registro de garantías por equipo, consulta, edición,
   reclamos e historial.
   ============================================================ */

const WarrantiesModule = {
    init() {
        this.render();
    },

    render() {
        const container = document.getElementById('warranties-view');
        if (!container) return;

        const warranties = DB.getWarranties();
        const clients = DB.getClients();
        const inventory = DB.getInventory();

        container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input type="text" id="searchWarranty" placeholder="Buscar garantía por cliente o equipo...">
          </div>
          <select class="form-control" id="filterWarrantyStatus" style="width:160px;">
            <option value="all">Todos los estados</option>
            <option value="vigente">Vigente</option>
            <option value="vencida">Vencida</option>
            <option value="reclamada">Reclamada</option>
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-primary" onclick="WarrantiesModule.openModal()">➕ Nueva Garantía</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>🛡️ Garantías Registradas</h3>
          <span style="font-size:13px;color:var(--gray-500);">Total: <strong>${warranties.length}</strong></span>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th>Equipo</th>
                  <th>Instalación</th>
                  <th>Vencimiento</th>
                  <th>Duración</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody id="warrantiesTableBody">
                ${this.renderTableRows(warranties, clients, inventory)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

        document.getElementById('searchWarranty')?.addEventListener('input', () => this.filter());
        document.getElementById('filterWarrantyStatus')?.addEventListener('change', () => this.filter());
    },

    renderTableRows(warranties, clients, inventory) {
        if (warranties.length === 0) {
            return `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--gray-500);">
        <div style="font-size:40px;margin-bottom:10px;">🛡️</div>
        No hay garantías registradas.
      </td></tr>`;
        }

        const statusMap = { vigente: 'badge-aprobado', vencida: 'badge-rechazado', reclamada: 'badge-enviado' };

        return warranties.map(w => {
            const client = clients.find(c => c.id === w.clientId);
            const item = inventory.find(i => i.id === w.inventoryItemId);
            return `<tr>
          <td>${w.id}</td>
          <td><strong>${client ? this.escapeHtml(client.name) : this.escapeHtml(w.clientName || '-')}</strong></td>
          <td>${item ? this.escapeHtml(item.name) : this.escapeHtml(w.itemName || '-')}</td>
          <td>${DB.formatDate(w.installationDate)}</td>
          <td>${DB.formatDate(w.expiryDate)}</td>
          <td>${w.durationMonths} meses</td>
          <td><span class="badge ${statusMap[w.status] || 'badge-enviado'}"><span class="dot"></span> ${w.status}</span></td>
          <td>
            <div class="actions">
              <button class="btn btn-sm btn-secondary" onclick="WarrantiesModule.view(${w.id})" title="Ver">👁️</button>
              <button class="btn btn-sm btn-secondary" onclick="WarrantiesModule.openModal(${w.id})" title="Editar">✏️</button>
              <button class="btn btn-sm btn-warning" onclick="WarrantiesModule.addClaim(${w.id})" title="Registrar reclamo">⚠️</button>
            </div>
          </td>
        </tr>`;
        }).join('');
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    filter() {
        const search = (document.getElementById('searchWarranty')?.value || '').toLowerCase();
        const statusFilter = document.getElementById('filterWarrantyStatus')?.value || 'all';
        const clients = DB.getClients();
        const inventory = DB.getInventory();
        let warranties = DB.getWarranties();

        if (search) {
            warranties = warranties.filter(w => {
                const client = clients.find(c => c.id === w.clientId);
                const item = inventory.find(i => i.id === w.inventoryItemId);
                return (client && client.name.toLowerCase().includes(search)) ||
                    (item && item.name.toLowerCase().includes(search)) ||
                    (w.clientName && w.clientName.toLowerCase().includes(search)) ||
                    (w.itemName && w.itemName.toLowerCase().includes(search));
            });
        }
        if (statusFilter !== 'all') {
            warranties = warranties.filter(w => w.status === statusFilter);
        }

        const tbody = document.getElementById('warrantiesTableBody');
        if (tbody) tbody.innerHTML = this.renderTableRows(warranties, clients, inventory);
    },

    openModal(warrantyId) {
        const warranty = warrantyId ? DB.getWarranties().find(w => w.id === warrantyId) : null;
        const clients = DB.getClients();
        const inventory = DB.getInventory();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.innerHTML = `
      <div class="modal" style="max-width:600px;">
        <div class="modal-header">
          <h3>${warranty ? 'Editar Garantía' : 'Nueva Garantía'}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          <form id="warrantyForm" onsubmit="return false;">
            <div class="form-group">
              <label class="required">Cliente</label>
              <select class="form-control" id="warrantyClient" required>
                <option value="">Seleccionar cliente...</option>
                ${clients.filter(c => c.active).map(c => `<option value="${c.id}" ${warranty && warranty.clientId === c.id ? 'selected' : ''}>${this.escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="required">Equipo Instalado</label>
              <select class="form-control" id="warrantyItem" required>
                <option value="">Seleccionar equipo...</option>
                ${inventory.map(i => `<option value="${i.id}" ${warranty && warranty.inventoryItemId === i.id ? 'selected' : ''}>${this.escapeHtml(i.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Fecha de Instalación</label>
                <input type="date" class="form-control" id="warrantyInstallDate" value="${warranty ? warranty.installationDate : ''}">
              </div>
              <div class="form-group">
                <label>Duración (meses)</label>
                <input type="number" class="form-control" id="warrantyDuration" value="${warranty ? warranty.durationMonths : 12}" min="1">
              </div>
            </div>
            <div class="form-group">
              <label>Condiciones</label>
              <textarea class="form-control" id="warrantyConditions" rows="3" placeholder="Condiciones de la garantía...">${warranty ? this.escapeHtml(warranty.conditions || '') : ''}</textarea>
            </div>
            <div class="form-group">
              <label>Estado</label>
              <select class="form-control" id="warrantyStatus">
                <option value="vigente" ${warranty && warranty.status === 'vigente' ? 'selected' : ''}>Vigente</option>
                <option value="vencida" ${warranty && warranty.status === 'vencida' ? 'selected' : ''}>Vencida</option>
                <option value="reclamada" ${warranty && warranty.status === 'reclamada' ? 'selected' : ''}>Reclamada</option>
              </select>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="WarrantiesModule.save(${warranty ? warranty.id : 'null'})">💾 Guardar</button>
        </div>
      </div>
    `;
        document.body.appendChild(modal);
    },

    save(warrantyId) {
        const clientId = parseInt(document.getElementById('warrantyClient').value);
        const inventoryItemId = parseInt(document.getElementById('warrantyItem').value);
        const installationDate = document.getElementById('warrantyInstallDate').value;
        const durationMonths = parseInt(document.getElementById('warrantyDuration').value) || 12;
        const conditions = document.getElementById('warrantyConditions').value.trim();
        const status = document.getElementById('warrantyStatus').value;

        if (!clientId || !inventoryItemId) {
            App.showToast('Seleccione cliente y equipo', 'warning');
            return;
        }

        const data = { clientId, inventoryItemId, installationDate, durationMonths, conditions, status };

        if (warrantyId) {
            DB.updateWarranty(warrantyId, data);
            App.showToast('Garantía actualizada', 'success');
        } else {
            DB.addWarranty(data);
            App.showToast('Garantía registrada', 'success');
        }
        document.querySelector('.modal-overlay.show').remove();
        this.render();
    },

    view(warrantyId) {
        const warranty = DB.getWarranties().find(w => w.id === warrantyId);
        if (!warranty) return;
        const clients = DB.getClients();
        const inventory = DB.getInventory();
        const client = clients.find(c => c.id === warranty.clientId);
        const item = inventory.find(i => i.id === warranty.inventoryItemId);
        const claims = DB.getWarrantyClaims(warrantyId);

        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.innerHTML = `
      <div class="modal modal-lg" style="max-width:700px;">
        <div class="modal-header">
          <h3>🛡️ Garantía #${warranty.id}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px;">
            <div><strong style="font-size:12px;color:var(--gray-500);display:block;">Cliente</strong>${client ? this.escapeHtml(client.name) : '-'}</div>
            <div><strong style="font-size:12px;color:var(--gray-500);display:block;">Equipo</strong>${item ? this.escapeHtml(item.name) : '-'}</div>
            <div><strong style="font-size:12px;color:var(--gray-500);display:block;">Instalación</strong>${DB.formatDate(warranty.installationDate)}</div>
            <div><strong style="font-size:12px;color:var(--gray-500);display:block;">Vencimiento</strong>${DB.formatDate(warranty.expiryDate)}</div>
            <div><strong style="font-size:12px;color:var(--gray-500);display:block;">Estado</strong>${this.escapeHtml(warranty.status)}</div>
          </div>
          ${warranty.conditions ? `<div style="margin-bottom:16px;"><strong style="font-size:12px;color:var(--gray-500);display:block;">Condiciones</strong><p>${this.escapeHtml(warranty.conditions)}</p></div>` : ''}
          <h4 style="font-size:14px;font-weight:600;margin-bottom:10px;">📋 Reclamos</h4>
          ${claims.length === 0 ? '<p style="font-size:13px;color:var(--gray-500);">No hay reclamos registrados.</p>' : claims.map(c => `
            <div style="background:var(--gray-50);border-radius:8px;padding:12px;margin-bottom:8px;">
              <strong style="font-size:13px;">${DB.formatDate(c.claim_date)}</strong>
              <p style="font-size:13px;margin-top:4px;">${this.escapeHtml(c.description)}</p>
              <span class="badge badge-enviado"><span class="dot"></span> ${c.status}</span>
            </div>`).join('')}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
          <button class="btn btn-warning" onclick="WarrantiesModule.addClaim(${warrantyId})">⚠️ Registrar Reclamo</button>
        </div>
      </div>
    `;
        document.body.appendChild(modal);
    },

    addClaim(warrantyId) {
        const description = prompt('Describa el reclamo de garantía:');
        if (!description) return;
        DB.addWarrantyClaim(warrantyId, description);
        App.showToast('Reclamo registrado', 'success');
        this.render();
    }
};