const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const { db, initSchema, seedData, all, get, run } = require('./db');
const { isCloudinaryConfigured, uploadBase64, saveUploadedFile } = require('./cloudinary');

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-systemhome-2026';

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) {
      callback(null, true);
    } else {
      callback(null, true); // Permite acceso para desarrollo y pruebas
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.use(express.static(path.join(__dirname, '..', 'systemhome')));
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// Health check endpoints for Render / monitoring
app.get(['/health', '/api/health'], (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ============================================================
// HELPERS & MIDDLEWARES
// ============================================================
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  let token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) token = req.query.token || '';
  if (!token) return res.status(401).json({ error: 'Token de autenticación requerido' });

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.email, u.phone, u.active, u.role_id, r.name as role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `).get(decoded.id || decoded.user_id);

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role_name || 'cliente',
      roleId: user.role_id
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireRole(roles = []) {
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    const userRole = (req.user.role || '').toLowerCase();
    const normalizedRoles = roles.map(r => r.toLowerCase());
    if (!normalizedRoles.includes(userRole)) {
      return res.status(403).json({ error: `Acceso denegado. Se requiere uno de los siguientes roles: ${roles.join(', ')}` });
    }
    next();
  };
}

function audit(req, action, moduleName, recordType = null, recordId = null, prevState = null, newState = null) {
  try {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, role, action, module, record_type, record_id, previous_state, new_state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req?.user ? req.user.id : null,
      req?.user ? req.user.username : 'sistema',
      req?.user ? req.user.role : 'sistema',
      action, moduleName, recordType, recordId,
      prevState ? JSON.stringify(prevState) : null,
      newState ? JSON.stringify(newState) : null,
      now
    );
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

function notify(userId, type, title, message, data = null) {
  try {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, data, read, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(userId || null, type, title, message, data ? JSON.stringify(data) : null, now);
  } catch (e) {
    console.error('Notification error:', e.message);
  }
}

function notifyAdmins(type, title, message, data = null) {
  try {
    const admins = db.prepare("SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'admin')").all();
    admins.forEach(a => notify(a.id, type, title, message, data));
  } catch (e) {
    console.error('Notify admins error:', e.message);
  }
}

function notifyRole(roleName, type, title, message, data = null) {
  try {
    const users = db.prepare("SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE name = ?)").all(roleName);
    users.forEach(u => notify(u.id, type, title, message, data));
  } catch (e) {
    console.error('Notify role error:', e.message);
  }
}

// Helpers para generación secuencial de códigos
function ensureNumber(table, prefix) {
  const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count + 1;
  return `${prefix}-${String(count).padStart(4, '0')}`;
}

function ensureRequestNumber() { return ensureNumber('requests', 'SOL'); }
function ensureBudgetNumber() { return ensureNumber('budgets', 'PR'); }
function ensureOrderNumber() { return ensureNumber('work_orders', 'OT'); }
function ensureSaleNumber() { return ensureNumber('sales', 'VTA'); }
function ensureInvoiceNumber() { return ensureNumber('invoices', 'FAC'); }

// Normalización de servicios
function resolveService(serviceTypeOrName) {
  if (!serviceTypeOrName) return { id: null, name: 'Otro' };
  const str = String(serviceTypeOrName).trim();
  const slugMap = {
    'camaras': 'Cámaras de Vigilancia',
    'camara': 'Cámaras de Vigilancia',
    'alarma': 'Sistemas de Alarma',
    'alarmas': 'Sistemas de Alarma',
    'ac': 'Aire Acondicionado',
    'aire': 'Aire Acondicionado',
    'cerca': 'Cerca Eléctrica',
    'cercas': 'Cerca Eléctrica',
    'video': 'Video Portero',
    'videoporteros': 'Video Portero',
    'control_acceso': 'Control de Acceso',
    'electricidad': 'Electricidad',
    'cable': 'Cableado Estructurado',
    'cableado': 'Cableado Estructurado',
    'redes': 'Redes e Internet',
    'otro': 'Otro'
  };

  const lookupName = slugMap[str.toLowerCase()] || str;
  const row = db.prepare('SELECT id, name FROM services WHERE LOWER(name) = LOWER(?) OR id = ?').get(lookupName, Number(str) || -1);
  if (row) return row;
  return { id: null, name: lookupName };
}

// Auto-vinculación de cliente para usuario logueado
function getOrCreateClientIdForUser(user) {
  if (!user) return null;
  // 1. Buscar por email
  if (user.email) {
    const existing = db.prepare('SELECT id FROM clients WHERE LOWER(email) = LOWER(?)').get(user.email);
    if (existing) return existing.id;
  }
  // 2. Buscar por teléfono
  if (user.phone) {
    const existing = db.prepare('SELECT id FROM clients WHERE phone = ?').get(user.phone);
    if (existing) return existing.id;
  }
  // 3. Buscar por creador
  const byCreator = db.prepare('SELECT id FROM clients WHERE created_by_user_id = ? ORDER BY id DESC LIMIT 1').get(user.id);
  if (byCreator) return byCreator.id;

  // 4. Crear registro de cliente automáticamente para usuarios cliente
  const now = new Date().toISOString();
  const ruc = `CI-${user.username}-${user.id}`;
  const insert = db.prepare(`
    INSERT INTO clients (name, ruc, address, phone, email, client_type, active, created_at, updated_at, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, 'persona', 1, ?, ?, ?)
  `).run(user.name || user.username, ruc, '', user.phone || '', user.email || '', now, now, user.id);
  return insert.lastInsertRowid;
}

// ============================================================
// FORMATTERS
// ============================================================
function formatUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.full_name || user.username,
    fullName: user.full_name || user.username,
    email: user.email || '',
    phone: user.phone || '',
    role: user.role_name || user.role || 'cliente',
    roleId: user.role_id,
    active: !!user.active,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

function formatClient(c) {
  return {
    id: c.id,
    name: c.name,
    ruc: c.ruc || '',
    address: c.address || '',
    street: c.street || '',
    number: c.number || '',
    neighborhood: c.neighborhood || '',
    city: c.city || '',
    reference: c.reference || '',
    latitude: c.latitude || null,
    longitude: c.longitude || null,
    phone: c.phone || '',
    email: c.email || '',
    type: c.client_type,
    active: !!c.active,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    createdByUserId: c.created_by_user_id
  };
}

function formatRequest(r) {
  return {
    id: r.id,
    number: r.number,
    clientId: r.client_id,
    clientName: r.client_name || '',
    clientPhone: r.client_phone || '',
    clientEmail: r.client_email || '',
    userId: r.user_id,
    serviceId: r.service_id,
    serviceType: r.service_type,
    serviceName: r.service_name || r.service_type || 'General',
    description: r.description,
    address: r.address || '',
    latitude: r.latitude || null,
    longitude: r.longitude || null,
    reference: r.reference || '',
    priority: r.priority || 'normal',
    status: r.status || 'pendiente',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    reviewedAt: r.reviewed_at,
    reviewedByUserId: r.reviewed_by_user_id
  };
}

function formatBudget(b) {
  let items = [];
  try { items = typeof b.items === 'string' ? JSON.parse(b.items || '[]') : (b.items || []); } catch (e) { items = []; }
  return {
    id: b.id,
    number: b.number,
    clientId: b.client_id,
    clientName: b.client_name || '',
    requestId: b.request_id,
    serviceId: b.service_id,
    serviceType: b.service_type || b.service_name || 'otro',
    serviceName: b.service_name || b.service_type || 'General',
    description: b.description || '',
    items: items,
    labor: b.labor || 0,
    discount: b.discount || 0,
    total: b.total || 0,
    status: b.status || 'borrador',
    source: b.source || 'internal',
    validUntil: b.valid_until || '',
    conditions: b.conditions || '',
    observations: b.observations || '',
    estimatedTime: b.estimated_time || '',
    address: b.address || '',
    latitude: b.latitude || null,
    longitude: b.longitude || null,
    reference: b.reference || '',
    sentAt: b.sent_at || null,
    sentByUserId: b.sent_by_user_id,
    rejectionReason: b.rejection_reason || '',
    rejectedAt: b.rejected_at || null,
    rejectedByUserId: b.rejected_by_user_id,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    createdByUserId: b.created_by_user_id,
    approvedAt: b.approved_at || null,
    approvedByUserId: b.approved_by_user_id
  };
}

function formatWorkOrder(w) {
  let obs = [];
  let mats = [];
  let equips = [];
  let photos = [];
  try { obs = typeof w.observations === 'string' ? JSON.parse(w.observations || '[]') : (w.observations || []); } catch (e) { obs = []; }
  try { mats = typeof w.materials_used === 'string' ? JSON.parse(w.materials_used || '[]') : (w.materials_used || []); } catch (e) { mats = []; }
  try { equips = typeof w.installed_equipment === 'string' ? JSON.parse(w.installed_equipment || '[]') : (w.installed_equipment || []); } catch (e) { equips = []; }
  try { photos = typeof w.evidence_photos === 'string' ? JSON.parse(w.evidence_photos || '[]') : (w.evidence_photos || []); } catch (e) { photos = []; }

  return {
    id: w.id,
    number: w.number,
    budgetId: w.budget_id,
    clientId: w.client_id,
    clientName: w.client_name || '',
    serviceId: w.service_id,
    serviceType: w.service_type || 'otro',
    serviceName: w.service_name || w.service_type || 'General',
    technicianId: w.technician_id,
    technicianName: w.technician_name || 'Sin asignar',
    scheduledDate: w.scheduled_date || '',
    priority: w.priority || 'normal',
    description: w.description || '',
    status: w.status || 'pendiente',
    observations: obs,
    address: w.address || '',
    latitude: w.latitude || null,
    longitude: w.longitude || null,
    workDone: w.work_done || '',
    materialsUsed: mats,
    installedEquipment: equips,
    clientSignature: w.client_signature || '',
    evidencePhotos: photos,
    closureNotes: w.closure_notes || '',
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    completedAt: w.completed_at || null,
    closedAt: w.closed_at || null,
    completedByUserId: w.completed_by_user_id,
    closedByUserId: w.closed_by_user_id
  };
}

function formatInventoryItem(i) {
  let imageUrl = i.image_url || null;
  if (!imageUrl && i.image_path) {
    imageUrl = `/uploads/${i.image_path}`;
  }
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    brand: i.brand || '',
    model: i.model || '',
    stock: Number(i.stock) || 0,
    minStock: Number(i.min_stock) || 5,
    price: Number(i.price) || 0,
    description: i.description || '',
    features: i.features || '',
    badge: i.badge || null,
    imagePath: i.image_path || null,
    imageUrl: imageUrl,
    showInCatalog: !!i.show_in_catalog,
    active: !!i.active,
    createdAt: i.created_at,
    updatedAt: i.updated_at
  };
}

function formatMaintenance(m) {
  let mats = [];
  let photos = [];
  try { mats = typeof m.materials_used === 'string' ? JSON.parse(m.materials_used || '[]') : (m.materials_used || []); } catch (e) { mats = []; }
  try { photos = typeof m.evidence_photos === 'string' ? JSON.parse(m.evidence_photos || '[]') : (m.evidence_photos || []); } catch (e) { photos = []; }

  return {
    id: m.id,
    clientId: m.client_id,
    clientName: m.client_name || '',
    technicianId: m.technician_id,
    technicianName: m.technician_name || '',
    inventoryItemId: m.inventory_item_id,
    equipmentName: m.equipment_name || m.item_name || '',
    nextMaintenanceDate: m.next_maintenance_date || '',
    scheduledTime: m.scheduled_time || '',
    maintenanceType: m.maintenance_type,
    frequency: m.frequency || 'Unica vez',
    status: m.status || 'programado',
    description: m.description || '',
    notes: m.notes || '',
    workDone: m.work_done || '',
    materialsUsed: mats,
    evidencePhotos: photos,
    latitude: m.latitude || null,
    longitude: m.longitude || null,
    createdAt: m.created_at,
    confirmedAt: m.confirmed_at || null,
    completedAt: m.completed_at || null,
    performedByUserId: m.performed_by_user_id
  };
}

function formatWarranty(w) {
  return {
    id: w.id,
    clientId: w.client_id,
    clientName: w.client_name || '',
    inventoryItemId: w.inventory_item_id,
    itemName: w.item_name || '',
    installationDate: w.installation_date || '',
    expiryDate: w.expiry_date || '',
    durationMonths: w.duration_months || 12,
    conditions: w.conditions || '',
    status: w.status || 'vigente',
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    createdByUserId: w.created_by_user_id
  };
}

function formatSale(s) {
  let items = [];
  try {
    items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(s.id);
  } catch (e) { items = []; }

  return {
    id: s.id,
    saleNumber: s.sale_number,
    clientId: s.client_id,
    clientName: s.client_name || 'Venta al Paso',
    sellerId: s.seller_id,
    sellerName: s.seller_name || 'Vendedor',
    subtotal: Number(s.subtotal) || 0,
    discount: Number(s.discount) || 0,
    total: Number(s.total) || 0,
    paymentMethod: s.payment_method || 'efectivo',
    status: s.status || 'pagada',
    cashReceived: s.cash_received !== null ? Number(s.cash_received) : null,
    cashChange: s.cash_change !== null ? Number(s.cash_change) : null,
    qrReference: s.qr_reference || '',
    qrReceipt: s.qr_receipt || '',
    notes: s.notes || '',
    items: items,
    createdAt: s.created_at,
    updatedAt: s.updated_at
  };
}

function formatInvoice(inv) {
  let items = [];
  try { items = typeof inv.items_json === 'string' ? JSON.parse(inv.items_json || '[]') : (inv.items_json || []); } catch (e) { items = []; }
  return {
    id: inv.id,
    invoiceNumber: inv.invoice_number,
    saleId: inv.sale_id,
    clientId: inv.client_id,
    clientName: inv.client_name,
    clientRuc: inv.client_ruc || '',
    clientAddress: inv.client_address || '',
    items: items,
    subtotal: Number(inv.subtotal) || 0,
    total: Number(inv.total) || 0,
    paymentMethod: inv.payment_method,
    status: inv.status,
    pdfPath: inv.pdf_path,
    createdAt: inv.created_at,
    updatedAt: inv.updated_at
  };
}

// ============================================================
// BACKGROUND ALERT DETECTORS
// ============================================================
function detectStockAlerts() {
  try {
    const now = new Date().toISOString();
    const lowItems = db.prepare('SELECT * FROM inventory_items WHERE active = 1 AND stock <= min_stock').all();
    lowItems.forEach(item => {
      const existing = db.prepare("SELECT id FROM stock_alerts WHERE item_id = ? AND status = 'pendiente'").get(item.id);
      if (!existing) {
        db.prepare('INSERT INTO stock_alerts (item_id, alert_type, stock_current, stock_min, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(item.id, 'stock_minimo', item.stock, item.min_stock, 'pendiente', now);
        notifyAdmins('stock_alerta', '⚠️ Alerta de Stock Mínimo', `El producto "${item.name}" tiene stock crítico (${item.stock} disponibles, mínimo: ${item.min_stock}).`, { itemId: item.id });
      }
    });
  } catch (e) {
    console.error('Stock alerts error:', e.message);
  }
}

function detectMaintenanceAlerts() {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const maintenances = db.prepare("SELECT * FROM maintenances WHERE status = 'programado' AND next_maintenance_date IS NOT NULL").all();

    maintenances.forEach(m => {
      const maintDate = new Date(m.next_maintenance_date);
      const diffDays = Math.ceil((maintDate - today) / (1000 * 60 * 60 * 24));

      const check = (days, col, typeLabel) => {
        if (diffDays === days && !m[col]) {
          db.prepare(`UPDATE maintenances SET ${col} = 1 WHERE id = ?`).run(m.id);
          db.prepare('INSERT INTO maintenance_alerts (maintenance_id, alert_type, days_before, notified_at, status) VALUES (?, ?, ?, ?, ?)')
            .run(m.id, `${days}_dias`, days, new Date().toISOString(), 'enviada');
          const client = m.client_id ? db.prepare('SELECT * FROM clients WHERE id = ?').get(m.client_id) : null;
          const msg = `Mantenimiento de "${m.equipment_name || 'equipo'}" (${client ? client.name : 'Cliente'}) para ${m.next_maintenance_date} (${days === 0 ? '¡HOY!' : 'en ' + days + ' días'}).`;
          notifyAdmins('mantenimiento_alerta', '🛠️ Alerta de Mantenimiento', msg, { maintenanceId: m.id });
          if (m.technician_id) {
            const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(m.technician_id);
            const techUser = tech ? db.prepare('SELECT id FROM users WHERE email = ? OR phone = ?').get(tech.email, tech.phone) : null;
            if (techUser) notify(techUser.id, 'mantenimiento_alerta', '🛠️ Mantenimiento Asignado Próximo', msg, { maintenanceId: m.id });
          }
        }
      };

      check(15, 'alert_sent_15', '15 días antes');
      check(7, 'alert_sent_7', '7 días antes');
      check(0, 'alert_sent_0', 'Día del mantenimiento');

      if (diffDays < 0 && m.status === 'programado') {
        db.prepare("UPDATE maintenances SET status = 'vencido' WHERE id = ?").run(m.id);
        notifyAdmins('mantenimiento_vencido', '❌ Mantenimiento Vencido', `El mantenimiento programado para ${m.next_maintenance_date} ha vencido sin ejecución.`, { maintenanceId: m.id });
      }
    });
  } catch (e) {
    console.error('Maintenance alerts error:', e.message);
  }
}

function updateWarrantyStatuses() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    db.prepare("UPDATE warranties SET status = 'vencida' WHERE status = 'vigente' AND expiry_date IS NOT NULL AND expiry_date < ?").run(today);
  } catch (e) {
    console.error('Warranty update error:', e.message);
  }
}



// ============================================================
// RUTAS DE AUTENTICACIÓN Y USUARIOS
// ============================================================
app.get('/api/health', (req, res) => res.json({ ok: true, message: 'SYSTEMHOME API operativa y segura', version: '2.0.0' }));

app.get('/api/auth/check-username', (req, res) => {
  const username = (req.query.username || '').trim();
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username);
  res.json({ exists: !!existing });
});

// Helper: verificar contraseña compatible con SHA256 (legacy Python) y bcrypt (Node.js)
function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith('$2')) {
    try { return bcrypt.compareSync(password, storedHash); } catch (e) { return false; }
  }
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    return hash.toLowerCase() === storedHash.toLowerCase();
  }
  return false;
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const user = db.prepare(`
    SELECT u.*, r.name as role_name
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE LOWER(u.username) = LOWER(?)
  `).get(username.trim());

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  if (!user.active) return res.status(403).json({ error: 'Cuenta de usuario inactiva. Contacte al administrador.' });

  // Migrar hash SHA256 a bcrypt automáticamente
  if (!user.password_hash.startsWith('$2')) {
    const newHash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role_name || 'cliente' }, jwtSecret, { expiresIn: '12h' });
  audit(req, 'login', 'auth', 'user', user.id, null, { username: user.username });
  res.json({ token, user: formatUser(user) });
});

app.post('/api/auth/register', (req, res) => {
  const { username, password, name, email, phone } = req.body;
  if (!username || !password || !name) return res.status(400).json({ error: 'Complete todos los campos requeridos' });

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
  if (existing) return res.status(409).json({ error: 'El nombre de usuario ya está registrado' });

  const clientRole = db.prepare("SELECT id FROM roles WHERE name = 'cliente'").get();
  const roleId = clientRole ? clientRole.id : 4;
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(password, 10);

  const result = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, email, phone, role_id, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(username.trim(), hash, name.trim(), email ? email.trim() : '', phone ? phone.trim() : '', roleId, now, now);

  const newUserId = result.lastInsertRowid;
  // Crear ficha de cliente automáticamente vinculada
  const rucAuto = `CI-${username.trim()}-${newUserId}`;
  db.prepare(`
    INSERT INTO clients (name, ruc, address, phone, email, client_type, active, created_at, updated_at, created_by_user_id)
    VALUES (?, ?, '', ?, ?, 'persona', 1, ?, ?, ?)
  `).run(name.trim(), rucAuto, phone ? phone.trim() : '', email ? email.trim() : '', now, now, newUserId);

  const user = db.prepare(`SELECT u.*, r.name as role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`).get(newUserId);
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role_name }, jwtSecret, { expiresIn: '12h' });
  audit(req, 'registro_cliente', 'auth', 'user', user.id, null, { username: user.username });
  notifyAdmins('nuevo_cliente_registrado', 'Nuevo cliente registrado', `El cliente ${user.full_name} (${user.username}) ha creado su cuenta.`, { userId: user.id });
  res.status(201).json({ token, user: formatUser(user) });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.prepare(`SELECT u.*, r.name as role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user: formatUser(user) });
});

app.get('/api/roles', authMiddleware, (req, res) => {
  const roles = db.prepare('SELECT id, name, description FROM roles ORDER BY id').all();
  res.json({ roles });
});

app.get('/api/users', authMiddleware, requireRole(['admin']), (req, res) => {
  const rows = db.prepare(`SELECT u.*, r.name as role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id ORDER BY u.id DESC`).all();
  res.json({ users: rows.map(formatUser) });
});

app.post('/api/users', authMiddleware, requireRole(['admin']), (req, res) => {
  const { username, password, name, email, phone, role = 'vendedor', active = true } = req.body;
  if (!username || !password || !name) return res.status(400).json({ error: 'Complete los campos obligatorios' });

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
  if (existing) return res.status(409).json({ error: 'El nombre de usuario ya existe' });

  const roleRow = db.prepare('SELECT id FROM roles WHERE LOWER(name) = LOWER(?)').get(role);
  if (!roleRow) return res.status(400).json({ error: `Rol inválido: ${role}` });

  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, email, phone, role_id, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(username.trim(), hash, name.trim(), email ? email.trim() : '', phone ? phone.trim() : '', roleRow.id, active ? 1 : 0, now, now);

  const user = db.prepare(`SELECT u.*, r.name as role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`).get(result.lastInsertRowid);
  audit(req, 'usuario_creado', 'users', 'user', user.id, null, { username: user.username, role });
  res.status(201).json({ user: formatUser(user) });
});

app.put('/api/users/:id', authMiddleware, requireRole(['admin']), (req, res) => {
  const userId = Number(req.params.id);
  const { username, name, email, phone, role, active, password } = req.body;
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!current) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (username && username.trim().toLowerCase() !== current.username.toLowerCase()) {
    const dup = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?').get(username.trim(), userId);
    if (dup) return res.status(409).json({ error: 'Nombre de usuario duplicado' });
  }

  const roleRow = role ? db.prepare('SELECT id FROM roles WHERE LOWER(name) = LOWER(?)').get(role) : null;
  let hash = current.password_hash;
  if (password && password.trim().length >= 6) {
    hash = bcrypt.hashSync(password.trim(), 10);
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users SET username = ?, full_name = ?, email = ?, phone = ?, role_id = ?, active = ?, password_hash = ?, updated_at = ? WHERE id = ?
  `).run(
    username ? username.trim() : current.username,
    name ? name.trim() : current.full_name,
    email !== undefined ? (email ? email.trim() : '') : current.email,
    phone !== undefined ? (phone ? phone.trim() : '') : current.phone,
    roleRow ? roleRow.id : current.role_id,
    active !== undefined ? (active ? 1 : 0) : current.active,
    hash,
    now,
    userId
  );

  const updated = db.prepare(`SELECT u.*, r.name as role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`).get(userId);
  audit(req, 'usuario_modificado', 'users', 'user', userId, { username: current.username }, { username: updated.username });
  res.json({ user: formatUser(updated) });
});

app.delete('/api/users/:id', authMiddleware, requireRole(['admin']), (req, res) => {
  const userId = Number(req.params.id);
  if (req.user.id === userId) return res.status(400).json({ error: 'No puede eliminarse a sí mismo' });
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!current) return res.status(404).json({ error: 'Usuario no encontrado' });
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  audit(req, 'usuario_eliminado', 'users', 'user', userId, { username: current.username }, null);
  res.json({ ok: true });
});

// ============================================================
// CLIENTES Y UBICACIÓN GPS
// ============================================================
app.get('/api/clients', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const rows = db.prepare('SELECT * FROM clients ORDER BY id DESC').all();
  res.json({ clients: rows.map(formatClient) });
});

app.post('/api/clients', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const { name, ruc, address, street, number, neighborhood, city, reference, latitude, longitude, phone, email, type = 'persona', active = true } = req.body;
  if (!name || !ruc) return res.status(400).json({ error: 'Nombre y RUC/CI son obligatorios' });

  const existing = db.prepare('SELECT id FROM clients WHERE LOWER(ruc) = LOWER(?)').get(ruc.trim());
  if (existing) return res.status(409).json({ error: 'RUC/CI ya registrado en el sistema' });

  const now = new Date().toISOString();
  const fullAddress = address || [street, number, neighborhood, city].filter(Boolean).join(', ');
  const result = db.prepare(`
    INSERT INTO clients (name, ruc, address, street, number, neighborhood, city, reference, latitude, longitude, phone, email, client_type, active, created_at, updated_at, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name.trim(), ruc.trim(), fullAddress, street || '', number || '', neighborhood || '', city || '', reference || '', latitude || null, longitude || null, phone || '', email || '', type, active ? 1 : 0, now, now, req.user.id);

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
  db.prepare('INSERT INTO client_history (client_id, entry_type, description, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?)').run(client.id, 'cliente_creado', 'Cliente registrado en el sistema', now, req.user.id);
  audit(req, 'cliente_creado', 'clients', 'client', client.id, null, { name: client.name, ruc: client.ruc });
  res.status(201).json({ client: formatClient(client) });
});

app.put('/api/clients/:id', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const clientId = Number(req.params.id);
  const { name, ruc, address, street, number, neighborhood, city, reference, latitude, longitude, phone, email, type, active } = req.body;
  const current = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!current) return res.status(404).json({ error: 'Cliente no encontrado' });

  if (ruc && ruc.trim().toLowerCase() !== (current.ruc || '').toLowerCase()) {
    const existing = db.prepare('SELECT id FROM clients WHERE LOWER(ruc) = LOWER(?) AND id != ?').get(ruc.trim(), clientId);
    if (existing) return res.status(409).json({ error: 'RUC/CI ya registrado por otro cliente' });
  }

  const now = new Date().toISOString();
  const fullAddress = address !== undefined ? address : [street, number, neighborhood, city].filter(Boolean).join(', ');

  db.prepare(`
    UPDATE clients SET name = ?, ruc = ?, address = ?, street = ?, number = ?, neighborhood = ?, city = ?, reference = ?, latitude = ?, longitude = ?, phone = ?, email = ?, client_type = ?, active = ?, updated_at = ? WHERE id = ?
  `).run(
    name ? name.trim() : current.name,
    ruc ? ruc.trim() : current.ruc,
    fullAddress || current.address,
    street !== undefined ? street : current.street,
    number !== undefined ? number : current.number,
    neighborhood !== undefined ? neighborhood : current.neighborhood,
    city !== undefined ? city : current.city,
    reference !== undefined ? reference : current.reference,
    latitude !== undefined ? latitude : current.latitude,
    longitude !== undefined ? longitude : current.longitude,
    phone !== undefined ? phone : current.phone,
    email !== undefined ? email : current.email,
    type || current.client_type,
    active !== undefined ? (active ? 1 : 0) : current.active,
    now,
    clientId
  );

  const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  db.prepare('INSERT INTO client_history (client_id, entry_type, description, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?)').run(clientId, 'cliente_actualizado', 'Datos de cliente actualizados', now, req.user.id);
  audit(req, 'cliente_modificado', 'clients', 'client', clientId, { name: current.name }, { name: updated.name });
  res.json({ client: formatClient(updated) });
});

app.delete('/api/clients/:id', authMiddleware, requireRole(['admin']), (req, res) => {
  const clientId = Number(req.params.id);
  const current = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!current) return res.status(404).json({ error: 'Cliente no encontrado' });
  db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);
  audit(req, 'cliente_eliminado', 'clients', 'client', clientId, { name: current.name }, null);
  res.json({ ok: true });
});

// SH-A03: Historial Integral del Cliente
app.get('/api/clients/:id/history', authMiddleware, (req, res) => {
  const clientId = Number(req.params.id);
  // Si es cliente, solo puede ver su propio historial
  if (req.user.role === 'cliente') {
    const myClientId = getOrCreateClientIdForUser(req.user);
    if (myClientId !== clientId) {
      return res.status(403).json({ error: 'No autorizado para consultar el historial de otro cliente' });
    }
  }

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  const history = db.prepare('SELECT * FROM client_history WHERE client_id = ? ORDER BY created_at DESC').all(clientId);
  const requestsList = db.prepare(`SELECT r.*, s.name as service_name FROM requests r LEFT JOIN services s ON s.id = r.service_id WHERE r.client_id = ? ORDER BY r.created_at DESC`).all(clientId);
  const budgetsList = db.prepare(`SELECT b.*, s.name as service_name FROM budgets b LEFT JOIN services s ON s.id = b.service_id WHERE b.client_id = ? ORDER BY b.created_at DESC`).all(clientId);
  const ordersList = db.prepare(`SELECT w.*, s.name as service_name, t.name as technician_name FROM work_orders w LEFT JOIN services s ON s.id = w.service_id LEFT JOIN technicians t ON t.id = w.technician_id WHERE w.client_id = ? ORDER BY w.created_at DESC`).all(clientId);
  const maintenancesList = db.prepare(`SELECT m.*, t.name as technician_name FROM maintenances m LEFT JOIN technicians t ON t.id = m.technician_id WHERE m.client_id = ? ORDER BY m.created_at DESC`).all(clientId);
  const warrantiesList = db.prepare(`SELECT w.*, ii.name as item_name FROM warranties w LEFT JOIN inventory_items ii ON ii.id = w.inventory_item_id WHERE w.client_id = ? ORDER BY w.created_at DESC`).all(clientId);
  const salesList = db.prepare(`SELECT s.*, u.full_name as seller_name FROM sales s LEFT JOIN users u ON u.id = s.seller_id WHERE s.client_id = ? ORDER BY s.created_at DESC`).all(clientId);
  const paymentsList = db.prepare(`SELECT * FROM payments WHERE client_id = ? ORDER BY created_at DESC`).all(clientId);
  const invoicesList = db.prepare(`SELECT * FROM invoices WHERE client_id = ? ORDER BY created_at DESC`).all(clientId);

  res.json({
    client: formatClient(client),
    history,
    requests: requestsList.map(formatRequest),
    budgets: budgetsList.map(formatBudget),
    orders: ordersList.map(formatWorkOrder),
    maintenances: maintenancesList.map(formatMaintenance),
    warranties: warrantiesList.map(formatWarranty),
    sales: salesList.map(formatSale),
    payments: paymentsList,
    invoices: invoicesList.map(formatInvoice)
  });
});

app.get('/api/me/history', authMiddleware, (req, res) => {
  const clientId = getOrCreateClientIdForUser(req.user);
  if (!clientId) return res.json({ history: [], requests: [], budgets: [], orders: [], maintenances: [], warranties: [], sales: [], invoices: [] });
  // Reutilizar lógica
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  const history = db.prepare('SELECT * FROM client_history WHERE client_id = ? ORDER BY created_at DESC').all(clientId);
  const requestsList = db.prepare(`SELECT r.*, s.name as service_name FROM requests r LEFT JOIN services s ON s.id = r.service_id WHERE r.client_id = ? ORDER BY r.created_at DESC`).all(clientId);
  const budgetsList = db.prepare(`SELECT b.*, s.name as service_name FROM budgets b LEFT JOIN services s ON s.id = b.service_id WHERE b.client_id = ? ORDER BY b.created_at DESC`).all(clientId);
  const ordersList = db.prepare(`SELECT w.*, s.name as service_name, t.name as technician_name FROM work_orders w LEFT JOIN services s ON s.id = w.service_id LEFT JOIN technicians t ON t.id = w.technician_id WHERE w.client_id = ? ORDER BY w.created_at DESC`).all(clientId);
  const maintenancesList = db.prepare(`SELECT m.*, t.name as technician_name FROM maintenances m LEFT JOIN technicians t ON t.id = m.technician_id WHERE m.client_id = ? ORDER BY m.created_at DESC`).all(clientId);
  const warrantiesList = db.prepare(`SELECT w.*, ii.name as item_name FROM warranties w LEFT JOIN inventory_items ii ON ii.id = w.inventory_item_id WHERE w.client_id = ? ORDER BY w.created_at DESC`).all(clientId);
  const salesList = db.prepare(`SELECT s.*, u.full_name as seller_name FROM sales s LEFT JOIN users u ON u.id = s.seller_id WHERE s.client_id = ? ORDER BY s.created_at DESC`).all(clientId);
  const invoicesList = db.prepare(`SELECT * FROM invoices WHERE client_id = ? ORDER BY created_at DESC`).all(clientId);

  res.json({
    client: client ? formatClient(client) : null,
    history,
    requests: requestsList.map(formatRequest),
    budgets: budgetsList.map(formatBudget),
    orders: ordersList.map(formatWorkOrder),
    maintenances: maintenancesList.map(formatMaintenance),
    warranties: warrantiesList.map(formatWarranty),
    sales: salesList.map(formatSale),
    invoices: invoicesList.map(formatInvoice)
  });
});

// ============================================================
// SOLICITUDES DE COTIZACIÓN (CON GPS Y FIX CRÍTICO)
// ============================================================
app.get('/api/requests', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, c.name as client_name, c.phone as client_phone, c.email as client_email, s.name as service_name
    FROM requests r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN services s ON s.id = r.service_id
    ORDER BY r.id DESC
  `).all();
  res.json({ requests: rows.map(formatRequest) });
});

app.get('/api/requests/mine', authMiddleware, (req, res) => {
  const clientId = getOrCreateClientIdForUser(req.user);
  const rows = db.prepare(`
    SELECT r.*, c.name as client_name, c.phone as client_phone, c.email as client_email, s.name as service_name
    FROM requests r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN services s ON s.id = r.service_id
    WHERE r.user_id = ? OR r.client_id = ?
    ORDER BY r.id DESC
  `).all(req.user.id, clientId);
  res.json({ requests: rows.map(formatRequest) });
});

app.post('/api/requests', authMiddleware, (req, res) => {
  const { serviceType, description, address, latitude, longitude, reference, priority = 'normal', clientId: passedClientId } = req.body;
  if (!serviceType || !description) {
    return res.status(400).json({ error: 'Tipo de servicio y descripción son requeridos' });
  }

  const clientId = passedClientId || getOrCreateClientIdForUser(req.user);
  const service = resolveService(serviceType);
  const number = ensureRequestNumber();
  const now = new Date().toISOString();

  const latNum = latitude !== undefined && latitude !== null && latitude !== '' ? Number(latitude) : null;
  const lngNum = longitude !== undefined && longitude !== null && longitude !== '' ? Number(longitude) : null;

  const result = db.prepare(`
    INSERT INTO requests (number, client_id, user_id, service_id, service_type, description, address, latitude, longitude, reference, priority, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)
  `).run(number, clientId, req.user.id, service.id, service.name || serviceType, description.trim(), address || '', latNum, lngNum, reference || '', priority, now, now);

  const requestRow = db.prepare(`
    SELECT r.*, c.name as client_name, c.phone as client_phone, c.email as client_email, s.name as service_name
    FROM requests r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN services s ON s.id = r.service_id
    WHERE r.id = ?
  `).get(result.lastInsertRowid);

  if (clientId) {
    db.prepare('INSERT INTO client_history (client_id, entry_type, description, related_type, related_id, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(clientId, 'solicitud_creada', `Solicitud de cotización ${number} enviada`, 'request', requestRow.id, now, req.user.id);
  }

  audit(req, 'solicitud_creada', 'requests', 'request', requestRow.id, null, { number, service: service.name, lat: latNum, lng: lngNum });
  notifyAdmins('nueva_solicitud', '📝 Nueva Solicitud de Cotización', `El cliente ${req.user.name || req.user.username} solicitó cotización (${service.name}) [${number}].`, { requestId: requestRow.id });

  res.status(201).json({ request: formatRequest(requestRow) });
});

app.get('/api/requests/:id', authMiddleware, (req, res) => {
  const requestId = Number(req.params.id);
  const row = db.prepare(`
    SELECT r.*, c.name as client_name, c.phone as client_phone, c.email as client_email, s.name as service_name
    FROM requests r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN services s ON s.id = r.service_id
    WHERE r.id = ?
  `).get(requestId);
  if (!row) return res.status(404).json({ error: 'Solicitud no encontrada' });

  // Aislamiento para clientes
  if (req.user.role === 'cliente' && row.user_id !== req.user.id && row.client_id !== getOrCreateClientIdForUser(req.user)) {
    return res.status(403).json({ error: 'No autorizado para consultar esta solicitud' });
  }

  const files = db.prepare('SELECT * FROM request_files WHERE request_id = ?').all(requestId);
  res.json({ request: formatRequest(row), files });
});

app.put('/api/requests/:id', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const requestId = Number(req.params.id);
  const { status, priority } = req.body;
  const current = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
  if (!current) return res.status(404).json({ error: 'Solicitud no encontrada' });

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE requests SET status = ?, priority = ?, reviewed_at = ?, reviewed_by_user_id = ?, updated_at = ? WHERE id = ?
  `).run(status || current.status, priority || current.priority, now, req.user.id, now, requestId);

  const updated = db.prepare(`
    SELECT r.*, c.name as client_name, c.phone as client_phone, c.email as client_email, s.name as service_name
    FROM requests r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN services s ON s.id = r.service_id
    WHERE r.id = ?
  `).get(requestId);

  audit(req, 'solicitud_modificada', 'requests', 'request', requestId, { status: current.status }, { status: updated.status });
  res.json({ request: formatRequest(updated) });
});

app.post('/api/requests/:id/files', authMiddleware, async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    if (!requestRow) return res.status(404).json({ error: 'Solicitud no encontrada' });

    const { filename, mimeType, data } = req.body;
    if (!filename || !data) return res.status(400).json({ error: 'Archivo no recibido' });

    let fileUrl;
    let fileSize = Buffer.byteLength(data, 'base64');

    if (isCloudinaryConfigured) {
      try {
        const dataUri = data.startsWith('data:') ? data : `data:${mimeType || 'application/octet-stream'};base64,${data}`;
        const uploadRes = await uploadBase64(dataUri, { folder: `systemhome/requests/${requestId}` });
        fileUrl = uploadRes.secure_url;
        fileSize = uploadRes.bytes || fileSize;
      } catch (uploadErr) {
        console.error('Error subiendo archivo a Cloudinary:', uploadErr);
        const reqDir = path.join(UPLOAD_DIR, 'requests', String(requestId));
        if (!fs.existsSync(reqDir)) fs.mkdirSync(reqDir, { recursive: true });
        const safeName = `${Date.now()}-${path.basename(filename).replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const filePath = path.join(reqDir, safeName);
        fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
        fileUrl = `/uploads/requests/${requestId}/${safeName}`;
      }
    } else {
      const reqDir = path.join(UPLOAD_DIR, 'requests', String(requestId));
      if (!fs.existsSync(reqDir)) fs.mkdirSync(reqDir, { recursive: true });
      const safeName = `${Date.now()}-${path.basename(filename).replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filePath = path.join(reqDir, safeName);
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
      fileUrl = `/uploads/requests/${requestId}/${safeName}`;
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO request_files (request_id, filename, filepath, mime_type, size, uploaded_at, uploaded_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(requestId, filename, fileUrl, mimeType || 'application/octet-stream', fileSize, now, req.user.id);

    const file = db.prepare('SELECT * FROM request_files WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ file });
  } catch (err) {
    console.error('Error al procesar archivo:', err);
    res.status(500).json({ error: 'Error interno al guardar archivo' });
  }
});

// ============================================================
// COTIZACIONES (BUDGETS) & APROBACIÓN CON GPS
// ============================================================
app.get('/api/services', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY id').all();
  res.json({ services: rows });
});

app.get('/api/budgets', authMiddleware, (req, res) => {
  if (req.user.role === 'cliente') {
    const clientId = getOrCreateClientIdForUser(req.user);
    const rows = db.prepare(`SELECT b.*, c.name as client_name, s.name as service_name FROM budgets b LEFT JOIN clients c ON c.id = b.client_id LEFT JOIN services s ON s.id = b.service_id WHERE b.client_id = ? ORDER BY b.id DESC`).all(clientId);
    return res.json({ budgets: rows.map(formatBudget) });
  }
  const rows = db.prepare(`SELECT b.*, c.name as client_name, s.name as service_name FROM budgets b LEFT JOIN clients c ON c.id = b.client_id LEFT JOIN services s ON s.id = b.service_id ORDER BY b.id DESC`).all();
  res.json({ budgets: rows.map(formatBudget) });
});

app.get('/api/budgets/mine', authMiddleware, (req, res) => {
  const clientId = getOrCreateClientIdForUser(req.user);
  const rows = db.prepare(`SELECT b.*, c.name as client_name, s.name as service_name FROM budgets b LEFT JOIN clients c ON c.id = b.client_id LEFT JOIN services s ON s.id = b.service_id WHERE b.client_id = ? ORDER BY b.id DESC`).all(clientId);
  res.json({ budgets: rows.map(formatBudget) });
});

app.post('/api/budgets', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const { clientId, requestId, serviceType, description, items = [], labor = 0, discount = 0, total = 0, status = 'borrador', source = 'internal', validUntil, conditions, observations, estimatedTime, address, latitude, longitude, reference } = req.body;
  const now = new Date().toISOString();
  const number = ensureBudgetNumber();
  const service = resolveService(serviceType);

  let finalLat = latitude;
  let finalLng = longitude;
  let finalAddress = address;

  if (requestId) {
    const reqRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    if (reqRow) {
      if (finalLat === undefined || finalLat === null) finalLat = reqRow.latitude;
      if (finalLng === undefined || finalLng === null) finalLng = reqRow.longitude;
      if (!finalAddress) finalAddress = reqRow.address;
    }
  }

  const result = db.prepare(`
    INSERT INTO budgets (number, client_id, request_id, service_id, service_type, description, items, labor, discount, total, status, source, valid_until, conditions, observations, estimated_time, address, latitude, longitude, reference, created_at, updated_at, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    number, clientId || null, requestId || null, service.id, service.name || serviceType || 'Otro',
    description || '', JSON.stringify(items), Number(labor) || 0, Number(discount) || 0, Number(total) || 0,
    status, source, validUntil || '', conditions || '', observations || '', estimatedTime || '',
    finalAddress || '', finalLat || null, finalLng || null, reference || '', now, now, req.user.id
  );

  const budget = db.prepare(`SELECT b.*, c.name as client_name, s.name as service_name FROM budgets b LEFT JOIN clients c ON c.id = b.client_id LEFT JOIN services s ON s.id = b.service_id WHERE b.id = ?`).get(result.lastInsertRowid);

  if (requestId) {
    db.prepare("UPDATE requests SET status = 'cotizando' WHERE id = ?").run(requestId);
  }

  if (clientId) {
    db.prepare('INSERT INTO client_history (client_id, entry_type, description, related_type, related_id, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(clientId, 'cotizacion_creada', `Cotización ${number} creada por valor de Bs. ${Number(total).toLocaleString('es-PY')}`, 'budget', budget.id, now, req.user.id);
  }

  audit(req, 'cotizacion_creada', 'budgets', 'budget', budget.id, null, { number, total });
  res.status(201).json({ budget: formatBudget(budget) });
});

app.put('/api/budgets/:id', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const budgetId = Number(req.params.id);
  const current = db.prepare('SELECT * FROM budgets WHERE id = ?').get(budgetId);
  if (!current) return res.status(404).json({ error: 'Cotización no encontrada' });

  const { clientId, requestId, serviceType, description, items = [], labor = 0, discount = 0, total = 0, status = 'borrador', source = 'internal', validUntil, conditions, observations, estimatedTime, address, latitude, longitude, reference } = req.body;
  const now = new Date().toISOString();
  const service = resolveService(serviceType || current.service_type);

  db.prepare(`
    UPDATE budgets SET client_id = ?, request_id = ?, service_id = ?, service_type = ?, description = ?, items = ?, labor = ?, discount = ?, total = ?, status = ?, source = ?, valid_until = ?, conditions = ?, observations = ?, estimated_time = ?, address = ?, latitude = ?, longitude = ?, reference = ?, updated_at = ? WHERE id = ?
  `).run(
    clientId !== undefined ? clientId : current.client_id,
    requestId !== undefined ? requestId : current.request_id,
    service.id,
    service.name,
    description !== undefined ? description : current.description,
    JSON.stringify(items),
    labor !== undefined ? Number(labor) : current.labor,
    discount !== undefined ? Number(discount) : current.discount,
    total !== undefined ? Number(total) : current.total,
    status || current.status,
    source || current.source,
    validUntil !== undefined ? validUntil : current.valid_until,
    conditions !== undefined ? conditions : current.conditions,
    observations !== undefined ? observations : current.observations,
    estimatedTime !== undefined ? estimatedTime : current.estimated_time,
    address !== undefined ? address : current.address,
    latitude !== undefined ? latitude : current.latitude,
    longitude !== undefined ? longitude : current.longitude,
    reference !== undefined ? reference : current.reference,
    now,
    budgetId
  );

  const updated = db.prepare(`SELECT b.*, c.name as client_name, s.name as service_name FROM budgets b LEFT JOIN clients c ON c.id = b.client_id LEFT JOIN services s ON s.id = b.service_id WHERE b.id = ?`).get(budgetId);
  audit(req, 'cotizacion_modificada', 'budgets', 'budget', budgetId, { status: current.status }, { status: updated.status });
  res.json({ budget: formatBudget(updated) });
});

app.post('/api/budgets/:id/send', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const budgetId = Number(req.params.id);
  const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(budgetId);
  if (!budget) return res.status(404).json({ error: 'Cotización no encontrada' });

  const now = new Date().toISOString();
  db.prepare("UPDATE budgets SET status = 'enviado', sent_at = ?, sent_by_user_id = ?, updated_at = ? WHERE id = ?").run(now, req.user.id, now, budgetId);

  if (budget.request_id) {
    db.prepare("UPDATE requests SET status = 'cotizacion_enviada' WHERE id = ?").run(budget.request_id);
  }

  // Notificar al cliente
  if (budget.client_id) {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(budget.client_id);
    const clientUser = client ? db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR phone = ?').get(client.email, client.phone) : null;
    if (clientUser) {
      notify(clientUser.id, 'cotizacion_enviada', '📋 Nueva Cotización Disponible', `Tienes disponible la cotización ${budget.number} por Bs. ${Number(budget.total).toLocaleString('es-PY')}.`, { budgetId });
    }
  }

  const updated = db.prepare(`SELECT b.*, c.name as client_name, s.name as service_name FROM budgets b LEFT JOIN clients c ON c.id = b.client_id LEFT JOIN services s ON s.id = b.service_id WHERE b.id = ?`).get(budgetId);
  audit(req, 'cotizacion_enviada', 'budgets', 'budget', budgetId, { status: budget.status }, { status: 'enviado' });
  res.json({ budget: formatBudget(updated) });
});

// Aprobación de cotización -> Generación automática de orden de trabajo con GPS
app.post('/api/budgets/:id/approve', authMiddleware, (req, res) => {
  const budgetId = Number(req.params.id);
  const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(budgetId);
  if (!budget) return res.status(404).json({ error: 'Cotización no encontrada' });
  if (budget.status === 'rechazado') return res.status(400).json({ error: 'Una cotización rechazada no puede aprobarse directamente' });

  const now = new Date().toISOString();
  db.prepare("UPDATE budgets SET status = 'aprobado', approved_at = ?, approved_by_user_id = ?, updated_at = ? WHERE id = ?").run(now, req.user.id, now, budgetId);

  if (budget.request_id) {
    db.prepare("UPDATE requests SET status = 'aprobada' WHERE id = ?").run(budget.request_id);
  }

  // Generar Orden de Trabajo automáticamente heredando GPS
  const orderNumber = ensureOrderNumber();
  const tech = db.prepare('SELECT id FROM technicians WHERE active = 1 ORDER BY id LIMIT 1').get();
  const techId = tech ? tech.id : null;

  const orderResult = db.prepare(`
    INSERT INTO work_orders (number, budget_id, client_id, service_id, service_type, technician_id, scheduled_date, priority, description, status, observations, address, latitude, longitude, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'alta', ?, 'pendiente', ?, ?, ?, ?, ?, ?)
  `).run(
    orderNumber, budget.id, budget.client_id, budget.service_id, budget.service_type || 'General', techId,
    now.slice(0, 10), budget.description || 'Orden generada automáticamente desde cotización aprobada',
    JSON.stringify([{ text: 'Orden creada por aprobación de cotización', author: 'Sistema', date: now }]),
    budget.address || '', budget.latitude || null, budget.longitude || null, now, now
  );

  const orderId = orderResult.lastInsertRowid;
  if (techId) {
    db.prepare('INSERT INTO work_order_assignments (work_order_id, technician_id, assigned_at, assigned_by_user_id) VALUES (?, ?, ?, ?)').run(orderId, techId, now, req.user.id);
  }

  db.prepare('INSERT INTO order_history (work_order_id, entry_type, description, details, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orderId, 'orden_creada', `Orden ${orderNumber} creada desde cotización aprobada ${budget.number}`, `Ubicación GPS: ${budget.latitude || 'N/A'}, ${budget.longitude || 'N/A'}`, now, req.user.id);

  if (budget.client_id) {
    db.prepare('INSERT INTO client_history (client_id, entry_type, description, related_type, related_id, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(budget.client_id, 'cotizacion_aprobada', `Cotización ${budget.number} aprobada -> Orden ${orderNumber} generada`, 'work_order', orderId, now, req.user.id);
  }

  audit(req, 'cotizacion_aprobada', 'budgets', 'budget', budgetId, { status: budget.status }, { status: 'aprobado', orderNumber });
  notifyAdmins('cotizacion_aprobada', '✅ Cotización Aprobada', `El cliente aprobó la cotización ${budget.number}. Se ha generado la Orden ${orderNumber}.`, { budgetId, orderId });

  const updatedBudget = db.prepare(`SELECT b.*, c.name as client_name, s.name as service_name FROM budgets b LEFT JOIN clients c ON c.id = b.client_id LEFT JOIN services s ON s.id = b.service_id WHERE b.id = ?`).get(budgetId);
  res.json({ budget: formatBudget(updatedBudget), workOrderId: orderId, workOrderNumber: orderNumber });
});

app.post('/api/budgets/:id/reject', authMiddleware, (req, res) => {
  const budgetId = Number(req.params.id);
  const { reason = '' } = req.body;
  const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(budgetId);
  if (!budget) return res.status(404).json({ error: 'Cotización no encontrada' });

  const now = new Date().toISOString();
  db.prepare("UPDATE budgets SET status = 'rechazado', rejection_reason = ?, rejected_at = ?, rejected_by_user_id = ?, updated_at = ? WHERE id = ?")
    .run(reason, now, req.user.id, now, budgetId);

  if (budget.request_id) {
    db.prepare("UPDATE requests SET status = 'rechazada' WHERE id = ?").run(budget.request_id);
  }

  if (budget.client_id) {
    db.prepare('INSERT INTO client_history (client_id, entry_type, description, related_type, related_id, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(budget.client_id, 'cotizacion_rechazada', `Cotización ${budget.number} rechazada.${reason ? ' Motivo: ' + reason : ''}`, 'budget', budget.id, now, req.user.id);
  }

  audit(req, 'cotizacion_rechazada', 'budgets', 'budget', budgetId, { status: budget.status }, { status: 'rechazado', reason });
  notifyAdmins('cotizacion_rechazada', '❌ Cotización Rechazada', `La cotización ${budget.number} fue rechazada por el cliente.${reason ? ' Motivo: ' + reason : ''}`, { budgetId });

  const updatedBudget = db.prepare(`SELECT b.*, c.name as client_name, s.name as service_name FROM budgets b LEFT JOIN clients c ON c.id = b.client_id LEFT JOIN services s ON s.id = b.service_id WHERE b.id = ?`).get(budgetId);
  res.json({ budget: formatBudget(updatedBudget) });
});

app.get('/api/budgets/:id/export', authMiddleware, (req, res) => {
  const budgetId = Number(req.params.id);
  const budget = db.prepare(`SELECT b.*, s.name as service_name FROM budgets b LEFT JOIN services s ON s.id = b.service_id WHERE b.id = ?`).get(budgetId);
  if (!budget) return res.status(404).json({ error: 'Cotización no encontrada' });
  const client = budget.client_id ? db.prepare('SELECT * FROM clients WHERE id = ?').get(budget.client_id) : null;

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=cotizacion-${budget.number}.pdf`);
  doc.pipe(res);

  doc.fontSize(22).fillColor('#1a56db').text('SYSTEMHOME SECURITY', { align: 'center' });
  doc.fontSize(10).fillColor('#4b5563').text('Seguridad Electrónica · Climatización · Redes & Telecomunicaciones', { align: 'center' });
  doc.fontSize(9).fillColor('#6b7280').text('Teléfono / WhatsApp: +591 64595762 · Asunción / Central', { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#1a56db').lineWidth(2).stroke();
  doc.moveDown();

  doc.fontSize(16).fillColor('#111827').text(`COTIZACIÓN OFICIAL: ${budget.number}`, { align: 'left' });
  doc.fontSize(10).fillColor('#4b5563');
  doc.text(`Fecha de Emisión: ${new Date(budget.created_at).toLocaleDateString('es-PY')}   |   Estado: ${budget.status.toUpperCase()}`);
  if (budget.valid_until) doc.text(`Válido hasta: ${budget.valid_until}`);
  doc.moveDown();

  doc.rect(40, doc.y, 515, 65).fillAndStroke('#f8fafc', '#e2e8f0');
  doc.fillColor('#1e293b').fontSize(11).text(' DATOS DEL CLIENTE:', 50, doc.y - 58);
  doc.fontSize(9).fillColor('#334155');
  doc.text(`Cliente: ${client ? client.name : 'Venta General'}`, 50, doc.y + 4);
  doc.text(`RUC / CI: ${client ? (client.ruc || 'S/N') : 'S/N'}   |   Teléfono: ${client ? (client.phone || '-') : '-'}`, 50, doc.y + 2);
  doc.text(`Dirección: ${budget.address || (client ? client.address : 'A coordinar')}`, 50, doc.y + 2);
  doc.moveDown(2);

  doc.fontSize(11).fillColor('#1a56db').text(`SERVICIO: ${budget.service_type || 'Servicio Técnico'}`);
  if (budget.description) {
    doc.fontSize(9).fillColor('#475569').text(budget.description);
  }
  doc.moveDown();

  // Tabla de items
  let items = [];
  try { items = JSON.parse(budget.items || '[]'); } catch (e) { items = []; }

  doc.fontSize(10).fillColor('#111827').text('DETALLE DE PRODUCTOS Y SERVICIOS:');
  doc.moveDown(0.3);

  let currentY = doc.y;
  doc.rect(40, currentY, 515, 20).fill('#1e293b');
  doc.fillColor('#ffffff').fontSize(9);
  doc.text('Concepto / Producto', 45, currentY + 5);
  doc.text('Cant.', 320, currentY + 5);
  doc.text('P. Unitario', 370, currentY + 5);
  doc.text('Subtotal', 470, currentY + 5);

  currentY += 22;
  items.forEach((it, idx) => {
    const qty = Number(it.quantity || it.qty || 1);
    const unitPrice = Number(it.unit_price || it.price || 0);
    const subtotal = Number(it.subtotal || (qty * unitPrice));

    doc.rect(40, currentY, 515, 18).fill(idx % 2 === 0 ? '#f8fafc' : '#ffffff');
    doc.fillColor('#1e293b').fontSize(8.5);
    doc.text(it.concept || it.name || 'Item', 45, currentY + 4, { width: 270, ellipsis: true });
    doc.text(String(qty), 325, currentY + 4);
    doc.text(unitPrice.toLocaleString('es-PY') + ' Bs', 370, currentY + 4);
    doc.text(subtotal.toLocaleString('es-PY') + ' Bs', 470, currentY + 4);
    currentY += 20;
  });

  doc.y = currentY + 10;
  doc.moveTo(350, doc.y).lineTo(555, doc.y).strokeColor('#cbd5e1').stroke();
  doc.moveDown(0.5);

  const labor = Number(budget.labor || 0);
  const discount = Number(budget.discount || 0);
  const total = Number(budget.total || 0);

  doc.fontSize(9).fillColor('#334155');
  if (labor > 0) doc.text(`Mano de Obra / Instalación: ${labor.toLocaleString('es-PY')} Bs`, 350, doc.y, { align: 'right' });
  if (discount > 0) doc.text(`Descuento Especial: -${discount.toLocaleString('es-PY')} Bs`, 350, doc.y, { align: 'right' });
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor('#1a56db').text(`TOTAL: ${total.toLocaleString('es-PY')} Bs`, 350, doc.y, { align: 'right' });

  if (budget.conditions || budget.observations) {
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#475569');
    if (budget.conditions) doc.text(`Condiciones: ${budget.conditions}`);
    if (budget.observations) doc.text(`Observaciones: ${budget.observations}`);
  }

  doc.moveDown(2);
  doc.fontSize(8.5).fillColor('#94a3b8').text('Documento generado por SYSTEMHOME · Gracias por su confianza.', { align: 'center' });
  doc.end();
});

// ============================================================
// ÓRDENES DE TRABAJO (SH-O01, SH-O02, SH-O03, SH-O04)
// ============================================================
app.get('/api/technicians', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM technicians ORDER BY id').all();
  res.json({ technicians: rows });
});

app.get('/api/workorders', authMiddleware, (req, res) => {
  const { clientId, technicianId, serviceType, status, from, to } = req.query;
  let where = [];
  let params = [];

  if (req.user.role === 'cliente') {
    const myClientId = getOrCreateClientIdForUser(req.user);
    where.push('w.client_id = ?');
    params.push(myClientId);
  } else if (req.user.role === 'tecnico') {
    const tech = db.prepare('SELECT id FROM technicians WHERE email = ? OR phone = ?').get(req.user.email, req.user.phone);
    if (tech) {
      where.push('w.technician_id = ?');
      params.push(tech.id);
    }
  } else {
    if (clientId && clientId !== 'all') { where.push('w.client_id = ?'); params.push(clientId); }
    if (technicianId && technicianId !== 'all') { where.push('w.technician_id = ?'); params.push(technicianId); }
  }

  if (status && status !== 'all') { where.push('w.status = ?'); params.push(status); }
  if (serviceType && serviceType !== 'all') { where.push('w.service_type = ?'); params.push(serviceType); }
  if (from) { where.push('w.created_at >= ?'); params.push(from); }
  if (to) { where.push('w.created_at <= ?'); params.push(to); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT w.*, c.name as client_name, s.name as service_name, t.name as technician_name
    FROM work_orders w
    LEFT JOIN clients c ON c.id = w.client_id
    LEFT JOIN services s ON s.id = w.service_id
    LEFT JOIN technicians t ON t.id = w.technician_id
    ${whereClause}
    ORDER BY w.id DESC
  `).all(...params);

  res.json({ workOrders: rows.map(formatWorkOrder) });
});

app.get('/api/workorders/:id', authMiddleware, (req, res) => {
  const orderId = Number(req.params.id);
  const row = db.prepare(`
    SELECT w.*, c.name as client_name, c.phone as client_phone, c.email as client_email, s.name as service_name, t.name as technician_name
    FROM work_orders w
    LEFT JOIN clients c ON c.id = w.client_id
    LEFT JOIN services s ON s.id = w.service_id
    LEFT JOIN technicians t ON t.id = w.technician_id
    WHERE w.id = ?
  `).get(orderId);

  if (!row) return res.status(404).json({ error: 'Orden no encontrada' });
  const history = db.prepare('SELECT * FROM order_history WHERE work_order_id = ? ORDER BY created_at DESC').all(orderId);
  res.json({ workOrder: formatWorkOrder(row), history });
});

app.post('/api/workorders', authMiddleware, requireRole(['admin']), (req, res) => {
  const { budgetId, technicianId, serviceType, priority = 'normal', scheduledDate, description, status = 'pendiente', observations = [], address, latitude, longitude } = req.body;
  const budget = budgetId ? db.prepare('SELECT * FROM budgets WHERE id = ?').get(budgetId) : null;
  const now = new Date().toISOString();
  const number = ensureOrderNumber();

  const service = resolveService(serviceType || (budget ? budget.service_type : 'General'));
  const clientId = budget ? budget.client_id : null;
  const finalAddress = address || (budget ? budget.address : '');
  const finalLat = latitude !== undefined ? latitude : (budget ? budget.latitude : null);
  const finalLng = longitude !== undefined ? longitude : (budget ? budget.longitude : null);

  const result = db.prepare(`
    INSERT INTO work_orders (number, budget_id, client_id, service_id, service_type, technician_id, scheduled_date, priority, description, status, observations, address, latitude, longitude, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    number, budgetId || null, clientId, service.id, service.name, technicianId || null,
    scheduledDate || now.slice(0, 10), priority, description || '', status, JSON.stringify(observations),
    finalAddress, finalLat, finalLng, now, now
  );

  const orderId = result.lastInsertRowid;
  if (technicianId) {
    db.prepare('INSERT INTO work_order_assignments (work_order_id, technician_id, assigned_at, assigned_by_user_id) VALUES (?, ?, ?, ?)').run(orderId, technicianId, now, req.user.id);
  }

  db.prepare('INSERT INTO order_history (work_order_id, entry_type, description, details, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orderId, 'orden_creada', `Orden ${number} creada`, description || 'Orden inicial', now, req.user.id);

  if (clientId) {
    db.prepare('INSERT INTO client_history (client_id, entry_type, description, related_type, related_id, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(clientId, 'orden_creada', `Orden de trabajo ${number} programada para ${scheduledDate || 'próximamente'}`, 'work_order', orderId, now, req.user.id);
  }

  audit(req, 'orden_creada', 'workorders', 'work_order', orderId, null, { number, status });
  const order = db.prepare(`SELECT w.*, c.name as client_name, s.name as service_name, t.name as technician_name FROM work_orders w LEFT JOIN clients c ON c.id = w.client_id LEFT JOIN services s ON s.id = w.service_id LEFT JOIN technicians t ON t.id = w.technician_id WHERE w.id = ?`).get(orderId);
  res.status(201).json({ workOrder: formatWorkOrder(order) });
});

app.put('/api/workorders/:id', authMiddleware, (req, res) => {
  const orderId = Number(req.params.id);
  const current = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(orderId);
  if (!current) return res.status(404).json({ error: 'Orden no encontrada' });

  // Regla estricta: Una orden cerrada no puede modificarse libremente salvo por Administrador
  if (current.status === 'cerrada' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'La orden está CERRADA definitivamente. Solo un Administrador puede realizar modificaciones excepcionales.' });
  }

  const { technicianId, serviceType, priority, scheduledDate, description, status, observations, address, latitude, longitude } = req.body;
  const now = new Date().toISOString();
  const service = resolveService(serviceType || current.service_type);

  db.prepare(`
    UPDATE work_orders SET technician_id = ?, service_id = ?, service_type = ?, priority = ?, scheduled_date = ?, description = ?, status = ?, observations = ?, address = ?, latitude = ?, longitude = ?, updated_at = ? WHERE id = ?
  `).run(
    technicianId !== undefined ? technicianId : current.technician_id,
    service.id,
    service.name,
    priority || current.priority,
    scheduledDate || current.scheduled_date,
    description !== undefined ? description : current.description,
    status || current.status,
    observations !== undefined ? JSON.stringify(observations) : current.observations,
    address !== undefined ? address : current.address,
    latitude !== undefined ? latitude : current.latitude,
    longitude !== undefined ? longitude : current.longitude,
    now,
    orderId
  );

  db.prepare('INSERT INTO order_history (work_order_id, entry_type, description, details, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orderId, 'orden_actualizada', `Orden actualizada (${status || current.status})`, `Modificado por ${req.user.username}`, now, req.user.id);

  audit(req, 'orden_modificada', 'workorders', 'work_order', orderId, { status: current.status }, { status: status || current.status });
  const updated = db.prepare(`SELECT w.*, c.name as client_name, s.name as service_name, t.name as technician_name FROM work_orders w LEFT JOIN clients c ON c.id = w.client_id LEFT JOIN services s ON s.id = w.service_id LEFT JOIN technicians t ON t.id = w.technician_id WHERE w.id = ?`).get(orderId);
  res.json({ workOrder: formatWorkOrder(updated) });
});

// Técnico inicia orden
app.post('/api/workorders/:id/start', authMiddleware, requireRole(['admin', 'tecnico']), (req, res) => {
  const orderId = Number(req.params.id);
  const now = new Date().toISOString();
  db.prepare("UPDATE work_orders SET status = 'en_proceso', updated_at = ? WHERE id = ?").run(now, orderId);

  db.prepare('INSERT INTO order_history (work_order_id, entry_type, description, details, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orderId, 'orden_iniciada', 'Técnico inició los trabajos de campo', 'Estado: en_proceso', now, req.user.id);

  audit(req, 'orden_iniciada', 'workorders', 'work_order', orderId, null, { status: 'en_proceso' });
  const updated = db.prepare(`SELECT w.*, c.name as client_name, s.name as service_name, t.name as technician_name FROM work_orders w LEFT JOIN clients c ON c.id = w.client_id LEFT JOIN services s ON s.id = w.service_id LEFT JOIN technicians t ON t.id = w.technician_id WHERE w.id = ?`).get(orderId);
  res.json({ workOrder: formatWorkOrder(updated) });
});

// SH-O03: Técnico finaliza trabajo (registra materiales, evidencias, firma)
app.post('/api/workorders/:id/finish', authMiddleware, requireRole(['admin', 'tecnico']), (req, res) => {
  const orderId = Number(req.params.id);
  const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

  const { workDone, observations, materialsUsed = [], installedEquipment = [], evidencePhotos = [], clientSignature } = req.body;
  const now = new Date().toISOString();

  let obsArray = [];
  try { obsArray = typeof order.observations === 'string' ? JSON.parse(order.observations || '[]') : []; } catch (e) { obsArray = []; }
  if (observations) obsArray.push({ text: observations, author: req.user.name || req.user.username, date: now });

  db.prepare(`
    UPDATE work_orders SET status = 'finalizada', work_done = ?, observations = ?, materials_used = ?, installed_equipment = ?, evidence_photos = ?, client_signature = ?, completed_at = ?, completed_by_user_id = ?, updated_at = ? WHERE id = ?
  `).run(
    workDone || 'Trabajo completado según especificaciones',
    JSON.stringify(obsArray),
    JSON.stringify(materialsUsed),
    JSON.stringify(installedEquipment),
    JSON.stringify(evidencePhotos),
    clientSignature || '',
    now,
    req.user.id,
    now,
    orderId
  );

  db.prepare('INSERT INTO order_history (work_order_id, entry_type, description, details, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orderId, 'trabajo_finalizado', 'Técnico finalizó el trabajo y cargó evidencias y materiales', `Materiales registrados: ${materialsUsed.length}`, now, req.user.id);

  audit(req, 'orden_finalizada_tecnico', 'workorders', 'work_order', orderId, { status: order.status }, { status: 'finalizada' });
  notifyAdmins('orden_por_cerrar', '🔧 Orden Finalizada por Técnico', `La Orden ${order.number} fue finalizada por el técnico y requiere revisión y cierre definitivo.`, { orderId });

  const updated = db.prepare(`SELECT w.*, c.name as client_name, s.name as service_name, t.name as technician_name FROM work_orders w LEFT JOIN clients c ON c.id = w.client_id LEFT JOIN services s ON s.id = w.service_id LEFT JOIN technicians t ON t.id = w.technician_id WHERE w.id = ?`).get(orderId);
  res.json({ workOrder: formatWorkOrder(updated) });
});

// SH-O03: Administrador revisa y cierra definitivamente (descuenta inventario, notifica y audita)
app.post('/api/workorders/:id/close', authMiddleware, requireRole(['admin']), (req, res) => {
  const orderId = Number(req.params.id);
  const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

  const { closureNotes = '', materials = null } = req.body;
  const now = new Date().toISOString();

  // Materiales a descontar
  let matsToDeduct = materials;
  if (!matsToDeduct) {
    try { matsToDeduct = JSON.parse(order.materials_used || '[]'); } catch (e) { matsToDeduct = []; }
  }

  // Descontar inventario sin permitir stock negativo
  for (const mat of matsToDeduct) {
    const itemId = mat.itemId || mat.id;
    const qty = Number(mat.quantity || mat.qty || 1);
    if (itemId && qty > 0) {
      const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
      if (item) {
        const stockBefore = item.stock;
        const stockAfter = Math.max(0, stockBefore - qty);
        db.prepare('UPDATE inventory_items SET stock = ?, updated_at = ? WHERE id = ?').run(stockAfter, now, itemId);
        db.prepare(`
          INSERT INTO inventory_movements (item_id, movement_type, quantity, stock_before, stock_after, reference_type, reference_id, notes, user_id, created_at)
          VALUES (?, 'salida', ?, ?, ?, 'work_order', ?, ?, ?, ?)
        `).run(itemId, qty, stockBefore, stockAfter, orderId, `Consumo en cierre de orden ${order.number}`, req.user.id, now);
      }
    }
  }

  db.prepare(`
    UPDATE work_orders SET status = 'cerrada', closure_notes = ?, closed_at = ?, closed_by_user_id = ?, updated_at = ? WHERE id = ?
  `).run(closureNotes || 'Cierre definitivo verificado y aprobado por administración', now, req.user.id, now, orderId);

  db.prepare('INSERT INTO order_history (work_order_id, entry_type, description, details, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orderId, 'orden_cerrada', `Orden ${order.number} cerrada definitivamente por el Administrador`, `Materiales descontados de inventario`, now, req.user.id);

  if (order.client_id) {
    db.prepare('INSERT INTO client_history (client_id, entry_type, description, related_type, related_id, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(order.client_id, 'orden_cerrada', `Orden de trabajo ${order.number} concluida y cerrada exitosamente`, 'work_order', orderId, now, req.user.id);

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(order.client_id);
    const clientUser = client ? db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR phone = ?').get(client.email, client.phone) : null;
    if (clientUser) {
      notify(clientUser.id, 'orden_cerrada', '🎉 Servicio Finalizado con Éxito', `Su orden de trabajo ${order.number} ha sido completada y cerrada. ¡Gracias por confiar en SYSTEMHOME!`, { orderId });
    }
  }

  audit(req, 'orden_cerrada_admin', 'workorders', 'work_order', orderId, { status: order.status }, { status: 'cerrada', materialsDeducted: matsToDeduct.length });
  detectStockAlerts();

  const updated = db.prepare(`SELECT w.*, c.name as client_name, s.name as service_name, t.name as technician_name FROM work_orders w LEFT JOIN clients c ON c.id = w.client_id LEFT JOIN services s ON s.id = w.service_id LEFT JOIN technicians t ON t.id = w.technician_id WHERE w.id = ?`).get(orderId);
  res.json({ workOrder: formatWorkOrder(updated) });
});

// PDF de Orden de Trabajo
app.get('/api/workorders/:id/export', authMiddleware, (req, res) => {
  const orderId = Number(req.params.id);
  const order = db.prepare(`
    SELECT w.*, c.name as client_name, c.ruc as client_ruc, c.phone as client_phone, c.address as client_address,
           s.name as service_name, t.name as technician_name, t.phone as technician_phone
    FROM work_orders w
    LEFT JOIN clients c ON c.id = w.client_id
    LEFT JOIN services s ON s.id = w.service_id
    LEFT JOIN technicians t ON t.id = w.technician_id
    WHERE w.id = ?
  `).get(orderId);

  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=orden-trabajo-${order.number}.pdf`);
  doc.pipe(res);

  doc.fontSize(22).fillColor('#1a56db').text('SYSTEMHOME SECURITY', { align: 'center' });
  doc.fontSize(10).fillColor('#4b5563').text('Comprobante Oficial de Orden de Trabajo y Servicio Técnico', { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#1a56db').lineWidth(2).stroke();
  doc.moveDown();

  doc.fontSize(15).fillColor('#111827').text(`ORDEN DE TRABAJO: ${order.number}`, { align: 'left' });
  doc.fontSize(9.5).fillColor('#4b5563');
  doc.text(`Fecha Programada: ${order.scheduled_date || '-'}   |   Estado: ${order.status.toUpperCase()}   |   Prioridad: ${order.priority.toUpperCase()}`);
  doc.moveDown();

  // Cliente y Técnico
  doc.rect(40, doc.y, 515, 60).fillAndStroke('#f8fafc', '#e2e8f0');
  doc.fillColor('#1e293b').fontSize(10).text('DATOS DE LA ORDEN:', 50, doc.y - 52);
  doc.fontSize(8.5).fillColor('#334155');
  doc.text(`Cliente: ${order.client_name || 'N/A'} (RUC: ${order.client_ruc || 'S/N'})  |  Tel: ${order.client_phone || '-'}`, 50, doc.y + 3);
  doc.text(`Técnico Responsable: ${order.technician_name || 'Sin Asignar'}  |  Tel: ${order.technician_phone || '-'}`, 50, doc.y + 2);
  doc.text(`Ubicación GPS: ${order.latitude || '-'}, ${order.longitude || '-'}  |  Dirección: ${order.address || order.client_address || 'En sitio'}`, 50, doc.y + 2);
  doc.moveDown(2);

  doc.fontSize(11).fillColor('#1a56db').text(`SERVICIO: ${order.service_name || order.service_type || 'General'}`);
  doc.fontSize(9).fillColor('#334155').text(`Descripción Inicial: ${order.description || '-'}`);
  doc.moveDown();

  if (order.work_done) {
    doc.fontSize(10).fillColor('#16a34a').text('TRABAJO REALIZADO:');
    doc.fontSize(9).fillColor('#1e293b').text(order.work_done);
    doc.moveDown();
  }

  // Materiales utilizados
  let mats = [];
  try { mats = JSON.parse(order.materials_used || '[]'); } catch (e) { mats = []; }
  if (mats.length > 0) {
    doc.fontSize(10).fillColor('#111827').text('MATERIALES Y REPUESTOS UTILIZADOS:');
    mats.forEach((m, idx) => {
      doc.fontSize(8.5).fillColor('#475569').text(`  ${idx + 1}. ${m.name || 'Item'}  × ${m.quantity || 1} unid.`);
    });
    doc.moveDown();
  }

  if (order.closed_at) {
    doc.fontSize(9).fillColor('#15803d').text(`✅ Orden cerrada definitivamente el: ${new Date(order.closed_at).toLocaleString('es-PY')}`);
    if (order.closure_notes) doc.fontSize(8.5).fillColor('#475569').text(`Notas de cierre: ${order.closure_notes}`);
  }

  doc.moveDown(3);
  const sigY = doc.y;
  doc.moveTo(60, sigY).lineTo(230, sigY).strokeColor('#94a3b8').stroke();
  doc.moveTo(320, sigY).lineTo(490, sigY).strokeColor('#94a3b8').stroke();
  doc.fontSize(8.5).fillColor('#64748b');
  doc.text('Firma del Técnico', 60, sigY + 5, { width: 170, align: 'center' });
  doc.text('Firma / Conformidad del Cliente', 320, sigY + 5, { width: 170, align: 'center' });

  doc.end();
});

// ============================================================
// INVENTARIO Y MOVIMIENTOS (SH-I02)
// ============================================================
app.get('/api/catalog', (req, res) => {
  const rows = db.prepare('SELECT * FROM inventory_items WHERE active = 1 AND show_in_catalog = 1 ORDER BY id DESC').all();
  res.json({ catalog: rows.map(formatInventoryItem) });
});

app.get('/api/inventory', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM inventory_items WHERE active = 1 ORDER BY id DESC').all();
  res.json({ inventory: rows.map(formatInventoryItem) });
});

app.post('/api/inventory', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const { name, category, brand, model, stock = 0, minStock = 5, price = 0, description = '', features = '', badge = '', imageUrl = '', imagePath = '', showInCatalog = true } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre del producto requerido' });

  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO inventory_items (name, category, brand, model, stock, min_stock, price, description, features, badge, image_url, image_path, show_in_catalog, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(name.trim(), category || 'otro', brand || '', model || '', Number(stock) || 0, Number(minStock) || 5, Number(price) || 0, description || '', features || '', badge || null, imageUrl || null, imagePath || null, showInCatalog ? 1 : 0, now, now);

  const itemId = result.lastInsertRowid;
  // Registrar movimiento inicial si stock > 0
  if (Number(stock) > 0) {
    db.prepare(`
      INSERT INTO inventory_movements (item_id, movement_type, quantity, stock_before, stock_after, reference_type, notes, user_id, created_at)
      VALUES (?, 'entrada', ?, 0, ?, 'inicial', 'Stock inicial al crear producto', ?, ?)
    `).run(itemId, Number(stock), Number(stock), req.user.id, now);
  }

  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
  audit(req, 'inventario_creado', 'inventory', 'inventory_item', item.id, null, { name: item.name, stock });
  detectStockAlerts();
  res.status(201).json({ inventoryItem: formatInventoryItem(item) });
});

app.put('/api/inventory/:id', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const itemId = Number(req.params.id);
  const current = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
  if (!current) return res.status(404).json({ error: 'Producto no encontrado' });

  const { name, category, brand, model, stock, minStock, price, description, features, badge, imageUrl, imagePath, showInCatalog } = req.body;
  const now = new Date().toISOString();

  const newStock = stock !== undefined ? Math.max(0, Number(stock)) : current.stock;
  if (stock !== undefined && newStock !== current.stock) {
    const diff = newStock - current.stock;
    const movementType = diff > 0 ? 'ajuste' : 'salida';
    db.prepare(`
      INSERT INTO inventory_movements (item_id, movement_type, quantity, stock_before, stock_after, reference_type, notes, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, 'ajuste_manual', 'Ajuste directo de stock desde administración', ?, ?)
    `).run(itemId, movementType, Math.abs(diff), current.stock, newStock, req.user.id, now);
  }

  db.prepare(`
    UPDATE inventory_items SET name = ?, category = ?, brand = ?, model = ?, stock = ?, min_stock = ?, price = ?, description = ?, features = ?, badge = ?, image_url = ?, image_path = ?, show_in_catalog = ?, updated_at = ? WHERE id = ?
  `).run(
    name ? name.trim() : current.name,
    category || current.category,
    brand !== undefined ? brand : current.brand,
    model !== undefined ? model : current.model,
    newStock,
    minStock !== undefined ? Number(minStock) : current.min_stock,
    price !== undefined ? Number(price) : current.price,
    description !== undefined ? description : current.description,
    features !== undefined ? features : current.features,
    badge !== undefined ? badge : current.badge,
    imageUrl !== undefined ? imageUrl : current.image_url,
    imagePath !== undefined ? imagePath : current.image_path,
    showInCatalog !== undefined ? (showInCatalog ? 1 : 0) : current.show_in_catalog,
    now,
    itemId
  );

  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
  audit(req, 'inventario_modificado', 'inventory', 'inventory_item', itemId, { stock: current.stock }, { stock: item.stock });
  detectStockAlerts();
  res.json({ inventoryItem: formatInventoryItem(item) });
});

app.post('/api/inventory/:id/image', authMiddleware, requireRole(['admin', 'vendedor']), async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
    if (!item) return res.status(404).json({ error: 'Producto no encontrado' });

    const { filename, data, imageUrl } = req.body;
    
    if (imageUrl) {
      db.prepare('UPDATE inventory_items SET image_url = ?, updated_at = ? WHERE id = ?').run(imageUrl.trim(), new Date().toISOString(), itemId);
      const updated = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
      return res.json({ inventoryItem: formatInventoryItem(updated) });
    }

    if (!filename || !data) return res.status(400).json({ error: 'Imagen no recibida' });

    let finalImageUrl;
    let imagePath = null;

    if (isCloudinaryConfigured) {
      try {
        const dataUri = data.startsWith('data:') ? data : `data:image/jpeg;base64,${data}`;
        const uploadRes = await uploadBase64(dataUri, { folder: 'systemhome/inventory' });
        finalImageUrl = uploadRes.secure_url;
        imagePath = uploadRes.public_id;
      } catch (uploadErr) {
        console.error('Error subiendo imagen a Cloudinary:', uploadErr);
        const invDir = path.join(UPLOAD_DIR, 'inventory');
        if (!fs.existsSync(invDir)) fs.mkdirSync(invDir, { recursive: true });
        const safeName = `${itemId}-${Date.now()}-${path.basename(filename).replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const savePath = path.join(invDir, safeName);
        fs.writeFileSync(savePath, Buffer.from(data, 'base64'));
        imagePath = `inventory/${safeName}`;
        finalImageUrl = `/uploads/${imagePath}`;
      }
    } else {
      const invDir = path.join(UPLOAD_DIR, 'inventory');
      if (!fs.existsSync(invDir)) fs.mkdirSync(invDir, { recursive: true });
      const safeName = `${itemId}-${Date.now()}-${path.basename(filename).replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const savePath = path.join(invDir, safeName);
      fs.writeFileSync(savePath, Buffer.from(data, 'base64'));
      imagePath = `inventory/${safeName}`;
      finalImageUrl = `/uploads/${imagePath}`;
    }

    db.prepare('UPDATE inventory_items SET image_path = ?, image_url = ?, updated_at = ? WHERE id = ?').run(imagePath, finalImageUrl, new Date().toISOString(), itemId);

    const updated = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
    res.json({ inventoryItem: formatInventoryItem(updated) });
  } catch (err) {
    console.error('Error al procesar imagen de inventario:', err);
    res.status(500).json({ error: 'Error interno al guardar imagen' });
  }
});

app.delete('/api/inventory/:id', authMiddleware, requireRole(['admin']), (req, res) => {
  const itemId = Number(req.params.id);
  db.prepare('UPDATE inventory_items SET active = 0 WHERE id = ?').run(itemId);
  audit(req, 'inventario_eliminado', 'inventory', 'inventory_item', itemId, null, null);
  res.json({ ok: true });
});

// SH-I02: Control de Movimientos de Inventario
app.get('/api/inventory/movements', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT im.*, ii.name as item_name, ii.category, u.username as user_name
    FROM inventory_movements im
    JOIN inventory_items ii ON ii.id = im.item_id
    LEFT JOIN users u ON u.id = im.user_id
    ORDER BY im.id DESC
  `).all();
  res.json({ movements: rows });
});

app.post('/api/inventory/movements', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const { itemId, movementType, quantity, notes = '', referenceType = 'manual', referenceId = null } = req.body;
  const qty = Number(quantity);
  if (!itemId || !movementType || !qty || qty <= 0) {
    return res.status(400).json({ error: 'Datos de movimiento inválidos (cantidad debe ser mayor a 0)' });
  }

  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
  if (!item) return res.status(404).json({ error: 'Producto no encontrado' });

  const stockBefore = item.stock;
  let stockAfter = stockBefore;

  if (movementType === 'entrada' || movementType === 'devolucion') {
    stockAfter = stockBefore + qty;
  } else if (movementType === 'salida' || movementType === 'venta' || movementType === 'ajuste') {
    if (stockBefore < qty) {
      return res.status(400).json({ error: `Stock insuficiente. Stock actual: ${stockBefore}, requerido: ${qty}` });
    }
    stockAfter = stockBefore - qty;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE inventory_items SET stock = ?, updated_at = ? WHERE id = ?').run(stockAfter, now, itemId);
  db.prepare(`
    INSERT INTO inventory_movements (item_id, movement_type, quantity, stock_before, stock_after, reference_type, reference_id, notes, user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(itemId, movementType, qty, stockBefore, stockAfter, referenceType, referenceId, notes || '', req.user.id, now);

  audit(req, 'movimiento_inventario', 'inventory', 'inventory_movement', itemId, { stockBefore }, { stockAfter, movementType, quantity: qty });
  detectStockAlerts();
  res.status(201).json({ ok: true, stockBefore, stockAfter });
});

// ============================================================
// VENTAS, PAGOS (EFECTIVO / QR) Y FACTURACIÓN
// ============================================================
app.get('/api/sales', authMiddleware, (req, res) => {
  if (req.user.role === 'cliente') {
    const clientId = getOrCreateClientIdForUser(req.user);
    const rows = db.prepare(`SELECT s.*, c.name as client_name, u.full_name as seller_name FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.seller_id WHERE s.client_id = ? ORDER BY s.id DESC`).all(clientId);
    return res.json({ sales: rows.map(formatSale) });
  }
  const rows = db.prepare(`SELECT s.*, c.name as client_name, u.full_name as seller_name FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.seller_id ORDER BY s.id DESC`).all();
  res.json({ sales: rows.map(formatSale) });
});

app.post('/api/sales', authMiddleware, (req, res) => {
  const { clientId: passedClientId, items = [], discount = 0, paymentMethod = 'efectivo', cashReceived = null, qrReference = '', notes = '' } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'El carrito o venta no contiene productos' });

  const clientId = passedClientId || (req.user.role === 'cliente' ? getOrCreateClientIdForUser(req.user) : null);

  // 1. Validar stock disponible para todos los items
  for (const it of items) {
    const itemRow = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND active = 1').get(it.itemId || it.id);
    if (!itemRow) {
      return res.status(400).json({ error: `El producto "${it.name || 'desconocido'}" no existe o no está activo` });
    }
    const qty = Number(it.quantity || it.qty || 1);
    if (itemRow.stock < qty) {
      return res.status(400).json({ error: `Stock insuficiente para "${itemRow.name}". Disponibles: ${itemRow.stock}, solicitados: ${qty}` });
    }
  }

  // 2. Calcular subtotales
  let subtotal = 0;
  items.forEach(it => {
    const qty = Number(it.quantity || it.qty || 1);
    const price = Number(it.unitPrice || it.price || 0);
    subtotal += (qty * price);
  });

  const discNum = Number(discount) || 0;
  const total = Math.max(0, subtotal - discNum);

  // 3. Validar pago en efectivo si aplica
  let cashChange = null;
  let cashRecNum = cashReceived !== null && cashReceived !== undefined ? Number(cashReceived) : null;
  if (paymentMethod === 'efectivo' && cashRecNum !== null) {
    if (cashRecNum < total) {
      return res.status(400).json({ error: `El monto recibido (${cashRecNum.toLocaleString('es-PY')} Bs) es menor al total a pagar (${total.toLocaleString('es-PY')} Bs)` });
    }
    cashChange = cashRecNum - total;
  }

  const now = new Date().toISOString();
  const saleNumber = ensureSaleNumber();
  const sellerId = req.user.role !== 'cliente' ? req.user.id : null;

  // 4. Crear registro de venta
  const saleInsert = db.prepare(`
    INSERT INTO sales (sale_number, client_id, seller_id, subtotal, discount, total, payment_method, status, cash_received, cash_change, qr_reference, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pagada', ?, ?, ?, ?, ?, ?)
  `).run(saleNumber, clientId, sellerId, subtotal, discNum, total, paymentMethod, cashRecNum, cashChange, qrReference || '', notes || '', now, now);

  const saleId = saleInsert.lastInsertRowid;

  // 5. Insertar sale_items y descontar inventario con salida automática
  for (const it of items) {
    const itemId = it.itemId || it.id;
    const qty = Number(it.quantity || it.qty || 1);
    const price = Number(it.unitPrice || it.price || 0);
    const itemSubtotal = qty * price;

    db.prepare(`
      INSERT INTO sale_items (sale_id, item_id, item_name, quantity, unit_price, subtotal)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(saleId, itemId, it.name || 'Producto', qty, price, itemSubtotal);

    const itemRow = db.prepare('SELECT stock FROM inventory_items WHERE id = ?').get(itemId);
    const stockBefore = itemRow.stock;
    const stockAfter = Math.max(0, stockBefore - qty);

    db.prepare('UPDATE inventory_items SET stock = ?, updated_at = ? WHERE id = ?').run(stockAfter, now, itemId);
    db.prepare(`
      INSERT INTO inventory_movements (item_id, movement_type, quantity, stock_before, stock_after, reference_type, reference_id, notes, user_id, created_at)
      VALUES (?, 'venta', ?, ?, ?, 'sale', ?, ?, ?, ?)
    `).run(itemId, qty, stockBefore, stockAfter, saleId, `Salida por venta ${saleNumber}`, req.user.id, now);
  }

  // 6. Registrar pago
  db.prepare(`
    INSERT INTO payments (sale_id, client_id, payment_method, amount, cash_received, cash_change, qr_reference, status, created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmado', ?, ?)
  `).run(saleId, clientId, paymentMethod, total, cashRecNum, cashChange, qrReference || '', req.user.id, now);

  // 7. Preparar/Generar Factura
  const invoiceNumber = ensureInvoiceNumber();
  const clientRow = clientId ? db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) : null;
  const clientName = clientRow ? clientRow.name : (req.user.name || req.user.username);
  const clientRuc = clientRow ? (clientRow.ruc || 'Sin RUC') : 'Sin RUC';
  const clientAddr = clientRow ? (clientRow.address || '') : '';

  db.prepare(`
    INSERT INTO invoices (invoice_number, sale_id, client_id, client_name, client_ruc, client_address, items_json, subtotal, total, payment_method, status, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'emitida', ?, ?, ?)
  `).run(invoiceNumber, saleId, clientId, clientName, clientRuc, clientAddr, JSON.stringify(items), subtotal, total, paymentMethod, req.user.id, now, now);

  if (clientId) {
    db.prepare('INSERT INTO client_history (client_id, entry_type, description, related_type, related_id, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(clientId, 'compra_realizada', `Compra ${saleNumber} por valor de Bs. ${total.toLocaleString('es-PY')} (${paymentMethod.toUpperCase()})`, 'sale', saleId, now, req.user.id);
  }

  audit(req, 'venta_realizada', 'sales', 'sale', saleId, null, { saleNumber, total, paymentMethod });
  notifyAdmins('venta_realizada', '💰 Nueva Venta Registrada', `Se registró la venta ${saleNumber} por valor de Bs. ${total.toLocaleString('es-PY')}.`, { saleId });
  detectStockAlerts();

  const createdSale = db.prepare(`SELECT s.*, c.name as client_name, u.full_name as seller_name FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.seller_id WHERE s.id = ?`).get(saleId);
  res.status(201).json({ sale: formatSale(createdSale), invoiceNumber, cashChange });
});

// Facturas
app.get('/api/invoices', authMiddleware, (req, res) => {
  if (req.user.role === 'cliente') {
    const clientId = getOrCreateClientIdForUser(req.user);
    const rows = db.prepare('SELECT * FROM invoices WHERE client_id = ? ORDER BY id DESC').all(clientId);
    return res.json({ invoices: rows.map(formatInvoice) });
  }
  const rows = db.prepare('SELECT * FROM invoices ORDER BY id DESC').all();
  res.json({ invoices: rows.map(formatInvoice) });
});

app.get('/api/invoices/:id/pdf', authMiddleware, (req, res) => {
  const invoiceId = Number(req.params.id);
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv) return res.status(404).json({ error: 'Factura no encontrada' });

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=factura-${inv.invoice_number}.pdf`);
  doc.pipe(res);

  doc.fontSize(22).fillColor('#1a56db').text('SYSTEMHOME S.A.', { align: 'center' });
  doc.fontSize(9.5).fillColor('#4b5563').text('RUC: 80099887-1 · Timbrado Electrónico: 16548920', { align: 'center' });
  doc.text('Seguridad Electrónica, Climatización y Telecomunicaciones', { align: 'center' });
  doc.text('WhatsApp: +591 64595762 · Asunción, Paraguay', { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#1a56db').lineWidth(2).stroke();
  doc.moveDown();

  doc.fontSize(14).fillColor('#111827').text(`COMPROBANTE DE FACTURACIÓN: ${inv.invoice_number}`, { align: 'left' });
  doc.fontSize(9).fillColor('#6b7280').text(`Fecha de Emisión: ${new Date(inv.created_at).toLocaleString('es-PY')}   |   Condición: Contado (${(inv.payment_method || 'efectivo').toUpperCase()})`);
  doc.moveDown();

  doc.rect(40, doc.y, 515, 50).fillAndStroke('#f8fafc', '#e2e8f0');
  doc.fillColor('#1e293b').fontSize(9.5).text('DATOS FISCALES DEL CLIENTE:', 50, doc.y - 42);
  doc.fontSize(8.5).fillColor('#334155');
  doc.text(`Razón Social / Nombre: ${inv.client_name}`, 50, doc.y + 3);
  doc.text(`RUC / CI: ${inv.client_ruc || 'Sin RUC'}   |   Dirección: ${inv.client_address || 'Asunción'}`, 50, doc.y + 2);
  doc.moveDown(1.8);

  let items = [];
  try { items = JSON.parse(inv.items_json || '[]'); } catch (e) { items = []; }

  let currentY = doc.y;
  doc.rect(40, currentY, 515, 18).fill('#1e293b');
  doc.fillColor('#ffffff').fontSize(8.5);
  doc.text('Cant.', 45, currentY + 4);
  doc.text('Descripción del Producto / Servicio', 85, currentY + 4);
  doc.text('P. Unitario', 380, currentY + 4);
  doc.text('Valor Total', 470, currentY + 4);

  currentY += 20;
  items.forEach((it, idx) => {
    const qty = Number(it.quantity || it.qty || 1);
    const price = Number(it.unitPrice || it.price || 0);
    const subtotal = Number(it.subtotal || (qty * price));

    doc.rect(40, currentY, 515, 16).fill(idx % 2 === 0 ? '#f8fafc' : '#ffffff');
    doc.fillColor('#1e293b').fontSize(8);
    doc.text(String(qty), 45, currentY + 3);
    doc.text(it.name || it.concept || 'Producto', 85, currentY + 3, { width: 280, ellipsis: true });
    doc.text(price.toLocaleString('es-PY') + ' Bs', 380, currentY + 3);
    doc.text(subtotal.toLocaleString('es-PY') + ' Bs', 470, currentY + 3);
    currentY += 18;
  });

  doc.y = currentY + 10;
  doc.moveTo(350, doc.y).lineTo(555, doc.y).strokeColor('#cbd5e1').stroke();
  doc.moveDown(0.5);

  doc.fontSize(12).fillColor('#1a56db').text(`TOTAL LIQUIDACIÓN: ${Number(inv.total).toLocaleString('es-PY')} Bs.`, 350, doc.y, { align: 'right' });
  doc.moveDown(0.3);
  doc.fontSize(8.5).fillColor('#64748b').text(`Liquidación IVA: Incluido 10% (${Math.round(inv.total / 11).toLocaleString('es-PY')} Bs)`, 350, doc.y, { align: 'right' });

  doc.moveDown(3);
  doc.fontSize(8).fillColor('#94a3b8').text('Comprobante preparado para integración de Facturación Electrónica SIFEN · SYSTEMHOME', { align: 'center' });
  doc.end();
});

// ============================================================
// PROGRAMACIÓN DE MANTENIMIENTOS (SH-M01)
// ============================================================
app.get('/api/maintenances', authMiddleware, (req, res) => {
  if (req.user.role === 'cliente') {
    const clientId = getOrCreateClientIdForUser(req.user);
    const rows = db.prepare(`
      SELECT m.*, c.name as client_name, t.name as technician_name, ii.name as item_name
      FROM maintenances m
      LEFT JOIN clients c ON c.id = m.client_id
      LEFT JOIN technicians t ON t.id = m.technician_id
      LEFT JOIN inventory_items ii ON ii.id = m.inventory_item_id
      WHERE m.client_id = ?
      ORDER BY m.next_maintenance_date ASC
    `).all(clientId);
    return res.json({ maintenances: rows.map(formatMaintenance) });
  }

  const rows = db.prepare(`
    SELECT m.*, c.name as client_name, t.name as technician_name, ii.name as item_name
    FROM maintenances m
    LEFT JOIN clients c ON c.id = m.client_id
    LEFT JOIN technicians t ON t.id = m.technician_id
    LEFT JOIN inventory_items ii ON ii.id = m.inventory_item_id
    ORDER BY m.next_maintenance_date ASC
  `).all();
  res.json({ maintenances: rows.map(formatMaintenance) });
});

app.post('/api/maintenances', authMiddleware, requireRole(['admin', 'vendedor', 'tecnico']), (req, res) => {
  const { clientId, technicianId, inventoryItemId, equipmentName, nextMaintenanceDate, scheduledTime, maintenanceType, frequency = 'Semestral', status = 'programado', description = '', notes = '', latitude, longitude } = req.body;
  if (!nextMaintenanceDate || !maintenanceType) {
    return res.status(400).json({ error: 'Fecha y tipo de mantenimiento son obligatorios' });
  }

  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO maintenances (client_id, technician_id, inventory_item_id, equipment_name, next_maintenance_date, scheduled_time, maintenance_type, frequency, status, description, notes, latitude, longitude, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    clientId || null, technicianId || null, inventoryItemId || null, equipmentName || '',
    nextMaintenanceDate, scheduledTime || '09:00', maintenanceType, frequency, status,
    description || '', notes || '', latitude || null, longitude || null, now
  );

  const maintId = result.lastInsertRowid;
  if (clientId) {
    db.prepare('INSERT INTO client_history (client_id, entry_type, description, related_type, related_id, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(clientId, 'mantenimiento_programado', `Mantenimiento ${maintenanceType} programado para el ${nextMaintenanceDate}`, 'maintenance', maintId, now, req.user.id);
  }

  audit(req, 'mantenimiento_programado', 'maintenances', 'maintenance', maintId, null, { nextMaintenanceDate, maintenanceType, status });
  const maint = db.prepare(`SELECT m.*, c.name as client_name, t.name as technician_name, ii.name as item_name FROM maintenances m LEFT JOIN clients c ON c.id = m.client_id LEFT JOIN technicians t ON t.id = m.technician_id LEFT JOIN inventory_items ii ON ii.id = m.inventory_item_id WHERE m.id = ?`).get(maintId);
  res.status(201).json({ maintenance: formatMaintenance(maint) });
});

app.put('/api/maintenances/:id', authMiddleware, requireRole(['admin', 'tecnico']), (req, res) => {
  const maintId = Number(req.params.id);
  const current = db.prepare('SELECT * FROM maintenances WHERE id = ?').get(maintId);
  if (!current) return res.status(404).json({ error: 'Mantenimiento no encontrado' });

  const { technicianId, nextMaintenanceDate, scheduledTime, maintenanceType, frequency, status, description, notes, workDone, materialsUsed, evidencePhotos } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE maintenances SET technician_id = ?, next_maintenance_date = ?, scheduled_time = ?, maintenance_type = ?, frequency = ?, status = ?, description = ?, notes = ?, work_done = ?, materials_used = ?, evidence_photos = ?, completed_at = ?, performed_by_user_id = ? WHERE id = ?
  `).run(
    technicianId !== undefined ? technicianId : current.technician_id,
    nextMaintenanceDate || current.next_maintenance_date,
    scheduledTime !== undefined ? scheduledTime : current.scheduled_time,
    maintenanceType || current.maintenance_type,
    frequency || current.frequency,
    status || current.status,
    description !== undefined ? description : current.description,
    notes !== undefined ? notes : current.notes,
    workDone !== undefined ? workDone : current.work_done,
    materialsUsed !== undefined ? JSON.stringify(materialsUsed) : current.materials_used,
    evidencePhotos !== undefined ? JSON.stringify(evidencePhotos) : current.evidence_photos,
    status === 'realizado' ? (current.completed_at || now) : null,
    status === 'realizado' ? (current.performed_by_user_id || req.user.id) : null,
    maintId
  );

  const updated = db.prepare(`SELECT m.*, c.name as client_name, t.name as technician_name, ii.name as item_name FROM maintenances m LEFT JOIN clients c ON c.id = m.client_id LEFT JOIN technicians t ON t.id = m.technician_id LEFT JOIN inventory_items ii ON ii.id = m.inventory_item_id WHERE m.id = ?`).get(maintId);
  audit(req, 'mantenimiento_modificado', 'maintenances', 'maintenance', maintId, { status: current.status }, { status: updated.status });
  res.json({ maintenance: formatMaintenance(updated) });
});

// Técnico completa mantenimiento
app.post('/api/maintenances/:id/complete', authMiddleware, requireRole(['admin', 'tecnico']), (req, res) => {
  const maintId = Number(req.params.id);
  const current = db.prepare('SELECT * FROM maintenances WHERE id = ?').get(maintId);
  if (!current) return res.status(404).json({ error: 'Mantenimiento no encontrado' });

  const { workDone, observations, materialsUsed = [], evidencePhotos = [] } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE maintenances SET status = 'realizado', work_done = ?, notes = ?, materials_used = ?, evidence_photos = ?, completed_at = ?, performed_by_user_id = ? WHERE id = ?
  `).run(
    workDone || 'Mantenimiento preventivo/correctivo ejecutado con éxito',
    observations || current.notes,
    JSON.stringify(materialsUsed),
    JSON.stringify(evidencePhotos),
    now,
    req.user.id,
    maintId
  );

  if (current.client_id) {
    db.prepare('INSERT INTO client_history (client_id, entry_type, description, related_type, related_id, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(current.client_id, 'mantenimiento_realizado', `Mantenimiento de ${current.equipment_name || 'equipo'} realizado con éxito`, 'maintenance', maintId, now, req.user.id);
  }

  audit(req, 'mantenimiento_completado', 'maintenances', 'maintenance', maintId, { status: current.status }, { status: 'realizado' });
  notifyAdmins('mantenimiento_realizado', '🛠️ Mantenimiento Realizado', `Se ha completado el mantenimiento de ${current.equipment_name || 'equipo'} (${current.next_maintenance_date}).`, { maintId });

  const updated = db.prepare(`SELECT m.*, c.name as client_name, t.name as technician_name, ii.name as item_name FROM maintenances m LEFT JOIN clients c ON c.id = m.client_id LEFT JOIN technicians t ON t.id = m.technician_id LEFT JOIN inventory_items ii ON ii.id = m.inventory_item_id WHERE m.id = ?`).get(maintId);
  res.json({ maintenance: formatMaintenance(updated) });
});

// Alertas de mantenimiento
app.get('/api/maintenance-alerts', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT ma.*, m.next_maintenance_date, m.status as maintenance_status, m.maintenance_type, m.equipment_name,
           c.name as client_name, ii.name as item_name
    FROM maintenance_alerts ma
    JOIN maintenances m ON m.id = ma.maintenance_id
    LEFT JOIN clients c ON c.id = m.client_id
    LEFT JOIN inventory_items ii ON ii.id = m.inventory_item_id
    ORDER BY ma.id DESC
  `).all();
  res.json({ alerts: rows });
});

// ============================================================
// GARANTÍAS Y RECLAMOS
// ============================================================
app.get('/api/warranties', authMiddleware, (req, res) => {
  updateWarrantyStatuses();
  if (req.user.role === 'cliente') {
    const clientId = getOrCreateClientIdForUser(req.user);
    const rows = db.prepare(`SELECT w.*, c.name as client_name, ii.name as item_name FROM warranties w LEFT JOIN clients c ON c.id = w.client_id LEFT JOIN inventory_items ii ON ii.id = w.inventory_item_id WHERE w.client_id = ? ORDER BY w.id DESC`).all(clientId);
    return res.json({ warranties: rows.map(formatWarranty) });
  }
  const rows = db.prepare(`SELECT w.*, c.name as client_name, ii.name as item_name FROM warranties w LEFT JOIN clients c ON c.id = w.client_id LEFT JOIN inventory_items ii ON ii.id = w.inventory_item_id ORDER BY w.id DESC`).all();
  res.json({ warranties: rows.map(formatWarranty) });
});

app.get('/api/warranties/mine', authMiddleware, (req, res) => {
  updateWarrantyStatuses();
  const clientId = getOrCreateClientIdForUser(req.user);
  const rows = db.prepare(`SELECT w.*, c.name as client_name, ii.name as item_name FROM warranties w LEFT JOIN clients c ON c.id = w.client_id LEFT JOIN inventory_items ii ON ii.id = w.inventory_item_id WHERE w.client_id = ? ORDER BY w.id DESC`).all(clientId);
  res.json({ warranties: rows.map(formatWarranty) });
});

app.post('/api/warranties', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const { clientId, inventoryItemId, installationDate, durationMonths = 12, conditions } = req.body;
  if (!clientId || !inventoryItemId) return res.status(400).json({ error: 'Cliente y producto son requeridos' });

  const now = new Date().toISOString();
  const installDate = installationDate || now.slice(0, 10);
  const expiry = new Date(installDate);
  expiry.setMonth(expiry.getMonth() + Number(durationMonths));
  const expiryDate = expiry.toISOString().slice(0, 10);

  const result = db.prepare(`
    INSERT INTO warranties (client_id, inventory_item_id, installation_date, expiry_date, duration_months, conditions, status, created_at, updated_at, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, 'vigente', ?, ?, ?)
  `).run(clientId, inventoryItemId, installDate, expiryDate, Number(durationMonths), conditions || '', now, now, req.user.id);

  const warranty = db.prepare('SELECT * FROM warranties WHERE id = ?').get(result.lastInsertRowid);
  audit(req, 'garantia_creada', 'warranties', 'warranty', warranty.id, null, { clientId, expiryDate });
  res.status(201).json({ warranty: formatWarranty(warranty) });
});

app.post('/api/warranties/:id/claims', authMiddleware, (req, res) => {
  const warrantyId = Number(req.params.id);
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: 'Descripción del reclamo requerida' });

  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO warranty_claims (warranty_id, claim_date, description, status, created_at, created_by_user_id)
    VALUES (?, ?, ?, 'abierto', ?, ?)
  `).run(warrantyId, now.slice(0, 10), description, now, req.user.id);

  db.prepare("UPDATE warranties SET status = 'reclamada' WHERE id = ?").run(warrantyId);
  audit(req, 'garantia_reclamada', 'warranties', 'warranty', warrantyId, null, { description });
  notifyAdmins('garantia_reclamada', '🛡️ Nuevo Reclamo de Garantía', `Se ha registrado un reclamo de garantía: "${description}"`, { warrantyId });

  const claim = db.prepare('SELECT * FROM warranty_claims WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ claim });
});

// ============================================================
// DASHBOARD, REPORTES Y SUMMARY
// ============================================================
app.get('/api/dashboard', authMiddleware, (req, res) => {
  const totalClients = db.prepare('SELECT COUNT(*) as count FROM clients WHERE active = 1').get().count;
  const totalRequests = db.prepare('SELECT COUNT(*) as count FROM requests').get().count;
  const pendingRequests = db.prepare("SELECT COUNT(*) as count FROM requests WHERE status = 'pendiente'").get().count;
  const totalBudgets = db.prepare('SELECT COUNT(*) as count FROM budgets').get().count;
  const pendingBudgets = db.prepare("SELECT COUNT(*) as count FROM budgets WHERE status IN ('borrador', 'enviado')").get().count;
  const approvedBudgets = db.prepare("SELECT COUNT(*) as count FROM budgets WHERE status = 'aprobado'").get().count;
  const rejectedBudgets = db.prepare("SELECT COUNT(*) as count FROM budgets WHERE status = 'rechazado'").get().count;
  const totalOrders = db.prepare('SELECT COUNT(*) as count FROM work_orders').get().count;
  const pendingOrders = db.prepare("SELECT COUNT(*) as count FROM work_orders WHERE status = 'pendiente'").get().count;
  const inProgressOrders = db.prepare("SELECT COUNT(*) as count FROM work_orders WHERE status IN ('en_proceso', 'ejecucion')").get().count;
  const completedOrders = db.prepare("SELECT COUNT(*) as count FROM work_orders WHERE status IN ('finalizada', 'cerrada', 'completada')").get().count;
  const totalSales = db.prepare('SELECT COUNT(*) as count FROM sales').get().count;
  const totalRevenue = db.prepare('SELECT COALESCE(SUM(total), 0) as sum FROM sales').get().sum;
  const lowStock = db.prepare('SELECT COUNT(*) as count FROM inventory_items WHERE active = 1 AND stock <= min_stock').get().count;
  const upcomingMaintenances = db.prepare("SELECT COUNT(*) as count FROM maintenances WHERE status = 'programado'").get().count;
  const overdueMaintenances = db.prepare("SELECT COUNT(*) as count FROM maintenances WHERE status = 'vencido'").get().count;
  const activeWarranties = db.prepare("SELECT COUNT(*) as count FROM warranties WHERE status = 'vigente'").get().count;

  const topTechnicians = db.prepare(`
    SELECT t.name, COUNT(w.id) as jobs
    FROM technicians t
    LEFT JOIN work_orders w ON w.technician_id = t.id
    GROUP BY t.id ORDER BY jobs DESC LIMIT 5
  `).all();

  const lowStockItems = db.prepare('SELECT * FROM inventory_items WHERE active = 1 AND stock <= min_stock ORDER BY stock ASC LIMIT 8').all();
  const upcomingMaintList = db.prepare("SELECT m.*, c.name as client_name FROM maintenances m LEFT JOIN clients c ON c.id = m.client_id WHERE m.status = 'programado' ORDER BY m.next_maintenance_date ASC LIMIT 6").all();

  const topServices = db.prepare(`
    SELECT COALESCE(s.name, b.service_type) as name, COUNT(b.id) as count
    FROM budgets b
    LEFT JOIN services s ON s.id = b.service_id
    GROUP BY COALESCE(s.name, b.service_type)
    ORDER BY count DESC LIMIT 8
  `).all();

  res.json({
    dashboard: {
      totalClients, totalRequests, pendingRequests, totalBudgets, pendingBudgets, approvedBudgets, rejectedBudgets,
      totalOrders, pendingOrders, inProgressOrders, completedOrders, totalSales, totalRevenue,
      lowStock, upcomingMaintenances, overdueMaintenances, activeWarranties,
      topTechnicians, lowStockItems, upcomingMaintList, topServices
    }
  });
});

app.get('/api/reports/services', authMiddleware, (req, res) => {
  const { serviceType, clientId, technicianId, status, from, to } = req.query;
  let where = [];
  let params = [];

  if (serviceType && serviceType !== 'all') { where.push('b.service_type = ?'); params.push(serviceType); }
  if (clientId && clientId !== 'all') { where.push('b.client_id = ?'); params.push(clientId); }
  if (status && status !== 'all') { where.push('b.status = ?'); params.push(status); }
  if (from) { where.push('b.created_at >= ?'); params.push(from); }
  if (to) { where.push('b.created_at <= ?'); params.push(to); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT b.*, c.name as client_name, s.name as service_name,
           (SELECT COUNT(*) FROM work_orders wo WHERE wo.budget_id = b.id) as order_count
    FROM budgets b
    LEFT JOIN clients c ON c.id = b.client_id
    LEFT JOIN services s ON s.id = b.service_id
    ${whereClause}
    ORDER BY b.id DESC
  `).all(...params);

  res.json({ report: rows });
});

app.get('/api/reports/services/export', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT b.number, b.service_type, b.description, b.total, b.status, b.created_at,
           c.name as client_name, c.phone as client_phone
    FROM budgets b
    LEFT JOIN clients c ON c.id = b.client_id
    ORDER BY b.id DESC
  `).all();

  const header = ['Número', 'Servicio', 'Cliente', 'Teléfono', 'Descripción', 'Total Bs', 'Estado', 'Fecha'];
  const lines = [header.join(',')];
  rows.forEach(r => {
    const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    lines.push([esc(r.number), esc(r.service_type), esc(r.client_name), esc(r.client_phone), esc(r.description), r.total, esc(r.status), esc(r.created_at)].join(','));
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=reporte-servicios.csv');
  res.send('\uFEFF' + lines.join('\n'));
});

app.get('/api/summary', authMiddleware, (req, res) => {
  const clients = db.prepare('SELECT COUNT(*) as count FROM clients WHERE active = 1').get().count;
  const budgets = db.prepare('SELECT COUNT(*) as count FROM budgets').get().count;
  const orders = db.prepare('SELECT COUNT(*) as count FROM work_orders').get().count;
  const inventory = db.prepare('SELECT COUNT(*) as count FROM inventory_items WHERE active = 1').get().count;
  const sales = db.prepare('SELECT COUNT(*) as count FROM sales').get().count;
  res.json({ summary: { clients, budgets, orders, inventory, sales } });
});

// ============================================================
// MÓDULO DE BACKUP Y RESTAURACIÓN REAL
// ============================================================
const backupDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

// Ruta de la base de datos para backup
const dbPathForBackup = process.env.DB_PATH 
  ? path.resolve(process.env.DB_PATH) 
  : path.join(__dirname, 'database', 'systemhome.sqlite');

app.get('/api/backup', authMiddleware, requireRole(['admin']), (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sqliteFilename = `systemhome-backup-${timestamp}.sqlite`;
    const jsonFilename = `systemhome-backup-${timestamp}.json`;
    const sqliteFilePath = path.join(backupDir, sqliteFilename);
    const jsonFilePath = path.join(backupDir, jsonFilename);

    // 1. Copia segura del archivo SQLite
    fs.copyFileSync(dbPathForBackup, sqliteFilePath);

    // 2. Volcado JSON completo de todas las tablas
    const tables = [
      'roles', 'permissions', 'role_permissions', 'users', 'clients', 'services',
      'budgets', 'budget_items', 'technicians', 'work_orders', 'work_order_assignments',
      'inventory_items', 'inventory_movements', 'maintenances', 'client_history',
      'order_history', 'locations', 'requests', 'request_files', 'notifications',
      'audit_logs', 'stock_alerts', 'maintenance_alerts', 'warranties', 'warranty_claims',
      'sales', 'sale_items', 'payments', 'invoices'
    ];

    const dataDump = {
      meta: {
        system: 'SYSTEMHOME Security',
        version: '2.0.0',
        createdAt: new Date().toISOString(),
        createdBy: req.user.username
      },
      tables: {}
    };

    tables.forEach(t => {
      try { dataDump.tables[t] = db.prepare(`SELECT * FROM ${t}`).all(); } catch (e) { dataDump.tables[t] = []; }
    });

    fs.writeFileSync(jsonFilePath, JSON.stringify(dataDump, null, 2), 'utf-8');
    audit(req, 'backup_creado', 'backup', 'database', null, null, { sqlite: sqliteFilename, json: jsonFilename });

    res.json({
      ok: true,
      message: 'Copia de seguridad creada correctamente',
      sqliteFile: sqliteFilename,
      jsonFile: jsonFilename,
      timestamp
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al generar la copia de seguridad: ' + error.message });
  }
});

app.get('/api/backup/list', authMiddleware, requireRole(['admin']), (req, res) => {
  if (!fs.existsSync(backupDir)) return res.json({ backups: [] });
  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.sqlite') || f.endsWith('.json'))
    .map(f => {
      const stat = fs.statSync(path.join(backupDir, f));
      return {
        name: f,
        size: stat.size,
        sizeFormatted: (stat.size / 1024).toFixed(1) + ' KB',
        modified: stat.mtime.toISOString(),
        type: f.endsWith('.sqlite') ? 'SQLite Database' : 'JSON Full Export'
      };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
  res.json({ backups: files });
});

app.get('/api/backup/download/:file', authMiddleware, requireRole(['admin']), (req, res) => {
  const file = path.basename(req.params.file);
  const filePath = path.join(backupDir, file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo de copia de seguridad no encontrado' });
  res.download(filePath);
});

app.delete('/api/backup/:file', authMiddleware, requireRole(['admin']), (req, res) => {
  const file = path.basename(req.params.file);
  const filePath = path.join(backupDir, file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  fs.unlinkSync(filePath);
  audit(req, 'backup_eliminado', 'backup', 'database', null, null, { file });
  res.json({ ok: true });
});

// ============================================================
// ALERTAS DE STOCK
// ============================================================
app.get('/api/stock-alerts', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT sa.*, ii.name as item_name, ii.stock as current_stock, ii.min_stock as stock_min
    FROM stock_alerts sa
    JOIN inventory_items ii ON ii.id = sa.item_id
    ORDER BY sa.id DESC
  `).all();
  res.json({ alerts: rows });
});

app.post('/api/stock-alerts/:id/resolve', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const alertId = Number(req.params.id);
  db.prepare("UPDATE stock_alerts SET status = 'atendida', resolved_at = ?, resolved_by_user_id = ? WHERE id = ?")
    .run(new Date().toISOString(), req.user.id, alertId);
  audit(req, 'alerta_stock_atendida', 'alerts', 'stock_alert', alertId, null, { status: 'atendida' });
  res.json({ ok: true });
});

// ============================================================
// GARANTÍAS: ACTUALIZACIÓN Y RECLAMACIONES
// ============================================================
app.put('/api/warranties/:id', authMiddleware, requireRole(['admin', 'vendedor']), (req, res) => {
  const warrantyId = Number(req.params.id);
  const current = db.prepare('SELECT * FROM warranties WHERE id = ?').get(warrantyId);
  if (!current) return res.status(404).json({ error: 'Garantía no encontrada' });

  const { clientId, inventoryItemId, installationDate, durationMonths, conditions, status } = req.body;
  const now = new Date().toISOString();
  const installDate = installationDate || current.installation_date;
  const months = durationMonths !== undefined ? Number(durationMonths) : current.duration_months;
  const expiry = new Date(installDate);
  expiry.setMonth(expiry.getMonth() + months);

  db.prepare(`
    UPDATE warranties SET client_id = ?, inventory_item_id = ?, installation_date = ?, expiry_date = ?, duration_months = ?, conditions = ?, status = ?, updated_at = ? WHERE id = ?
  `).run(
    clientId !== undefined ? clientId : current.client_id,
    inventoryItemId !== undefined ? inventoryItemId : current.inventory_item_id,
    installDate,
    expiry.toISOString().slice(0, 10),
    months,
    conditions !== undefined ? conditions : current.conditions,
    status || current.status,
    now,
    warrantyId
  );

  const updated = db.prepare(`
    SELECT w.*, c.name as client_name, ii.name as item_name
    FROM warranties w
    LEFT JOIN clients c ON c.id = w.client_id
    LEFT JOIN inventory_items ii ON ii.id = w.inventory_item_id
    WHERE w.id = ?
  `).get(warrantyId);
  audit(req, 'garantia_modificada', 'warranties', 'warranty', warrantyId, { status: current.status }, { status: updated.status });
  res.json({ warranty: formatWarranty(updated) });
});

app.get('/api/warranties/:id/claims', authMiddleware, (req, res) => {
  const warrantyId = Number(req.params.id);
  const rows = db.prepare(`
    SELECT wc.*, w.number, u.full_name as user_name
    FROM warranty_claims wc
    LEFT JOIN warranties w ON w.id = wc.warranty_id
    LEFT JOIN users u ON u.id = wc.created_by_user_id
    WHERE wc.warranty_id = ?
    ORDER BY wc.id DESC
  `).all(warrantyId);
  res.json({ claims: rows });
});

// ============================================================
// AUDITORÍA Y NOTIFICACIONES
// ============================================================
app.get('/api/audit', authMiddleware, requireRole(['admin']), (req, res) => {
  const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300').all();
  res.json({ logs: rows });
});

app.get('/api/notifications', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY id DESC LIMIT 100').all(req.user.id);
  res.json({ notifications: rows });
});

app.get('/api/notifications/unread-count', authMiddleware, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE (user_id = ? OR user_id IS NULL) AND read = 0').get(req.user.id).count;
  res.json({ count });
});

app.post('/api/notifications/:id/read', authMiddleware, (req, res) => {
  const notifId = Number(req.params.id);
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(notifId);
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', authMiddleware, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? OR user_id IS NULL').run(req.user.id);
  res.json({ ok: true });
});

// ============================================================
// SPA FALLBACK
// ============================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'systemhome', 'index.html'));
});

// ============================================================
// ARRANQUE E INICIALIZACIÓN
// ============================================================
initSchema();
seedData();
detectStockAlerts();
detectMaintenanceAlerts();
updateWarrantyStatuses();

setInterval(() => {
  detectStockAlerts();
  detectMaintenanceAlerts();
  updateWarrantyStatuses();
}, 4 * 60 * 60 * 1000);

app.listen(port, () => {
  console.log(`====================================================`);
  console.log(`  SYSTEMHOME SECURITY API v2.0 LISTENING ON PORT ${port}`);
  console.log(`  http://localhost:${port}`);
  console.log(`====================================================`);
});
