/* ============================================================
   SYSTEMHOME - Módulo Presupuestos (SH-A02)
   Gestión de presupuestos con servicio, materiales,
   mano de obra y total. Vinculación al cliente.
   Control de estados: borrador, enviado, aprobado, rechazado.
   ============================================================ */

const BudgetsModule = {
    currentBudgetId: null,
    editingIndex: null,

    init() {
        this.render();
    },

    render() {
        const container = document.getElementById('budgets-view');
        if (!container) return;

        const budgets = DB.getBudgets();
        const clients = DB.getClients();

        container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input type="text" id="searchBudget" placeholder="Buscar presupuesto por N° o cliente...">
          </div>
          <select class="form-control" id="filterBudgetStatus" style="width:160px;">
            <option value="all">Todos los estados</option>
            <option value="borrador">Borrador</option>
            <option value="enviado">Enviado</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-primary" onclick="BudgetsModule.openModal()">
            ➕ Nuevo Presupuesto
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Presupuestos</h3>
          <span style="font-size:13px;color:var(--gray-500);">Total: <strong>${budgets.length}</strong></span>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Cliente</th>
                  <th>Servicio</th>
                  <th>Total</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody id="budgetsTableBody">
                ${this.renderTableRows(budgets, clients)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal -->
      <div class="modal-overlay" id="budgetModal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <h3 id="budgetModalTitle">Nuevo Presupuesto</h3>
            <button class="modal-close" onclick="BudgetsModule.closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <form id="budgetForm" onsubmit="return false;">
              <input type="hidden" id="budgetId" value="">
              <input type="hidden" id="budgetRequestId" value="">
              <input type="hidden" id="budgetLatitude" value="">
              <input type="hidden" id="budgetLongitude" value="">
              <input type="hidden" id="budgetAddress" value="">
              <input type="hidden" id="budgetReference" value="">
              
              <div class="form-row">
                <div class="form-group">
                  <label class="required">Cliente</label>
                  <select class="form-control" id="budgetClient" required>
                    <option value="">Seleccionar cliente...</option>
                    ${clients.filter(c => c.active).map(c =>
            `<option value="${c.id}">${this.escapeHtml(c.name)} - ${this.escapeHtml(c.ruc || '')}</option>`
        ).join('')}
                  </select>
                  <div class="form-error" id="err-budget-client">Seleccione un cliente</div>
                </div>
                <div class="form-group">
                  <label class="required">Tipo de Servicio</label>
                  <select class="form-control" id="budgetService" required>
                    <option value="">Seleccionar...</option>
                    <option value="camaras">Cámaras de Vigilancia</option>
                    <option value="alarma">Sistemas de Alarma</option>
                    <option value="ac">Aire Acondicionado</option>
                    <option value="cerca">Cerca Eléctrica</option>
                    <option value="video">Video Portero</option>
                    <option value="electricidad">Electricidad</option>
                    <option value="cableado">Cableado Estructurado</option>
                    <option value="redes">Redes e Internet</option>
                    <option value="otro">Otro</option>
                  </select>
                  <div class="form-error" id="err-budget-service">Seleccione un servicio</div>
                </div>
              </div>

              <div class="form-group">
                <label>Descripción del Servicio</label>
                <textarea class="form-control" id="budgetDescription" placeholder="Describa los trabajos a realizar..." rows="3"></textarea>
              </div>

              <div style="margin-top:20px;margin-bottom:16px;">
                <h4 style="font-size:14px;font-weight:600;color:var(--gray-700);margin-bottom:12px;">📋 Líneas del Presupuesto</h4>
                
                <div style="background:var(--gray-50);border-radius:var(--radius-md);padding:16px;margin-bottom:16px;">
                  <div class="form-row-3">
                    <div class="form-group">
                      <label>Concepto</label>
                      <input type="text" class="form-control" id="itemConcept" placeholder="Ej: Cámara HD 1080p">
                    </div>
                    <div class="form-group">
                      <label>Cantidad</label>
                      <input type="number" class="form-control" id="itemQty" value="1" min="1">
                    </div>
                    <div class="form-group">
                      <label>Precio Unit. (GS)</label>
                      <input type="number" class="form-control" id="itemPrice" value="0" min="0">
                    </div>
                  </div>
                  <button class="btn btn-sm btn-secondary" onclick="BudgetsModule.addItem()" style="margin-top:4px;">➕ Agregar línea</button>
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
                  <tbody id="budgetItemsBody">
                  </tbody>
                </table>
              </div>

              <div class="form-row-3">
                <div class="form-group">
                  <label>Mano de Obra (GS)</label>
                  <input type="number" class="form-control" id="budgetLabor" value="0" min="0">
                </div>
                <div class="form-group">
                  <label>Descuento (GS)</label>
                  <input type="number" class="form-control" id="budgetDiscount" value="0" min="0">
                </div>
                <div class="form-group">
                  <label style="font-size:16px;font-weight:700;color:var(--primary);">Total: <span id="budgetTotalDisplay">0</span> Bs</label>
                  <input type="hidden" id="budgetTotal" value="0">
                </div>
              </div>

              <div class="form-row-3">
                <div class="form-group">
                  <label>Fecha de Validez</label>
                  <input type="date" class="form-control" id="budgetValidUntil">
                </div>
                <div class="form-group">
                  <label>Tiempo Estimado</label>
                  <input type="text" class="form-control" id="budgetEstimatedTime" placeholder="Ej: 3 días">
                </div>
                <div class="form-group">
                  <label>📍 Dirección del Trabajo</label>
                  <input type="text" class="form-control" id="budgetAddressInput" placeholder="Dirección donde se realizará el trabajo">
                </div>
              </div>
              <div class="form-group">
                <label>Condiciones</label>
                <textarea class="form-control" id="budgetConditions" rows="2" placeholder="Condiciones de la cotización..."></textarea>
              </div>
              <div class="form-group">
                <label>Observaciones</label>
                <textarea class="form-control" id="budgetObservations" rows="2" placeholder="Observaciones adicionales..."></textarea>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="BudgetsModule.closeModal()">Cancelar</button>
            <button class="btn btn-secondary" onclick="BudgetsModule.saveDraft()">📄 Guardar Borrador</button>
            <button class="btn btn-primary" onclick="BudgetsModule.saveAndSend()">📨 Guardar y Enviar</button>
          </div>
        </div>
      </div>
    `;

        document.getElementById('searchBudget')?.addEventListener('input', () => this.filter());
        document.getElementById('filterBudgetStatus')?.addEventListener('change', () => this.filter());
    },

    budgetItems: [],

    renderTableRows(budgets, clients) {
        if (budgets.length === 0) {
            return `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gray-500);">
        <div style="font-size:40px;margin-bottom:10px;">📋</div>
        No hay presupuestos registrados.
      </td></tr>`;
        }

        const getStatusBadge = (status) => {
            const map = {
                borrador: 'badge-borrador',
                enviado: 'badge-enviado',
                aprobado: 'badge-aprobado',
                rechazado: 'badge-rechazado'
            };
            return `<span class="badge ${map[status] || 'badge-borrador'}"><span class="dot"></span> ${status.charAt(0).toUpperCase() + status.slice(1)
                }</span>`;
        };

        return budgets.map(b => {
            const client = clients.find(c => c.id === b.clientId);
            const clientEmail = client?.email || '';
            const emailSubject = encodeURIComponent(`Presupuesto SYSTEMHOME ${b.number} - ${b.serviceType}`);
            const emailBody = encodeURIComponent(`Estimado/a ${client?.name || 'Cliente'},\n\nLe enviamos el presupuesto ${b.number} para el servicio de ${b.serviceType}.\nTotal: ${Number(b.total || 0).toLocaleString('es-PY')} Bs.\n\nPara aprobar o consultar, por favor contáctenos al WhatsApp +591 64595762 o ingrese a nuestro portal.\n\nAtentamente,\nSYSTEMHOME Security`);
            const mailtoUrl = clientEmail ? `mailto:${clientEmail}?subject=${emailSubject}&body=${emailBody}` : '#';

            return `<tr>
          <td><strong>${this.escapeHtml(b.number)}</strong></td>
          <td>${client ? this.escapeHtml(client.name) : 'Eliminado'}</td>
          <td>${this.getServiceLabel(b.serviceType)}</td>
          <td><strong>${DB.formatCurrency(b.total || 0)}</strong></td>
          <td>${DB.formatDate(b.createdAt)}</td>
          <td>${getStatusBadge(b.status)}</td>
          <td>
            <div class="actions" style="display:flex;gap:4px;flex-wrap:wrap;">
              <button class="btn btn-sm btn-secondary" onclick="BudgetsModule.view(${b.id})" title="Ver detalle">👁️</button>
              <button class="btn btn-sm btn-secondary" onclick="DB.exportBudgetPdf(${b.id})" title="Descargar Cotización PDF">📄 PDF</button>
              ${clientEmail ? `
                <a href="${mailtoUrl}" class="btn btn-sm btn-info" title="Enviar por Correo a ${clientEmail}">✉️</a>
              ` : ''}
              <button class="btn btn-sm btn-secondary" onclick="BudgetsModule.edit(${b.id})" title="Editar">✏️</button>
              ${b.status === 'borrador' ? `<button class="btn btn-sm btn-primary" onclick="BudgetsModule.sendToClient(${b.id})" title="Enviar cotización al portal">📨</button>` : ''}
              ${b.status === 'enviado' ? `<button class="btn btn-sm btn-success" onclick="BudgetsModule.approve(${b.id})" title="Aprobar">✅</button>` : ''}
              ${b.status === 'enviado' ? `<button class="btn btn-sm btn-danger" onclick="BudgetsModule.reject(${b.id})" title="Rechazar">❌</button>` : ''}
              ${b.status === 'aprobado' ? `<button class="btn btn-sm btn-success" onclick="BudgetsModule.createOrder(${b.id})" title="Crear orden de trabajo">🔧</button>` : ''}
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

    getServiceLabel(type) {
        const map = {
            camaras: 'Cámaras',
            alarma: 'Alarmas',
            ac: 'A/Acondicionado',
            cerca: 'Cerca Eléctrica',
            video: 'Video Portero',
            electricidad: 'Electricidad',
            cableado: 'Cableado Estruct.',
            redes: 'Redes/Internet',
            otro: 'Otro'
        };
        return map[type] || type;
    },

    filter() {
        const search = (document.getElementById('searchBudget')?.value || '').toLowerCase();
        const statusFilter = document.getElementById('filterBudgetStatus')?.value || 'all';
        const clients = DB.getClients();

        let budgets = DB.getBudgets();
        if (search) {
            budgets = budgets.filter(b => {
                const client = clients.find(c => c.id === b.clientId);
                return (b.number && b.number.toLowerCase().includes(search)) ||
                    (client && client.name.toLowerCase().includes(search));
            });
        }
        if (statusFilter !== 'all') {
            budgets = budgets.filter(b => b.status === statusFilter);
        }

        const tbody = document.getElementById('budgetsTableBody');
        if (tbody) tbody.innerHTML = this.renderTableRows(budgets, clients);
    },

    calculateTotal() {
        const itemsTotal = this.budgetItems.reduce((sum, item) => sum + (item.qty * item.price), 0);
        const labor = parseFloat(document.getElementById('budgetLabor')?.value) || 0;
        const discount = parseFloat(document.getElementById('budgetDiscount')?.value) || 0;
        const total = itemsTotal + labor - discount;
        const display = document.getElementById('budgetTotalDisplay');
        if (display) display.textContent = total.toLocaleString('es-PY');
        document.getElementById('budgetTotal').value = total;
        return total;
    },

    addItem() {
        const concept = document.getElementById('itemConcept')?.value.trim();
        const qty = parseInt(document.getElementById('itemQty')?.value) || 1;
        const price = parseFloat(document.getElementById('itemPrice')?.value) || 0;

        if (!concept) {
            App.showToast('Ingrese un concepto para la línea', 'warning');
            return;
        }

        this.budgetItems.push({ concept, qty, price });
        this.renderItems();
        this.calculateTotal();

        // Clear inputs
        document.getElementById('itemConcept').value = '';
        document.getElementById('itemQty').value = '1';
        document.getElementById('itemPrice').value = '0';
    },

    removeItem(index) {
        this.budgetItems.splice(index, 1);
        this.renderItems();
        this.calculateTotal();
    },

    renderItems() {
        const tbody = document.getElementById('budgetItemsBody');
        if (!tbody) return;

        if (this.budgetItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:20px;">
            No hay líneas agregadas. Agregue conceptos arriba.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.budgetItems.map((item, i) => `
      <tr>
        <td>${this.escapeHtml(item.concept)}</td>
        <td>${item.qty}</td>
        <td>${DB.formatCurrency(item.price)}</td>
        <td><strong>${DB.formatCurrency(item.qty * item.price)}</strong></td>
        <td><button class="btn btn-sm btn-danger" onclick="BudgetsModule.removeItem(${i})">🗑️</button></td>
      </tr>
    `).join('');
    },

    openModal(budgetId) {
        if (!document.getElementById('budgetModal')) {
            this.render();
        }

        this.currentBudgetId = budgetId || null;
        this.budgetItems = [];

        const modal = document.getElementById('budgetModal');
        const title = document.getElementById('budgetModalTitle');
        const form = document.getElementById('budgetForm');

        if (!modal || !title || !form) {
            return;
        }

        if (budgetId) {
            const budget = DB.getBudget(budgetId);
            if (!budget) return;
            title.textContent = `Editar Presupuesto ${budget.number}`;
            document.getElementById('budgetId').value = budget.id;
            document.getElementById('budgetClient').value = budget.clientId;
            document.getElementById('budgetService').value = budget.serviceType || '';
            document.getElementById('budgetDescription').value = budget.description || '';
            document.getElementById('budgetLabor').value = budget.labor || 0;
            document.getElementById('budgetDiscount').value = budget.discount || 0;
            this.budgetItems = budget.items || [];
            this.renderItems();
            this.calculateTotal();
        } else {
            title.textContent = 'Nuevo Presupuesto';
            form.reset();
            document.getElementById('budgetId').value = '';
            this.budgetItems = [];
            this.renderItems();
            this.calculateTotal();
        }

        document.querySelectorAll('.form-error').forEach(el => el.classList.remove('show'));
        document.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));
        modal.classList.add('show');
    },

    closeModal() {
        document.getElementById('budgetModal')?.classList.remove('show');
        this.currentBudgetId = null;
        this.budgetItems = [];
    },

    validate() {
        let valid = true;
        const fields = [
            { id: 'budgetClient', errId: 'err-budget-client' },
            { id: 'budgetService', errId: 'err-budget-service' },
        ];

        fields.forEach(f => {
            const el = document.getElementById(f.id);
            const err = document.getElementById(f.errId);
            if (!el || !el.value) {
                valid = false;
                if (el) el.classList.add('error');
                if (err) err.classList.add('show');
            } else {
                if (el) el.classList.remove('error');
                if (err) err.classList.remove('show');
            }
        });

        return valid;
    },

    getFormData() {
        return {
            clientId: parseInt(document.getElementById('budgetClient').value),
            requestId: parseInt(document.getElementById('budgetRequestId').value) || null,
            serviceType: document.getElementById('budgetService').value,
            description: document.getElementById('budgetDescription').value.trim(),
            items: this.budgetItems,
            labor: parseFloat(document.getElementById('budgetLabor').value) || 0,
            discount: parseFloat(document.getElementById('budgetDiscount').value) || 0,
            total: parseFloat(document.getElementById('budgetTotal').value) || 0,
            validUntil: document.getElementById('budgetValidUntil')?.value || '',
            conditions: document.getElementById('budgetConditions')?.value.trim() || '',
            observations: document.getElementById('budgetObservations')?.value.trim() || '',
            estimatedTime: document.getElementById('budgetEstimatedTime')?.value.trim() || '',
            address: document.getElementById('budgetAddressInput')?.value.trim() || document.getElementById('budgetAddress')?.value || '',
            latitude: parseFloat(document.getElementById('budgetLatitude')?.value) || null,
            longitude: parseFloat(document.getElementById('budgetLongitude')?.value) || null,
            reference: document.getElementById('budgetReference')?.value || '',
        };
    },

    saveDraft() {
        if (!this.validate()) return;
        const data = this.getFormData();
        data.status = 'borrador';

        const id = parseInt(document.getElementById('budgetId').value);
        if (id) {
            DB.updateBudget(id, data);
            App.showNotification('Presupuesto actualizado', 'success');
        } else {
            DB.addBudget(data);
            App.showNotification('Presupuesto guardado como borrador', 'success');
        }
        this.closeModal();
        this.render();
    },

    saveAndSend() {
        if (!this.validate()) return;
        const data = this.getFormData();
        data.status = 'enviado';

        const id = parseInt(document.getElementById('budgetId').value);
        if (id) {
            DB.updateBudget(id, data);
            App.showNotification('Presupuesto actualizado y enviado', 'success');
        } else {
            DB.addBudget(data);
            App.showNotification('Presupuesto creado y enviado al cliente', 'success');
        }
        this.closeModal();
        this.render();
    },

    edit(id) {
        this.openModal(id);
    },

    view(id) {
        const budget = DB.getBudget(id);
        if (!budget) return;
        const client = DB.getClient(budget.clientId);
        const items = budget.items || [];
        const waText = encodeURIComponent(`Hola ${client ? client.name : 'Cliente'}, adjuntamos el detalle del Presupuesto ${budget.number} por un total de ${DB.formatCurrency(budget.total)}.`);

        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.innerHTML = `
          <div class="modal modal-lg">
            <div class="modal-header" style="background:#1e293b;color:white;">
              <div>
                <h3 style="margin:0;color:white;">📄 Detalle de Presupuesto: ${this.escapeHtml(budget.number)}</h3>
                <span style="font-size:0.85rem;color:#94a3b8;">SYSTEMHOME Security</span>
              </div>
              <button class="modal-close" style="color:white;" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
              <div style="display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding-bottom:1rem;margin-bottom:1rem;">
                <div>
                  <h4 style="margin:0 0 4px 0;color:#1a56db;">Cliente: ${client ? this.escapeHtml(client.name) : 'No asignado'}</h4>
                  <div style="font-size:0.85rem;color:#64748b;">RUC/CI: ${client?.ruc || '-'} · Tel: ${client?.phone || '-'} · Email: ${client?.email || '-'}</div>
                  <div style="font-size:0.85rem;color:#64748b;">Servicio: <strong>${this.getServiceLabel(budget.serviceType)}</strong></div>
                </div>
                <div style="text-align:right;">
                  <span class="badge badge-${budget.status === 'aprobado' ? 'success' : budget.status === 'enviado' ? 'info' : 'warning'}">${budget.status.toUpperCase()}</span>
                  <div style="font-size:0.85rem;color:#64748b;margin-top:4px;">Fecha: ${DB.formatDate(budget.createdAt)}</div>
                </div>
              </div>

              ${budget.address ? `<div style="background:#f8fafc;padding:8px 12px;border-radius:6px;font-size:0.85rem;margin-bottom:1rem;">📍 <strong>Ubicación:</strong> ${this.escapeHtml(budget.address)} ${budget.latitude ? `(${budget.latitude.toFixed(5)}, ${budget.longitude.toFixed(5)})` : ''}</div>` : ''}

              <table class="data-table" style="font-size:0.9rem;">
                <thead>
                  <tr>
                    <th>Concepto / Material</th>
                    <th>Cantidad</th>
                    <th>P. Unitario</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map(it => `
                    <tr>
                      <td>${this.escapeHtml(it.concept || it.name)}</td>
                      <td>${it.quantity}</td>
                      <td>${DB.formatCurrency(it.unitPrice || it.price || 0)}</td>
                      <td><strong>${DB.formatCurrency((it.quantity || 1) * (it.unitPrice || it.price || 0))}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>

              <div style="margin-top:1.2rem;text-align:right;border-top:1px solid #e2e8f0;padding-top:0.8rem;">
                <div style="font-size:1.3rem;font-weight:700;color:#1a56db;">
                  TOTAL: ${DB.formatCurrency(budget.total)}
                </div>
              </div>

              <div style="display:flex;gap:8px;margin-top:1.5rem;flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="DB.exportBudgetPdf(${budget.id})">
                  📥 Descargar PDF
                </button>
                <a href="https://wa.me/59164595762?text=${waText}" target="_blank" class="btn btn-success">
                  📱 Compartir por WhatsApp
                </a>
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
    },

    sendToClient(id) {
        const budget = DB.getBudget(id);
        if (!budget) return;
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.innerHTML = `
      <div class="modal modal-lg" style="max-width:550px;">
        <div class="modal-header">
          <h3>📨 Enviar Cotización al Cliente</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div style="background:#f0f9ff;border-left:4px solid #3b82f6;padding:16px;border-radius:8px;margin-bottom:20px;">
            <p style="margin:0;font-weight:600;color:#1e3a8a;">Cotización #${this.escapeHtml(budget.number)}</p>
            <p style="margin:4px 0 0 0;font-size:14px;color:#475569;">Se enviará al cliente con opción de aprobar o rechazar</p>
          </div>
          
          <form id="sendBudgetForm">
            <div class="form-group">
              <label>Mensaje personalizado (opcional)</label>
              <textarea class="form-control" id="budgetSendMessage" placeholder="Agregue un mensaje especial para el cliente..." style="min-height:100px;resize:vertical;"></textarea>
              <p style="font-size:12px;color:#6b7280;margin:6px 0 0 0;">El cliente recibirá esta cotización junto con el PDF detallado</p>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="BudgetsModule._doSendToClient(${id}, document.getElementById('budgetSendMessage').value); this.closest('.modal-overlay').remove();">
            ✅ Enviar Ahora
          </button>
        </div>
      </div>
    `;
        document.body.appendChild(modal);
    },

    _doSendToClient(id, message) {
        DB.sendBudget(id);
        if (message) {
            DB.addNotification(`Cotización #${id} enviada`, message, 'budget_sent', 'info');
        }
        App.showNotification('📨 Cotización enviada al cliente. Puede ver la respuesta cuando apruebe o rechace.', 'success');
        this.render();
    },

    send(id) {
        this.sendToClient(id);
    },

  approve(id) {
    if (confirm('¿Aprobar este presupuesto? Se generará la orden de trabajo automáticamente.')) {
      const res = DB.approveBudget(id);
      if (res && res.workOrderNumber) {
        App.showToast(`Cotización aprobada. Orden ${res.workOrderNumber} generada`, 'success');
      } else {
        App.showToast('Presupuesto aprobado', 'success');
      }
      this.render();
    }
  },

    reject(id) {
        const reason = prompt('Indique el motivo del rechazo (opcional):');
        DB.rejectBudget(id, reason);
        App.showToast('Cotización rechazada', 'warning');
        this.render();
    },

    createOrder(id) {
        const budget = DB.getBudget(id);
        if (!budget) return;
        if (budget.status !== 'aprobado') {
            App.showToast('Solo se pueden crear órdenes desde cotizaciones aprobadas', 'warning');
            return;
        }
        const technicians = DB.getTechnicians();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.innerHTML = `
      <div class="modal" style="max-width:500px;">
        <div class="modal-header">
          <h3>🔧 Crear Orden de Trabajo</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px;">
            Cotización <strong>${this.escapeHtml(budget.number)}</strong> aprobada. Se creará la orden de trabajo.
          </p>
          <div class="form-group">
            <label>Técnico Asignado</label>
            <select class="form-control" id="orderTechnician">
              <option value="">Sin asignar</option>
              ${technicians.filter(t => t.active).map(t => `<option value="${t.id}">${this.escapeHtml(t.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Prioridad</label>
            <select class="form-control" id="orderPriority">
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="baja">Baja</option>
            </select>
          </div>
          <div class="form-group">
            <label>Fecha Programada</label>
            <input type="date" class="form-control" id="orderScheduledDate">
          </div>
          <div class="form-group">
            <label>Descripción</label>
            <textarea class="form-control" id="orderDescription" rows="3">${this.escapeHtml(budget.description || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="BudgetsModule.saveOrder(${id})">🔧 Crear Orden</button>
        </div>
      </div>
    `;
        document.body.appendChild(modal);
    },

    saveOrder(budgetId) {
        const budget = DB.getBudget(budgetId);
        const technicianId = parseInt(document.getElementById('orderTechnician').value) || null;
        const priority = document.getElementById('orderPriority').value;
        const scheduledDate = document.getElementById('orderScheduledDate').value;
        const description = document.getElementById('orderDescription').value.trim();

        const order = DB.addWorkOrder({
            budgetId,
            technicianId,
            serviceType: budget.serviceType,
            priority,
            scheduledDate,
            description: description || budget.description || '',
            status: 'pendiente',
            observations: [],
            address: budget.address,
            latitude: budget.latitude,
            longitude: budget.longitude
        });

        if (order) {
            App.showToast(`Orden de trabajo ${order.number} creada`, 'success');
            document.querySelector('.modal-overlay.show').remove();
            this.render();
        } else {
            App.showToast('No se pudo crear la orden', 'error');
        }
    },
};
