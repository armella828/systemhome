const path = require('path');
const fs = require('fs');
require('dotenv').config();

// ============================================================
// CONEXIÓN A BASE DE DATOS (SQLite Universal: node:sqlite / better-sqlite3)
// ============================================================
let DatabaseClass;
try {
  DatabaseClass = require('better-sqlite3');
} catch (e) {
  const { DatabaseSync } = require('node:sqlite');
  DatabaseClass = class DatabaseSyncAdapter {
    constructor(filePath) {
      this._db = new DatabaseSync(filePath);
    }
    pragma(cmd) {
      try { this._db.exec(`PRAGMA ${cmd}`); } catch(e) {}
    }
    exec(sql) {
      return this._db.exec(sql);
    }
    prepare(sql) {
      const stmt = this._db.prepare(sql);
      return {
        run: (...args) => {
          const params = Array.isArray(args[0]) ? args[0] : args;
          return stmt.run(...params);
        },
        get: (...args) => {
          const params = Array.isArray(args[0]) ? args[0] : args;
          const res = stmt.get(...params);
          return res ? { ...res } : undefined;
        },
        all: (...args) => {
          const params = Array.isArray(args[0]) ? args[0] : args;
          const rows = stmt.all(...params);
          return rows.map(r => ({ ...r }));
        }
      };
    }
  };
}

const dbPath = process.env.DB_PATH || path.join(__dirname, 'database', 'systemhome.sqlite');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseClass(dbPath);
db.pragma('foreign_keys = ON');

function run(sql, params = []) {
  return db.prepare(sql).run(params);
}

function get(sql, params = []) {
  return db.prepare(sql).get(params);
}

function all(sql, params = []) {
  return db.prepare(sql).all(params);
}

function addColumnIfNotExists(tableName, columnName, columnDef) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = columns.some(c => c.name.toLowerCase() === columnName.toLowerCase());
    if (!exists) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
    }
  } catch (e) {
    console.error(`Error adding column ${columnName} to ${tableName}:`, e.message);
  }
}

function initSchema() {
  // ============ TABLAS PRINCIPALES (SCHEMA BASE) ============
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY(role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      role_id INTEGER REFERENCES roles(id),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ruc TEXT UNIQUE,
      address TEXT,
      street TEXT,
      number TEXT,
      neighborhood TEXT,
      city TEXT,
      reference TEXT,
      latitude REAL,
      longitude REAL,
      phone TEXT,
      email TEXT,
      client_type TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE NOT NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      request_id INTEGER,
      service_id INTEGER REFERENCES services(id),
      service_type TEXT,
      description TEXT,
      items TEXT,
      labor REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'borrador',
      source TEXT NOT NULL DEFAULT 'internal',
      valid_until TEXT,
      conditions TEXT,
      observations TEXT,
      estimated_time TEXT,
      address TEXT,
      latitude REAL,
      longitude REAL,
      reference TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      sent_at TEXT,
      sent_by_user_id INTEGER REFERENCES users(id),
      approved_at TEXT,
      approved_by_user_id INTEGER REFERENCES users(id),
      rejection_reason TEXT,
      rejected_at TEXT,
      rejected_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS budget_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      concept TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS technicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      specialty TEXT,
      phone TEXT,
      email TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE NOT NULL,
      budget_id INTEGER REFERENCES budgets(id),
      client_id INTEGER REFERENCES clients(id),
      service_id INTEGER REFERENCES services(id),
      service_type TEXT,
      technician_id INTEGER REFERENCES technicians(id),
      scheduled_date TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pendiente',
      observations TEXT,
      address TEXT,
      latitude REAL,
      longitude REAL,
      work_done TEXT,
      materials_used TEXT,
      installed_equipment TEXT,
      client_signature TEXT,
      evidence_photos TEXT,
      closure_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      completed_by_user_id INTEGER REFERENCES users(id),
      closed_at TEXT,
      closed_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS work_order_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      technician_id INTEGER NOT NULL REFERENCES technicians(id),
      assigned_at TEXT NOT NULL,
      assigned_by_user_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'assigned',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      brand TEXT,
      model TEXT,
      stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 5,
      price REAL NOT NULL DEFAULT 0,
      description TEXT,
      features TEXT,
      image_path TEXT,
      image_url TEXT,
      badge TEXT,
      show_in_catalog INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      movement_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      stock_before INTEGER,
      stock_after INTEGER,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS maintenances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id),
      technician_id INTEGER REFERENCES technicians(id),
      inventory_item_id INTEGER REFERENCES inventory_items(id),
      equipment_name TEXT,
      next_maintenance_date TEXT,
      scheduled_time TEXT,
      maintenance_type TEXT NOT NULL,
      frequency TEXT,
      status TEXT NOT NULL DEFAULT 'programado',
      description TEXT,
      notes TEXT,
      work_done TEXT,
      materials_used TEXT,
      evidence_photos TEXT,
      latitude REAL,
      longitude REAL,
      alert_sent_15 INTEGER NOT NULL DEFAULT 0,
      alert_sent_7 INTEGER NOT NULL DEFAULT 0,
      alert_sent_0 INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      confirmed_at TEXT,
      completed_at TEXT,
      performed_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS client_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      entry_type TEXT NOT NULL,
      description TEXT NOT NULL,
      related_type TEXT,
      related_id INTEGER,
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      entry_type TEXT NOT NULL,
      description TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      street TEXT,
      number TEXT,
      neighborhood TEXT,
      city TEXT,
      reference TEXT,
      full_address TEXT,
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE NOT NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id),
      service_id INTEGER REFERENCES services(id),
      service_type TEXT,
      description TEXT,
      address TEXT,
      latitude REAL,
      longitude REAL,
      reference TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'pendiente',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS request_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      uploaded_at TEXT NOT NULL,
      uploaded_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      data TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      role TEXT,
      action TEXT NOT NULL,
      module TEXT,
      record_type TEXT,
      record_id INTEGER,
      previous_state TEXT,
      new_state TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      alert_type TEXT NOT NULL DEFAULT 'stock_minimo',
      stock_current INTEGER NOT NULL,
      stock_min INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendiente',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS maintenance_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      maintenance_id INTEGER NOT NULL REFERENCES maintenances(id) ON DELETE CASCADE,
      alert_type TEXT NOT NULL,
      days_before INTEGER,
      notified_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'enviada'
    );

    CREATE TABLE IF NOT EXISTS warranties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
      installation_date TEXT,
      expiry_date TEXT,
      duration_months INTEGER NOT NULL DEFAULT 12,
      conditions TEXT,
      status TEXT NOT NULL DEFAULT 'vigente',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS warranty_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warranty_id INTEGER NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
      claim_date TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'abierto',
      resolution TEXT,
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id)
    );

    -- ============ NUEVAS TABLAS: VENTAS, PAGOS Y FACTURAS ============
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_number TEXT UNIQUE NOT NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      seller_id INTEGER REFERENCES users(id),
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'efectivo',
      status TEXT NOT NULL DEFAULT 'pagada',
      cash_received REAL,
      cash_change REAL,
      qr_reference TEXT,
      qr_receipt TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      cash_received REAL,
      cash_change REAL,
      qr_reference TEXT,
      qr_receipt TEXT,
      status TEXT NOT NULL DEFAULT 'confirmado',
      notes TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      client_name TEXT NOT NULL,
      client_ruc TEXT,
      client_address TEXT,
      items_json TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'efectivo',
      status TEXT NOT NULL DEFAULT 'emitida',
      pdf_path TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // ============ MIGRACIONES DE COLUMNAS A PRUEBA DE FALLOS ============
  addColumnIfNotExists('inventory_items', 'badge', 'TEXT');
  addColumnIfNotExists('inventory_items', 'show_in_catalog', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfNotExists('inventory_items', 'min_stock', 'INTEGER NOT NULL DEFAULT 5');
  addColumnIfNotExists('inventory_items', 'image_path', 'TEXT');
  addColumnIfNotExists('inventory_items', 'image_url', 'TEXT');
  addColumnIfNotExists('inventory_items', 'features', 'TEXT');

  addColumnIfNotExists('inventory_movements', 'stock_before', 'INTEGER');
  addColumnIfNotExists('inventory_movements', 'stock_after', 'INTEGER');
  addColumnIfNotExists('inventory_movements', 'reference_type', 'TEXT');
  addColumnIfNotExists('inventory_movements', 'reference_id', 'INTEGER');

  addColumnIfNotExists('clients', 'latitude', 'REAL');
  addColumnIfNotExists('clients', 'longitude', 'REAL');
  addColumnIfNotExists('clients', 'street', 'TEXT');
  addColumnIfNotExists('clients', 'number', 'TEXT');
  addColumnIfNotExists('clients', 'neighborhood', 'TEXT');
  addColumnIfNotExists('clients', 'city', 'TEXT');
  addColumnIfNotExists('clients', 'reference', 'TEXT');

  addColumnIfNotExists('budgets', 'request_id', 'INTEGER');
  addColumnIfNotExists('budgets', 'valid_until', 'TEXT');
  addColumnIfNotExists('budgets', 'conditions', 'TEXT');
  addColumnIfNotExists('budgets', 'observations', 'TEXT');
  addColumnIfNotExists('budgets', 'estimated_time', 'TEXT');
  addColumnIfNotExists('budgets', 'sent_at', 'TEXT');
  addColumnIfNotExists('budgets', 'sent_by_user_id', 'INTEGER');
  addColumnIfNotExists('budgets', 'rejection_reason', 'TEXT');
  addColumnIfNotExists('budgets', 'rejected_at', 'TEXT');
  addColumnIfNotExists('budgets', 'rejected_by_user_id', 'INTEGER');
  addColumnIfNotExists('budgets', 'latitude', 'REAL');
  addColumnIfNotExists('budgets', 'longitude', 'REAL');
  addColumnIfNotExists('budgets', 'address', 'TEXT');
  addColumnIfNotExists('budgets', 'reference', 'TEXT');

  addColumnIfNotExists('work_orders', 'latitude', 'REAL');
  addColumnIfNotExists('work_orders', 'longitude', 'REAL');
  addColumnIfNotExists('work_orders', 'address', 'TEXT');
  addColumnIfNotExists('work_orders', 'work_done', 'TEXT');
  addColumnIfNotExists('work_orders', 'materials_used', 'TEXT');
  addColumnIfNotExists('work_orders', 'installed_equipment', 'TEXT');
  addColumnIfNotExists('work_orders', 'client_signature', 'TEXT');
  addColumnIfNotExists('work_orders', 'evidence_photos', 'TEXT');
  addColumnIfNotExists('work_orders', 'closure_notes', 'TEXT');
  addColumnIfNotExists('work_orders', 'closed_at', 'TEXT');
  addColumnIfNotExists('work_orders', 'closed_by_user_id', 'INTEGER');

  addColumnIfNotExists('maintenances', 'technician_id', 'INTEGER');
  addColumnIfNotExists('maintenances', 'equipment_name', 'TEXT');
  addColumnIfNotExists('maintenances', 'frequency', 'TEXT');
  addColumnIfNotExists('maintenances', 'work_done', 'TEXT');
  addColumnIfNotExists('maintenances', 'materials_used', 'TEXT');
  addColumnIfNotExists('maintenances', 'evidence_photos', 'TEXT');
  addColumnIfNotExists('maintenances', 'latitude', 'REAL');
  addColumnIfNotExists('maintenances', 'longitude', 'REAL');
  addColumnIfNotExists('maintenances', 'scheduled_time', 'TEXT');
  addColumnIfNotExists('maintenances', 'confirmed_at', 'TEXT');
  addColumnIfNotExists('maintenances', 'alert_sent_15', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfNotExists('maintenances', 'alert_sent_7', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfNotExists('maintenances', 'alert_sent_0', 'INTEGER NOT NULL DEFAULT 0');
  
  // ============ COLUMNAS DE RESPUESTA CLIENTE ============
  addColumnIfNotExists('budgets', 'client_response_status', "TEXT DEFAULT 'pendiente'");
  addColumnIfNotExists('budgets', 'client_response_date', 'TEXT');
  addColumnIfNotExists('budgets', 'client_notes', 'TEXT');
  addColumnIfNotExists('budgets', 'client_response_by_user_id', 'INTEGER REFERENCES users(id)');
}

function seedData() {
  const now = new Date().toISOString();
  const validRoleNames = ['admin', 'vendedor', 'tecnico', 'cliente'];
  const legacyRoleNames = ['gerente', 'supervisor', 'almacenista'];
  const roles = all('SELECT id, name FROM roles');
  const roleMap = Object.fromEntries(roles.map(r => [r.name, r.id]));
  const replacementRoleName = roleMap.vendedor ? 'vendedor' : (roleMap.tecnico ? 'tecnico' : 'admin');
  const replacementRoleId = roleMap[replacementRoleName] || null;

  if (replacementRoleId) {
    legacyRoleNames.forEach((legacyRole) => {
      const legacyId = roleMap[legacyRole];
      if (legacyId) {
        run('UPDATE users SET role_id = ? WHERE role_id = ?', [replacementRoleId, legacyId]);
        run('DELETE FROM role_permissions WHERE role_id = ?', [legacyId]);
      }
    });
    run("DELETE FROM roles WHERE name IN ('gerente', 'supervisor', 'almacenista')");
  }

  const roleCount = db.prepare('SELECT COUNT(*) as count FROM roles').get().count;
  if (roleCount === 0) {
    db.exec(`
      INSERT INTO roles (name, description) VALUES
      ('admin', 'Administrador con control total del sistema'),
      ('vendedor', 'Vendedor comercial (ventas, cotizaciones, cobros, facturas)'),
      ('tecnico', 'Técnico de campo (órdenes asignadas, mantenimientos, evidencias)'),
      ('cliente', 'Cliente con portal propio para cotizaciones, compras y servicios');
    `);

    db.exec(`
      INSERT INTO permissions (key, description) VALUES
      ('dashboard.admin', 'Ver dashboard administrativo completo'),
      ('clients.read', 'Ver clientes'),
      ('clients.write', 'Gestionar clientes'),
      ('budgets.read', 'Ver presupuestos y cotizaciones'),
      ('budgets.write', 'Gestionar presupuestos y cotizaciones'),
      ('orders.read', 'Ver órdenes de trabajo'),
      ('orders.write', 'Gestionar órdenes de trabajo'),
      ('orders.close', 'Cerrar definitivamente órdenes de trabajo'),
      ('inventory.read', 'Ver inventario y catálogo'),
      ('inventory.write', 'Gestionar inventario y movimientos'),
      ('sales.read', 'Ver ventas y cobros'),
      ('sales.write', 'Registrar ventas, cobros y facturas'),
      ('maintenance.read', 'Ver mantenimientos'),
      ('maintenance.write', 'Gestionar y programar mantenimientos'),
      ('requests.read', 'Ver solicitudes de cotización'),
      ('requests.write', 'Gestionar solicitudes de cotización'),
      ('warranties.read', 'Ver garantías'),
      ('warranties.write', 'Gestionar garantías'),
      ('reports.read', 'Ver reportes gerenciales'),
      ('audit.read', 'Ver registros de auditoría'),
      ('backup.manage', 'Gestionar copias de seguridad'),
      ('users.manage', 'Administrar usuarios y permisos'),
      ('notifications.read', 'Ver notificaciones');
    `);

    const rolesAfterInsert = all('SELECT id, name FROM roles');
    const permissions = all('SELECT id, key FROM permissions');
    const roleMapAfterInsert = Object.fromEntries(rolesAfterInsert.map(r => [r.name, r.id]));
    const permMap = Object.fromEntries(permissions.map(p => [p.key, p.id]));

    const rolePerms = {
      admin: ['dashboard.admin','clients.read','clients.write','budgets.read','budgets.write','orders.read','orders.write','orders.close','inventory.read','inventory.write','sales.read','sales.write','maintenance.read','maintenance.write','requests.read','requests.write','warranties.read','warranties.write','reports.read','audit.read','backup.manage','users.manage','notifications.read'],
      vendedor: ['clients.read','clients.write','budgets.read','budgets.write','sales.read','sales.write','inventory.read','requests.read','requests.write','warranties.read','reports.read','notifications.read'],
      tecnico: ['orders.read','orders.write','maintenance.read','maintenance.write','requests.read','notifications.read'],
      cliente: ['clients.read','budgets.read','requests.read','requests.write','warranties.read','sales.read','notifications.read']
    };

    for (const [roleName, permissionKeys] of Object.entries(rolePerms)) {
      const roleId = roleMapAfterInsert[roleName];
      for (const permissionKey of permissionKeys) {
        const permissionId = permMap[permissionKey];
        if (roleId && permissionId) {
          run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, permissionId]);
        }
      }
    }
  }

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const bcrypt = require('bcryptjs');
    run('INSERT INTO users (username, password_hash, full_name, email, phone, role_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, (SELECT id FROM roles WHERE name = ?), 1, ?, ?)', ['admin', bcrypt.hashSync('admin123', 10), 'Administrador General', 'admin@systemhome.com', '0981 000 000', 'admin', now, now]);
    run('INSERT INTO users (username, password_hash, full_name, email, phone, role_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, (SELECT id FROM roles WHERE name = ?), 1, ?, ?)', ['vendedor', bcrypt.hashSync('vendedor123', 10), 'Vendedor Comercial', 'vendedor@systemhome.com', '0981 555 555', 'vendedor', now, now]);
    run('INSERT INTO users (username, password_hash, full_name, email, phone, role_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, (SELECT id FROM roles WHERE name = ?), 1, ?, ?)', ['tecnico', bcrypt.hashSync('tecnico123', 10), 'Técnico Especialista', 'tecnico@systemhome.com', '0981 333 333', 'tecnico', now, now]);
    run('INSERT INTO users (username, password_hash, full_name, email, phone, role_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, (SELECT id FROM roles WHERE name = ?), 1, ?, ?)', ['cliente', bcrypt.hashSync('cliente123', 10), 'Cliente Residencial', 'cliente@systemhome.com', '0981 666 666', 'cliente', now, now]);
  }

  const serviceCount = db.prepare('SELECT COUNT(*) as count FROM services').get().count;
  if (serviceCount === 0) {
    db.exec(`
      INSERT INTO services (name, description, active) VALUES
      ('Cámaras de Vigilancia', 'Instalación y mantenimiento de sistemas de videovigilancia HD y 4K', 1),
      ('Sistemas de Alarma', 'Instalación de paneles de alarma inalámbricos y cableados con sensores inteligentes', 1),
      ('Aire Acondicionado', 'Instalación, mantenimiento preventivo y reparación de equipos de climatización', 1),
      ('Cerca Eléctrica', 'Cercas perimetrales electrificadas de alta seguridad y protección perimetral', 1),
      ('Video Portero', 'Video porteros IP y analógicos con pantalla táctil y apertura remota', 1),
      ('Control de Acceso', 'Sistemas biométricos, tarjetas de proximidad y cerraduras electrónicas', 1),
      ('Electricidad', 'Instalaciones eléctricas residenciales, comerciales e industriales', 1),
      ('Cableado Estructurado', 'Cableado de datos y voz Cat6/Cat6A certificado para empresas', 1),
      ('Redes e Internet', 'Instalación y configuración de redes WiFi de alta velocidad, switches y routers', 1);
    `);
  }

  const technicianCount = db.prepare('SELECT COUNT(*) as count FROM technicians').get().count;
  if (technicianCount === 0) {
    db.exec(`
      INSERT INTO technicians (name, specialty, phone, email, active, created_at, updated_at) VALUES
      ('Carlos Mendoza', 'Cámaras de Vigilancia y Alarmas', '0981 123 456', 'carlos@systemhome.com', 1, '${now}', '${now}'),
      ('Ana López', 'Aire Acondicionado y Climatización', '0981 789 012', 'ana@systemhome.com', 1, '${now}', '${now}'),
      ('Pedro Ramírez', 'Redes, Cableado Estructurado y Electricidad', '0981 345 678', 'pedro@systemhome.com', 1, '${now}', '${now}'),
      ('Marcos Benítez', 'Cercas Eléctricas y Control de Acceso', '0981 654 321', 'marcos@systemhome.com', 1, '${now}', '${now}');
    `);
  }

  // ============ CATÁLOGO GENERAL MULTIRUBRO COMPLETO ============
  const inventoryCount = db.prepare('SELECT COUNT(*) as count FROM inventory_items').get().count;
  if (inventoryCount < 10) {
    db.exec(`DELETE FROM inventory_items`);
    const items = [
      { name: 'Cámara Domo IP 4MP IR 30m', category: 'camaras', brand: 'Hikvision', model: 'DS-2CD1143G0-I', stock: 15, min_stock: 4, price: 580000, description: 'Cámara antivandálica domo IP 4MP con visión nocturna infrarroja de 30m, compresión H.265+ y protección IP67.', features: '4 Megapíxeles, PoE, Visión Nocturna 30m, IP67, Antivandálica IK10', badge: 'Más vendido', image_url: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&auto=format&fit=crop&q=80' },
      { name: 'Cámara Tubo Exterior Full Color 2MP', category: 'camaras', brand: 'Dahua', model: 'DH-HAC-HFW1209TLMN-LED', stock: 20, min_stock: 5, price: 420000, description: 'Cámara bullet con tecnología Full Color para imágenes a todo color 24/7 con luz LED blanca cálida de 20m.', features: 'Full Color 24/7, 1080p Full HD, Luz blanca 20m, Carcasa resistente al clima IP67', badge: 'Recomendado', image_url: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600&auto=format&fit=crop&q=80' },
      { name: 'DVR Grabador 8 Canales 1080p + 2 IP', category: 'dvr_nvr', brand: 'Hikvision', model: 'iDS-7208HQHI-M1/S', stock: 8, min_stock: 2, price: 890000, description: 'Grabador digital de 8 canales con inteligencia artificial AcuSense, detección de humanos y vehículos.', features: '8 Canales BNC + 2 IP, Detección de movimiento 2.0 AcuSense, Salida HDMI 4K, Soporta hasta 10TB HDD', badge: 'Alta demanda', image_url: 'https://images.unsplash.com/photo-1544652478-6653e09f18a2?w=600&auto=format&fit=crop&q=80' },
      { name: 'NVR 16 Canales 4K con 16 Puertos PoE', category: 'dvr_nvr', brand: 'Hikvision', model: 'DS-7616NI-Q2/16P', stock: 6, min_stock: 2, price: 1750000, description: 'Grabador NVR IP de 16 canales con 16 puertos PoE independientes, soporte para cámaras de hasta 8MP 4K.', features: '16 Canales PoE plug & play, Grabación 4K Ultra HD, 2 bahías SATA hasta 16TB, Decodificación H.265+', badge: 'Profesional', image_url: 'https://images.unsplash.com/photo-1544652478-6653e09f18a2?w=600&auto=format&fit=crop&q=80' },
      { name: 'Kit Alarma Inalámbrica Smart WiFi + 4G', category: 'alarmas', brand: 'Tuya Smart', model: 'PG-103-4G', stock: 12, min_stock: 3, price: 950000, description: 'Kit de alarma inteligente con pantalla táctil, conexión WiFi y 4G SIM. Incluye panel, sensor de movimiento, sensor magnético y 2 controles.', features: 'Pantalla color 2.4", Conexión WiFi + Chip 4G, App móvil iOS/Android, Compatible Alexa y Google Home', badge: 'Popular', image_url: 'https://images.unsplash.com/photo-1558002038-1055907df827?w=600&auto=format&fit=crop&q=80' },
      { name: 'Sensor de Movimiento Infrarrojo Pasivo PIR', category: 'alarmas', brand: 'DSC', model: 'LC-100-PI', stock: 40, min_stock: 10, price: 120000, description: 'Detector de movimiento PIR cableado con inmunidad a mascotas de hasta 25 kg y cobertura de 15 metros.', features: 'Inmunidad a mascotas 25kg, Cobertura 15m 90°, Tamper antidesarme, Compensación automática de temperatura', badge: null, image_url: 'https://images.unsplash.com/photo-1558002038-1055907df827?w=600&auto=format&fit=crop&q=80' },
      { name: 'Aire Split 12000 BTU Inverter Frío/Calor', category: 'ac', brand: 'Samsung', model: 'AR12TVHQASIN', stock: 7, min_stock: 2, price: 3450000, description: 'Aire acondicionado split con compresor Digital Inverter de alta eficiencia energética, gas ecológico R410A y modo ultra silencioso.', features: '12000 BTU, Frío/Calor, Tecnología Inverter 60% ahorro, Filtro HD antibacterial, Gas R410A', badge: 'Ahorro Energía', image_url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&auto=format&fit=crop&q=80' },
      { name: 'Aire Split 18000 BTU Inverter Frío/Calor', category: 'ac', brand: 'Carrier', model: 'XPower 18K', stock: 5, min_stock: 2, price: 4650000, description: 'Equipo de climatización de alta potencia para salones y oficinas de hasta 35m2 con control remoto inteligente.', features: '18000 BTU, Compresor Inverter, Flujo de aire 4D, Modo Turbo y Sleep, Filtro de carbono', badge: 'Potente', image_url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&auto=format&fit=crop&q=80' },
      { name: 'Energizador para Cerca Eléctrica 10.000V', category: 'cercas', brand: 'JFL', model: 'ECR-18 Plus', stock: 8, min_stock: 3, price: 1100000, description: 'Central electrificadora de alta potencia para cercas perimetrales de hasta 1.800 metros lineales con shock disuasivo de 10.000V.', features: '10.000 Voltios de pulso, Alcance 1800m, Entrada para sensores, Salida para sirena, Batería de respaldo', badge: 'Seguridad Max', image_url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb325?w=600&auto=format&fit=crop&q=80' },
      { name: 'Aislador de Esquina Reforzado (Pack x 10)', category: 'cercas', brand: 'Garen', model: 'AIS-ESQ-10', stock: 35, min_stock: 8, price: 75000, description: 'Aisladores plásticos con protección UV de alta resistencia para esquinas y postes de cercas perimetrales.', features: 'Material policarbonato con filtro UV, Sólida fijación, Soporta tensión extrema', badge: null, image_url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb325?w=600&auto=format&fit=crop&q=80' },
      { name: 'Videoportero IP WiFi Pantalla 7" Touch', category: 'videoporteros', brand: 'Hikvision', model: 'DS-KIS604-P', stock: 9, min_stock: 2, price: 1850000, description: 'Kit de videoportero IP compuesto por frente de calle antivandálico con cámara 2MP y monitor táctil de 7" con apertura remota vía App.', features: 'Pantalla táctil 7" IPS, Cámara Full HD 1080p con IR, Conexión WiFi + PoE, Desbloqueo remoto por celular', badge: 'Premium', image_url: 'https://images.unsplash.com/photo-1558002038-1055907df827?w=600&auto=format&fit=crop&q=80' },
      { name: 'Control de Acceso Biométrico y Tarjetas RFID', category: 'control_acceso', brand: 'ZKTeco', model: 'K40 Pro', stock: 10, min_stock: 3, price: 780000, description: 'Terminal de control de asistencia y acceso con lector de huellas digitales de alta precisión, teclado y lector de tarjetas RFID.', features: 'Capacidad 1000 huellas, 1000 tarjetas, Batería integrada, Puerto TCP/IP y USB para descarga', badge: 'Empresarial', image_url: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600&auto=format&fit=crop&q=80' },
      { name: 'Router WiFi 6 Dual Band Gigabit AX3000', category: 'redes', brand: 'TP-Link', model: 'Archer AX53', stock: 14, min_stock: 4, price: 620000, description: 'Router de última generación WiFi 6 con velocidades de hasta 3 Gbps, 4 antenas de alta ganancia y tecnología Beamforming.', features: 'Velocidad hasta 2402 Mbps en 5GHz + 574 Mbps en 2.4GHz, 4 Puertos Gigabit, OFDMA y MU-MIMO, Seguridad WPA3', badge: 'Alta velocidad', image_url: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&auto=format&fit=crop&q=80' },
      { name: 'Switch 8 Puertos Gigabit con 4 Puertos PoE', category: 'redes', brand: 'TP-Link', model: 'TL-SG1008P', stock: 11, min_stock: 3, price: 540000, description: 'Switch de sobremesa metálico con 8 puertos 10/100/1000Mbps, 4 puertos PoE con hasta 64W de potencia total para cámaras y APs.', features: '8 Puertos Gigabit Ethernet, 4 Puertos PoE 802.3af (64W total), Plug and Play, Carcasa metálica disipadora', badge: null, image_url: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&auto=format&fit=crop&q=80' },
      { name: 'Bobina de Cable UTP Cat6 100% Cobre 305m', category: 'cableado', brand: 'Furukawa', model: 'Gigalan Cat6', stock: 16, min_stock: 4, price: 850000, description: 'Bobina de cable de par trenzado UTP Categoría 6, conductores 100% cobre sólido de 23 AWG para redes de alta velocidad.', features: 'Categoría 6, 100% Cobre puro (no CCA), Frecuencia 250 MHz, Chaqueta retardante de llama CMX/CM', badge: '100% Cobre', image_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80' },
      { name: 'Tablero Eléctrico Modular 12 Polos IP65', category: 'electricidad', brand: 'Schneider Electric', model: 'Kaedra 12M', stock: 18, min_stock: 5, price: 290000, description: 'Caja de distribución eléctrica estanca para 12 módulos DIN con puerta transparente de policarbonato y protección contra agua y polvo.', features: 'Capacidad 12 módulos DIN, Protección estanca IP65 / IK09, Puerta abatible transparente, Guías de fijación rápida', badge: null, image_url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=80' },
      { name: 'Fuente de Alimentación Conmutada 12V 10A', category: 'accesorios', brand: 'CCTV Power', model: 'PSU-12V10A', stock: 25, min_stock: 6, price: 160000, description: 'Fuente de poder estabilizada tipo switching de 12V DC a 10 Amperios con protección térmica y contra cortocircuito.', features: 'Entrada 110/220V AC, Salida 12V DC 10A (120W), Filtro de ruido EMI integrado, Gabinete ventilado', badge: null, image_url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=80' },
      { name: 'Par de Balunes Pasivos HD-CVI/TVI/AHD 4K', category: 'accesorios', brand: 'Hikvision', model: 'DS-1H18S/E', stock: 60, min_stock: 15, price: 45000, description: 'Transmisores de video pasivos mediante cable UTP para transmisión de video en alta definición hasta 4K a 200 metros.', features: 'Soporta 720p/1080p/4MP/4K, Conector BNC con cable flexible, Protección antiestática ESD y sobretensión', badge: 'Económico', image_url: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&auto=format&fit=crop&q=80' }
    ];

    const insertItem = db.prepare(`
      INSERT INTO inventory_items (name, category, brand, model, stock, min_stock, price, description, features, badge, image_url, show_in_catalog, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
    `);

    for (const it of items) {
      insertItem.run(it.name, it.category, it.brand, it.model, it.stock, it.min_stock, it.price, it.description, it.features || '', it.badge || null, it.image_url, now, now);
    }
  }

  // ============ CLIENTE INICIAL CON VINCULACIÓN ============
  const clientCount = db.prepare('SELECT COUNT(*) as count FROM clients').get().count;
  if (clientCount === 0) {
    const adminUserId = db.prepare("SELECT id FROM users WHERE username = 'admin'").get().id;
    const clientId = run(`
      INSERT INTO clients (name, ruc, address, street, number, neighborhood, city, reference, latitude, longitude, phone, email, client_type, active, created_at, updated_at, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `, [
      'María Gómez', '1234567-8', 'Av. Mariscal López 1250 esq. San Martín', 'Av. Mariscal López', '1250', 'Recoleta', 'Asunción', 'Frente al banco',
      -25.2965, -57.5812, '0981 010 101', 'cliente@systemhome.com', 'persona', now, now, adminUserId
    ]).lastInsertRowid;

    const serviceId = db.prepare("SELECT id FROM services WHERE name = 'Cámaras de Vigilancia'").get().id;
    const budgetId = run(`
      INSERT INTO budgets (number, client_id, service_id, service_type, description, items, labor, discount, total, status, source, address, latitude, longitude, created_at, updated_at, created_by_user_id, approved_at, approved_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'PR-0001', clientId, serviceId, 'camaras', 'Instalación de sistema de 4 cámaras Full Color con DVR AcuSense',
      JSON.stringify([
        { concept: 'Cámara Tubo Exterior Full Color 2MP', quantity: 4, unit_price: 420000, subtotal: 1680000 },
        { concept: 'DVR Grabador 8 Canales 1080p', quantity: 1, unit_price: 890000, subtotal: 890000 },
        { concept: 'Bobina de Cable UTP Cat6 100% Cobre', quantity: 1, unit_price: 850000, subtotal: 850000 }
      ]),
      600000, 120000, 3900000, 'aprobado', 'internal', 'Av. Mariscal López 1250', -25.2965, -57.5812, now, now, adminUserId, now, adminUserId
    ]).lastInsertRowid;

    const technicianId = db.prepare('SELECT id FROM technicians ORDER BY id LIMIT 1').get().id;
    const orderId = run(`
      INSERT INTO work_orders (number, budget_id, client_id, service_id, service_type, technician_id, scheduled_date, priority, description, status, observations, address, latitude, longitude, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'OT-0001', budgetId, clientId, serviceId, 'camaras', technicianId, now, 'alta', 'Instalación de cámaras y configuración de App móvil',
      'en_proceso', JSON.stringify([{ text: 'Cableado canalizado completado.', author: 'Carlos Mendoza', date: now }]),
      'Av. Mariscal López 1250', -25.2965, -57.5812, now, now
    ]).lastInsertRowid;

    run('INSERT INTO client_history (client_id, entry_type, description, related_type, related_id, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [clientId, 'cliente_creado', 'Cliente registrado en SYSTEMHOME', 'client', clientId, now, adminUserId]);
    run('INSERT INTO order_history (work_order_id, entry_type, description, details, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)', [orderId, 'orden_creada', 'Orden de trabajo iniciada', 'Asignada a Carlos Mendoza', now, adminUserId]);
  }

  // ============ SOLICITUDES DE COTIZACIÓN PARA PRUEBAS ============
  const requestCount = db.prepare('SELECT COUNT(*) as count FROM requests').get().count;
  if (requestCount === 0) {
    const adminUserId = db.prepare("SELECT id FROM users WHERE username = 'admin'").get().id;
    const clients = all('SELECT id FROM clients LIMIT 3');
    const services = all('SELECT id, name FROM services LIMIT 5');
    
    const serviceTypes = ['camaras', 'alarmas', 'ac', 'cercas', 'videoporteros', 'control_acceso', 'redes', 'cableado', 'electricidad'];
    const statuses = ['pendiente', 'en_revision', 'cotizando'];
    const priorities = ['baja', 'normal', 'alta'];
    
    const requests_data = [
      { number: 'SOL-0001', clientId: clients[0]?.id || 1, serviceType: 'camaras', status: 'en_revision', priority: 'alta', description: 'Necesito instalar 4 cámaras Full Color en mi casa', address: 'Calle 1 Nro. 100', lat: -25.2965, lng: -57.5812, ref: 'Frente a la tienda' },
      { number: 'SOL-0002', clientId: clients[1]?.id || 1, serviceType: 'alarmas', status: 'cotizando', priority: 'normal', description: 'Sistema de alarma inteligente WiFi y 4G', address: 'Calle 2 Nro. 200', lat: -25.3000, lng: -57.5900, ref: 'Detrás del comercio' },
      { number: 'SOL-0003', clientId: clients[2]?.id || 1, serviceType: 'ac', status: 'pendiente', priority: 'normal', description: 'Aire acondicionado split 18000 BTU', address: 'Calle 3 Nro. 300', lat: -25.3100, lng: -57.6000, ref: 'Esquina con Av. Principal' },
      { number: 'SOL-0004', clientId: clients[0]?.id || 1, serviceType: 'cercas', status: 'en_revision', priority: 'normal', description: 'Cerca eléctrica para perímetro de propiedad', address: 'Ruta 2 Km. 10', lat: -25.2800, lng: -57.5700, ref: 'Propiedad agrícola' },
      { number: 'SOL-0005', clientId: clients[1]?.id || 1, serviceType: 'videoporteros', status: 'cotizando', priority: 'alta', description: 'Videoportero IP WiFi con pantalla táctil', address: 'Av. Brasil 500', lat: -25.3050, lng: -57.5950, ref: 'Condominio A' },
      { number: 'SOL-0006', clientId: clients[2]?.id || 1, serviceType: 'control_acceso', status: 'pendiente', priority: 'normal', description: 'Control de acceso biométrico para oficina', address: 'Edificio Corporativo', lat: -25.3200, lng: -57.6100, ref: 'Planta baja' },
      { number: 'SOL-0007', clientId: clients[0]?.id || 1, serviceType: 'redes', status: 'en_revision', priority: 'normal', description: 'Red WiFi 6 para casa con 3 plantas', address: 'Calle Independencia 450', lat: -25.2900, lng: -57.5850, ref: 'Zona residencial' },
      { number: 'SOL-0008', clientId: clients[1]?.id || 1, serviceType: 'cableado', status: 'cotizando', priority: 'alta', description: 'Cableado estructurado Cat6A para empresa', address: 'Edificio de Negocios', lat: -25.3150, lng: -57.6050, ref: 'Oficinas 1-5' }
    ];
    
    const insertRequest = db.prepare(`
      INSERT INTO requests (number, client_id, user_id, service_id, service_type, description, address, latitude, longitude, reference, priority, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const req of requests_data) {
      const serviceId = services.find(s => s.name.toLowerCase().includes(req.serviceType.split('_')[0]))?.id || services[0]?.id;
      insertRequest.run(
        req.number,
        req.clientId,
        adminUserId,
        serviceId,
        req.serviceType,
        req.description,
        req.address,
        req.lat,
        req.lng,
        req.ref,
        req.priority,
        req.status,
        now,
        now
      );
    }
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initSchema,
  seedData,
};