/* ============================================================
   SYSTEMHOME - Módulo Inventario, Catálogo y Stock (SH-I01, SH-I02)
   Gestión completa de productos, precios, fotos (archivo o URL),
   control de movimientos, visibilidad en catálogo y alertas.
   ============================================================ */

const InventoryModule = {
  currentItemId: null,
  currentTab: 'items', // 'items', 'movements'
  tempImageBase64: null,
  tempImageFilename: null,
  IMAGE_FALLBACK: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="#e2e8f0"/><text x="60" y="55" text-anchor="middle" font-size="40">📦</text></svg>'),

  init() {
    this.render();
  },

  render(container = null) {
    const target = container || document.getElementById('inventory-view');
    if (!target) return;

    const user = Auth.getCurrentUser();
    const isAllowed = user && (user.role === 'admin' || user.role === 'vendedor');
    const items = DB.getInventory();

    target.innerHTML = `
      <div class="module-header">
        <div>
          <h2>Inventario y Catálogo de Equipos</h2>
          <p class="module-subtitle">Administración de productos, precios en Bolivianos (Bs.), stock, fotos e integración con el portal de clientes</p>
        </div>
        <div class="module-actions">
          <button class="btn btn-secondary" onclick="InventoryModule.downloadCatalogPdf()" title="Descargar catálogo en PDF">📄 Descargar PDF</button>
          <button class="btn btn-secondary" onclick="InventoryModule.refresh()" title="Recargar inventario">🔄 Actualizar</button>
          ${isAllowed ? `
            <button class="btn btn-primary" onclick="InventoryModule.openModal()" id="btnNewProduct">
              ➕ Nuevo Producto / Equipo
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Navigation tabs -->
      <div class="sales-tabs-bar" style="margin-bottom:1.5rem;">
        <button class="tab-btn ${this.currentTab === 'items' ? 'active' : ''}" onclick="InventoryModule.setTab('items')">
          📦 Catálogo de Productos (${items.length})
        </button>
        <button class="tab-btn ${this.currentTab === 'movements' ? 'active' : ''}" onclick="InventoryModule.setTab('movements')">
          📜 Registro de Movimientos (Kárdex)
        </button>
      </div>

      <div id="inventoryTabContent"></div>
    `;

    this.renderTabContent();
  },

  setTab(tab) {
    this.currentTab = tab;
    this.renderTabContent();
    document.querySelectorAll('.sales-tabs-bar .tab-btn').forEach(b => {
      b.classList.toggle('active', (b.textContent.includes('Catálogo') && tab === 'items') || (b.textContent.includes('Movimientos') && tab === 'movements'));
    });
  },

  refresh() {
    this.renderTabContent();
    App.showNotification('Inventario actualizado', 'info');
  },

  async downloadCatalogPdf() {
    try {
      const result = await DB.fetchCatalogPdf('all', true);
      App.showNotification(`Catálogo PDF descargado: ${result.filename}`, 'success');
    } catch (err) {
      App.showNotification(err.message || 'No se pudo descargar el catálogo en PDF', 'error');
    }
  },

  renderTabContent() {
    const container = document.getElementById('inventoryTabContent');
    if (!container) return;

    if (this.currentTab === 'items') {
      this.renderItemsList(container);
    } else {
      this.renderMovementsList(container);
    }
  },

  renderItemsList(container) {
    const items = DB.getInventory();
    const user = Auth.getCurrentUser();
    const canEdit = user && (user.role === 'admin' || user.role === 'vendedor');

    container.innerHTML = `
      <div class="toolbar" style="margin-bottom:1.2rem;">
        <div class="toolbar-left">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input type="text" id="searchInventory" placeholder="Buscar por nombre, marca o modelo..." oninput="InventoryModule.filter()">
          </div>
          <select class="form-control" id="filterInventoryCategory" style="width:200px;" onchange="InventoryModule.filter()">
            <option value="all">Todas las categorías</option>
            <option value="camaras">📹 Cámaras de Seguridad</option>
            <option value="dvr_nvr">💾 DVR / NVR</option>
            <option value="alarmas">🚨 Alarmas</option>
            <option value="ac">❄️ Aire Acondicionado</option>
            <option value="cercas">⚡ Cercas Eléctricas</option>
            <option value="videoporteros">📺 Video Portero</option>
            <option value="control_acceso">🔐 Control de Acceso</option>
            <option value="redes">🌐 Redes y Switches</option>
            <option value="cableado">🔌 Cables y Accesorios</option>
            <option value="electricidad">💡 Electricidad</option>
            <option value="accesorios">🔧 Accesorios Varios</option>
          </select>
        </div>
        ${canEdit ? `
          <div class="toolbar-right">
            <button class="btn btn-primary" onclick="InventoryModule.openModal()">
              ➕ Nuevo Producto
            </button>
          </div>
        ` : ''}
      </div>

      <div class="card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Foto</th>
                <th>Producto / Equipo</th>
                <th>Categoría</th>
                <th>Marca / Modelo</th>
                <th>Stock</th>
                <th>Precio Unit. (Bs.)</th>
                <th>Catálogo</th>
                ${canEdit ? '<th>Acciones</th>' : ''}
              </tr>
            </thead>
            <tbody id="inventoryTableBody">
              ${this.renderTableRows(items)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modal de Producto -->
      <div class="modal-overlay" id="inventoryModal">
        <div class="modal" style="max-width:720px;">
          <div class="modal-header">
            <h3 id="inventoryModalTitle">Nuevo Producto</h3>
            <button class="modal-close" onclick="InventoryModule.closeModal()">✕</button>
          </div>
          <div class="modal-body" style="max-height:80vh;overflow-y:auto;">
            <form id="inventoryForm" onsubmit="return InventoryModule.save(event)">
              <input type="hidden" id="inventoryId" value="">

              <div class="form-row">
                <div class="form-group flex-2">
                  <label class="required">Nombre del Producto / Equipo</label>
                  <input type="text" class="form-control" id="invName" placeholder="Ej: Cámara Domo IP 4MP IR 30m" required>
                </div>
                <div class="form-group flex-1">
                  <label class="required">Categoría</label>
                  <select class="form-control" id="invCategory" required>
                    <option value="">Seleccionar...</option>
                    <option value="camaras">Cámaras</option>
                    <option value="dvr_nvr">DVR / NVR</option>
                    <option value="alarmas">Alarmas</option>
                    <option value="ac">Aire Acondicionado</option>
                    <option value="cercas">Cercas Eléctricas</option>
                    <option value="videoporteros">Video Porteros</option>
                    <option value="control_acceso">Control de Acceso</option>
                    <option value="redes">Redes e Internet</option>
                    <option value="cableado">Cableado</option>
                    <option value="electricidad">Electricidad</option>
                    <option value="accesorios">Accesorios</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label>Marca</label>
                  <input type="text" class="form-control" id="invBrand" placeholder="Ej: Hikvision, Dahua, Samsung...">
                </div>
                <div class="form-group flex-1">
                  <label>Modelo</label>
                  <input type="text" class="form-control" id="invModel" placeholder="Ej: DS-2CD1143G0-I">
                </div>
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label class="required">Stock Disponible</label>
                  <input type="number" class="form-control" id="invStock" value="0" min="0" required>
                </div>
                <div class="form-group flex-1">
                  <label class="required">Stock Mínimo de Alerta</label>
                  <input type="number" class="form-control" id="invMinStock" value="5" min="1" required>
                </div>
                <div class="form-group flex-1">
                  <label class="required">Precio de Venta (Bs.)</label>
                  <input type="number" class="form-control" id="invPrice" value="0" step="any" required>
                </div>
              </div>

              <div class="form-group">
                <label>Descripción Comercial</label>
                <textarea class="form-control" id="invDescription" placeholder="Descripción detallada del producto para el cliente..." rows="2"></textarea>
              </div>

              <div class="form-group">
                <label>Características Destacadas (separadas por coma)</label>
                <input type="text" class="form-control" id="invFeatures" placeholder="Ej: 4 Megapíxeles, PoE, Visión Nocturna 30m, IP67">
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label>Etiqueta / Badge Promocional</label>
                  <input type="text" class="form-control" id="invBadge" placeholder="Ej: Más vendido, Oferta, Premium, 100% Cobre...">
                </div>
                <div class="form-group flex-1">
                  <label>Visibilidad en Catálogo</label>
                  <select class="form-control" id="invShowInCatalog">
                    <option value="1">✅ Visible en Portal de Clientes</option>
                    <option value="0">❌ Oculto en Portal</option>
                  </select>
                </div>
              </div>

              <!-- GESTIÓN DE FOTO DEL PRODUCTO -->
              <div class="form-group" style="background:#f8fafc;padding:1.2rem;border-radius:10px;border:1px solid #e2e8f0;margin-top:1rem;">
                <label style="font-weight:700;display:block;margin-bottom:0.6rem;color:#1e3a8a;">📸 Imagen del Producto</label>
                
                <div class="form-group">
                  <label style="font-size:0.85rem;color:#475569;font-weight:600;" for="invImageFile">Seleccione la imagen desde su equipo</label>
                  <input type="file" class="form-control" id="invImageFile" accept="image/png,image/jpeg,image/webp" onchange="InventoryModule.onFileSelected(event)">
                  <small class="text-muted">La imagen se guarda en la base de datos y se muestra en el portal del cliente. No se admiten URLs externas.</small>
                  <input type="hidden" id="invImageUrl">
                </div>

                <!-- Preview Box -->
                <div id="invPreviewBox" style="margin-top:0.8rem;display:flex;align-items:center;gap:1.2rem;background:white;padding:10px;border-radius:8px;border:1px solid #cbd5e1;">
                  <img id="invImagePreview" src="" alt="Vista previa" style="width:100px;height:75px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;display:none;">
                  <div id="invPreviewText" style="font-size:0.85rem;color:#64748b;flex:1;">Sin imagen seleccionada</div>
                  <button type="button" class="btn btn-sm btn-danger" id="btnRemoveImage" style="display:none;" onclick="InventoryModule.removeImage()">✕ Quitar Imagen</button>
                </div>
              </div>

              <div class="modal-footer" style="padding:1.2rem 0 0 0;">
                <button type="button" class="btn btn-secondary" onclick="InventoryModule.closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="btnSaveInventory">💾 Guardar Producto</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  },

  renderTableRows(items) {
    if (!items || items.length === 0) {
      return `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--gray-500);">
        <div style="font-size:40px;margin-bottom:10px;">📦</div>
        No hay equipos registrados en el inventario.
      </td></tr>`;
    }

    const user = Auth.getCurrentUser();
    const canEdit = user && (user.role === 'admin' || user.role === 'vendedor');

    const getCatBadge = (cat) => {
      const map = {
        camaras: '📹 Cámaras', dvr_nvr: '💾 DVR/NVR', alarmas: '🚨 Alarmas', ac: '❄️ A/Acond.',
        cercas: '⚡ Cercas', videoporteros: '📺 Video Port.', control_acceso: '🔐 Acceso',
        redes: '🌐 Redes', cableado: '🔌 Cableado', electricidad: '💡 Electricidad', accesorios: '🔧 Acces.'
      };
      return map[cat] || cat;
    };

    return items.map((item, i) => {
      const imgUrl = item.imageUrl || (item.imagePath ? `/uploads/${item.imagePath}` : this.IMAGE_FALLBACK);
      const fallback = this.escapeHtml(this.IMAGE_FALLBACK);

      return `
        <tr>
          <td>${i + 1}</td>
          <td>
            <img src="${this.escapeHtml(imgUrl)}" alt="${this.escapeHtml(item.name)}" referrerpolicy="no-referrer" loading="lazy"
                 style="width:48px;height:38px;border-radius:6px;object-fit:cover;border:1px solid #e2e8f0;"
                 onerror="this.onerror=null; this.src='${fallback}'">
          </td>
          <td>
            <strong>${this.escapeHtml(item.name)}</strong>
            ${item.badge ? `<span class="badge badge-info" style="margin-left:5px;font-size:0.7rem;">${this.escapeHtml(item.badge)}</span>` : ''}
          </td>
          <td><span class="badge badge-secondary">${getCatBadge(item.category)}</span></td>
          <td>${this.escapeHtml(item.brand || '-')} ${item.model ? `(${this.escapeHtml(item.model)})` : ''}</td>
          <td>
            <span class="badge ${item.stock <= (item.minStock || 5) ? 'badge-danger' : 'badge-success'}">
              ${item.stock} unid.
            </span>
          </td>
          <td><strong>${Number(item.price || 0).toLocaleString('es-PY')} Bs</strong></td>
          <td>
            ${item.showInCatalog ? 
              `<span class="badge badge-success">Visible</span>` : 
              `<span class="badge badge-danger">Oculto</span>`}
          </td>
          ${canEdit ? `
            <td>
              <div class="actions" style="display:flex;gap:4px;">
                <button class="btn btn-sm btn-secondary" onclick="InventoryModule.openModal(${item.id})" title="Editar producto y foto">✏️</button>
                <button class="btn btn-sm btn-info" onclick="InventoryModule.quickAdjustStock(${item.id}, '${this.escapeHtml(item.name)}', ${item.stock})" title="Ajustar Stock Rápido">📦</button>
                ${user.role === 'admin' ? `
                  <button class="btn btn-sm btn-danger" onclick="InventoryModule.confirmDelete(${item.id})" title="Eliminar producto">🗑️</button>
                ` : ''}
              </div>
            </td>
          ` : ''}
        </tr>
      `;
    }).join('');
  },

  filter() {
    const search = (document.getElementById('searchInventory')?.value || '').toLowerCase();
    const catFilter = document.getElementById('filterInventoryCategory')?.value || 'all';

    let items = DB.getInventory();
    if (search) {
      items = items.filter(i =>
        (i.name && i.name.toLowerCase().includes(search)) ||
        (i.brand && i.brand.toLowerCase().includes(search)) ||
        (i.model && i.model.toLowerCase().includes(search))
      );
    }
    if (catFilter !== 'all') {
      items = items.filter(i => (i.category || '').toLowerCase() === catFilter.toLowerCase());
    }

    const tbody = document.getElementById('inventoryTableBody');
    if (tbody) tbody.innerHTML = this.renderTableRows(items);
  },

  openModal(itemId = null) {
    this.currentItemId = itemId || null;
    this.tempImageBase64 = null;
    this.tempImageFilename = null;

    let modal = document.getElementById('inventoryModal');
    if (!modal) {
      // Ensure items list is rendered
      const container = document.getElementById('inventoryTabContent');
      if (container) this.renderItemsList(container);
      modal = document.getElementById('inventoryModal');
    }
    if (!modal) return;

    const title = document.getElementById('inventoryModalTitle');
    const previewImg = document.getElementById('invImagePreview');
    const previewText = document.getElementById('invPreviewText');
    const btnRemove = document.getElementById('btnRemoveImage');

    if (itemId) {
      const item = DB.getInventoryItem(itemId);
      if (!item) return;
      if (title) title.textContent = '✏️ Editar Producto: ' + item.name;
      document.getElementById('inventoryId').value = item.id;
      document.getElementById('invName').value = item.name || '';
      document.getElementById('invCategory').value = item.category || '';
      document.getElementById('invBrand').value = item.brand || '';
      document.getElementById('invModel').value = item.model || '';
      document.getElementById('invStock').value = item.stock !== undefined ? item.stock : 0;
      document.getElementById('invMinStock').value = item.minStock || 5;
      document.getElementById('invPrice').value = item.price || 0;
      document.getElementById('invDescription').value = item.description || '';
      document.getElementById('invFeatures').value = item.features || '';
      document.getElementById('invBadge').value = item.badge || '';
      document.getElementById('invShowInCatalog').value = item.showInCatalog ? '1' : '0';
      document.getElementById('invImageUrl').value = item.imageUrl || '';
      document.getElementById('invImageFile').value = '';

      if (item.imageUrl) {
        if (previewImg) {
          previewImg.onerror = () => { previewImg.onerror = null; previewImg.src = this.IMAGE_FALLBACK; };
          previewImg.src = item.imageUrl;
          previewImg.style.display = 'block';
        }
        if (previewText) previewText.textContent = 'Imagen guardada: ' + item.imageUrl.slice(-30);
        if (btnRemove) btnRemove.style.display = 'inline-block';
      } else {
        if (previewImg) previewImg.style.display = 'none';
        if (previewText) previewText.textContent = 'Sin imagen guardada';
        if (btnRemove) btnRemove.style.display = 'none';
      }
    } else {
      if (title) title.textContent = '➕ Nuevo Producto / Equipo';
      document.getElementById('inventoryForm')?.reset();
      document.getElementById('inventoryId').value = '';
      document.getElementById('invStock').value = 0;
      document.getElementById('invMinStock').value = 5;
      document.getElementById('invPrice').value = 0;
      document.getElementById('invShowInCatalog').value = '1';
      document.getElementById('invImageUrl').value = '';
      if (previewImg) previewImg.style.display = 'none';
      if (previewText) previewText.textContent = 'Sin imagen seleccionada';
      if (btnRemove) btnRemove.style.display = 'none';
    }

    modal.classList.add('show');
  },

  closeModal() {
    const modal = document.getElementById('inventoryModal');
    if (modal) modal.classList.remove('show');
    this.currentItemId = null;
    this.tempImageBase64 = null;
    this.tempImageFilename = null;
  },

  onFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      App.showNotification('Seleccione una imagen PNG, JPG o WEBP', 'warning');
      event.target.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      App.showNotification('La imagen no debe superar 8 MB', 'warning');
      event.target.value = '';
      return;
    }

    this.tempImageFilename = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.tempImageBase64 = e.target.result.split(',')[1];
      const previewImg = document.getElementById('invImagePreview');
      const previewText = document.getElementById('invPreviewText');
      const btnRemove = document.getElementById('btnRemoveImage');

      if (previewImg) { previewImg.src = e.target.result; previewImg.style.display = 'block'; }
      if (previewText) previewText.textContent = `Archivo: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      if (btnRemove) btnRemove.style.display = 'inline-block';
      const urlInput = document.getElementById('invImageUrl');
      if (urlInput) urlInput.value = '';
    };
    reader.readAsDataURL(file);
  },

  onUrlInput(url) {
    const previewImg = document.getElementById('invImagePreview');
    const previewText = document.getElementById('invPreviewText');
    const btnRemove = document.getElementById('btnRemoveImage');

    const clean = String(url || '').trim();
    if (/^(https?:\/\/|data:image\/|\/uploads\/)/i.test(clean)) {
      if (previewImg) {
        previewImg.onerror = () => { previewImg.onerror = null; previewImg.src = this.IMAGE_FALLBACK; };
        previewImg.src = clean;
        previewImg.style.display = 'block';
      }
      if (previewText) previewText.textContent = 'URL externa vinculada';
      if (btnRemove) btnRemove.style.display = 'inline-block';
      this.tempImageBase64 = null;
      this.tempImageFilename = null;
      const fileInput = document.getElementById('invImageFile');
      if (fileInput) fileInput.value = '';
    } else if (!url) {
      if (previewImg) previewImg.style.display = 'none';
      if (previewText) previewText.textContent = 'Sin imagen';
      if (btnRemove) btnRemove.style.display = 'none';
    }
  },

  removeImage() {
    this.tempImageBase64 = null;
    this.tempImageFilename = null;
    const fileInput = document.getElementById('invImageFile');
    const urlInput = document.getElementById('invImageUrl');
    const previewImg = document.getElementById('invImagePreview');
    const previewText = document.getElementById('invPreviewText');
    const btnRemove = document.getElementById('btnRemoveImage');

    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
    if (previewImg) previewImg.style.display = 'none';
    if (previewText) previewText.textContent = 'Sin imagen';
    if (btnRemove) btnRemove.style.display = 'none';
  },

  async save(e) {
    e.preventDefault();
    const idVal = document.getElementById('inventoryId')?.value;
    const id = idVal ? Number(idVal) : null;

    const name = document.getElementById('invName')?.value.trim();
    const category = document.getElementById('invCategory')?.value;
    const brand = document.getElementById('invBrand')?.value.trim();
    const model = document.getElementById('invModel')?.value.trim();
    const stock = Number(document.getElementById('invStock')?.value) || 0;
    const minStock = Number(document.getElementById('invMinStock')?.value) || 5;
    const price = Number(document.getElementById('invPrice')?.value) || 0;
    const description = document.getElementById('invDescription')?.value.trim();
    const features = document.getElementById('invFeatures')?.value.trim();
    const badge = document.getElementById('invBadge')?.value.trim();
    const showInCatalog = document.getElementById('invShowInCatalog')?.value === '1';
    const imageUrl = document.getElementById('invImageUrl')?.value.trim();

    if (!name || !category) {
      App.showNotification('Nombre y categoría son obligatorios', 'warning');
      return false;
    }

    const btn = document.getElementById('btnSaveInventory');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando producto...'; }

    const payload = {
      name, category, brand, model, stock, minStock, price,
      description, features, badge, showInCatalog,
      imageUrl: imageUrl || null
    };

    let saved = null;
    if (id) {
      saved = DB.updateInventoryItem(id, payload);
    } else {
      saved = DB.addInventoryItem(payload);
    }

    if (saved && saved.id) {
      // La imagen seleccionada se persiste en la BD antes de mostrar éxito.
      if (this.tempImageBase64 && this.tempImageFilename) {
        try {
          const uploaded = await DB.uploadInventoryImage(saved.id, this.tempImageFilename, this.tempImageBase64);
          if (!uploaded?.inventoryItem || uploaded.error) {
            throw new Error(uploaded?.error || 'No se pudo guardar la imagen del producto');
          }
        } catch (err) {
          App.showNotification('El producto se guardó, pero la imagen no: ' + (err.message || 'error de conexión'), 'error');
          if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Producto'; }
          return false;
        }
      }

      App.showNotification(`🎉 ¡Producto "${saved.name}" guardado exitosamente!`, 'success');
      this.closeModal();
      this.renderTabContent();
    } else {
      App.showNotification(saved?.error || 'Error al guardar el producto', 'error');
    }

    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Producto'; }
    return false;
  },

  quickAdjustStock(itemId, itemName, currentStock) {
    const input = prompt(`Ajustar stock para "${itemName}".\nStock actual: ${currentStock}\nIngrese el nuevo stock disponible:`, currentStock);
    if (input === null) return;
    const newStock = parseInt(input);
    if (isNaN(newStock) || newStock < 0) {
      App.showNotification('Por favor ingrese un número entero válido mayor o igual a 0', 'warning');
      return;
    }

    const res = DB.updateInventoryItem(itemId, { stock: newStock });
    if (res) {
      App.showNotification(`Stock de "${itemName}" actualizado a ${newStock} unidades`, 'success');
      this.renderTabContent();
    }
  },

  confirmDelete(itemId) {
    const item = DB.getInventoryItem(itemId);
    if (!item) return;
    if (!confirm(`¿Está seguro de eliminar el producto "${item.name}" del inventario?`)) return;

    DB.deleteInventoryItem(itemId);
    App.showNotification(`Producto "${item.name}" eliminado`, 'info');
    this.renderTabContent();
  },

  // ============================================================
  // REGISTRO DE MOVIMIENTOS (SH-I02)
  // ============================================================
  renderMovementsList(container) {
    const movements = DB.getInventoryMovements();
    const user = Auth.getCurrentUser();
    const canRegister = user && (user.role === 'admin' || user.role === 'vendedor');

    container.innerHTML = `
      <div class="module-header" style="margin-bottom:1rem;">
        <div>
          <h3>Kárdex y Movimientos de Inventario</h3>
          <p class="module-subtitle">Historial de entradas, salidas, ventas, devoluciones y ajustes de stock con trazabilidad</p>
        </div>
        ${canRegister ? `
          <button class="btn btn-primary" onclick="InventoryModule.openMovementModal()">
            ➕ Registrar Movimiento Manual
          </button>
        ` : ''}
      </div>

      <div class="card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Tipo de Movimiento</th>
                <th>Cantidad</th>
                <th>Stock Anterior</th>
                <th>Stock Resultante</th>
                <th>Motivo / Referencia</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              ${movements.length === 0 ? `
                <tr><td colspan="8" style="text-align:center;padding:30px;color:var(--gray-500);">No hay movimientos registrados.</td></tr>
              ` : movements.map(m => `
                <tr>
                  <td>${new Date(m.created_at || m.createdAt).toLocaleString('es-PY')}</td>
                  <td><strong>${this.escapeHtml(m.item_name || 'Producto')}</strong></td>
                  <td>
                    <span class="badge ${m.movement_type === 'entrada' || m.movement_type === 'devolucion' ? 'badge-success' : (m.movement_type === 'venta' || m.movement_type === 'salida' ? 'badge-danger' : 'badge-warning')}">
                      ${(m.movement_type || 'movimiento').toUpperCase()}
                    </span>
                  </td>
                  <td><strong>${m.movement_type === 'salida' || m.movement_type === 'venta' ? '-' : '+'}${m.quantity}</strong></td>
                  <td>${m.stock_before !== null ? m.stock_before : '-'}</td>
                  <td><strong>${m.stock_after !== null ? m.stock_after : '-'}</strong></td>
                  <td>${this.escapeHtml(m.notes || m.reference_type || '-')}</td>
                  <td>${m.user_name || 'Sistema'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  openMovementModal() {
    const inventory = DB.getInventory();
    document.getElementById('movementModalOverlay')?.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'movementModalOverlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>Registrar Movimiento de Inventario</h3>
          <button class="modal-close" onclick="document.getElementById('movementModalOverlay').remove()">✕</button>
        </div>
        <form onsubmit="return InventoryModule.submitMovement(event)">
          <div class="modal-body">
            <div class="form-group">
              <label class="required">Producto / Equipo</label>
              <select id="movItemId" class="form-control" required>
                ${inventory.map(i => `<option value="${i.id}">${i.name} (Stock actual: ${i.stock})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="required">Tipo de Movimiento</label>
              <select id="movType" class="form-control" required>
                <option value="entrada">📥 Entrada (Compra / Recepción de mercadería)</option>
                <option value="salida">📤 Salida (Uso en servicio / Desecho)</option>
                <option value="devolucion">↩️ Devolución de cliente</option>
                <option value="ajuste">⚙️ Ajuste de inventario</option>
              </select>
            </div>
            <div class="form-group">
              <label class="required">Cantidad de Unidades</label>
              <input type="number" id="movQty" class="form-control" min="1" value="1" required>
            </div>
            <div class="form-group">
              <label>Motivo / Observación</label>
              <textarea id="movNotes" class="form-control" rows="2" placeholder="Ej: Compra de lote según factura de proveedor..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('movementModalOverlay').remove()">Cancelar</button>
            <button type="submit" class="btn btn-primary">Registrar Movimiento</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  submitMovement(e) {
    e.preventDefault();
    const itemId = Number(document.getElementById('movItemId')?.value);
    const movementType = document.getElementById('movType')?.value;
    const quantity = Number(document.getElementById('movQty')?.value);
    const notes = document.getElementById('movNotes')?.value.trim();

    if (!itemId || !movementType || quantity <= 0) return false;

    const res = DB.addInventoryMovement({ itemId, movementType, quantity, notes });
    if (res && res.ok) {
      App.showNotification('Movimiento de inventario registrado correctamente', 'success');
      document.getElementById('movementModalOverlay')?.remove();
      this.renderTabContent();
    } else {
      App.showNotification(res?.error || 'Error al registrar movimiento', 'error');
    }
    return false;
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};