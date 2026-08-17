/* ============================================================
   SYSTEMHOME - Módulo Solicitudes de Cotización
   Gestión de solicitudes del cliente: revisar, cotizar,
   ver ubicación en mapa, cambiar estado.
   ============================================================ */

const RequestsModule = {
    currentFilter: 'all',

    init() {
        this.render();
    },

    render() {
        const container = document.getElementById('requests-view');
        if (!container) return;

        const requests = DB.getRequests();
        const clients = DB.getClients();

        container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input type="text" id="searchRequest" placeholder="Buscar solicitud por N° o cliente...">
          </div>
          <select class="form-control" id="filterRequestStatus" style="width:180px;">
            <option value="all">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_revision">En revisión</option>
            <option value="cotizando">Cotizando</option>
            <option value="cotizacion_enviada">Cotización enviada</option>
            <option value="aprobada">Aprobada</option>
            <option value="rechazada">Rechazada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <div class="toolbar-right">
          <span style="font-size:13px;color:var(--gray-500);">Total: <strong>${requests.length}</strong></span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>📝 Solicitudes de Cotización</h3>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Cliente</th>
                  <th>Servicio</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Prioridad</th>
                  <th>Ubicación</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody id="requestsTableBody">
                ${this.renderTableRows(requests, clients)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

        document.getElementById('searchRequest')?.addEventListener('input', () => this.filter());
        document.getElementById('filterRequestStatus')?.addEventListener('change', () => this.filter());
    },

    renderTableRows(requests, clients) {
        if (requests.length === 0) {
            return `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--gray-500);">
        <div style="font-size:40px;margin-bottom:10px;">📭</div>
        No hay solicitudes registradas.
      </td></tr>`;
        }

        const statusMap = {
            pendiente: 'badge-pendiente',
            en_revision: 'badge-enviado',
            cotizando: 'badge-enviado',
            cotizacion_enviada: 'badge-enviado',
            aprobada: 'badge-aprobado',
            rechazada: 'badge-rechazado',
            cancelada: 'badge-inactive'
        };
        const labelMap = {
            pendiente: 'Pendiente',
            en_revision: 'En revisión',
            cotizando: 'Cotizando',
            cotizacion_enviada: 'Cotización enviada',
            aprobada: 'Aprobada',
            rechazada: 'Rechazada',
            cancelada: 'Cancelada'
        };
        const priorityMap = { alta: 'badge-rechazado', normal: 'badge-enviado', baja: 'badge-inactive' };

        return requests.map(r => {
            const client = clients.find(c => c.id === r.clientId);
            return `<tr>
          <td><strong>${this.escapeHtml(r.number)}</strong></td>
          <td>${client ? this.escapeHtml(client.name) : this.escapeHtml(r.clientName || 'Cliente')}</td>
          <td>${this.escapeHtml(r.serviceName || r.serviceType || '-')}</td>
          <td>${DB.formatDateTime(r.createdAt)}</td>
          <td><span class="badge ${statusMap[r.status] || 'badge-pendiente'}"><span class="dot"></span> ${labelMap[r.status] || r.status}</span></td>
          <td><span class="badge ${priorityMap[r.priority] || 'badge-enviado'}"><span class="dot"></span> ${r.priority || 'normal'}</span></td>
          <td>${r.latitude && r.longitude ? '<span style="color:var(--success);">📍 GPS</span>' : (r.address ? '📍 ' + this.escapeHtml(r.address.substring(0, 30)) : '-')}</td>
          <td>
            <div class="actions">
              <button class="btn btn-sm btn-secondary" onclick="RequestsModule.view(${r.id})" title="Ver solicitud">👁️</button>
              ${r.status === 'pendiente' ? `<button class="btn btn-sm btn-primary" onclick="RequestsModule.setStatus(${r.id}, 'en_revision')" title="Marcar en revisión">🔍</button>` : ''}
              ${['pendiente', 'en_revision', 'cotizando'].includes(r.status) ? `<button class="btn btn-sm btn-success" onclick="RequestsModule.createBudget(${r.id})" title="Crear cotización">📋</button>` : ''}
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
        const search = (document.getElementById('searchRequest')?.value || '').toLowerCase();
        const statusFilter = document.getElementById('filterRequestStatus')?.value || 'all';
        const clients = DB.getClients();
        let requests = DB.getRequests();

        if (search) {
            requests = requests.filter(r => {
                const client = clients.find(c => c.id === r.clientId);
                return (r.number && r.number.toLowerCase().includes(search)) ||
                    (client && client.name.toLowerCase().includes(search)) ||
                    (r.clientName && r.clientName.toLowerCase().includes(search));
            });
        }
        if (statusFilter !== 'all') {
            requests = requests.filter(r => r.status === statusFilter);
        }

        const tbody = document.getElementById('requestsTableBody');
        if (tbody) tbody.innerHTML = this.renderTableRows(requests, clients);
    },

    setStatus(id, status) {
        DB.updateRequest(id, { status });
        App.showNotification('Estado de solicitud actualizado', 'success');
        this.render();
    },

  view(id) {
    const data = DB.getRequest(id);
    if (!data) return;
    // data puede ser el objeto de request directamente (de DB.getRequest) o {request, files}
    const r = data.request || data;
    const files = data.files || [];

        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.innerHTML = `
      <div class="modal modal-lg" style="max-width:800px;">
        <div class="modal-header">
          <h3>Solicitud ${this.escapeHtml(r.number)}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px;">
            <div><strong style="font-size:12px;color:var(--gray-500);display:block;">Cliente</strong>${this.escapeHtml(r.clientName || 'Cliente')}</div>
            <div><strong style="font-size:12px;color:var(--gray-500);display:block;">Servicio</strong>${this.escapeHtml(r.serviceName || r.serviceType || '-')}</div>
            <div><strong style="font-size:12px;color:var(--gray-500);display:block;">Fecha</strong>${DB.formatDateTime(r.createdAt)}</div>
            <div><strong style="font-size:12px;color:var(--gray-500);display:block;">Estado</strong>${this.escapeHtml(r.status)}</div>
            <div><strong style="font-size:12px;color:var(--gray-500);display:block;">Prioridad</strong>${this.escapeHtml(r.priority || 'normal')}</div>
          </div>
          <div style="margin-bottom:16px;">
            <strong style="font-size:12px;color:var(--gray-500);display:block;">Descripción</strong>
            <p style="white-space:pre-wrap;font-size:14px;">${this.escapeHtml(r.description || '')}</p>
          </div>
          <div style="margin-bottom:16px;">
            <strong style="font-size:12px;color:var(--gray-500);display:block;">Dirección</strong>
            <p>${this.escapeHtml(r.address || 'No especificada')}</p>
            ${r.reference ? `<p style="font-size:13px;color:var(--gray-500);">Referencia: ${this.escapeHtml(r.reference)}</p>` : ''}
          </div>
          ${r.latitude && r.longitude ? `
            <div style="margin-bottom:16px;">
              <strong style="font-size:12px;color:var(--gray-500);display:block;">Ubicación GPS</strong>
              <p style="font-size:13px;">Lat: ${r.latitude.toFixed(6)} · Lng: ${r.longitude.toFixed(6)}</p>
              <button class="btn btn-sm btn-primary" onclick="RequestsModule.showMap(${r.latitude}, ${r.longitude}, '${this.escapeHtml(r.address || '')}')">🗺️ Ver ubicación en mapa</button>
            </div>
          ` : ''}
          ${files.length ? `
            <div style="margin-bottom:16px;">
              <strong style="font-size:12px;color:var(--gray-500);display:block;">Archivos adjuntos</strong>
              ${files.map(f => `<a href="${f.filepath}" target="_blank" style="display:block;margin:4px 0;">📎 ${this.escapeHtml(f.filename)}</a>`).join('')}
            </div>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
          ${['pendiente', 'en_revision', 'cotizando'].includes(r.status) ? `<button class="btn btn-primary" onclick="RequestsModule.createBudget(${r.id})">📋 Crear Cotización</button>` : ''}
        </div>
      </div>
    `;
        document.body.appendChild(modal);
    },

    showMap(lat, lng, address) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.innerHTML = `
      <div class="modal modal-lg" style="max-width:700px;">
        <div class="modal-header">
          <h3>🗺️ Ubicación del Cliente</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">${this.escapeHtml(address || '')}</p>
          <div id="requestMap" style="height:400px;border-radius:8px;border:1px solid var(--gray-200);"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
          <a class="btn btn-primary" href="https://www.google.com/maps?q=${lat},${lng}" target="_blank">Abrir en Google Maps</a>
        </div>
      </div>
    `;
        document.body.appendChild(modal);

        setTimeout(() => {
            const mapEl = document.getElementById('requestMap');
            if (mapEl && window.L) {
                const map = L.map(mapEl).setView([lat, lng], 16);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap'
                }).addTo(map);
                L.marker([lat, lng]).addTo(map).bindPopup(address || 'Ubicación').openPopup();
            }
        }, 100);
    },

  createBudget(requestId) {
    const requestData = DB.getRequest(requestId);
    if (!requestData) {
      App.showNotification('Error: No se encontró la solicitud', 'error');
      return;
    }

    const r = requestData.request || requestData;
    const client = r.clientId ? DB.getClient(r.clientId) : null;
    const clients = DB.getClients();
    const serviceTypes = [
      { value: 'camaras', label: 'Cámaras de Vigilancia' },
      { value: 'alarma', label: 'Sistemas de Alarma' },
      { value: 'ac', label: 'Aire Acondicionado' },
      { value: 'cerca', label: 'Cerca Eléctrica' },
      { value: 'video', label: 'Video Portero' },
      { value: 'electricidad', label: 'Electricidad' },
      { value: 'cableado', label: 'Cableado Estructurado' },
      { value: 'redes', label: 'Redes e Internet' },
      { value: 'otro', label: 'Otro' }
    ];

    let budgetItems = [];

    const closeModal = () => {
      const m = document.getElementById('reqBudgetModal');
      if (m) m.remove();
    };

    const calcTotal = () => {
      const itemsTotal = budgetItems.reduce((sum, it) => sum + (it.qty * it.price), 0);
      const labor = parseFloat(document.getElementById('reqBudgetLabor')?.value) || 0;
      const discount = parseFloat(document.getElementById('reqBudgetDiscount')?.value) || 0;
      const total = itemsTotal + labor - discount;
      const display = document.getElementById('reqBudgetTotalDisplay');
      if (display) display.textContent = total.toLocaleString('es-PY');
      const hidden = document.getElementById('reqBudgetTotal');
      if (hidden) hidden.value = total;
      return total;
    };

    const renderItems = () => {
      const tbody = document.getElementById('reqBudgetItemsBody');
      if (!tbody) return;
      if (budgetItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:20px;">No hay líneas agregadas.</td></tr>';
        return;
      }
      tbody.innerHTML = budgetItems.map((it, i) => `
        <tr>
          <td>${this.escapeHtml(it.concept)}</td>
          <td>${it.qty}</td>
          <td>${DB.formatCurrency(it.price)}</td>
          <td><strong>${DB.formatCurrency(it.qty * it.price)}</strong></td>
          <td><button class="btn btn-sm btn-danger" onclick="RequestsModule._removeBudgetItem(${i})">🗑️</button></td>
        </tr>
      `).join('');
    };

    const addItem = () => {
      const concept = document.getElementById('reqItemConcept')?.value.trim();
      const qty = parseInt(document.getElementById('reqItemQty')?.value) || 1;
      const price = parseFloat(document.getElementById('reqItemPrice')?.value) || 0;
      if (!concept) { App.showToast('Ingrese un concepto', 'warning'); return; }
      budgetItems.push({ concept, qty, price });
      renderItems();
      calcTotal();
      document.getElementById('reqItemConcept').value = '';
      document.getElementById('reqItemQty').value = '1';
      document.getElementById('reqItemPrice').value = '0';
    };

    this._removeBudgetItem = (i) => {
      budgetItems.splice(i, 1);
      renderItems();
      calcTotal();
    };

    this._saveBudget = (asDraft) => {
      const clientId = parseInt(document.getElementById('reqBudgetClient')?.value) || null;
      const serviceType = document.getElementById('reqBudgetService')?.value;
      const description = document.getElementById('reqBudgetDescription')?.value.trim();
      if (!serviceType) { App.showToast('Seleccione un tipo de servicio', 'warning'); return; }

      const data = {
        clientId,
        requestId: requestId,
        serviceType,
        description: description || r.description || '',
        items: budgetItems,
        labor: parseFloat(document.getElementById('reqBudgetLabor')?.value) || 0,
        discount: parseFloat(document.getElementById('reqBudgetDiscount')?.value) || 0,
        total: parseFloat(document.getElementById('reqBudgetTotal')?.value) || 0,
        status: asDraft ? 'borrador' : 'enviado',
        source: 'internal',
        validUntil: document.getElementById('reqBudgetValidUntil')?.value || '',
        conditions: document.getElementById('reqBudgetConditions')?.value.trim() || '',
        observations: document.getElementById('reqBudgetObservations')?.value.trim() || '',
        estimatedTime: document.getElementById('reqBudgetEstTime')?.value.trim() || '',
        address: document.getElementById('reqBudgetAddress')?.value.trim() || r.address || '',
        latitude: r.latitude || null,
        longitude: r.longitude || null,
        reference: r.reference || ''
      };

      const result = DB.addBudget(data);
      if (result) {
        DB.updateRequest(requestId, { status: asDraft ? 'cotizando' : 'cotizacion_enviada' });
        App.showNotification(asDraft ? '📄 Cotización guardada como borrador' : '📨 Cotización creada y enviada al cliente', 'success');
        closeModal();
        RequestsModule.render();
      } else {
        App.showNotification('Error al guardar la cotización', 'error');
      }
    };

    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'reqBudgetModal';
    modal.innerHTML = `
      <div class="modal modal-lg" style="max-width:850px;max-height:90vh;overflow-y:auto;">
        <div class="modal-header">
          <h3>📋 Crear Cotización desde Solicitud ${this.escapeHtml(r.number)}</h3>
          <button class="modal-close" onclick="RequestsModule._closeReqBudgetModal()">✕</button>
        </div>
        <div class="modal-body">
          <div style="background:#f0f9ff;border-left:4px solid #3b82f6;padding:14px 16px;border-radius:8px;margin-bottom:20px;">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:13px;">
              <div><strong style="color:var(--gray-500);font-size:11px;display:block;">Solicitud</strong>${this.escapeHtml(r.number)}</div>
              <div><strong style="color:var(--gray-500);font-size:11px;display:block;">Cliente</strong>${this.escapeHtml(client?.name || r.clientName || 'Sin cliente')}</div>
              <div><strong style="color:var(--gray-500);font-size:11px;display:block;">Teléfono</strong>${this.escapeHtml(client?.phone || r.clientPhone || '-')}</div>
              <div><strong style="color:var(--gray-500);font-size:11px;display:block;">Correo</strong>${this.escapeHtml(client?.email || r.clientEmail || '-')}</div>
              <div><strong style="color:var(--gray-500);font-size:11px;display:block;">Fecha</strong>${DB.formatDateTime(r.createdAt)}</div>
              <div><strong style="color:var(--gray-500);font-size:11px;display:block;">Servicio</strong>${this.escapeHtml(r.serviceName || r.serviceType || '-')}</div>
            </div>
            ${r.description ? `<div style="margin-top:10px;font-size:13px;"><strong style="color:var(--gray-500);font-size:11px;display:block;">Descripción</strong>${this.escapeHtml(r.description)}</div>` : ''}
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="required">Cliente</label>
              <select class="form-control" id="reqBudgetClient" required>
                <option value="">Seleccionar cliente...</option>
                ${clients.filter(c => c.active).map(c =>
                  `<option value="${c.id}" ${r.clientId == c.id ? 'selected' : ''}>${this.escapeHtml(c.name)} - ${this.escapeHtml(c.ruc || '')}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="required">Tipo de Servicio</label>
              <select class="form-control" id="reqBudgetService" required>
                <option value="">Seleccionar...</option>
                ${serviceTypes.map(s => `<option value="${s.value}" ${r.serviceType === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Descripción del Servicio</label>
            <textarea class="form-control" id="reqBudgetDescription" rows="2" placeholder="Describa los trabajos a realizar...">${this.escapeHtml(r.description || '')}</textarea>
          </div>

          <div style="margin-top:16px;margin-bottom:12px;">
            <h4 style="font-size:14px;font-weight:600;color:var(--gray-700);margin-bottom:10px;">📋 Líneas del Presupuesto</h4>
            <div style="background:var(--gray-50);border-radius:var(--radius-md);padding:12px;margin-bottom:12px;">
              <div class="form-row-3">
                <div class="form-group">
                  <label>Concepto</label>
                  <input type="text" class="form-control" id="reqItemConcept" placeholder="Ej: Cámara HD 1080p">
                </div>
                <div class="form-group">
                  <label>Cantidad</label>
                  <input type="number" class="form-control" id="reqItemQty" value="1" min="1">
                </div>
                <div class="form-group">
                  <label>Precio Unit. (Bs)</label>
                  <input type="number" class="form-control" id="reqItemPrice" value="0" min="0">
                </div>
              </div>
              <button class="btn btn-sm btn-secondary" onclick="RequestsModule._addItemReqBudget()" style="margin-top:4px;">➕ Agregar línea</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width:50%;">Concepto</th>
                  <th>Cant.</th>
                  <th>Precio Unit.</th>
                  <th>Subtotal</th>
                  <th style="width:50px;"></th>
                </tr>
              </thead>
              <tbody id="reqBudgetItemsBody">
                <tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:20px;">No hay líneas agregadas.</td></tr>
              </tbody>
            </table>
          </div>

          <div class="form-row-3">
            <div class="form-group">
              <label>Mano de Obra (Bs)</label>
              <input type="number" class="form-control" id="reqBudgetLabor" value="0" min="0" onchange="RequestsModule._calcReqBudgetTotal()">
            </div>
            <div class="form-group">
              <label>Descuento (Bs)</label>
              <input type="number" class="form-control" id="reqBudgetDiscount" value="0" min="0" onchange="RequestsModule._calcReqBudgetTotal()">
            </div>
            <div class="form-group">
              <label style="font-size:16px;font-weight:700;color:var(--primary);">Total: <span id="reqBudgetTotalDisplay">0</span> Bs</label>
              <input type="hidden" id="reqBudgetTotal" value="0">
            </div>
          </div>

          <div class="form-row-3">
            <div class="form-group">
              <label>Fecha de Validez</label>
              <input type="date" class="form-control" id="reqBudgetValidUntil">
            </div>
            <div class="form-group">
              <label>Tiempo Estimado</label>
              <input type="text" class="form-control" id="reqBudgetEstTime" placeholder="Ej: 3 días">
            </div>
            <div class="form-group">
              <label>📍 Dirección</label>
              <input type="text" class="form-control" id="reqBudgetAddress" value="${this.escapeHtml(r.address || '')}" placeholder="Dirección del trabajo">
            </div>
          </div>
          <div class="form-group">
            <label>Condiciones</label>
            <textarea class="form-control" id="reqBudgetConditions" rows="2" placeholder="Condiciones de la cotización..."></textarea>
          </div>
          <div class="form-group">
            <label>Observaciones</label>
            <textarea class="form-control" id="reqBudgetObservations" rows="2" placeholder="Observaciones adicionales..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="RequestsModule._closeReqBudgetModal()">Cancelar</button>
          <button class="btn btn-secondary" onclick="RequestsModule._saveBudget(true)">📄 Guardar Borrador</button>
          <button class="btn btn-primary" onclick="RequestsModule._saveBudget(false)">📨 Crear y Enviar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this._addItemReqBudget = addItem;
    this._closeReqBudgetModal = closeModal;
    this._calcReqBudgetTotal = calcTotal;
  }
};