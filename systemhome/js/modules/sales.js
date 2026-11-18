/* ============================================================
   SYSTEMHOME - Módulo de Ventas, Cobros y Facturación
   ============================================================ */

const SalesModule = {
  currentTab: 'list', // 'list', 'new', 'invoices'
  currentSaleItems: [],

  render(container) {
    const user = Auth.getCurrentUser();
    const isSellerOrAdmin = user && (user.role === 'admin' || user.role === 'vendedor');

    container.innerHTML = `
      <div class="module-header">
        <div>
          <h2>Gestión de Ventas y Facturación</h2>
          <p class="module-subtitle">Registro de ventas en mostrador, cálculo de cambio en efectivo, cobros QR y emisión de facturas legales</p>
        </div>
        <div class="module-actions">
          <button class="btn btn-secondary" onclick="SalesModule.refresh()" title="Recargar ventas">🔄 Actualizar</button>
          ${isSellerOrAdmin ? `
            <button class="btn ${this.currentTab === 'new' ? 'btn-secondary' : 'btn-primary'}" onclick="SalesModule.setTab('new')">
              ➕ Nueva Venta / Cobro
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="sales-tabs-bar">
        <button class="tab-btn ${this.currentTab === 'list' ? 'active' : ''}" onclick="SalesModule.setTab('list')">
          📋 Historial de Ventas
        </button>
        ${isSellerOrAdmin ? `
          <button class="tab-btn ${this.currentTab === 'new' ? 'active' : ''}" onclick="SalesModule.setTab('new')">
            🛒 Registrar Venta en Mostrador
          </button>
        ` : ''}
        <button class="tab-btn ${this.currentTab === 'invoices' ? 'active' : ''}" onclick="SalesModule.setTab('invoices')">
          📄 Facturas Emitidas
        </button>
      </div>

      <div id="salesTabContent" class="sales-tab-content"></div>
    `;

    this.renderTabContent();
  },

  setTab(tab) {
    this.currentTab = tab;
    const btns = document.querySelectorAll('.sales-tabs-bar .tab-btn');
    btns.forEach(b => b.classList.remove('active'));
    this.render(document.getElementById('sales-view'));
  },

  refresh() {
    this.renderTabContent();
    App.showNotification('Datos de ventas actualizados', 'info');
  },

  renderTabContent() {
    const container = document.getElementById('salesTabContent');
    if (!container) return;

    if (this.currentTab === 'list') {
      this.renderSalesList(container);
    } else if (this.currentTab === 'new') {
      this.renderNewSaleForm(container);
    } else if (this.currentTab === 'invoices') {
      this.renderInvoicesList(container);
    }
  },

  renderSalesList(container) {
    const sales = DB.getSales();
    if (!sales || sales.length === 0) {
      container.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-icon">💰</div>
          <h3>No hay ventas registradas aún</h3>
          <p>Las ventas realizadas en mostrador o compras del portal de clientes aparecerán aquí.</p>
          <button class="btn btn-primary" onclick="SalesModule.setTab('new')">Registrar Primera Venta</button>
        </div>
      `;
      return;
    }

    let totalRecaudado = 0;
    sales.forEach(s => totalRecaudado += Number(s.total || 0));

    container.innerHTML = `
      <!-- Metric Cards -->
      <div class="sales-summary-grid">
        <div class="sales-kpi-card">
          <span class="kpi-label">Total de Ventas</span>
          <span class="kpi-value">${sales.length}</span>
        </div>
        <div class="sales-kpi-card">
          <span class="kpi-label">Recaudación Total</span>
          <span class="kpi-value text-success">${totalRecaudado.toLocaleString('es-PY')} Bs</span>
        </div>
        <div class="sales-kpi-card">
          <span class="kpi-label">Ventas en Efectivo</span>
          <span class="kpi-value">${sales.filter(s => s.paymentMethod === 'efectivo').length}</span>
        </div>
        <div class="sales-kpi-card">
          <span class="kpi-label">Cobros QR / Transferencia</span>
          <span class="kpi-value">${sales.filter(s => s.paymentMethod === 'qr' || s.paymentMethod === 'tarjeta').length}</span>
        </div>
      </div>

      <div class="table-responsive" style="margin-top:1.5rem;">
        <table class="data-table">
          <thead>
            <tr>
              <th>N° Venta</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Método de Pago</th>
              <th>Items</th>
              <th>Total (Bs.)</th>
              <th>Vendedor</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${sales.map(s => `
              <tr>
                <td><strong>${s.saleNumber}</strong></td>
                <td>${new Date(s.createdAt).toLocaleDateString('es-PY')} ${new Date(s.createdAt).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</td>
                <td>${s.clientName || 'Venta al Paso'}</td>
                <td>
                  <span class="badge ${s.paymentMethod === 'efectivo' ? 'badge-info' : 'badge-success'}">
                    ${(s.paymentMethod || 'efectivo').toUpperCase()}
                  </span>
                </td>
                <td>${(s.items || []).length} prod.</td>
                <td><strong class="text-primary">${Number(s.total || 0).toLocaleString('es-PY')} Bs</strong></td>
                <td>${s.sellerName || 'Sistema'}</td>
                <td>
                  <button class="btn btn-sm btn-secondary" onclick="SalesModule.viewSaleDetail(${s.id})">👁️ Ver Detalle</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  renderNewSaleForm(container) {
    const clients = DB.getClients();
    const inventory = DB.getInventory().filter(i => i.stock > 0);

    if (this.currentSaleItems.length === 0 && inventory.length > 0) {
      // Start with 1 empty item
      this.currentSaleItems = [{ itemId: inventory[0].id, name: inventory[0].name, price: inventory[0].price, stock: inventory[0].stock, quantity: 1 }];
    }

    container.innerHTML = `
      <div class="sale-pos-layout">
        <!-- Left: Product Selection & Cart Items -->
        <div class="sale-pos-main card">
          <div class="card-header">
            <h3>🛒 Productos de la Venta</h3>
            <button type="button" class="btn btn-sm btn-secondary" onclick="SalesModule.addSaleItemRow()">➕ Agregar Producto</button>
          </div>
          <div class="card-body">
            <div id="saleItemsContainer"></div>
          </div>
        </div>

        <!-- Right: Client & Checkout Details -->
        <div class="sale-pos-sidebar card">
          <div class="card-header">
            <h3>💳 Datos de Cobro y Factura</h3>
          </div>
          <div class="card-body">
            <form id="posCheckoutForm" onsubmit="return SalesModule.submitSale(event)">
              <div class="form-group">
                <label for="posClientId">Cliente</label>
                <select id="posClientId" class="form-control" onchange="SalesModule.onClientChange()">
                  <option value="">-- Venta al Paso (Sin registrar) --</option>
                  ${clients.map(c => `<option value="${c.id}">${c.name} (${c.ruc || 'S/RUC'})</option>`).join('')}
                </select>
              </div>

              <div class="form-group">
                <label for="posDiscount">Descuento Global (Bs.)</label>
                <input type="number" id="posDiscount" class="form-control" value="0" min="0" oninput="SalesModule.updatePosTotals()">
              </div>

              <!-- Subtotal & Total Box -->
              <div class="pos-totals-box">
                <div class="totals-row">
                  <span>Subtotal:</span>
                  <strong id="posSubtotalDisplay">0 Bs</strong>
                </div>
                <div class="totals-row">
                  <span>Descuento:</span>
                  <strong id="posDiscountDisplay">0 Bs</strong>
                </div>
                <div class="totals-row totals-grand">
                  <span>TOTAL A PAGAR:</span>
                  <strong id="posTotalDisplay" class="text-primary">0 Bs</strong>
                </div>
              </div>

              <div class="form-group" style="margin-top:1rem;">
                <label>Método de Pago</label>
                <div class="payment-method-selector">
                  <label class="radio-card">
                    <input type="radio" name="posPaymentMethod" value="efectivo" checked onchange="SalesModule.onPaymentMethodChange('efectivo')">
                    <div class="radio-card-content">
                      <span class="icon">💵</span>
                      <span>Efectivo</span>
                    </div>
                  </label>
                  <label class="radio-card">
                    <input type="radio" name="posPaymentMethod" value="qr" onchange="SalesModule.onPaymentMethodChange('qr')">
                    <div class="radio-card-content">
                      <span class="icon">📱</span>
                      <span>Cobro QR</span>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Cash change calculation -->
              <div id="posCashSection" class="pos-payment-subbox">
                <div class="form-group">
                  <label for="posCashReceived">Monto Recibido en Efectivo (Bs.)</label>
                  <input type="number" id="posCashReceived" class="form-control" placeholder="Ej: 500000" min="0" oninput="SalesModule.calculateCashChange()">
                </div>
                <div class="cash-change-alert" id="posCashChangeBox" style="display:none;">
                  <span>VUELTO / CAMBIO:</span>
                  <strong id="posCashChangeDisplay" class="text-success">0 Bs</strong>
                </div>
              </div>

              <!-- QR section -->
              <div id="posQrSection" class="pos-payment-subbox" style="display:none;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:1.2rem;text-align:center;">
                <div style="font-weight:700;color:#166534;margin-bottom:0.5rem;font-size:1.05rem;">📱 Cobro por QR Instantáneo</div>
                <div style="display:flex;justify-content:center;margin:0.6rem 0;">
                  <img id="posQrImage" src="" alt="Código QR de Cobro" style="display:none;border:3px solid white;border-radius:8px;box-shadow:0 3px 10px rgba(0,0,0,0.08);width:160px;height:160px;">
                  <div id="posQrMissing" style="display:none;padding:24px;border:1px dashed #86efac;border-radius:8px;color:#166534;background:#f8fafc;">
                    Aún no hay QR de cobranza. Cargue la imagen en <strong>Configuración → QR de Cobranzas</strong>.
                  </div>
                </div>
                <p style="font-size:0.85rem;color:#15803d;margin:0.2rem 0;">Escanee desde la app bancaria para transferir</p>
                <div style="font-size:0.8rem;color:#64748b;">WhatsApp Oficial: <strong>+591 64595762</strong></div>
                <div class="form-group" style="margin-top:0.8rem;text-align:left;">
                  <label for="posQrReference">N° de Comprobante / Referencia Bancaria</label>
                  <input type="text" id="posQrReference" class="form-control" placeholder="Ej: OP-984512">
                </div>
              </div>

              <div class="form-group" style="margin-top:1rem;">
                <label for="posNotes">Observaciones de la Venta</label>
                <textarea id="posNotes" class="form-control" rows="2" placeholder="Detalles de entrega o comprobante..."></textarea>
              </div>

              <button type="submit" class="btn btn-primary btn-block btn-lg" style="width:100%;margin-top:1rem;" id="btnSubmitPosSale">
                ✅ Finalizar Venta y Emitir Factura
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    this.renderSaleItemRows();
    this.updatePosTotals();
  },

  renderSaleItemRows() {
    const container = document.getElementById('saleItemsContainer');
    if (!container) return;

    const inventory = DB.getInventory().filter(i => i.stock > 0);

    if (this.currentSaleItems.length === 0) {
      container.innerHTML = `
        <div class="text-muted text-center" style="padding:2rem;">
          <p>No hay productos agregados. Haga clic en "+ Agregar Producto".</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.currentSaleItems.map((item, idx) => `
      <div class="sale-item-row" data-idx="${idx}">
        <div class="form-group flex-2">
          <label>Producto / Equipo</label>
          <select class="form-control" onchange="SalesModule.onSaleItemSelect(${idx}, this.value)">
            ${inventory.map(inv => `
              <option value="${inv.id}" ${inv.id === item.itemId ? 'selected' : ''}>
                ${inv.name} - ${inv.price.toLocaleString('es-PY')} Bs (Stock: ${inv.stock})
              </option>
            `).join('')}
          </select>
        </div>
        <div class="form-group flex-1">
          <label>Cantidad (Max: ${item.stock})</label>
          <input type="number" class="form-control" value="${item.quantity}" min="1" max="${item.stock}"
                 oninput="SalesModule.onSaleItemQtyChange(${idx}, this.value)">
        </div>
        <div class="form-group flex-1">
          <label>Precio Unit.</label>
          <input type="number" class="form-control" value="${item.price}" min="0"
                 oninput="SalesModule.onSaleItemPriceChange(${idx}, this.value)">
        </div>
        <div class="form-group flex-1">
          <label>Subtotal</label>
          <div class="pos-item-subtotal">${(item.quantity * item.price).toLocaleString('es-PY')} Bs</div>
        </div>
        <div class="form-group flex-auto" style="align-self:flex-end;">
          <button type="button" class="btn btn-sm btn-danger" onclick="SalesModule.removeSaleItemRow(${idx})" title="Eliminar fila">✕</button>
        </div>
      </div>
    `).join('');
  },

  addSaleItemRow() {
    const inventory = DB.getInventory().filter(i => i.stock > 0);
    if (inventory.length === 0) {
      App.showNotification('No hay productos con stock disponible en el inventario', 'warning');
      return;
    }
    const first = inventory[0];
    this.currentSaleItems.push({ itemId: first.id, name: first.name, price: first.price, stock: first.stock, quantity: 1 });
    this.renderSaleItemRows();
    this.updatePosTotals();
  },

  removeSaleItemRow(idx) {
    this.currentSaleItems.splice(idx, 1);
    this.renderSaleItemRows();
    this.updatePosTotals();
  },

  onSaleItemSelect(idx, itemId) {
    const inv = DB.getInventoryItem(Number(itemId));
    if (inv && this.currentSaleItems[idx]) {
      this.currentSaleItems[idx].itemId = inv.id;
      this.currentSaleItems[idx].name = inv.name;
      this.currentSaleItems[idx].price = inv.price;
      this.currentSaleItems[idx].stock = inv.stock;
      if (this.currentSaleItems[idx].quantity > inv.stock) {
        this.currentSaleItems[idx].quantity = Math.max(1, inv.stock);
      }
      this.renderSaleItemRows();
      this.updatePosTotals();
    }
  },

  onSaleItemQtyChange(idx, val) {
    const qty = Math.max(1, Number(val) || 1);
    if (this.currentSaleItems[idx]) {
      const maxStock = this.currentSaleItems[idx].stock;
      if (qty > maxStock) {
        App.showNotification(`Stock máximo disponible para este producto: ${maxStock}`, 'warning');
        this.currentSaleItems[idx].quantity = maxStock;
      } else {
        this.currentSaleItems[idx].quantity = qty;
      }
      this.renderSaleItemRows();
      this.updatePosTotals();
    }
  },

  onSaleItemPriceChange(idx, val) {
    if (this.currentSaleItems[idx]) {
      this.currentSaleItems[idx].price = Math.max(0, Number(val) || 0);
      this.renderSaleItemRows();
      this.updatePosTotals();
    }
  },

  onPaymentMethodChange(method) {
    const cashSec = document.getElementById('posCashSection');
    const qrSec = document.getElementById('posQrSection');
    if (method === 'efectivo') {
      if (cashSec) cashSec.style.display = 'block';
      if (qrSec) qrSec.style.display = 'none';
      this.calculateCashChange();
    } else {
      if (cashSec) cashSec.style.display = 'none';
      if (qrSec) qrSec.style.display = 'block';

      let subtotal = 0;
      this.currentSaleItems.forEach(it => subtotal += (it.quantity * it.price));
      const discInput = document.getElementById('posDiscount');
      const discount = discInput ? Number(discInput.value) || 0 : 0;
      const total = Math.max(0, subtotal - discount);
      const qrImg = document.getElementById('posQrImage');
      const customQr = App?.getQRCode ? App.getQRCode() : '';

      const missing = document.getElementById('posQrMissing');
      if (qrImg) {
        if (customQr) {
          qrImg.src = customQr;
          qrImg.style.display = 'block';
          if (missing) missing.style.display = 'none';
        } else {
          qrImg.removeAttribute('src');
          qrImg.style.display = 'none';
          if (missing) missing.style.display = 'block';
          App.showToast('Cargue el QR de cobranza en Configuración antes de cobrar con QR', 'warning');
        }
      }
    }
  },

  updatePosTotals() {
    let subtotal = 0;
    this.currentSaleItems.forEach(it => subtotal += (it.quantity * it.price));

    const discInput = document.getElementById('posDiscount');
    const discount = discInput ? Number(discInput.value) || 0 : 0;
    const total = Math.max(0, subtotal - discount);

    const subDisplay = document.getElementById('posSubtotalDisplay');
    const discDisplay = document.getElementById('posDiscountDisplay');
    const totalDisplay = document.getElementById('posTotalDisplay');

    if (subDisplay) subDisplay.textContent = subtotal.toLocaleString('es-PY') + ' Bs';
    if (discDisplay) discDisplay.textContent = discount.toLocaleString('es-PY') + ' Bs';
    if (totalDisplay) totalDisplay.textContent = total.toLocaleString('es-PY') + ' Bs';

    this.calculateCashChange();
  },

  calculateCashChange() {
    const cashInput = document.getElementById('posCashReceived');
    const changeBox = document.getElementById('posCashChangeBox');
    const changeDisplay = document.getElementById('posCashChangeDisplay');
    if (!cashInput || !changeBox || !changeDisplay) return;

    let subtotal = 0;
    this.currentSaleItems.forEach(it => subtotal += (it.quantity * it.price));
    const discInput = document.getElementById('posDiscount');
    const discount = discInput ? Number(discInput.value) || 0 : 0;
    const total = Math.max(0, subtotal - discount);

    const received = Number(cashInput.value);
    if (!received || received <= 0) {
      changeBox.style.display = 'none';
      return;
    }

    changeBox.style.display = 'flex';
    if (received >= total) {
      const change = received - total;
      changeDisplay.className = 'text-success';
      changeDisplay.textContent = change.toLocaleString('es-PY') + ' Bs';
    } else {
      const missing = total - received;
      changeDisplay.className = 'text-danger';
      changeDisplay.textContent = `Faltan: ${missing.toLocaleString('es-PY')} Bs`;
    }
  },

  submitSale(e) {
    e.preventDefault();
    if (this.currentSaleItems.length === 0) {
      App.showNotification('Debe agregar al menos un producto a la venta', 'warning');
      return false;
    }

    const clientIdVal = document.getElementById('posClientId')?.value;
    const discount = Number(document.getElementById('posDiscount')?.value) || 0;
    const paymentMethod = document.querySelector('input[name="posPaymentMethod"]:checked')?.value || 'efectivo';
    const cashReceived = paymentMethod === 'efectivo' ? Number(document.getElementById('posCashReceived')?.value) || null : null;
    const qrReference = document.getElementById('posQrReference')?.value || '';
    const notes = document.getElementById('posNotes')?.value || '';

    // Calculate total
    let subtotal = 0;
    this.currentSaleItems.forEach(it => subtotal += (it.quantity * it.price));
    const total = Math.max(0, subtotal - discount);

    if (paymentMethod === 'efectivo' && cashReceived !== null && cashReceived < total) {
      App.showNotification(`El monto recibido en efectivo (${cashReceived.toLocaleString('es-PY')} Bs) es menor al total (${total.toLocaleString('es-PY')} Bs)`, 'error');
      return false;
    }

    const btn = document.getElementById('btnSubmitPosSale');
    if (btn) { btn.disabled = true; btn.textContent = 'Procesando venta...'; }

    const salePayload = {
      clientId: clientIdVal ? Number(clientIdVal) : null,
      items: this.currentSaleItems.map(it => ({
        itemId: it.itemId,
        name: it.name,
        quantity: it.quantity,
        price: it.price,
        unitPrice: it.price
      })),
      discount,
      paymentMethod,
      cashReceived,
      qrReference,
      notes
    };

    const res = DB.registerSale(salePayload);
    if (res && res.sale) {
      const saleItemsCopy = [...this.currentSaleItems];
      App.showNotification(`¡Venta ${res.sale.saleNumber} registrada exitosamente! Factura ${res.invoiceNumber || ''} emitida.`, 'success');
      this.currentSaleItems = [];
      this.setTab('list');

      // Pop up printable Invoice Modal
      const clientObj = clientIdVal ? DB.getClient(Number(clientIdVal)) : null;
      const modal = document.createElement('div');
      modal.className = 'modal active';
      modal.innerHTML = `
        <div class="modal-dialog" style="max-width:620px;">
          <div class="modal-content">
            <div class="modal-header" style="background:#1e293b;color:white;">
              <div>
                <h3 style="margin:0;color:white;">🧾 Factura Legal Emitida: ${res.invoiceNumber || 'Emitida'}</h3>
                <span style="font-size:0.85rem;color:#94a3b8;">SYSTEMHOME Security</span>
              </div>
              <button class="modal-close" style="color:white;" onclick="this.closest('.modal').remove()">✕</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
              <div style="display:flex;justify-content:space-between;border-bottom:2px solid #e2e8f0;padding-bottom:1rem;margin-bottom:1rem;">
                <div>
                  <h4 style="margin:0 0 0.2rem 0;color:#1a56db;">SYSTEMHOME S.A.</h4>
                  <div style="font-size:0.85rem;color:#64748b;">RUC: 80099887-1 · Timbrado: 16548920</div>
                  <div style="font-size:0.85rem;color:#64748b;">WhatsApp: +591 64595762</div>
                </div>
                <div style="text-align:right;">
                  <span class="badge badge-success">${paymentMethod.toUpperCase()}</span>
                  <div style="font-size:0.85rem;color:#64748b;margin-top:0.3rem;">Fecha: ${new Date().toLocaleDateString('es-PY')}</div>
                </div>
              </div>

              <div style="background:#f8fafc;padding:0.8rem;border-radius:8px;font-size:0.9rem;margin-bottom:1rem;">
                <div><strong>Cliente:</strong> ${clientObj ? clientObj.name : 'Venta al Paso'}</div>
                <div><strong>RUC / CI:</strong> ${clientObj ? clientObj.ruc : 'Sin RUC'}</div>
              </div>

              <table class="data-table" style="font-size:0.9rem;">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cant.</th>
                    <th>P. Unit.</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${saleItemsCopy.map(it => `
                    <tr>
                      <td>${it.name}</td>
                      <td>${it.quantity}</td>
                      <td>${Number(it.price).toLocaleString('es-PY')} Bs</td>
                      <td><strong>${(it.quantity * it.price).toLocaleString('es-PY')} Bs</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>

              <div style="margin-top:1.2rem;text-align:right;border-top:1px solid #e2e8f0;padding-top:0.8rem;">
                <div style="font-size:1.3rem;font-weight:700;color:#1a56db;">
                  TOTAL: ${total.toLocaleString('es-PY')} Bs.
                </div>
                <div style="font-size:0.85rem;color:#64748b;">IVA Incluido 10%: ${Math.round(total / 11).toLocaleString('es-PY')} Bs.</div>
                ${res.cashChange !== null ? `<div style="font-size:0.95rem;color:#16a34a;margin-top:0.3rem;">Vuelto / Cambio: <strong>${Number(res.cashChange).toLocaleString('es-PY')} Bs.</strong></div>` : ''}
              </div>

              <div style="display:flex;gap:0.7rem;margin-top:1.5rem;">
                <button class="btn btn-primary btn-lg flex-1" onclick="DB.exportInvoicePdf(${res.sale.id || 1});">
                  📥 Descargar Factura PDF
                </button>
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove();">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } else {
      App.showNotification(res?.error || 'Error al procesar la venta', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '✅ Finalizar Venta y Generar Factura'; }
    }

    return false;
  },

  renderInvoicesList(container) {
    const invoices = DB.getInvoices();
    if (!invoices || invoices.length === 0) {
      container.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-icon">📄</div>
          <h3>No hay facturas emitidas</h3>
          <p>Las facturas se generan automáticamente al confirmar ventas o cobros.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>N° Factura</th>
              <th>Fecha de Emisión</th>
              <th>Razón Social / Cliente</th>
              <th>RUC / CI</th>
              <th>Condición de Pago</th>
              <th>Total Liquidado</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map(inv => `
              <tr>
                <td><strong>${inv.invoiceNumber}</strong></td>
                <td>${new Date(inv.createdAt).toLocaleDateString('es-PY')} ${new Date(inv.createdAt).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</td>
                <td>${inv.clientName}</td>
                <td>${inv.clientRuc || 'Sin RUC'}</td>
                <td>Contado (${(inv.paymentMethod || 'efectivo').toUpperCase()})</td>
                <td><strong class="text-primary">${Number(inv.total || 0).toLocaleString('es-PY')} Bs</strong></td>
                <td><span class="badge badge-success">EMITIDA</span></td>
                <td>
                  <button class="btn btn-sm btn-primary" onclick="DB.exportInvoicePdf(${inv.id})">
                    📥 Descargar PDF
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  viewSaleDetail(saleId) {
    const sales = DB.getSales();
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    let items = sale.items || [];
    let itemsHtml = items.map(it => `
      <tr>
        <td>${it.item_name || it.name || 'Producto'}</td>
        <td>${it.quantity}</td>
        <td>${Number(it.unit_price || it.price || 0).toLocaleString('es-PY')} Bs</td>
        <td><strong>${Number(it.subtotal || (it.quantity * it.unit_price)).toLocaleString('es-PY')} Bs</strong></td>
      </tr>
    `).join('');

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width:650px;">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Detalle de Venta: ${sale.saleNumber}</h3>
            <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
          </div>
          <div class="modal-body">
            <div class="sale-detail-grid">
              <div><strong>Fecha:</strong> ${new Date(sale.createdAt).toLocaleString('es-PY')}</div>
              <div><strong>Cliente:</strong> ${sale.clientName}</div>
              <div><strong>Método de Pago:</strong> ${(sale.paymentMethod || 'efectivo').toUpperCase()}</div>
              <div><strong>Vendedor / Emisor:</strong> ${sale.sellerName || 'Sistema'}</div>
            </div>

            <h4 style="margin-top:1.2rem;margin-bottom:0.5rem;">Detalle de Items:</h4>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Precio Unit.</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>

            <div class="sale-summary-footer" style="margin-top:1rem;text-align:right;">
              <div>Subtotal: <strong>${Number(sale.subtotal || 0).toLocaleString('es-PY')} Bs</strong></div>
              ${sale.discount ? `<div>Descuento: <strong>-${Number(sale.discount).toLocaleString('es-PY')} Bs</strong></div>` : ''}
              <div style="font-size:1.2rem;color:#1a56db;margin-top:0.3rem;">
                TOTAL: <strong>${Number(sale.total || 0).toLocaleString('es-PY')} Bs</strong>
              </div>
              ${sale.cashReceived ? `<div class="text-muted" style="margin-top:0.3rem;">Efectivo Recibido: ${Number(sale.cashReceived).toLocaleString('es-PY')} Bs | Vuelto: ${Number(sale.cashChange || 0).toLocaleString('es-PY')} Bs</div>` : ''}
              ${sale.qrReference ? `<div class="text-muted" style="margin-top:0.3rem;">Ref. QR / Transf: ${sale.qrReference}</div>` : ''}
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cerrar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
};
