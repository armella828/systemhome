/* ============================================================
   SYSTEMHOME - Módulo Órdenes de Trabajo (SH-O01, SH-O02, SH-O03, SH-O04)
   Gestión de órdenes, asignación de técnicos, cambio de estado
   en tiempo real (Pendiente -> En Ejecución -> Finalizada -> Cerrada),
   carga de evidencias, firma del cliente y cierre definitivo.
   ============================================================ */

const WorkOrdersModule = {
  currentOrderId: null,
  observations: [],
  closureMaterials: [],
  evidencePhotos: [],

  init() {
    this.render();
  },

  render(container = null) {
    const target = container || document.getElementById('workorders-view');
    if (!target) return;

    const user = Auth.getCurrentUser();
    const isTech = user && user.role === 'tecnico';
    const isAdmin = user && user.role === 'admin';
    const orders = DB.getWorkOrders();
    const techs = DB.getTechnicians();
    const clients = DB.getClients();

    target.innerHTML = `
      <div class="module-header">
        <div>
          <h2>Órdenes de Trabajo y Servicios Técnicos</h2>
          <p class="module-subtitle">Control de ejecución en campo, asignación de técnicos y cierre definitivo de servicios</p>
        </div>
        <div class="module-actions">
          <button class="btn btn-secondary" onclick="WorkOrdersModule.refresh()">🔄 Actualizar</button>
          ${isAdmin ? `
            <button class="btn btn-primary" onclick="WorkOrdersModule.openModal()">
              ➕ Nueva Orden de Trabajo
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Filters Toolbar -->
      <div class="toolbar" style="margin-bottom:1.2rem;">
        <div class="toolbar-left" style="flex-wrap:wrap;gap:0.6rem;">
          <div class="search-box" style="min-width:250px;">
            <span class="search-icon">🔍</span>
            <input type="text" id="searchOrder" placeholder="Buscar por N° de orden, cliente o dirección..." oninput="WorkOrdersModule.filter()">
          </div>
          <select class="form-control" id="filterOrderStatus" style="width:180px;" onchange="WorkOrdersModule.filter()">
            <option value="all">Todos los estados</option>
            <option value="pendiente">🟡 Pendiente de inicio</option>
            <option value="en_proceso">🔵 En Ejecución / Proceso</option>
            <option value="finalizada">🟢 Finalizada por técnico</option>
            <option value="cerrada">🔒 Cerrada definitivamente</option>
          </select>
          ${!isTech ? `
            <select class="form-control" id="filterOrderTech" style="width:180px;" onchange="WorkOrdersModule.filter()">
              <option value="all">Todos los técnicos</option>
              ${techs.map(t => `<option value="${t.id}">${this.escapeHtml(t.name)}</option>`).join('')}
            </select>
          ` : ''}
        </div>
      </div>

      <div class="card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>N° Orden</th>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Técnico Asignado</th>
                <th>Prioridad</th>
                <th>Fecha Programada</th>
                <th>Estado Actual</th>
                <th>Acciones / Cambio de Estado</th>
              </tr>
            </thead>
            <tbody id="ordersTableBody">
              ${this.renderTableRows(orders)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modal de Creación / Edición de Orden -->
      <div class="modal-overlay" id="orderModal" style="display:none;">
        <div class="modal" style="max-width:700px;">
          <div class="modal-header">
            <h3 id="orderModalTitle">Nueva Orden de Trabajo</h3>
            <button class="modal-close" onclick="WorkOrdersModule.closeModal()">✕</button>
          </div>
          <div class="modal-body" style="max-height:80vh;overflow-y:auto;">
            <form id="orderForm" onsubmit="return WorkOrdersModule.save(event)">
              <input type="hidden" id="orderId" value="">

              <div class="form-row">
                <div class="form-group flex-1">
                  <label class="required">Cliente</label>
                  <select class="form-control" id="orderClientId" required>
                    <option value="">Seleccionar cliente...</option>
                    ${clients.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)} (${c.ruc || 'S/RUC'})</option>`).join('')}
                  </select>
                </div>
                <div class="form-group flex-1">
                  <label class="required">Servicio</label>
                  <select class="form-control" id="orderServiceType" required>
                    <option value="Cámaras de Vigilancia">Cámaras de Vigilancia</option>
                    <option value="Sistemas de Alarma">Sistemas de Alarma</option>
                    <option value="Aire Acondicionado">Aire Acondicionado</option>
                    <option value="Cerca Eléctrica">Cerca Eléctrica</option>
                    <option value="Video Portero">Video Portero</option>
                    <option value="Control de Acceso">Control de Acceso</option>
                    <option value="Electricidad">Electricidad</option>
                    <option value="Cableado Estructurado">Cableado Estructurado</option>
                    <option value="Redes e Internet">Redes e Internet</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label class="required">Técnico Asignado</label>
                  <select class="form-control" id="orderTechId" required>
                    <option value="">Seleccionar técnico...</option>
                    ${techs.map(t => `<option value="${t.id}">${this.escapeHtml(t.name)} (${t.specialty || 'General'})</option>`).join('')}
                  </select>
                </div>
                <div class="form-group flex-1">
                  <label>Prioridad</label>
                  <select class="form-control" id="orderPriority">
                    <option value="baja">Baja</option>
                    <option value="normal" selected>Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div class="form-group flex-1">
                  <label class="required">Fecha Programada</label>
                  <input type="date" class="form-control" id="orderScheduledDate" required>
                </div>
              </div>

              <div class="form-group">
                <label>Descripción del Trabajo a Realizar</label>
                <textarea class="form-control" id="orderDescription" rows="2" placeholder="Especificaciones para el técnico..."></textarea>
              </div>

              <div class="form-group">
                <label>Dirección / Ubicación del Servicio</label>
                <input type="text" class="form-control" id="orderAddress" placeholder="Calle, N°, Barrio...">
              </div>

              <div class="form-group">
                <label>Estado</label>
                <select class="form-control" id="orderStatusSelect">
                  <option value="pendiente">🟡 Pendiente de inicio</option>
                  <option value="en_proceso">🔵 En Ejecución / Proceso</option>
                  <option value="finalizada">🟢 Finalizada por técnico</option>
                  ${isAdmin ? '<option value="cerrada">🔒 Cerrada definitivamente</option>' : ''}
                </select>
              </div>

              <div class="modal-footer" style="padding:1rem 0 0 0;">
                <button type="button" class="btn btn-secondary" onclick="WorkOrdersModule.closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="btnSaveOrder">💾 Guardar Orden</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Modal de Finalización Técnica (Cierre Fase 1) -->
      <div class="modal-overlay" id="finishOrderModal" style="display:none;">
        <div class="modal" style="max-width:650px;">
          <div class="modal-header">
            <h3>🏁 Finalizar Trabajo de Campo: <span id="finishOrderNumTitle"></span></h3>
            <button class="modal-close" onclick="WorkOrdersModule.closeFinishModal()">✕</button>
          </div>
          <div class="modal-body" style="max-height:80vh;overflow-y:auto;">
            <form id="finishOrderForm" onsubmit="return WorkOrdersModule.submitFinish(event)">
              <input type="hidden" id="finishOrderId" value="">

              <div class="form-group">
                <label class="required">Descripción del Trabajo Realizado</label>
                <textarea class="form-control" id="finishWorkDone" rows="3" placeholder="Detalle técnico de los trabajos completados, pruebas realizadas y estado final..." required></textarea>
              </div>

              <div class="form-group">
                <label>Observaciones de Campo</label>
                <input type="text" class="form-control" id="finishObservations" placeholder="Notas sobre el sitio o recomendaciones para el cliente...">
              </div>

              <!-- Materiales Utilizados -->
              <div class="form-group" style="background:#f8fafc;padding:1rem;border-radius:8px;border:1px solid #e2e8f0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                  <label style="font-weight:600;margin:0;">📦 Materiales / Repuestos Utilizados</label>
                  <button type="button" class="btn btn-sm btn-secondary" onclick="WorkOrdersModule.addMaterialRow()">➕ Agregar Material</button>
                </div>
                <div id="finishMaterialsContainer"></div>
              </div>

              <!-- Firma y Conformidad -->
              <div class="form-group" style="margin-top:1rem;">
                <label>Nombre / Firma del Cliente Receptor</label>
                <input type="text" class="form-control" id="finishSignature" placeholder="Nombre completo de quien recepcionó el servicio...">
              </div>

              <div class="modal-footer" style="padding:1rem 0 0 0;">
                <button type="button" class="btn btn-secondary" onclick="WorkOrdersModule.closeFinishModal()">Cancelar</button>
                <button type="submit" class="btn btn-success" id="btnSubmitFinish">✅ Registrar Finalización</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  },

  renderTableRows(orders) {
    if (!orders || orders.length === 0) {
      return `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--gray-500);">
        <div style="font-size:40px;margin-bottom:10px;">🔧</div>
        No hay órdenes de trabajo registradas.
      </td></tr>`;
    }

    const user = Auth.getCurrentUser();
    const isTech = user && user.role === 'tecnico';
    const isAdmin = user && user.role === 'admin';

    const getStatusBadge = (st) => {
      if (st === 'pendiente') return '<span class="badge badge-warning">🟡 PENDIENTE</span>';
      if (st === 'en_proceso' || st === 'ejecucion') return '<span class="badge badge-info">🔵 EN EJECUCIÓN</span>';
      if (st === 'finalizada' || st === 'completada') return '<span class="badge badge-success">🟢 FINALIZADA</span>';
      if (st === 'cerrada') return '<span class="badge badge-primary">🔒 CERRADA</span>';
      return `<span class="badge badge-secondary">${(st || '').toUpperCase()}</span>`;
    };

    return orders.map(o => {
      const isPending = o.status === 'pendiente';
      const isInProgress = o.status === 'en_proceso' || o.status === 'ejecucion';
      const isFinished = o.status === 'finalizada' || o.status === 'completada';
      const isClosed = o.status === 'cerrada';

      return `
        <tr>
          <td><strong>${o.number}</strong></td>
          <td>${this.escapeHtml(o.clientName || 'Cliente')}</td>
          <td>${this.escapeHtml(o.serviceName || o.serviceType)}</td>
          <td>${this.escapeHtml(o.technicianName || 'Sin asignar')}</td>
          <td><span class="badge badge-${o.priority === 'urgente' || o.priority === 'alta' ? 'danger' : 'secondary'}">${o.priority.toUpperCase()}</span></td>
          <td>${o.scheduledDate || '-'}</td>
          <td>${getStatusBadge(o.status)}</td>
          <td>
            <div class="actions" style="display:flex;gap:4px;flex-wrap:wrap;">
              <!-- Botón rápido según estado para el Técnico / Admin -->
              ${isPending ? `
                <button class="btn btn-sm btn-primary" onclick="WorkOrdersModule.startOrder(${o.id})" title="Iniciar ejecución">
                  ▶️ Iniciar
                </button>
              ` : ''}

              ${isInProgress ? `
                <button class="btn btn-sm btn-success" onclick="WorkOrdersModule.openFinishModal(${o.id}, '${o.number}')" title="Finalizar trabajo de campo">
                  🏁 Finalizar
                </button>
              ` : ''}

              ${isFinished && isAdmin ? `
                <button class="btn btn-sm btn-warning" onclick="WorkOrdersModule.closePermanently(${o.id}, '${o.number}')" title="Revisar y Cerrar Definitivamente">
                  🔒 Cierre Definitivo
                </button>
              ` : ''}

              <button class="btn btn-sm btn-secondary" onclick="DB.exportWorkOrderPdf(${o.id})" title="Descargar comprobante PDF">
                📄 PDF
              </button>

              ${isAdmin || !isClosed ? `
                <button class="btn btn-sm btn-secondary" onclick="WorkOrdersModule.openModal(${o.id})" title="Editar datos">
                  ✏️
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  filter() {
    const search = (document.getElementById('searchOrder')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('filterOrderStatus')?.value || 'all';
    const techFilter = document.getElementById('filterOrderTech')?.value || 'all';

    let orders = DB.getWorkOrders();
    if (search) {
      orders = orders.filter(o =>
        (o.number && o.number.toLowerCase().includes(search)) ||
        (o.clientName && o.clientName.toLowerCase().includes(search)) ||
        (o.address && o.address.toLowerCase().includes(search)) ||
        (o.description && o.description.toLowerCase().includes(search))
      );
    }
    if (statusFilter !== 'all') {
      orders = orders.filter(o => o.status === statusFilter || (statusFilter === 'en_proceso' && o.status === 'ejecucion') || (statusFilter === 'finalizada' && o.status === 'completada'));
    }
    if (techFilter !== 'all') {
      orders = orders.filter(o => String(o.technicianId) === String(techFilter));
    }

    const tbody = document.getElementById('ordersTableBody');
    if (tbody) tbody.innerHTML = this.renderTableRows(orders);
  },

  refresh() {
    const orders = DB.getWorkOrders();
    const tbody = document.getElementById('ordersTableBody');
    if (tbody) tbody.innerHTML = this.renderTableRows(orders);
    App.showNotification('Órdenes de trabajo actualizadas', 'info');
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  openModal(orderId = null) {
    this.currentOrderId = orderId || null;
    const modal = document.getElementById('orderModal');
    const title = document.getElementById('orderModalTitle');
    if (!modal) return;

    if (orderId) {
      const order = DB.getWorkOrder(orderId);
      if (!order) return;
      title.textContent = `Editar Orden: ${order.number}`;
      document.getElementById('orderId').value = order.id;
      document.getElementById('orderClientId').value = order.clientId || '';
      document.getElementById('orderServiceType').value = order.serviceName || order.serviceType || 'Cámaras de Vigilancia';
      document.getElementById('orderTechId').value = order.technicianId || '';
      document.getElementById('orderPriority').value = order.priority || 'normal';
      document.getElementById('orderScheduledDate').value = order.scheduledDate ? order.scheduledDate.slice(0, 10) : '';
      document.getElementById('orderDescription').value = order.description || '';
      document.getElementById('orderAddress').value = order.address || '';
      document.getElementById('orderStatusSelect').value = order.status || 'pendiente';
    } else {
      title.textContent = 'Nueva Orden de Trabajo';
      document.getElementById('orderForm')?.reset();
      document.getElementById('orderId').value = '';
      document.getElementById('orderScheduledDate').value = new Date().toISOString().slice(0, 10);
      document.getElementById('orderPriority').value = 'normal';
      document.getElementById('orderStatusSelect').value = 'pendiente';
    }

    modal.style.display = 'flex';
  },

  closeModal() {
    const modal = document.getElementById('orderModal');
    if (modal) modal.style.display = 'none';
    this.currentOrderId = null;
  },

  save(e) {
    e.preventDefault();
    const idVal = document.getElementById('orderId')?.value;
    const id = idVal ? Number(idVal) : null;

    const clientId = Number(document.getElementById('orderClientId')?.value);
    const serviceType = document.getElementById('orderServiceType')?.value;
    const technicianId = Number(document.getElementById('orderTechId')?.value) || null;
    const priority = document.getElementById('orderPriority')?.value || 'normal';
    const scheduledDate = document.getElementById('orderScheduledDate')?.value;
    const description = document.getElementById('orderDescription')?.value.trim();
    const address = document.getElementById('orderAddress')?.value.trim();
    const status = document.getElementById('orderStatusSelect')?.value || 'pendiente';

    if (!clientId || !serviceType || !scheduledDate) {
      App.showNotification('Por favor complete los campos obligatorios (*)', 'warning');
      return false;
    }

    const payload = { clientId, serviceType, technicianId, priority, scheduledDate, description, address, status };

    let res = null;
    if (id) {
      res = DB.updateWorkOrder(id, payload);
    } else {
      res = DB.addWorkOrder(payload);
    }

    if (res) {
      App.showNotification(`Orden de trabajo guardada con éxito (Estado: ${status.toUpperCase()})`, 'success');
      this.closeModal();
      this.refresh();
    } else {
      App.showNotification('Error al guardar la orden de trabajo', 'error');
    }
    return false;
  },

  // Iniciar ejecución
  startOrder(orderId) {
    if (!confirm('¿Confirmar que el técnico ha INICIADO los trabajos en campo? (Estado pasará a EN EJECUCIÓN)')) return;

    const res = DB.startWorkOrder(orderId);
    if (res) {
      App.showNotification('¡Orden de trabajo iniciada! Estado: EN EJECUCIÓN', 'success');
      this.refresh();
    }
  },

  // Finalizar trabajo (Fase 1)
  openFinishModal(orderId, orderNum) {
    this.currentOrderId = orderId;
    this.closureMaterials = [];

    const modal = document.getElementById('finishOrderModal');
    const title = document.getElementById('finishOrderNumTitle');
    if (!modal) return;

    title.textContent = orderNum;
    document.getElementById('finishOrderId').value = orderId;
    document.getElementById('finishWorkDone').value = '';
    document.getElementById('finishObservations').value = '';
    document.getElementById('finishSignature').value = '';
    document.getElementById('finishMaterialsContainer').innerHTML = '';

    modal.style.display = 'flex';
  },

  closeFinishModal() {
    const modal = document.getElementById('finishOrderModal');
    if (modal) modal.style.display = 'none';
  },

  addMaterialRow() {
    const inventory = DB.getInventory().filter(i => i.stock > 0);
    const container = document.getElementById('finishMaterialsContainer');
    if (!container) return;

    const rowIdx = container.children.length;
    const row = document.createElement('div');
    row.className = 'form-row';
    row.style.marginBottom = '0.5rem';
    row.innerHTML = `
      <div class="form-group flex-2" style="margin:0;">
        <select class="form-control finish-mat-item">
          ${inventory.map(i => `<option value="${i.id}">${i.name} (Stock: ${i.stock})</option>`).join('')}
        </select>
      </div>
      <div class="form-group flex-1" style="margin:0;">
        <input type="number" class="form-control finish-mat-qty" value="1" min="1" placeholder="Cantidad">
      </div>
      <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.form-row').remove()">✕</button>
    `;
    container.appendChild(row);
  },

  submitFinish(e) {
    e.preventDefault();
    const orderId = Number(document.getElementById('finishOrderId')?.value);
    const workDone = document.getElementById('finishWorkDone')?.value.trim();
    const observations = document.getElementById('finishObservations')?.value.trim();
    const clientSignature = document.getElementById('finishSignature')?.value.trim();

    if (!workDone) {
      App.showNotification('Detalle el trabajo realizado', 'warning');
      return false;
    }

    // Collect materials
    const materialsUsed = [];
    document.querySelectorAll('#finishMaterialsContainer .form-row').forEach(row => {
      const select = row.querySelector('.finish-mat-item');
      const qtyInput = row.querySelector('.finish-mat-qty');
      if (select && qtyInput) {
        const itemId = Number(select.value);
        const quantity = Number(qtyInput.value) || 1;
        const inv = DB.getInventoryItem(itemId);
        materialsUsed.push({ itemId, name: inv ? inv.name : 'Material', quantity });
      }
    });

    const payload = { workDone, observations, materialsUsed, clientSignature };
    const res = DB.finishWorkOrder(orderId, payload);
    if (res) {
      App.showNotification('¡Trabajo de campo finalizado! La orden pasa a revisión para cierre definitivo.', 'success');
      this.closeFinishModal();
      this.refresh();
    } else {
      App.showNotification('Error al registrar finalización', 'error');
    }
    return false;
  },

  // Cierre definitivo permanente (Admin - Fase 2)
  closePermanently(orderId, orderNumber) {
    const notes = prompt(`Cierre Definitivo de Orden ${orderNumber}.\nSe descontarán los materiales consumidos del stock y se archivará.\nNotas de cierre (opcional):`, 'Trabajo verificado y completado satisfactoriamente.');
    if (notes === null) return;

    const res = DB.closeWorkOrder(orderId, { closureNotes: notes });
    if (res) {
      App.showNotification(`🎉 ¡Orden ${orderNumber} CERRADA DEFINITIVAMENTE! Stock descontado con éxito.`, 'success');
      this.refresh();
    } else {
      App.showNotification('Error al cerrar orden', 'error');
    }
  }
};