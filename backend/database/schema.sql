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
