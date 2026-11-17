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
          <button class="btn btn-secondary" onclick="BudgetsModule.quickQuote()" title="Cotizar sin seleccionar cliente ni crear venta">
            ⚡ Cotización rápida
          </button>
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
                  <label>Cliente registrado (opcional)</label>
                  <select class="form-control" id="budgetClient">
                    <option value="">-- Cliente no registrado / prospecto --</option>
                    ${clients.filter(c => c.active).map(c =>
            `<option value="${c.id}">${this.escapeHtml(c.name)} - ${this.escapeHtml(c.ruc || '')}</option>`
        ).join('')}
                  </select>
                  <small style="font-size:12px;color:var(--gray-500);">Deje vacío si la cotización es para un cliente que llegó por WhatsApp.</small>
                  <div class="form-error" id="err-budget-client"></div>
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

              <div id="prospectFields" class="form-row">
                <div class="form-group">
                  <label>Nombre del Cliente (opcional)</label>
                  <input type="text" class="form-control" id="prospectName" placeholder="Ej: Juan Pérez">
                </div>
                <div class="form-group">
                  <label>Teléfono / WhatsApp (opcional)</label>
                  <input type="text" class="form-control" id="prospectPhone" placeholder="0981 123 456">
                </div>
                <div class="form-group">
                  <label>Correo Electrónico (opcional)</label>
                  <input type="email" class="form-control" id="prospectEmail" placeholder="cliente@correo.com">
                </div>
              </div>
              <div class="form-group" id="prospectRucGroup">
                <label>RUC / CI (opcional)</label>
                <input type="text" class="form-control" id="prospectRuc" placeholder="S/N">
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
                      <label>Precio Unit. (Bs.)</label>
                      <input type="number" class="form-control" id="itemPrice" value="0" min="0">
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="form-group">
                      <label>Descuento de línea (%)</label>
                      <input type="number" class="form-control" id="itemDiscount" value="0" min="0" max="100">
                    </div>
                    <div class="form-group">
                      <label>Notas (opcional)</label>
                      <input type="text" class="form-control" id="itemNotes" placeholder="Ej: instalación incluida">
                    </div>
                  </div>
                  <button class="btn btn-sm btn-secondary" onclick="BudgetsModule.addItem()" style="margin-top:4px;">➕ Agregar línea</button>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th style="width:42%;">Concepto</th>
                      <th>Cant.</th>
                      <th>Precio Unit.</th>
                      <th>Dto.</th>
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
                  <label>Mano de Obra (Bs.)</label>
                  <input type="number" class="form-control" id="budgetLabor" value="0" min="0">
                </div>
                <div class="form-group">
                  <label>Descuento general (Bs.)</label>
                  <input type="number" class="form-control" id="budgetDiscount" value="0" min="0">
                </div>
                <div class="form-group">
                  <label>Impuestos / gastos (Bs.)</label>
                  <input type="number" class="form-control" id="budgetTax" value="0" min="0">
                </div>
              </div>
              <div class="form-group" style="text-align:right;">
                <label style="font-size:16px;font-weight:700;color:var(--primary);">Total: <span id="budgetTotalDisplay">0</span> Bs.</label>
                <input type="hidden" id="budgetTotal" value="0">
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
            <button class="btn btn-info" onclick="BudgetsModule.saveAndDownload()" title="Solo cotizar: guarda y descarga el PDF sin crear venta">📄 Guardar y descargar PDF</button>
            <button class="btn btn-primary" onclick="BudgetsModule.saveAndSend()">📨 Guardar y Enviar</button>
          </div>
        </div>
      </div>
    `;

        document.getElementById('searchBudget')?.addEventListener('input', () => this.filter());
        document.getElementById('filterBudgetStatus')?.addEventListener('change', () => this.filter());
        document.getElementById('budgetClient')?.addEventListener('change', () => this.toggleProspectFields());
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
            const displayName = client?.name || b.prospectName || 'Prospecto';
            const recipient = client?.email || b.prospectEmail || '';
            const phone = client?.phone || b.prospectPhone || '';
            const waText = encodeURIComponent(`Hola ${displayName}, le compartimos la cotización ${b.number} por Bs. ${Number(b.total || 0).toLocaleString('es-PY')}.`);
            const waUrl = phone
                ? `https://wa.me/591${String(phone).replace(/\D/g, '')}?text=${waText}`
                : '';

            return `<tr>
          <td><strong>${this.escapeHtml(b.number)}</strong></td>
          <td>
            <strong>${this.escapeHtml(displayName)}</strong>
            ${client ? '' : '<span class="badge badge-borrador" style="margin-left:4px;">Prospecto</span>'}
            <br><small style="color:var(--gray-500);">${this.escapeHtml(recipient || phone || 'Sin contacto')}</small>
          </td>
          <td>${this.getServiceLabel(b.serviceType)}</td>
          <td><strong>${DB.formatCurrency(b.total || 0)}</strong></td>
          <td>${DB.formatDate(b.createdAt)}</td>
          <td>${getStatusBadge(b.status)}${b.sentAt ? '<br><small style="color:var(--gray-500);">Correo enviado</small>' : ''}</td>
          <td>
            <div class="actions" style="display:flex;gap:4px;flex-wrap:wrap;">
              <button class="btn btn-sm btn-secondary" onclick="BudgetsModule.view(${b.id})" title="Ver detalle">👁️</button>
              <button class="btn btn-sm btn-secondary" onclick="BudgetsModule.downloadPdf(${b.id}, '${b.number}')" title="Descargar PDF">📄 PDF</button>
              <button class="btn btn-sm btn-info" onclick="BudgetsModule.openEmailModal(${b.id})" title="Enviar por correo real con PDF">✉️ Correo</button>
              ${waUrl ? `<a href="${waUrl}" target="_blank" class="btn btn-sm btn-success" title="Compartir por WhatsApp">📱</a>` : ''}
              <button class="btn btn-sm btn-secondary" onclick="BudgetsModule.edit(${b.id})" title="Editar">✏️</button>
              ${b.status === 'borrador' ? `<button class="btn btn-sm btn-primary" onclick="BudgetsModule.sendToClient(${b.id})" title="Marcar como enviado al portal">📨</button>` : ''}
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
                    (client && client.name.toLowerCase().includes(search)) ||
                    String(b.prospectName || '').toLowerCase().includes(search) ||
                    String(b.prospectPhone || '').toLowerCase().includes(search) ||
                    String(b.prospectEmail || '').toLowerCase().includes(search);
            });
        }
        if (statusFilter !== 'all') {
            budgets = budgets.filter(b => b.status === statusFilter);
        }

        const tbody = document.getElementById('budgetsTableBody');
        if (tbody) tbody.innerHTML = this.renderTableRows(budgets, clients);
    },

    itemSubtotal(item) {
        const qty = Number(item.qty || item.quantity || 1) || 1;
        const price = Number(item.price || item.unitPrice || 0) || 0;
        const discountPercent = Number(item.discountPercent || 0) || 0;
        return qty * price * (1 - discountPercent / 100);
    },

    calculateTotal() {
        const itemsTotal = this.budgetItems.reduce((sum, item) => sum + this.itemSubtotal(item), 0);
        const labor = parseFloat(document.getElementById('budgetLabor')?.value) || 0;
        const discount = parseFloat(document.getElementById('budgetDiscount')?.value) || 0;
        const tax = parseFloat(document.getElementById('budgetTax')?.value) || 0;
        const total = itemsTotal + labor - discount + tax;
        const display = document.getElementById('budgetTotalDisplay');
        if (display) display.textContent = total.toLocaleString('es-PY');
        document.getElementById('budgetTotal').value = total;
        return total;
    },

    addItem() {
        const concept = document.getElementById('itemConcept')?.value.trim();
        const qty = parseInt(document.getElementById('itemQty')?.value) || 1;
        const price = parseFloat(document.getElementById('itemPrice')?.value) || 0;
        const discountPercent = parseFloat(document.getElementById('itemDiscount')?.value) || 0;
        const notes = document.getElementById('itemNotes')?.value.trim() || '';

        if (!concept) {
            App.showToast('Ingrese un concepto para la línea', 'warning');
            return;
        }
        if (discountPercent < 0 || discountPercent > 100) {
            App.showToast('El descuento debe estar entre 0 y 100', 'warning');
            return;
        }

        this.budgetItems.push({ concept, qty, quantity: qty, price, unitPrice: price, discountPercent, notes });
        this.renderItems();
        this.calculateTotal();

        document.getElementById('itemConcept').value = '';
        document.getElementById('itemQty').value = '1';
        document.getElementById('itemPrice').value = '0';
        document.getElementById('itemDiscount').value = '0';
        document.getElementById('itemNotes').value = '';
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
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px;">
            No hay líneas agregadas. Agregue conceptos arriba.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.budgetItems.map((item, i) => `
      <tr>
        <td>${this.escapeHtml(item.concept)}${item.notes ? `<br><small style="color:var(--gray-500);">${this.escapeHtml(item.notes)}</small>` : ''}</td>
        <td>${item.qty || item.quantity || 1}</td>
        <td>${DB.formatCurrency(item.price || item.unitPrice || 0)}</td>
        <td>${item.discountPercent || 0}%</td>
        <td><strong>${DB.formatCurrency(this.itemSubtotal(item))}</strong></td>
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
            document.getElementById('budgetClient').value = budget.clientId || '';
            document.getElementById('budgetRequestId').value = budget.requestId || '';
            document.getElementById('budgetService').value = budget.serviceType || '';
            document.getElementById('budgetDescription').value = budget.description || '';
            document.getElementById('budgetLabor').value = budget.labor || 0;
            document.getElementById('budgetDiscount').value = budget.discount || 0;
            document.getElementById('budgetTax').value = budget.tax || 0;
            document.getElementById('budgetValidUntil').value = budget.validUntil || '';
            document.getElementById('budgetEstimatedTime').value = budget.estimatedTime || '';
            document.getElementById('budgetAddressInput').value = budget.address || '';
            document.getElementById('budgetConditions').value = budget.conditions || '';
            document.getElementById('budgetObservations').value = budget.observations || '';
            document.getElementById('prospectName').value = budget.prospectName || '';
            document.getElementById('prospectPhone').value = budget.prospectPhone || '';
            document.getElementById('prospectEmail').value = budget.prospectEmail || '';
            document.getElementById('prospectRuc').value = budget.prospectRuc || '';
            this.budgetItems = (budget.items || []).map(item => ({
                concept: item.concept || item.name || 'Item',
                qty: Number(item.qty || item.quantity || 1),
                quantity: Number(item.qty || item.quantity || 1),
                price: Number(item.price || item.unitPrice || 0),
                unitPrice: Number(item.price || item.unitPrice || 0),
                discountPercent: Number(item.discountPercent || 0),
                notes: item.notes || ''
            }));
        } else {
            title.textContent = 'Nuevo Presupuesto (cliente registrado o prospecto)';
            form.reset();
            document.getElementById('budgetId').value = '';
            document.getElementById('budgetLabor').value = '0';
            document.getElementById('budgetDiscount').value = '0';
            document.getElementById('budgetTax').value = '0';
            this.budgetItems = [];
        }
        this.toggleProspectFields();
        this.renderItems();
        this.calculateTotal();

        document.querySelectorAll('.form-error').forEach(el => el.classList.remove('show'));
        document.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));
        modal.classList.add('show');
    },

    toggleProspectFields() {
        const clientId = parseInt(document.getElementById('budgetClient')?.value) || null;
        const visible = !clientId;
        ['prospectFields', 'prospectRucGroup'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = visible ? '' : 'none';
        });
        ['prospectName', 'prospectPhone', 'prospectEmail'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.required = false; // Datos de contacto opcionales: se puede cotizar sin cliente.
        });
    },

    closeModal() {
        document.getElementById('budgetModal')?.classList.remove('show');
        this.currentBudgetId = null;
        this.budgetItems = [];
    },

    quickQuote() {
        this.openModal();
        const title = document.getElementById('budgetModalTitle');
        if (title) title.textContent = '⚡ Cotización rápida (sin cliente)';
        const client = document.getElementById('budgetClient');
        if (client) client.value = '';
        const name = document.getElementById('prospectName');
        if (name) name.value = 'Cliente ocasional';
        this.toggleProspectFields();
        document.getElementById('budgetService')?.focus();
    },

    async downloadPdf(id, number = '') {
        try {
            const result = await DB.downloadBudgetPdf(id, number);
            App.showToast(`PDF descargado: ${result.filename}`, 'success');
        } catch (err) {
            App.showToast(err.message || 'No se pudo descargar el PDF', 'error');
        }
    },

    async saveAndDownload() {
        if (!this.validate()) return;
        const data = this.getFormData();
        data.status = 'borrador';
        const id = parseInt(document.getElementById('budgetId').value);
        const btn = [...document.querySelectorAll('#budgetModal .modal-footer .btn')].find(b => b.textContent.includes('descargar'));
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando PDF...'; }
        try {
            const result = id
                ? await DB.updateBudgetAsync(id, data)
                : await DB.addBudgetAsync(data);
            const savedId = result?.budget?.id || id || result?.id;
            const budget = result?.budget || DB.getBudget(savedId);
            this.closeModal();
            this.render();
            if (budget?.id) {
                await this.downloadPdf(budget.id, budget.number);
                App.showToast(`Cotización ${budget.number} lista. No se creó ninguna venta.`, 'success');
            }
        } catch (err) {
            App.showToast(err.message || 'No se pudo guardar la cotización', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '📄 Guardar y descargar PDF'; }
        }
    },

    validate() {
        let valid = true;
        const serviceEl = document.getElementById('budgetService');
        const serviceErr = document.getElementById('err-budget-service');
        if (!serviceEl?.value) {
            valid = false;
            serviceEl?.classList.add('error');
            serviceErr?.classList.add('show');
        } else {
            serviceEl?.classList.remove('error');
            serviceErr?.classList.remove('show');
        }

        // El cliente registrado es opcional. Si no se carga, se usa "Cliente ocasional".
        document.getElementById('err-budget-client')?.classList.remove('show');

        return valid;
    },

    getFormData() {
        return {
            clientId: parseInt(document.getElementById('budgetClient')?.value) || null,
            requestId: parseInt(document.getElementById('budgetRequestId')?.value) || null,
            serviceType: document.getElementById('budgetService').value,
            description: document.getElementById('budgetDescription').value.trim(),
            items: this.budgetItems.map(item => ({
                concept: item.concept || item.name || 'Item',
                qty: Number(item.qty || item.quantity || 1),
                quantity: Number(item.qty || item.quantity || 1),
                price: Number(item.price || item.unitPrice || 0),
                unitPrice: Number(item.price || item.unitPrice || 0),
                discountPercent: Number(item.discountPercent || 0),
                notes: item.notes || '',
                subtotal: this.itemSubtotal(item)
            })),
            labor: parseFloat(document.getElementById('budgetLabor').value) || 0,
            discount: parseFloat(document.getElementById('budgetDiscount').value) || 0,
            tax: parseFloat(document.getElementById('budgetTax').value) || 0,
            total: parseFloat(document.getElementById('budgetTotal').value) || 0,
            validUntil: document.getElementById('budgetValidUntil')?.value || '',
            conditions: document.getElementById('budgetConditions')?.value.trim() || '',
            observations: document.getElementById('budgetObservations')?.value.trim() || '',
            estimatedTime: document.getElementById('budgetEstimatedTime')?.value.trim() || '',
            address: document.getElementById('budgetAddressInput')?.value.trim() || document.getElementById('budgetAddress')?.value || '',
            latitude: parseFloat(document.getElementById('budgetLatitude')?.value) || null,
            longitude: parseFloat(document.getElementById('budgetLongitude')?.value) || null,
            reference: document.getElementById('budgetReference')?.value || '',
            prospectName: document.getElementById('prospectName')?.value.trim() || 'Cliente ocasional',
            prospectPhone: document.getElementById('prospectPhone')?.value.trim() || '',
            prospectEmail: document.getElementById('prospectEmail')?.value.trim() || '',
            prospectRuc: document.getElementById('prospectRuc')?.value.trim() || '',
        };
    },

    async saveDraft() {
        if (!this.validate()) return;
        const data = this.getFormData();
        data.status = 'borrador';

        const id = parseInt(document.getElementById('budgetId').value);
        const btn = document.querySelector('#budgetModal .modal-footer .btn-primary');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }
        try {
            if (id) await DB.updateBudgetAsync(id, data);
            else await DB.addBudgetAsync(data);
            App.showNotification(id ? 'Presupuesto actualizado' : 'Presupuesto guardado como borrador', 'success');
            this.closeModal();
            this.render();
        } catch (err) {
            App.showNotification(err.message || 'No se pudo guardar el presupuesto', 'error');
            if (btn) { btn.disabled = false; btn.textContent = '📨 Guardar y Enviar'; }
        }
    },

    async saveAndSend() {
        if (!this.validate()) return;
        const data = this.getFormData();
        data.status = 'enviado';

        const id = parseInt(document.getElementById('budgetId').value);
        const btn = document.querySelector('#budgetModal .modal-footer .btn-primary');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }
        try {
            const result = id
                ? await DB.updateBudgetAsync(id, data)
                : await DB.addBudgetAsync(data);
            const budget = result?.budget || DB.getBudget(id);
            App.showNotification('Presupuesto guardado y enviado al portal del cliente', 'success');
            this.closeModal();
            this.render();
            if (budget) {
                const recipient = budget.prospectEmail || DB.getClient(budget.clientId)?.email || '';
                if (recipient && confirm('¿Desea enviar también la cotización por correo con el PDF adjunto?')) {
                    await this.sendEmailNow(budget.id, recipient, '');
                }
            }
        } catch (err) {
            App.showNotification(err.message || 'No se pudo guardar el presupuesto', 'error');
            if (btn) { btn.disabled = false; btn.textContent = '📨 Guardar y Enviar'; }
        }
    },

    edit(id) {
        this.openModal(id);
    },

    view(id) {
        const budget = DB.getBudget(id);
        if (!budget) return;
        const client = DB.getClient(budget.clientId);
        const displayName = client?.name || budget.prospectName || 'Cliente';
        const displayRuc = client?.ruc || budget.prospectRuc || '-';
        const displayPhone = client?.phone || budget.prospectPhone || '-';
        const displayEmail = client?.email || budget.prospectEmail || '';
        const items = budget.items || [];
        const waText = encodeURIComponent(`Hola ${displayName}, adjuntamos el detalle del Presupuesto ${budget.number} por un total de ${DB.formatCurrency(budget.total)}.`);

        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.innerHTML = `
          <div class="modal modal-lg">
            <div class="modal-header" style="background:linear-gradient(135deg,#0b1f3a,#0e7490);color:white;">
              <div>
                <h3 style="margin:0;color:white;">📄 Detalle de Presupuesto: ${this.escapeHtml(budget.number)}</h3>
                <span style="font-size:0.85rem;color:#cbd5e1;">SYSTEMHOME Security</span>
              </div>
              <button class="modal-close" style="color:white;" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
              <div style="display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding-bottom:1rem;margin-bottom:1rem;">
                <div>
                  <h4 style="margin:0 0 4px 0;color:#0e7490;">${this.escapeHtml(displayName)}
                    ${client ? '' : '<span class="badge badge-borrador">Prospecto</span>'}
                  </h4>
                  <div style="font-size:0.85rem;color:#64748b;">RUC/CI: ${this.escapeHtml(displayRuc)} · Tel: ${this.escapeHtml(displayPhone)} · Email: ${this.escapeHtml(displayEmail || '-')}</div>
                  <div style="font-size:0.85rem;color:#64748b;">Servicio: <strong>${this.getServiceLabel(budget.serviceType)}</strong></div>
                </div>
                <div style="text-align:right;">
                  <span class="badge badge-${budget.status === 'aprobado' ? 'success' : budget.status === 'enviado' ? 'info' : 'warning'}">${budget.status.toUpperCase()}</span>
                  <div style="font-size:0.85rem;color:#64748b;margin-top:4px;">Fecha: ${DB.formatDate(budget.createdAt)}</div>
                  ${budget.sentAt ? `<div style="font-size:0.8rem;color:#0e7490;margin-top:4px;">Correo enviado: ${DB.formatDate(budget.sentAt)}</div>` : ''}
                </div>
              </div>

              ${budget.address ? `<div style="background:#f8fafc;padding:8px 12px;border-radius:6px;font-size:0.85rem;margin-bottom:1rem;">📍 <strong>Ubicación:</strong> ${this.escapeHtml(budget.address)} ${budget.latitude ? `(${budget.latitude.toFixed(5)}, ${budget.longitude.toFixed(5)})` : ''}</div>` : ''}

              <table class="data-table" style="font-size:0.9rem;">
                <thead>
                  <tr>
                    <th>Concepto / Material</th>
                    <th>Cantidad</th>
                    <th>P. Unitario</th>
                    <th>Dto.</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map(it => `
                    <tr>
                      <td>${this.escapeHtml(it.concept || it.name || 'Item')}${it.notes ? `<br><small style="color:#64748b;">${this.escapeHtml(it.notes)}</small>` : ''}</td>
                      <td>${it.qty || it.quantity || 1}</td>
                      <td>${DB.formatCurrency(it.price || it.unitPrice || 0)}</td>
                      <td>${it.discountPercent || 0}%</td>
                      <td><strong>${DB.formatCurrency(this.itemSubtotal(it))}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>

              <div style="margin-top:1.2rem;text-align:right;border-top:1px solid #e2e8f0;padding-top:0.8rem;font-size:0.9rem;color:#475569;">
                <div>Mano de obra: ${DB.formatCurrency(budget.labor || 0)} · Impuestos: ${DB.formatCurrency(budget.tax || 0)} · Descuento: -${DB.formatCurrency(budget.discount || 0)}</div>
                <div style="font-size:1.3rem;font-weight:700;color:#0e7490;margin-top:4px;">
                  TOTAL: ${DB.formatCurrency(budget.total)}
                </div>
              </div>

              <div style="display:flex;gap:8px;margin-top:1.5rem;flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="BudgetsModule.downloadPdf(${budget.id}, '${budget.number}')">
                  📥 Descargar PDF con logo
                </button>
                <button class="btn btn-info" onclick="this.closest('.modal-overlay').remove(); BudgetsModule.openEmailModal(${budget.id})">
                  ✉️ Enviar por correo
                </button>
                <a href="https://wa.me/591${String(displayPhone).replace(/\D/g, '')}?text=${waText}" target="_blank" class="btn btn-success">
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

    openEmailModal(id) {
        const budget = DB.getBudget(id);
        if (!budget) return;
        const client = DB.getClient(budget.clientId);
        const defaultTo = budget.prospectEmail || client?.email || '';
        const name = budget.prospectName || client?.name || 'Cliente';
        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.id = 'budgetEmailModal';
        modal.innerHTML = `
          <div class="modal" style="max-width:540px;">
            <div class="modal-header">
              <h3>✉️ Enviar cotización por correo</h3>
              <button class="modal-close" onclick="document.getElementById('budgetEmailModal').remove()">✕</button>
            </div>
            <div class="modal-body">
              <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px;">
                Cotización <strong>${this.escapeHtml(budget.number)}</strong> para ${this.escapeHtml(name)}.
                Se adjuntará el PDF con el logo de la empresa.
              </p>
              <div class="form-group">
                <label class="required">Correo del destinatario</label>
                <input type="email" class="form-control" id="budgetEmailTo" value="${this.escapeHtml(defaultTo)}" placeholder="cliente@correo.com" required>
              </div>
              <div class="form-group">
                <label>Mensaje adicional (opcional)</label>
                <textarea class="form-control" id="budgetEmailMessage" rows="3" placeholder="Estimado cliente, adjuntamos su cotización..."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" onclick="document.getElementById('budgetEmailModal').remove()">Cancelar</button>
              <button class="btn btn-primary" id="btnSendBudgetEmail" onclick="BudgetsModule.sendEmailNow(${budget.id}, document.getElementById('budgetEmailTo').value, document.getElementById('budgetEmailMessage').value)">
                📨 Enviar con PDF
              </button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
    },

    async sendEmailNow(id, to, message) {
        const email = String(to || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            App.showToast('Ingrese un correo electrónico válido', 'warning');
            return;
        }
        const btn = document.getElementById('btnSendBudgetEmail');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Enviando...'; }
        try {
            const result = await DB.emailBudget(id, { to: email, message: message || '', markSent: true });
            App.showToast(`Cotización enviada a ${result?.to || email} con PDF adjunto`, 'success');
            document.getElementById('budgetEmailModal')?.remove();
            this.render();
        } catch (err) {
            App.showToast(err.message || 'No se pudo enviar el correo', 'error');
            if (btn) { btn.disabled = false; btn.textContent = '📨 Enviar con PDF'; }
        }
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
