/* ============================================================
   SYSTEMHOME - Portal del Cliente
   Bienvenida con logo, catálogo de productos/servicios,
   carrito de compras y solicitudes de servicio
   ============================================================ */

const SH_SVG_ICON = (paths) => `<svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const SH_IMAGE_FALLBACK = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="#e8eef5"/><text x="120" y="105" text-anchor="middle" font-size="64">📦</text><text x="120" y="140" text-anchor="middle" font-size="13" fill="#64748b">Imagen no disponible</text></svg>');

const SH_PORTAL_DEFAULT_ICONS = {
    camaras: SH_SVG_ICON('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/><circle cx="9.5" cy="12" r="2.5"/>'),
    ac: SH_SVG_ICON('<rect x="2.5" y="4" width="19" height="7" rx="2"/><path d="M6 8h11"/><path d="M6 14c0 2-1 2-1 4"/><path d="M12 14c0 2-1 2-1 4"/><path d="M18 14c0 2-1 2-1 4"/>'),
    alarma: SH_SVG_ICON('<path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6z"/><path d="M10 19a2 2 0 0 0 4 0"/><path d="M12 6v3"/>'),
    cerca: SH_SVG_ICON('<path d="M3 18V9l3-2 3 2 3-2 3 2 3-2 3 2v9"/><path d="M3 13h18"/><path d="M12 3v4"/><circle cx="12" cy="7" r="1.5"/>'),
    video: SH_SVG_ICON('<rect x="3" y="3" width="13" height="18" rx="2"/><circle cx="9.5" cy="9" r="2.5"/><path d="M5.5 16c.8-1.8 2.2-2.7 4-2.7s3.2.9 4 2.7"/><path d="m19 9 2-1v8l-2-1z"/>'),
    electricidad: SH_SVG_ICON('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>'),
    cableado: SH_SVG_ICON('<rect x="3" y="4" width="6" height="6" rx="1"/><rect x="15" y="14" width="6" height="6" rx="1"/><path d="M9 7h4a3 3 0 0 1 3 3v4"/><path d="M6 10v4a3 3 0 0 0 3 3h6"/>'),
    redes: SH_SVG_ICON('<circle cx="12" cy="5" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M12 7v4"/><path d="M6 16 11 11"/><path d="m18 16-5-5"/><path d="M5 20h14"/>')
};

const ClientPortal = {
    currentView: 'welcome',
    cartItems: [],
    portalIcons: {},

    init() {
        this.loadCart();
        this.loadPortalIcons();
        this.render();
    },

    loadPortalIcons() {
        try {
            const value = DB.getSetting('portal_icons', {});
            this.portalIcons = value && typeof value === 'object' ? value : {};
        } catch (e) {
            this.portalIcons = {};
        }
    },

    productImage(item, extraStyle = '') {
        const src = item.imageUrl || SH_IMAGE_FALLBACK;
        const fallback = this.escapeHtml(SH_IMAGE_FALLBACK);
        const style = `max-width:100%;max-height:120px;object-fit:contain;border-radius:10px;${extraStyle}`;
        return `<img src="${this.escapeHtml(src)}" alt="${this.escapeHtml(item.name || 'Producto')}"
            loading="lazy" referrerpolicy="no-referrer" style="${style}"
            onerror="this.onerror=null;this.src='${fallback}'">`;
    },

    getIcon(key) {
        const custom = this.portalIcons[key];
        if (!custom) return SH_PORTAL_DEFAULT_ICONS[key] || SH_PORTAL_DEFAULT_ICONS.camaras;
        // Los iconos nuevos se seleccionan como archivo y se guardan como data:image.
        // Se conservan http(s) y emoji solo por compatibilidad con valores anteriores.
        if (/^data:image|^https?:\/\//i.test(custom)) {
            return `<img src="${this.escapeHtml(custom)}" alt="" style="width:56px;height:56px;object-fit:contain;">`;
        }
        return `<span style="font-size:48px;line-height:1;">${this.escapeHtml(custom)}</span>`;
    },

    // ============================================================
    // CART STATE MANAGEMENT (localStorage)
    // ============================================================
    loadCart() {
        try {
            const stored = localStorage.getItem('sh_cart');
            this.cartItems = stored ? JSON.parse(stored) : [];
        } catch (e) {
            this.cartItems = [];
        }
    },

    saveCart() {
        localStorage.setItem('sh_cart', JSON.stringify(this.cartItems));
        this.updateCartBadge();
    },

    addToCart(item) {
        const existing = this.cartItems.find(c => c.id === item.id);
        if (existing) {
            existing.quantity += 1;
        } else {
            this.cartItems.push({
                id: item.id,
                name: item.name,
                price: item.price || 0,
                stock: item.stock || 0,
                imageUrl: item.imageUrl || null,
                category: item.category || 'otro',
                quantity: 1
            });
        }
        this.saveCart();
        App.showToast(`${item.name} agregado al carrito`, 'success');
    },

    removeFromCart(itemId) {
        this.cartItems = this.cartItems.filter(c => c.id !== itemId);
        this.saveCart();
        if (this.currentView === 'cart') this.renderCart();
    },

    updateCartQty(itemId, delta) {
        const item = this.cartItems.find(c => c.id === itemId);
        if (!item) return;
        item.quantity += delta;
        if (item.quantity <= 0) {
            this.removeFromCart(itemId);
            return;
        }
        if (item.quantity > item.stock) {
            item.quantity = item.stock;
            App.showToast(`Stock máximo: ${item.stock} unidades`, 'warning');
        }
        this.saveCart();
        if (this.currentView === 'cart') this.renderCart();
    },

    clearCart() {
        if (this.cartItems.length === 0) return;
        if (!confirm('¿Vaciar el carrito completamente?')) return;
        this.cartItems = [];
        this.saveCart();
        this.renderCart();
    },

    getCartTotal() {
        return this.cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    },

    getCartCount() {
        return this.cartItems.reduce((sum, item) => sum + item.quantity, 0);
    },

    updateCartBadge() {
        const badge = document.getElementById('cartNavCount');
        if (badge) {
            const count = this.getCartCount();
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
    },

    // ============================================================
    // NAVIGATION
    // ============================================================
    render() {
        this.renderWelcome();
        this.renderCatalog();
        this.renderCart();
        this.renderRequests();
        this.renderQuotes();
        this.updateCartBadge();
    },

    navigate(view) {
        this.currentView = view;
        document.querySelectorAll('.client-section').forEach(s => s.classList.remove('active'));
        const section = document.getElementById('client-' + view + '-view');
        if (section) section.classList.add('active');

        document.querySelectorAll('.client-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.clientview === view);
        });

        if (view === 'cart') this.renderCart();
    },

    refresh() {
        App.showToast('🔄 Actualizando datos...', 'info');
        this.render();
        App.showToast('✅ Datos actualizados', 'success');
    },

    // ============================================================
    // WELCOME
    // ============================================================
    renderWelcome() {
        const container = document.getElementById('client-welcome-view');
        if (!container) return;

        const logo = localStorage.getItem('sh_logo');

        container.innerHTML = `
        <div class="portal-hero">
            <div class="portal-hero-copy">
                <span class="portal-eyebrow">SEGURIDAD · CLIMATIZACIÓN · REDES</span>
                <h2>Bienvenido a <strong>SYSTEMHOME</strong></h2>
                <p>
                    Protegemos lo que más importa. Encuentra cámaras, alarmas, aire acondicionado y soluciones
                    tecnológicas con <strong>instalación profesional y garantía</strong>.
                </p>
                <div class="portal-hero-actions">
                    <button class="portal-btn portal-btn-primary" onclick="ClientPortal.navigate('catalog')">📦 Explorar catálogo</button>
                    <button class="portal-btn portal-btn-ghost" onclick="ClientPortal.navigate('requests')">📝 Pedir cotización</button>
                </div>
                <div class="portal-hero-contact">
                    <a href="https://wa.me/59164595762" target="_blank" rel="noopener">💬 WhatsApp +591 64595762</a>
                    <a href="tel:+59164595762">📞 Llamarnos</a>
                </div>
            </div>
            <div class="portal-hero-brand">
                <div class="portal-hero-logo" id="clientWelcomeLogo">
                    ${logo ? `<img src="${logo}" alt="SYSTEMHOME" onerror="this.onerror=null;this.src='assets/LOGO.png'">` : '<img src="assets/LOGO.png" alt="SYSTEMHOME">'}
                </div>
                <div class="portal-hero-badge">Soluciones integrales</div>
            </div>
        </div>

        <div class="portal-section-title">
            <span>Nuestros servicios</span>
            <small>Todo lo que necesitas en un solo lugar</small>
        </div>

        <div class="client-services-grid">
            <div class="client-service-card">
                <div class="service-icon">${this.getIcon('camaras')}</div>
                <h4>Cámaras de Vigilancia</h4>
                <p>Sistemas de videovigilancia HD, IP, inalámbricas y grabación 24/7 para tu protección.</p>
            </div>
            <div class="client-service-card">
                <div class="service-icon">${this.getIcon('ac')}</div>
                <h4>Aire Acondicionado</h4>
                <p>Venta e instalación de equipos de aire acondicionado residencial y comercial.</p>
            </div>
            <div class="client-service-card">
                <div class="service-icon">${this.getIcon('alarma')}</div>
                <h4>Sistemas de Alarma</h4>
                <p>Alarmas contra intrusos, sensores de movimiento y monitoreo inteligente.</p>
            </div>
            <div class="client-service-card">
                <div class="service-icon">${this.getIcon('cerca')}</div>
                <h4>Cercas Eléctricas</h4>
                <p>Cercas de seguridad perimetral con sensores y alertas en tiempo real.</p>
            </div>
            <div class="client-service-card">
                <div class="service-icon">${this.getIcon('video')}</div>
                <h4>Video Portero</h4>
                <p>Sistemas de video portero con pantalla táctil, audio bidireccional y acceso remoto.</p>
            </div>
            <div class="client-service-card">
                <div class="service-icon">${this.getIcon('electricidad')}</div>
                <h4>Electricidad</h4>
                <p>Instalaciones eléctricas residenciales, comerciales e industriales.</p>
            </div>
            <div class="client-service-card">
                <div class="service-icon">${this.getIcon('cableado')}</div>
                <h4>Cableado Estructurado</h4>
                <p>Cableado profesional para datos, voz, video y redes corporativas.</p>
            </div>
            <div class="client-service-card">
                <div class="service-icon">${this.getIcon('redes')}</div>
                <h4>Redes e Internet</h4>
                <p>Redes WiFi, fibra óptica, servidores e infraestructura de conectividad.</p>
            </div>
        </div>
        `;
    },

    // ============================================================
    // CATALOG
    // ============================================================
    renderCatalog() {
        const container = document.getElementById('client-catalog-view');
        if (!container) return;

        const catalog = DB.getCatalog();

        // Los id deben coincidir con la columna category de inventory_items.
        const categories = [
            { id: 'camaras', label: '📷 Cámaras' },
            { id: 'alarmas', label: '🔔 Alarmas' },
            { id: 'dvr_nvr', label: '💾 Grabadores' },
            { id: 'ac', label: '❄️ A/Acondicionado' },
            { id: 'cercas', label: '⚡ Cercas' },
            { id: 'videoporteros', label: '📺 Video Portero' },
            { id: 'control_acceso', label: '🔐 Control de acceso' },
            { id: 'redes', label: '🌐 Redes' },
            { id: 'cableado', label: '🔌 Cableado' },
            { id: 'electricidad', label: '💡 Electricidad' },
            { id: 'accesorios', label: '🔧 Accesorios' },
            { id: 'otro', label: '📦 Otros' },
        ];

        const currentCat = this.currentCatalogFilter || 'all';

        container.innerHTML = `
        <div class="catalog-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
            <div>
                <h2>📦 Catálogo de Productos</h2>
                <p>Explora nuestra amplia gama de productos para seguridad, confort y conectividad.</p>
            </div>
            <button class="btn btn-primary" onclick="ClientPortal.downloadCatalogPdf()" style="white-space:nowrap;">📄 Descargar PDF</button>
        </div>

        <div class="catalog-categories" id="catalogCategories">
            <button class="catalog-cat-btn ${currentCat === 'all' ? 'active' : ''}" onclick="ClientPortal.filterCatalog('all')">Todos</button>
            ${categories.map(c => `
                <button class="catalog-cat-btn ${currentCat === c.id ? 'active' : ''}" 
                        onclick="ClientPortal.filterCatalog('${c.id}')">${c.label}</button>
            `).join('')}
        </div>

        <div class="catalog-grid" id="catalogGrid">
            ${this.renderCatalogItems(catalog, currentCat)}
        </div>
        `;
    },

    currentCatalogFilter: 'all',

    filterCatalog(category) {
        this.currentCatalogFilter = category;
        this.renderCatalog();
    },

    async downloadCatalogPdf() {
        try {
            const result = await DB.fetchCatalogPdf(this.currentCatalogFilter || 'all', true);
            window.App?.showToast?.(`Catálogo PDF descargado: ${result.filename}`, 'success');
        } catch (err) {
            window.App?.showToast?.(err.message || 'No se pudo descargar el catálogo en PDF', 'error');
        }
    },

    renderCatalogItems(catalog, filter) {
        let items = filter === 'all' ? catalog : catalog.filter(i => i.category === filter);

        if (items.length === 0) {
            return `<div style="text-align:center;padding:60px 20px;color:var(--gray-500);grid-column:1/-1;">
                <div style="font-size:40px;margin-bottom:12px;">📭</div>
                <h3 style="margin-bottom:6px;">No hay productos en esta categoría</h3>
                <p style="font-size:14px;">Pronto estaremos agregando más productos.</p>
            </div>`;
        }

        const categoryIcons = {
            camaras: '📷', alarmas: '🔔', dvr_nvr: '💾', ac: '❄️',
            cercas: '⚡', videoporteros: '📺', control_acceso: '🔐',
            redes: '🌐', cableado: '🔌', electricidad: '💡',
            accesorios: '🔧', herramientas: '🛠️', otro: '📦'
        };

        return items.map(item => `
        <div class="catalog-item">
            <div class="catalog-item-img" style="background:linear-gradient(135deg, var(--gray-100), var(--gray-200));">
                ${item.badge ? `<span class="cat-badge">${this.escapeHtml(item.badge)}</span>` : ''}
                ${item.imageUrl ? this.productImage(item) :
                    `<span style="font-size:64px;">${categoryIcons[item.category] || '📦'}</span>`}
            </div>
            <div class="catalog-item-info">
                <h4>${this.escapeHtml(item.name)}</h4>
                <div class="item-brand">${this.escapeHtml(item.brand || '')}${item.model ? ' · ' + this.escapeHtml(item.model) : ''}</div>
                <div class="item-desc">${this.escapeHtml(item.description || '')}</div>
                <div class="item-price">${DB.formatCurrency(item.price || 0)}</div>
                <div class="item-cta">
                    ${item.stock > 0 ? `
                    <button class="btn btn-sm btn-primary" onclick="ClientPortal.addToCart(${JSON.stringify({id:item.id,name:item.name,price:item.price,stock:item.stock,imageUrl:item.imageUrl,category:item.category}).replace(/"/g,'&quot;')})">
                        🛒 Agregar al Carrito
                    </button>
                    ` : `
                    <button class="btn btn-sm" disabled style="opacity:0.5;cursor:not-allowed;">
                        Sin Stock
                    </button>
                    `}
                    <button class="btn btn-sm btn-secondary" onclick="ClientPortal.requestProduct('${this.escapeHtml(item.name)}')" style="margin-top:4px;">
                        📝 Solicitar Cotización
                    </button>
                </div>
            </div>
        </div>
        `).join('');
    },

    requestProduct(productName) {
        this.navigate('requests');
        const desc = document.getElementById('clientRequestDesc');
        if (desc) {
            desc.value = `Cotización para: ${productName}\n\n`;
            desc.focus();
        }
        App.showToast(`Cotización solicitada para: ${productName}`, 'info');
    },

    // ============================================================
    // CART
    // ============================================================
    renderCart() {
        const container = document.getElementById('client-cart-view');
        if (!container) return;

        if (this.cartItems.length === 0) {
            container.innerHTML = `
            <div class="cart-empty">
                <div class="cart-empty-icon">🛒</div>
                <h3 style="margin-bottom:8px;">Tu carrito está vacío</h3>
                <p style="margin-bottom:16px;">Agrega productos desde nuestro catálogo para comenzar tu compra.</p>
                <button class="btn btn-primary" onclick="ClientPortal.navigate('catalog')">📦 Ver Catálogo</button>
            </div>
            `;
            return;
        }

        const total = this.getCartTotal();
        const count = this.getCartCount();

        const categoryIcons = {
            camaras: '📷', alarmas: '🔔', dvr_nvr: '💾', ac: '❄️',
            cercas: '⚡', videoporteros: '📺', control_acceso: '🔐',
            redes: '🌐', cableado: '🔌', electricidad: '💡',
            accesorios: '🔧', herramientas: '🛠️', otro: '📦'
        };

        container.innerHTML = `
        <div style="margin-bottom:24px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                <div>
                    <h2 style="font-size:22px;font-weight:700;color:var(--gray-900);">🛒 Mi Carrito</h2>
                    <p style="font-size:14px;color:var(--gray-500);margin-top:4px;">
                        ${count} ${count === 1 ? 'producto' : 'productos'} en tu carrito
                    </p>
                </div>
                <button class="btn btn-sm btn-danger" onclick="ClientPortal.clearCart()">🗑️ Vaciar Carrito</button>
            </div>
        </div>

        <div class="client-cart-layout">
            <div class="client-cart-items">
                ${this.cartItems.map(item => `
                <div class="client-cart-item">
                    <div class="cart-item-img">
                        ${item.imageUrl ? this.productImage(item, 'max-height:64px;') :
                            `${categoryIcons[item.category] || '📦'}`
                        }
                    </div>
                    <div class="cart-item-info">
                        <h4>${this.escapeHtml(item.name)}</h4>
                        <div class="cart-item-price">${DB.formatCurrency(item.price)} × ${item.quantity}</div>
                    </div>
                    <div class="cart-item-qty">
                        <button class="btn-qty" onclick="ClientPortal.updateCartQty(${item.id}, -1)">−</button>
                        <span class="qty-number">${item.quantity}</span>
                        <button class="btn-qty" onclick="ClientPortal.updateCartQty(${item.id}, 1)">+</button>
                    </div>
                    <div class="cart-item-subtotal">${DB.formatCurrency(item.price * item.quantity)}</div>
                    <button class="btn-item-remove" onclick="ClientPortal.removeFromCart(${item.id})" title="Eliminar">✕</button>
                </div>
                `).join('')}
            </div>

            <div class="cart-summary">
                <h3>📋 Resumen del Pedido</h3>
                <div class="cart-summary-row">
                    <span>Productos (${count})</span>
                    <span>${DB.formatCurrency(total)}</span>
                </div>
                <div class="cart-summary-row">
                    <span>Envío</span>
                    <span style="color:var(--success);font-weight:600;">A coordinar</span>
                </div>
                <div class="cart-summary-row cart-total">
                    <span>TOTAL</span>
                    <span>${DB.formatCurrency(total)}</span>
                </div>

                <div class="cart-actions">
                    <a href="https://wa.me/59164595762?text=${encodeURIComponent(this.buildWhatsAppMessage())}" 
                       target="_blank" rel="noopener noreferrer"
                       class="btn btn-success" style="width:100%;justify-content:center;gap:8px;padding:12px;font-size:15px;">
                        📱 Comprar por WhatsApp
                    </a>
                    <button class="btn btn-primary" onclick="ClientPortal.navigate('catalog')" style="width:100%;justify-content:center;gap:8px;padding:12px;">
                        📦 Seguir Comprando
                    </button>
                </div>

                <div style="margin-top:16px;padding:12px;background:var(--gray-50);border-radius:8px;font-size:12px;color:var(--gray-500);text-align:center;">
                    <p style="margin:0;">📞 ¿Necesitas ayuda? Llámanos al <strong>64595762</strong></p>
                    <p style="margin:4px 0 0 0;">📱 O escríbenos por <strong>WhatsApp</strong></p>
                </div>
            </div>
        </div>
        `;
    },

    buildWhatsAppMessage() {
        let msg = '🛒 *Pedido SYSTEMHOME*\n\n';
        msg += '📋 *Productos:*\n';
        this.cartItems.forEach((item, i) => {
            msg += `${i + 1}. ${item.name} x${item.quantity} - ${DB.formatCurrency(item.price * item.quantity)}\n`;
        });
        msg += `\n💰 *TOTAL: ${DB.formatCurrency(this.getCartTotal())}*\n`;
        msg += '\n📍 Dirección de entrega: \n';
        msg += '📌 Referencia: ';
        return msg;
    },

    // ============================================================
    // QUOTES / SOLICITUDES
    // ============================================================
    renderRequests() {
        const container = document.getElementById('client-requests-view');
        if (!container) return;

        const requests = DB.getBudgets().filter(b => b.source === 'client').reverse();

        container.innerHTML = `
        <div style="margin-bottom:24px;">
            <h2 style="font-size:22px;font-weight:700;color:var(--gray-900);">📝 Solicitar Servicio</h2>
            <p style="font-size:14px;color:var(--gray-500);margin-top:4px;">
                Complete el formulario para solicitar una cotización o servicio personalizado.
            </p>
        </div>

        <div class="client-request-form">
            <h3>Nueva Solicitud</h3>
            <form id="clientRequestForm" onsubmit="return false;">
                <div class="form-row">
                    <div class="form-group">
                        <label class="required">Nombre Completo</label>
                        <input type="text" class="form-control" id="clientReqName" placeholder="Su nombre completo" required>
                    </div>
                    <div class="form-group">
                        <label class="required">Teléfono / Celular</label>
                        <input type="text" class="form-control" id="clientReqPhone" placeholder="Ej: (0981) 123-456" required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Correo Electrónico</label>
                        <input type="email" class="form-control" id="clientReqEmail" placeholder="correo@ejemplo.com">
                    </div>
                    <div class="form-group">
                        <label class="required">Tipo de Servicio</label>
                        <select class="form-control" id="clientReqService" required>
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
                    </div>
                </div>
                <div class="form-group">
                    <label class="required">Descripción de lo que necesita</label>
                    <textarea class="form-control" id="clientRequestDesc" rows="4" 
                        placeholder="Describa detalladamente el servicio o producto que necesita..." required></textarea>
                </div>
                <div class="form-group">
                    <label>📍 Ubicación del Servicio</label>
                    <div style="display:flex;gap:8px;margin-bottom:8px;">
                        <input type="text" class="form-control" id="clientReqAddress" placeholder="Dirección (calle, número, referencia)" style="flex:1;">
                        <button type="button" class="btn btn-secondary" onclick="ClientPortal.getLocation()" title="Usar mi ubicación actual" style="white-space:nowrap;">
                            📍 Usar mi ubicación
                        </button>
                    </div>
                    <input type="text" class="form-control" id="clientReqLocation" placeholder="Pegar enlace de Google Maps o coordenadas (opcional)" style="margin-bottom:8px;">
                    <div id="locationPreview" style="display:none;margin-top:8px;padding:10px;background:var(--gray-50);border-radius:8px;border:1px solid var(--gray-200);font-size:13px;color:var(--gray-600);"></div>
                    <div class="form-note" style="font-size:12px;color:var(--gray-500);margin-top:6px;">Puedes usar tu ubicación actual o pegar un enlace de Google Maps para que sepamos exactamente dónde ir.</div>
                </div>
                <button type="button" class="btn btn-primary btn-lg" id="btnSubmitRequest" onclick="ClientPortal.submitRequest()" style="width:100%;justify-content:center;">
                    📨 Enviar Solicitud
                </button>
            </form>
        </div>

        <h3 style="font-size:16px;font-weight:600;color:var(--gray-700);margin-bottom:14px;">📋 Mis Solicitudes Anteriores</h3>
        <div class="requests-list">
            ${requests.length === 0 ? `
                <div style="text-align:center;padding:40px;color:var(--gray-500);background:white;border-radius:var(--radius-md);border:1px solid var(--gray-200);">
                    <div style="font-size:36px;margin-bottom:10px;">📭</div>
                    <p>Aún no has realizado ninguna solicitud.</p>
                </div>
            ` : requests.map(r => `
                <div class="request-card">
                    <div class="request-info">
                        <h4>${this.escapeHtml(r.description ? r.description.substring(0, 60) + '...' : 'Solicitud #' + r.id)}</h4>
                        <p>${DB.formatDate(r.createdAt)} · ${this.getServiceLabel(r.serviceType)}</p>
                    </div>
                    <div class="request-status">
                        <span class="badge ${r.status === 'aprobado' ? 'badge-aprobado' : r.status === 'rechazado' ? 'badge-rechazado' : r.status === 'enviado' ? 'badge-enviado' : 'badge-borrador'}">
                            <span class="dot"></span> ${r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </span>
                    </div>
                </div>
            `).join('')}
        </div>
        `;
    },

    renderQuotes() {
        const container = document.getElementById('client-quotes-view');
        if (!container) return;

        const budgets = DB.getBudgets().filter(b => b.source === 'internal' || b.status === 'enviado' || b.status === 'aprobado' || b.status === 'rechazado');

        const statusMap = {
            borrador: { badge: 'badge-borrador', label: 'Borrador' },
            enviado: { badge: 'badge-enviado', label: 'Enviado' },
            aprobado: { badge: 'badge-aprobado', label: 'Aprobado' },
            rechazado: { badge: 'badge-rechazado', label: 'Rechazado' }
        };

        container.innerHTML = `
        <div style="margin-bottom:24px;">
            <h2 style="font-size:22px;font-weight:700;color:var(--gray-900);">📋 Mis Cotizaciones</h2>
            <p style="font-size:14px;color:var(--gray-500);margin-top:4px;">
                Revise las cotizaciones que le hemos enviado. Puede aprobar o rechazar cada una.
            </p>
        </div>

        ${budgets.length === 0 ? `
            <div style="text-align:center;padding:60px 20px;color:var(--gray-500);background:white;border-radius:var(--radius-md);border:1px solid var(--gray-200);">
                <div style="font-size:48px;margin-bottom:12px;">📭</div>
                <h3 style="margin-bottom:6px;">No tiene cotizaciones aún</h3>
                <p style="font-size:14px;">Cuando solicite un servicio, recibirá una cotización aquí.</p>
            </div>
        ` : budgets.map(b => {
            const items = b.items || [];
            const st = statusMap[b.status] || statusMap.borrador;
            let itemsHtml = '';
            if (items.length > 0) {
                itemsHtml = `
                <table style="width:100%;font-size:13px;margin:12px 0;border-collapse:collapse;">
                    <thead>
                        <tr style="background:var(--gray-50);">
                            <th style="padding:8px;text-align:left;border-bottom:1px solid var(--gray-200);">Concepto</th>
                            <th style="padding:8px;text-align:center;border-bottom:1px solid var(--gray-200);">Cant.</th>
                            <th style="padding:8px;text-align:right;border-bottom:1px solid var(--gray-200);">P. Unitario</th>
                            <th style="padding:8px;text-align:right;border-bottom:1px solid var(--gray-200);">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(it => `
                            <tr>
                                <td style="padding:8px;border-bottom:1px solid var(--gray-100);">${this.escapeHtml(it.concept || it.name || '-')}</td>
                                <td style="padding:8px;text-align:center;border-bottom:1px solid var(--gray-100);">${it.quantity || it.qty || 1}</td>
                                <td style="padding:8px;text-align:right;border-bottom:1px solid var(--gray-100);">${DB.formatCurrency(it.unitPrice || it.price || 0)}</td>
                                <td style="padding:8px;text-align:right;border-bottom:1px solid var(--gray-100);font-weight:600;">${DB.formatCurrency((it.quantity || it.qty || 1) * (it.unitPrice || it.price || 0))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
            }

            return `
            <div style="background:white;border:1px solid var(--gray-200);border-radius:var(--radius-md);margin-bottom:16px;overflow:hidden;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--gray-100);background:var(--gray-50);">
                    <div>
                        <h3 style="font-size:16px;font-weight:700;margin:0;color:var(--gray-900);">${this.escapeHtml(b.number)}</h3>
                        <p style="font-size:12px;color:var(--gray-500);margin:2px 0 0 0;">${DB.formatDate(b.createdAt)} · ${this.getServiceLabel(b.serviceType)}</p>
                    </div>
                    <span class="badge ${st.badge}"><span class="dot"></span> ${st.label}</span>
                </div>
                <div style="padding:16px 20px;">
                    ${b.description ? `<p style="font-size:13px;color:var(--gray-600);margin-bottom:12px;white-space:pre-wrap;">${this.escapeHtml(b.description)}</p>` : ''}
                    ${b.address ? `<p style="font-size:12px;color:var(--gray-500);margin-bottom:8px;">📍 ${this.escapeHtml(b.address)}</p>` : ''}
                    ${itemsHtml}
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;margin-top:12px;padding-top:12px;border-top:1px solid var(--gray-200);">
                        ${b.labor > 0 ? `<div style="font-size:13px;color:var(--gray-600);">Mano de Obra: ${DB.formatCurrency(b.labor)}</div>` : ''}
                        ${b.discount > 0 ? `<div style="font-size:13px;color:var(--gray-600);">Descuento: -${DB.formatCurrency(b.discount)}</div>` : ''}
                        <div style="font-size:20px;font-weight:800;color:var(--primary);">TOTAL: ${DB.formatCurrency(b.total)}</div>
                    </div>
                    ${b.status === 'enviado' ? `
                    <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
                        <button class="btn btn-danger" onclick="ClientPortal.rejectQuote(${b.id})" style="padding:10px 24px;font-weight:600;">
                            ❌ Rechazar
                        </button>
                        <button class="btn btn-success" onclick="ClientPortal.approveQuote(${b.id})" style="padding:10px 24px;font-weight:600;">
                            ✅ Aprobar
                        </button>
                    </div>
                    ` : ''}
                    ${b.status === 'aprobado' ? `<p style="font-size:13px;color:var(--success);font-weight:600;margin-top:12px;text-align:right;">✅ Cotización aprobada - Orden de trabajo generada</p>` : ''}
                    ${b.status === 'rechazado' ? `<p style="font-size:13px;color:var(--danger);font-weight:600;margin-top:12px;text-align:right;">❌ Cotización rechazada${b.rejectionReason ? ': ' + this.escapeHtml(b.rejectionReason) : ''}</p>` : ''}
                </div>
            </div>`;
        }).join('')}
        `;
    },

    approveQuote(budgetId) {
        if (confirm('¿Está seguro de aprobar esta cotización? Se generará una orden de trabajo automáticamente.')) {
            const res = DB.approveBudget(budgetId);
            if (res && res.workOrderNumber) {
                App.showToast(`Cotización aprobada. Orden ${res.workOrderNumber} generada.`, 'success');
            } else {
                App.showToast('Cotización aprobada correctamente.', 'success');
            }
            this.renderQuotes();
        }
    },

    rejectQuote(budgetId) {
        const reason = prompt('Indique el motivo del rechazo (opcional):');
        if (reason !== null) {
            DB.rejectBudget(budgetId, reason);
            App.showToast('Cotización rechazada', 'warning');
            this.renderQuotes();
        }
    },

    getLocation() {
        if (!navigator.geolocation) {
            App.showToast('Tu navegador no soporta geolocalización', 'warning');
            return;
        }
        App.showToast('Obteniendo tu ubicación...', 'info');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
                const locInput = document.getElementById('clientReqLocation');
                if (locInput) locInput.value = mapsUrl;
                const preview = document.getElementById('locationPreview');
                if (preview) {
                    preview.style.display = 'block';
                    preview.innerHTML = `✅ Ubicación obtenida:<br><strong>Lat:</strong> ${lat.toFixed(6)}, <strong>Lng:</strong> ${lng.toFixed(6)}<br><a href="${mapsUrl}" target="_blank" style="color:var(--primary);">Ver en Google Maps</a>`;
                }
                App.showToast('✅ Ubicación obtenida correctamente', 'success');
            },
            (error) => {
                let msg = 'No se pudo obtener la ubicación';
                if (error.code === 1) msg = 'Permiso denegado. Activa la ubicación en tu navegador.';
                else if (error.code === 2) msg = 'Ubicación no disponible. Intenta de nuevo.';
                else if (error.code === 3) msg = 'Tiempo de espera agotado. Intenta de nuevo.';
                App.showToast(msg, 'warning');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    },

    async submitRequest() {
        const name = document.getElementById('clientReqName')?.value.trim();
        const phone = document.getElementById('clientReqPhone')?.value.trim();
        const email = document.getElementById('clientReqEmail')?.value.trim() || '';
        const service = document.getElementById('clientReqService')?.value;
        const desc = document.getElementById('clientRequestDesc')?.value.trim();
        const address = document.getElementById('clientReqAddress')?.value.trim() || '';
        const location = document.getElementById('clientReqLocation')?.value.trim() || '';

        if (!name) { App.showToast('Ingrese su nombre', 'warning'); return; }
        if (!phone) { App.showToast('Ingrese su teléfono', 'warning'); return; }
        if (!service) { App.showToast('Seleccione un tipo de servicio', 'warning'); return; }
        if (!desc) { App.showToast('Describa lo que necesita', 'warning'); return; }

        let fullDesc = desc;
        if (address) fullDesc += `\n\n📍 Dirección: ${address}`;
        if (location) fullDesc += `\n🗺️ Ubicación: ${location}`;

        let latitude = null;
        let longitude = null;
        const coords = location.match(/(?:q=|@|ll=)?(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
        if (coords) {
            latitude = Number(coords[1]);
            longitude = Number(coords[2]);
        }

        const btn = document.getElementById('btnSubmitRequest');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Enviando...'; }

        try {
            const result = await DB.submitQuoteRequest({
                clientId: null,
                clientName: name,
                clientPhone: phone,
                clientEmail: email,
                clientAddress: address,
                serviceType: service,
                description: fullDesc,
                address,
                reference: location,
                latitude,
                longitude,
                priority: 'normal',
                createBudget: true,
                items: [{ concept: desc.substring(0, 120), qty: 1, price: 0 }]
            });
            const number = result?.request?.number || result?.budget?.number || '';
            App.showToast(`✅ Solicitud ${number} enviada. El equipo ya fue notificado.`, 'success');
            document.getElementById('clientRequestForm')?.reset();
            document.getElementById('locationPreview')?.style.setProperty('display', 'none');
            this.renderRequests();
            this.renderQuotes();
        } catch (err) {
            console.error(err);
            App.showToast(err.message || 'No se pudo enviar la solicitud. Intente nuevamente.', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '📨 Enviar Solicitud'; }
        }
    },

    getServiceLabel(type) {
        const map = {
            camaras: '📷 Cámaras', alarma: '🔔 Alarmas', ac: '❄️ A/Acond.',
            cerca: '⚡ Cerca Eléc.', video: '📺 Video Portero',
            electricidad: '🔌 Electricidad', cableado: '🔗 Cableado',
            redes: '🌐 Redes/Internet', otro: '📋 Otro'
        };
        return map[type] || type;
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
};
