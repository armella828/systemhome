const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
const isPostgres = !!DATABASE_URL;

let db, run, get, all;

if (isPostgres) {
  // ============================================================
  // SYNCHRONOUS PostgreSQL adapter using Worker Threads
  // This keeps the same sync interface as better-sqlite3 so
  // server.js doesn't need any changes.
  // ============================================================
  const { Worker } = require('worker_threads');
  // Atomics.wait bloquea el event loop principal: la respuesta debe escribirse
  // directamente en memoria compartida, no via callbacks on('message').
  const pgWorker = new Worker(path.join(__dirname, 'pg-worker.js'));
  const CTRL = new Int32Array(new SharedArrayBuffer(8)); // [0]=listo, [1]=longitud
  const DATA = new SharedArrayBuffer(16 * 1024 * 1024);
  let workerFatal = null;

  pgWorker.on('error', (err) => { workerFatal = err.message; });
  pgWorker.on('exit', (code) => {
    if (code !== 0) workerFatal = `PG Worker terminó inesperadamente (código ${code})`;
  });

  function pgQuerySync(sql, params = []) {
    Atomics.store(CTRL, 0, 0);
    Atomics.store(CTRL, 1, 0);
    pgWorker.postMessage({ sql, params, ctrlSab: CTRL.buffer, dataSab: DATA });
    const status = Atomics.wait(CTRL, 0, 0, 15000);
    if (status === 'timed-out') {
      throw new Error('Timeout de PostgreSQL (15s): ' + sql.slice(0, 120) + (workerFatal ? ' | ' + workerFatal : ''));
    }
    const len = Atomics.load(CTRL, 1);
    const json = Buffer.from(new Uint8Array(DATA, 0, len)).toString('utf8');
    const result = JSON.parse(json);
    if (result.error) throw new Error(result.error);
    return result;
  }

  function convertPlaceholders(sql) {
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
  }

  // Los INSERT necesitan RETURNING para obtener lastInsertRowid (SQLite lo da gratis)
  function withReturning(sql) {
    const trimmed = sql.trim();
    if (!/^INSERT\b/i.test(trimmed) || /\bRETURNING\b/i.test(trimmed)) return sql;
    return trimmed.replace(/;?\s*$/, '') + ' RETURNING *';
  }

  db = {
    prepare(sql) {
      return {
        run: (...args) => {
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          const converted = convertPlaceholders(withReturning(sql));
          const result = pgQuerySync(converted, params);
          return {
            lastInsertRowid: result.rows?.[0]?.id || null,
            changes: result.rowCount || 0,
            rows: result.rows || [],
          };
        },
        get: (...args) => {
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          const converted = convertPlaceholders(sql);
          const result = pgQuerySync(converted, params);
          return result.rows[0] || undefined;
        },
        all: (...args) => {
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          const converted = convertPlaceholders(sql);
          const result = pgQuerySync(converted, params);
          return result.rows || [];
        }
      };
    },

    exec(sql) {
      const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of statements) {
        try {
          pgQuerySync(stmt);
        } catch (e) {
          if (!e.message.includes('already exists') && !e.message.includes('duplicate key')) {
            console.error('Exec error:', e.message);
          }
        }
      }
    },

    pragma() {},
  };

  run = (sql, params = []) => {
    const converted = convertPlaceholders(withReturning(sql));
    const result = pgQuerySync(converted, params);
    return {
      lastInsertRowid: result.rows?.[0]?.id || null,
      changes: result.rowCount || 0,
      rows: result.rows || [],
    };
  };

  get = (sql, params = []) => {
    const converted = convertPlaceholders(sql);
    const result = pgQuerySync(converted, params);
    return result.rows[0] || undefined;
  };

  all = (sql, params = []) => {
    const converted = convertPlaceholders(sql);
    const result = pgQuerySync(converted, params);
    return result.rows || [];
  };

} else {
  // ============================================================
  // SQLite (local development fallback)
  // ============================================================
  let DatabaseClass;
  try {
    DatabaseClass = require('better-sqlite3');
  } catch (e) {
    const { DatabaseSync } = require('node:sqlite');
    DatabaseClass = class DatabaseSyncAdapter {
      constructor(filePath) { this._db = new DatabaseSync(filePath); }
      pragma(cmd) { try { this._db.exec(`PRAGMA ${cmd}`); } catch(e) {} }
      exec(sql) { return this._db.exec(sql); }
      prepare(sql) {
        const stmt = this._db.prepare(sql);
        return {
          run: (...args) => { const params = Array.isArray(args[0]) ? args[0] : args; return stmt.run(...params); },
          get: (...args) => { const params = Array.isArray(args[0]) ? args[0] : args; const res = stmt.get(...params); return res ? { ...res } : undefined; },
          all: (...args) => { const params = Array.isArray(args[0]) ? args[0] : args; return stmt.all(...params).map(r => ({ ...r })); }
        };
      }
    };
  }

  const dbPath = process.env.DB_PATH || path.join(__dirname, 'database', 'systemhome.sqlite');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const sqliteDb = new DatabaseClass(dbPath);
  sqliteDb.pragma('foreign_keys = ON');
  db = sqliteDb;

  run = (sql, params = []) => db.prepare(sql).run(params);
  get = (sql, params = []) => db.prepare(sql).get(params);
  all = (sql, params = []) => db.prepare(sql).all(params);
}

// ============================================================
// COLUMN MIGRATION HELPER
// ============================================================
function addColumnIfNotExists(tableName, columnName, columnDef) {
  try {
    if (isPostgres) {
      const exists = get(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [tableName, columnName]
      );
      if (!exists) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
      }
    } else {
      const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
      const exists = columns.some(c => c.name.toLowerCase() === columnName.toLowerCase());
      if (!exists) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
      }
    }
  } catch (e) {
    console.error(`Error adding column ${columnName} to ${tableName}:`, e.message);
  }
}

// ============================================================
// SCHEMA
// ============================================================
function initSchema() {
  const schema = `
    CREATE TABLE IF NOT EXISTS roles (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      name TEXT UNIQUE NOT NULL,
      description TEXT
    );
    CREATE TABLE IF NOT EXISTS permissions (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      key TEXT UNIQUE NOT NULL,
      description TEXT
    );
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY(role_id, permission_id)
    );
    CREATE TABLE IF NOT EXISTS users (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT, phone TEXT,
      role_id INTEGER REFERENCES roles(id),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS clients (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      name TEXT NOT NULL, ruc TEXT UNIQUE,
      address TEXT, street TEXT, number TEXT, neighborhood TEXT, city TEXT, reference TEXT,
      latitude ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'}, longitude ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      phone TEXT, email TEXT, client_type TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS services (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      name TEXT UNIQUE NOT NULL, description TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS budgets (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      number TEXT UNIQUE NOT NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      request_id INTEGER, service_id INTEGER REFERENCES services(id),
      service_type TEXT, description TEXT, items TEXT,
      labor ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0,
      discount ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0,
      total ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'borrador', source TEXT NOT NULL DEFAULT 'internal',
      valid_until TEXT, conditions TEXT, observations TEXT, estimated_time TEXT,
      address TEXT,
      latitude ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      longitude ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      reference TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      sent_at TEXT, sent_by_user_id INTEGER REFERENCES users(id),
      approved_at TEXT, approved_by_user_id INTEGER REFERENCES users(id),
      rejection_reason TEXT, rejected_at TEXT, rejected_by_user_id INTEGER REFERENCES users(id),
      client_response_status TEXT DEFAULT 'pendiente', client_response_date TEXT,
      client_notes TEXT, client_response_by_user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS budget_items (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      concept TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
      unit_price ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0,
      subtotal ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS technicians (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      name TEXT NOT NULL, specialty TEXT, phone TEXT, email TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS work_orders (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      number TEXT UNIQUE NOT NULL,
      budget_id INTEGER REFERENCES budgets(id),
      client_id INTEGER REFERENCES clients(id),
      service_id INTEGER REFERENCES services(id), service_type TEXT,
      technician_id INTEGER REFERENCES technicians(id),
      scheduled_date TEXT, priority TEXT NOT NULL DEFAULT 'normal',
      description TEXT, status TEXT NOT NULL DEFAULT 'pendiente',
      observations TEXT, address TEXT,
      latitude ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      longitude ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      work_done TEXT, materials_used TEXT, installed_equipment TEXT,
      client_signature TEXT, evidence_photos TEXT, closure_notes TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      completed_at TEXT, completed_by_user_id INTEGER REFERENCES users(id),
      closed_at TEXT, closed_by_user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS work_order_assignments (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      technician_id INTEGER NOT NULL REFERENCES technicians(id),
      assigned_at TEXT NOT NULL, assigned_by_user_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'assigned', notes TEXT
    );
    CREATE TABLE IF NOT EXISTS inventory_items (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      name TEXT NOT NULL, category TEXT, brand TEXT, model TEXT,
      stock INTEGER NOT NULL DEFAULT 0, min_stock INTEGER NOT NULL DEFAULT 5,
      price ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0,
      description TEXT, features TEXT, image_path TEXT, image_url TEXT, badge TEXT,
      show_in_catalog INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      movement_type TEXT NOT NULL, quantity INTEGER NOT NULL,
      stock_before INTEGER, stock_after INTEGER,
      reference_type TEXT, reference_id INTEGER, notes TEXT,
      user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS maintenances (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      client_id INTEGER REFERENCES clients(id),
      technician_id INTEGER REFERENCES technicians(id),
      inventory_item_id INTEGER REFERENCES inventory_items(id),
      equipment_name TEXT, next_maintenance_date TEXT, scheduled_time TEXT,
      maintenance_type TEXT NOT NULL, frequency TEXT,
      status TEXT NOT NULL DEFAULT 'programado',
      description TEXT, notes TEXT, work_done TEXT, materials_used TEXT,
      evidence_photos TEXT,
      latitude ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      longitude ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      alert_sent_15 INTEGER NOT NULL DEFAULT 0, alert_sent_7 INTEGER NOT NULL DEFAULT 0,
      alert_sent_0 INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, confirmed_at TEXT, completed_at TEXT,
      performed_by_user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS client_history (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      entry_type TEXT NOT NULL, description TEXT NOT NULL,
      related_type TEXT, related_id INTEGER,
      created_at TEXT NOT NULL, created_by_user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS order_history (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      entry_type TEXT NOT NULL, description TEXT NOT NULL, details TEXT,
      created_at TEXT NOT NULL, created_by_user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS locations (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      street TEXT, number TEXT, neighborhood TEXT, city TEXT, reference TEXT,
      full_address TEXT,
      latitude ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      longitude ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS requests (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      number TEXT UNIQUE NOT NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id),
      service_id INTEGER REFERENCES services(id), service_type TEXT,
      description TEXT, address TEXT,
      latitude ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      longitude ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      reference TEXT, priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'pendiente',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      reviewed_at TEXT, reviewed_by_user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS request_files (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      filename TEXT NOT NULL, filepath TEXT NOT NULL,
      mime_type TEXT, size INTEGER,
      uploaded_at TEXT NOT NULL, uploaded_by_user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      user_id INTEGER REFERENCES users(id),
      type TEXT NOT NULL, title TEXT NOT NULL, message TEXT, data TEXT,
      read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      user_id INTEGER, username TEXT, role TEXT,
      action TEXT NOT NULL, module TEXT, record_type TEXT, record_id INTEGER,
      previous_state TEXT, new_state TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_alerts (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      alert_type TEXT NOT NULL DEFAULT 'stock_minimo',
      stock_current INTEGER NOT NULL, stock_min INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendiente',
      created_at TEXT NOT NULL, resolved_at TEXT,
      resolved_by_user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS maintenance_alerts (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      maintenance_id INTEGER NOT NULL REFERENCES maintenances(id) ON DELETE CASCADE,
      alert_type TEXT NOT NULL, days_before INTEGER,
      notified_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'enviada'
    );
    CREATE TABLE IF NOT EXISTS warranties (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
      installation_date TEXT, expiry_date TEXT,
      duration_months INTEGER NOT NULL DEFAULT 12,
      conditions TEXT, status TEXT NOT NULL DEFAULT 'vigente',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS warranty_claims (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      warranty_id INTEGER NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
      claim_date TEXT NOT NULL, description TEXT,
      status TEXT NOT NULL DEFAULT 'abierto', resolution TEXT,
      created_at TEXT NOT NULL, created_by_user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS sales (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      sale_number TEXT UNIQUE NOT NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      seller_id INTEGER REFERENCES users(id),
      subtotal ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0,
      discount ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0,
      total ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'efectivo',
      status TEXT NOT NULL DEFAULT 'pagada',
      cash_received ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      cash_change ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      qr_reference TEXT, qr_receipt TEXT, notes TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
      item_name TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
      unit_price ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0,
      subtotal ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS payments (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      payment_method TEXT NOT NULL,
      amount ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0,
      cash_received ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      cash_change ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'},
      qr_reference TEXT, qr_receipt TEXT,
      status TEXT NOT NULL DEFAULT 'confirmado', notes TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      invoice_number TEXT UNIQUE NOT NULL,
      sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      client_name TEXT NOT NULL, client_ruc TEXT, client_address TEXT,
      items_json TEXT,
      subtotal ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0,
      total ${isPostgres ? 'DOUBLE PRECISION' : 'REAL'} NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'efectivo',
      status TEXT NOT NULL DEFAULT 'emitida', pdf_path TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `;

  if (isPostgres) {
    // PostgreSQL: exec handles splitting
    db.exec(schema);
  } else {
    db.exec(schema);
    // SQLite migrations
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
    addColumnIfNotExists('budgets', 'client_response_status', "TEXT DEFAULT 'pendiente'");
    addColumnIfNotExists('budgets', 'client_response_date', 'TEXT');
    addColumnIfNotExists('budgets', 'client_notes', 'TEXT');
    addColumnIfNotExists('budgets', 'client_response_by_user_id', 'INTEGER REFERENCES users(id)');
  }
}

// ============================================================
// SEED DATA
// ============================================================
function seedData() {
  const now = new Date().toISOString();

  // Role cleanup
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
        run('UPDATE users SET role_id = ' + (isPostgres ? '$1' : '?') + ' WHERE role_id = ' + (isPostgres ? '$2' : '?'), [replacementRoleId, legacyId]);
        run('DELETE FROM role_permissions WHERE role_id = ' + (isPostgres ? '$1' : '?'), [legacyId]);
      }
    });
    run("DELETE FROM roles WHERE name IN ('gerente', 'supervisor', 'almacenista')");
  }

  const roleCount = Number(get('SELECT COUNT(*) as count FROM roles').count);
  if (roleCount === 0) {
    if (isPostgres) {
      db.exec(`INSERT INTO roles (name, description) VALUES ('admin', 'Administrador con control total del sistema');
        INSERT INTO roles (name, description) VALUES ('vendedor', 'Vendedor comercial (ventas, cotizaciones, cobros, facturas)');
        INSERT INTO roles (name, description) VALUES ('tecnico', 'Tecnico de campo (ordenes asignadas, mantenimientos, evidencias)');
        INSERT INTO roles (name, description) VALUES ('cliente', 'Cliente con portal propio para cotizaciones, compras y servicios')`);
      db.exec(`INSERT INTO permissions (key, description) VALUES
        ('dashboard.admin', 'Ver dashboard administrativo completo'), ('clients.read', 'Ver clientes'), ('clients.write', 'Gestionar clientes'),
        ('budgets.read', 'Ver presupuestos y cotizaciones'), ('budgets.write', 'Gestionar presupuestos y cotizaciones'),
        ('orders.read', 'Ver ordenes de trabajo'), ('orders.write', 'Gestionar ordenes de trabajo'), ('orders.close', 'Cerrar ordenes de trabajo'),
        ('inventory.read', 'Ver inventario y catalogo'), ('inventory.write', 'Gestionar inventario y movimientos'),
        ('sales.read', 'Ver ventas y cobros'), ('sales.write', 'Registrar ventas, cobros y facturas'),
        ('maintenance.read', 'Ver mantenimientos'), ('maintenance.write', 'Gestionar y programar mantenimientos'),
        ('requests.read', 'Ver solicitudes de cotizacion'), ('requests.write', 'Gestionar solicitudes de cotizacion'),
        ('warranties.read', 'Ver garantias'), ('warranties.write', 'Gestionar garantias'),
        ('reports.read', 'Ver reportes gerenciales'), ('audit.read', 'Ver registros de auditoria'),
        ('backup.manage', 'Gestionar copias de seguridad'), ('users.manage', 'Administrar usuarios y permisos'),
        ('notifications.read', 'Ver notificaciones')`);
    } else {
      db.exec(`INSERT INTO roles (name, description) VALUES
        ('admin', 'Administrador con control total del sistema'),
        ('vendedor', 'Vendedor comercial (ventas, cotizaciones, cobros, facturas)'),
        ('tecnico', 'Tecnico de campo (ordenes asignadas, mantenimientos, evidencias)'),
        ('cliente', 'Cliente con portal propio para cotizaciones, compras y servicios')`);
      db.exec(`INSERT INTO permissions (key, description) VALUES
        ('dashboard.admin', 'Ver dashboard administrativo completo'), ('clients.read', 'Ver clientes'), ('clients.write', 'Gestionar clientes'),
        ('budgets.read', 'Ver presupuestos y cotizaciones'), ('budgets.write', 'Gestionar presupuestos y cotizaciones'),
        ('orders.read', 'Ver ordenes de trabajo'), ('orders.write', 'Gestionar ordenes de trabajo'), ('orders.close', 'Cerrar ordenes de trabajo'),
        ('inventory.read', 'Ver inventario y catalogo'), ('inventory.write', 'Gestionar inventario y movimientos'),
        ('sales.read', 'Ver ventas y cobros'), ('sales.write', 'Registrar ventas, cobros y facturas'),
        ('maintenance.read', 'Ver mantenimientos'), ('maintenance.write', 'Gestionar y programar mantenimientos'),
        ('requests.read', 'Ver solicitudes de cotizacion'), ('requests.write', 'Gestionar solicitudes de cotizacion'),
        ('warranties.read', 'Ver garantias'), ('warranties.write', 'Gestionar garantias'),
        ('reports.read', 'Ver reportes gerenciales'), ('audit.read', 'Ver registros de auditoria'),
        ('backup.manage', 'Gestionar copias de seguridad'), ('users.manage', 'Administrar usuarios y permisos'),
        ('notifications.read', 'Ver notificaciones')`);
    }

    const rolesAfterInsert = all('SELECT id, name FROM roles');
    const permissions = all('SELECT id, key FROM permissions');
    const roleMapAfterInsert = Object.fromEntries(rolesAfterInsert.map(r => [r.name, r.id]));
    const permMap = Object.fromEntries(permissions.map(p => [p.key, p.id]));
    const rolePerms = {
      admin: Object.keys(permMap),
      vendedor: ['clients.read','clients.write','budgets.read','budgets.write','sales.read','sales.write','inventory.read','requests.read','requests.write','warranties.read','reports.read','notifications.read'],
      tecnico: ['orders.read','orders.write','maintenance.read','maintenance.write','requests.read','notifications.read'],
      cliente: ['clients.read','budgets.read','requests.read','requests.write','warranties.read','sales.read','notifications.read']
    };
    for (const [roleName, permissionKeys] of Object.entries(rolePerms)) {
      const roleId = roleMapAfterInsert[roleName];
      for (const pk of permissionKeys) {
        const pid = permMap[pk];
        if (roleId && pid) run('INSERT INTO role_permissions (role_id, permission_id) VALUES (' + (isPostgres ? '$1,$2' : '?,?') + ')', [roleId, pid]);
      }
    }
  }

  const userCount = Number(get('SELECT COUNT(*) as count FROM users').count);
  if (userCount === 0) {
    const bcrypt = require('bcryptjs');
    const q = isPostgres ? '$1' : '?';
    run(`INSERT INTO users (username, password_hash, full_name, email, phone, role_id, active, created_at, updated_at) VALUES (${q},${q},${q},${q},${q},(SELECT id FROM roles WHERE name = ${q}),1,${q},${q})`,
      ['admin', bcrypt.hashSync('admin123', 10), 'Administrador General', 'admin@systemhome.com', '0981 000 000', 'admin', now, now]);
    run(`INSERT INTO users (username, password_hash, full_name, email, phone, role_id, active, created_at, updated_at) VALUES (${q},${q},${q},${q},${q},(SELECT id FROM roles WHERE name = ${q}),1,${q},${q})`,
      ['vendedor', bcrypt.hashSync('vendedor123', 10), 'Vendedor Comercial', 'vendedor@systemhome.com', '0981 555 555', 'vendedor', now, now]);
    run(`INSERT INTO users (username, password_hash, full_name, email, phone, role_id, active, created_at, updated_at) VALUES (${q},${q},${q},${q},${q},(SELECT id FROM roles WHERE name = ${q}),1,${q},${q})`,
      ['tecnico', bcrypt.hashSync('tecnico123', 10), 'Tecnico Especialista', 'tecnico@systemhome.com', '0981 333 333', 'tecnico', now, now]);
    run(`INSERT INTO users (username, password_hash, full_name, email, phone, role_id, active, created_at, updated_at) VALUES (${q},${q},${q},${q},${q},(SELECT id FROM roles WHERE name = ${q}),1,${q},${q})`,
      ['cliente', bcrypt.hashSync('cliente123', 10), 'Cliente Residencial', 'cliente@systemhome.com', '0981 666 666', 'cliente', now, now]);
  }

  const serviceCount = Number(get('SELECT COUNT(*) as count FROM services').count);
  if (serviceCount === 0) {
    const q = isPostgres ? '$1' : '?';
    const services = [
      ['Camaras de Vigilancia', 'Instalacion y mantenimiento de sistemas de videovigilancia HD y 4K'],
      ['Sistemas de Alarma', 'Alarmas inalambricos y cableados con sensores inteligentes'],
      ['Aire Acondicionado', 'Instalacion, mantenimiento y reparacion de climatizacion'],
      ['Cerca Electrica', 'Cercas perimetrales electrificadas de alta seguridad'],
      ['Video Portero', 'Video porteros IP y analogicos con pantalla tactil'],
      ['Control de Acceso', 'Sistemas biometricos, tarjetas y cerraduras electronicas'],
      ['Electricidad', 'Instalaciones electricas residenciales, comerciales e industriales'],
      ['Cableado Estructurado', 'Cableado de datos y voz Cat6/Cat6A certificado para empresas'],
      ['Redes e Internet', 'Redes WiFi, fibra optica, servidores e infraestructura de conectividad'],
    ];
    for (const [name, desc] of services) {
      run(`INSERT INTO services (name, description, active) VALUES (${q},${q},1)`, [name, desc]);
    }
  }

  const techCount = Number(get('SELECT COUNT(*) as count FROM technicians').count);
  if (techCount === 0) {
    const q = isPostgres ? '$1' : '?';
    const techs = [
      ['Carlos Mendoza', 'Camaras de Vigilancia y Alarmas', '0981 123 456', 'carlos@systemhome.com'],
      ['Ana Lopez', 'Aire Acondicionado y Climatizacion', '0981 789 012', 'ana@systemhome.com'],
      ['Pedro Ramirez', 'Redes, Cableado Estructurado y Electricidad', '0981 345 678', 'pedro@systemhome.com'],
      ['Marcos Benitez', 'Cercas Electricas y Control de Acceso', '0981 654 321', 'marcos@systemhome.com'],
    ];
    for (const [name, spec, phone, email] of techs) {
      run(`INSERT INTO technicians (name, specialty, phone, email, active, created_at, updated_at) VALUES (${q},${q},${q},${q},1,${q},${q})`, [name, spec, phone, email, now, now]);
    }
  }

  const invCount = Number(get('SELECT COUNT(*) as count FROM inventory_items').count);
  if (invCount < 10) {
    run('DELETE FROM inventory_items');
    const q = isPostgres ? '$1' : '?';
    const items = [
      ['Camaras Domo IP 4MP IR 30m', 'camaras', 'Hikvision', 'DS-2CD1143G0-I', 15, 4, 580000, 'Camara antivandalica domo IP 4MP', '4 Megapixeles, PoE, Vision Nocturna 30m, IP67', 'Mas vendido', 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&auto=format&fit=crop&q=80'],
      ['Camaras Tubo Exterior Full Color 2MP', 'camaras', 'Dahua', 'DH-HAC-HFW1209TLMN-LED', 20, 5, 420000, 'Camara bullet Full Color 24/7', 'Full Color, 1080p, Luz blanca 20m, IP67', 'Recomendado', 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600&auto=format&fit=crop&q=80'],
      ['DVR 8 Canales 1080p + 2 IP', 'dvr_nvr', 'Hikvision', 'iDS-7208HQHI-M1/S', 8, 2, 890000, 'Grabador digital 8 canales AcuSense', '8 Canales BNC + 2 IP, HDMI 4K', 'Alta demanda', 'https://images.unsplash.com/photo-1544652478-6653e09f18a2?w=600&auto=format&fit=crop&q=80'],
      ['NVR 16 Canales 4K 16 Puertos PoE', 'dvr_nvr', 'Hikvision', 'DS-7616NI-Q2/16P', 6, 2, 1750000, 'Grabador NVR IP 16 canales PoE', '16 Canales PoE, 4K, 2 bahias SATA 16TB', 'Profesional', 'https://images.unsplash.com/photo-1544652478-6653e09f18a2?w=600&auto=format&fit=crop&q=80'],
      ['Kit Alarma Smart WiFi + 4G', 'alarmas', 'Tuya Smart', 'PG-103-4G', 12, 3, 950000, 'Kit alarma inteligente WiFi y 4G', 'Pantalla 2.4, WiFi + 4G, App movil, Alexa', 'Popular', 'https://images.unsplash.com/photo-1558002038-1055907df827?w=600&auto=format&fit=crop&q=80'],
      ['Sensor Movimiento PIR', 'alarmas', 'DSC', 'LC-100-PI', 40, 10, 120000, 'Detector movimiento PIR cableado', 'Inmunidad mascotas 25kg, 15m 90 grados', null, 'https://images.unsplash.com/photo-1558002038-1055907df827?w=600&auto=format&fit=crop&q=80'],
      ['Aire Split 12000 BTU Inverter F/C', 'ac', 'Samsung', 'AR12TVHQASIN', 7, 2, 3450000, 'Aire split Inverter frío/calor', '12000 BTU, 60% ahorro, Gas R410A', 'Ahorro Energia', 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&auto=format&fit=crop&q=80'],
      ['Aire Split 18000 BTU Inverter F/C', 'ac', 'Carrier', 'XPower 18K', 5, 2, 4650000, 'Aire split alta potencia', '18000 BTU, Inverter, Turbo y Sleep', 'Potente', 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&auto=format&fit=crop&q=80'],
      ['Energizador Cerca 10.000V', 'cercas', 'JFL', 'ECR-18 Plus', 8, 3, 1100000, 'Central electrificadora 10.000V', '10.000V, 1800m, Bateria respaldo', 'Seguridad Max', 'https://images.unsplash.com/photo-1508873696983-2df5293cb325?w=600&auto=format&fit=crop&q=80'],
      ['Videoportero IP WiFi 7" Touch', 'videoporteros', 'Hikvision', 'DS-KIS604-P', 9, 2, 1850000, 'Kit videoportero IP tactil', '7 IPS tactil, Full HD, WiFi + PoE', 'Premium', 'https://images.unsplash.com/photo-1558002038-1055907df827?w=600&auto=format&fit=crop&q=80'],
      ['Control Acceso Biometrico RFID', 'control_acceso', 'ZKTeco', 'K40 Pro', 10, 3, 780000, 'Terminal control acceso biometrico', '1000 huellas, 1000 tarjetas, TCP/IP', 'Empresarial', 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600&auto=format&fit=crop&q=80'],
      ['Router WiFi 6 Dual Band AX3000', 'redes', 'TP-Link', 'Archer AX53', 14, 4, 620000, 'Router WiFi 6 ultima generacion', '3 Gbps, 4 antenas, Beamforming, WPA3', 'Alta velocidad', 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&auto=format&fit=crop&q=80'],
      ['Switch 8 Puertos Gigabit 4 PoE', 'redes', 'TP-Link', 'TL-SG1008P', 11, 3, 540000, 'Switch 8 puertos con 4 PoE', '8 Gigabit, 4 PoE 64W, Metalico', null, 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&auto=format&fit=crop&q=80'],
      ['Cable UTP Cat6 100% Cobre 305m', 'cableado', 'Furukawa', 'Gigalan Cat6', 16, 4, 850000, 'Cable UTP Cat6 100% cobre solido', 'Cat6, 100% Cobre, 250 MHz', '100% Cobre', 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'],
      ['Tablero Electrico 12 Polos IP65', 'electricidad', 'Schneider Electric', 'Kaedra 12M', 18, 5, 290000, 'Caja distribucion electrica estanca', '12 modulos DIN, IP65/IK09', null, 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=80'],
      ['Fuente Alimentacion 12V 10A', 'accesorios', 'CCTV Power', 'PSU-12V10A', 25, 6, 160000, 'Fuente poder estabilizada 12V 10A', '110/220V AC, 120W, Filtro EMI', null, 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=80'],
      ['Balunes HD-CVI/TVI/AHD 4K', 'accesorios', 'Hikvision', 'DS-1H18S/E', 60, 15, 45000, 'Transmisores video pasivos UTP', '720p/1080p/4K, 200m, ESD', 'Economico', 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&auto=format&fit=crop&q=80'],
    ];
    for (const it of items) {
      run(`INSERT INTO inventory_items (name, category, brand, model, stock, min_stock, price, description, features, badge, image_url, show_in_catalog, active, created_at, updated_at) VALUES (${q},${q},${q},${q},${q},${q},${q},${q},${q},${q},${q},1,1,${q},${q})`,
        [...it, now, now]);
    }
  }

  const clientCount = Number(get('SELECT COUNT(*) as count FROM clients').count);
  if (clientCount === 0) {
    const adminUserId = get("SELECT id FROM users WHERE username = 'admin'").id;
    const q = isPostgres ? '$1' : '?';
    const insertResult = run(`INSERT INTO clients (name, ruc, address, phone, email, client_type, active, created_at, updated_at, created_by_user_id) VALUES (${q},${q},${q},${q},${q},'persona',1,${q},${q},${q})`,
      ['Maria Gomez', '1234567-8', 'Av. Mariscal Lopez 1250', '0981 010 101', 'cliente@systemhome.com', now, now, adminUserId]);
    const clientId = insertResult.lastInsertRowid;
    if (clientId) {
      run(`INSERT INTO client_history (client_id, entry_type, description, related_type, related_id, created_at, created_by_user_id) VALUES (${q},${q},${q},${q},${q},${q},${q})`,
        [clientId, 'cliente_creado', 'Cliente registrado en SYSTEMHOME', 'client', clientId, now, adminUserId]);
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
  isPostgres,
};
