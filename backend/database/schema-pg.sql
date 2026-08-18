-- ============================================================
-- SYSTEMHOME - Esquema PostgreSQL para Neon Console
-- ============================================================

-- 1. Roles y Permisos
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_id)
);

-- 2. Usuarios
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
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

-- 3. Clientes
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  ruc TEXT UNIQUE,
  address TEXT,
  street TEXT,
  number TEXT,
  neighborhood TEXT,
  city TEXT,
  reference TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  phone TEXT,
  email TEXT,
  client_type TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id)
);

-- 4. Servicios
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

-- 5. Presupuestos / Cotizaciones
CREATE TABLE IF NOT EXISTS budgets (
  id SERIAL PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  request_id INTEGER,
  service_id INTEGER REFERENCES services(id),
  service_type TEXT,
  description TEXT,
  items TEXT,
  labor DOUBLE PRECISION NOT NULL DEFAULT 0,
  discount DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'borrador',
  source TEXT NOT NULL DEFAULT 'internal',
  valid_until TEXT,
  conditions TEXT,
  observations TEXT,
  estimated_time TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
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
  rejected_by_user_id INTEGER REFERENCES users(id),
  client_response_status TEXT DEFAULT 'pendiente',
  client_response_date TEXT,
  client_notes TEXT,
  client_response_by_user_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS budget_items (
  id SERIAL PRIMARY KEY,
  budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0
);

-- 6. Técnicos
CREATE TABLE IF NOT EXISTS technicians (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT,
  phone TEXT,
  email TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 7. Órdenes de Trabajo
CREATE TABLE IF NOT EXISTS work_orders (
  id SERIAL PRIMARY KEY,
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
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
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
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  technician_id INTEGER NOT NULL REFERENCES technicians(id),
  assigned_at TEXT NOT NULL,
  assigned_by_user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'assigned',
  notes TEXT
);

-- 8. Inventario y Catálogo
CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  model TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  price DOUBLE PRECISION NOT NULL DEFAULT 0,
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
  id SERIAL PRIMARY KEY,
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

-- 9. Mantenimientos
CREATE TABLE IF NOT EXISTS maintenances (
  id SERIAL PRIMARY KEY,
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
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  alert_sent_15 INTEGER NOT NULL DEFAULT 0,
  alert_sent_7 INTEGER NOT NULL DEFAULT 0,
  alert_sent_0 INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  completed_at TEXT,
  performed_by_user_id INTEGER REFERENCES users(id)
);

-- 10. Historiales y Ubicaciones
CREATE TABLE IF NOT EXISTS client_history (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  description TEXT NOT NULL,
  related_type TEXT,
  related_id INTEGER,
  created_at TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_history (
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  description TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  street TEXT,
  number TEXT,
  neighborhood TEXT,
  city TEXT,
  reference TEXT,
  full_address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 11. Solicitudes y Archivos
CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id),
  service_id INTEGER REFERENCES services(id),
  service_type TEXT,
  description TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  reference TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pendiente',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by_user_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS request_files (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  uploaded_at TEXT NOT NULL,
  uploaded_by_user_id INTEGER REFERENCES users(id)
);

-- 12. Notificaciones y Auditoría
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  data TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
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

-- 13. Garantías
CREATE TABLE IF NOT EXISTS warranties (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
  warranty_id INTEGER NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
  claim_date TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'abierto',
  resolution TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id)
);

-- 14. Ventas, Cobros y Facturación
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  sale_number TEXT UNIQUE NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  seller_id INTEGER REFERENCES users(id),
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
  discount DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'efectivo',
  status TEXT NOT NULL DEFAULT 'pagada',
  cash_received DOUBLE PRECISION,
  cash_change DOUBLE PRECISION,
  qr_reference TEXT,
  qr_receipt TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  cash_received DOUBLE PRECISION,
  cash_change DOUBLE PRECISION,
  qr_reference TEXT,
  qr_receipt TEXT,
  status TEXT NOT NULL DEFAULT 'confirmado',
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_ruc TEXT,
  client_address TEXT,
  items_json TEXT,
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'efectivo',
  status TEXT NOT NULL DEFAULT 'emitida',
  pdf_path TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ============================================================
-- DATOS INICIALES POR DEFECTO (ROLES Y SERVICIOS)
-- ============================================================
INSERT INTO roles (name, description) VALUES
  ('admin', 'Administrador con control total del sistema'),
  ('vendedor', 'Vendedor comercial (ventas, cotizaciones, cobros, facturas)'),
  ('tecnico', 'Técnico de campo (órdenes asignadas, mantenimientos, evidencias)'),
  ('cliente', 'Cliente con portal propio para cotizaciones, compras y servicios')
ON CONFLICT (name) DO NOTHING;

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
  ('notifications.read', 'Ver notificaciones')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'vendedor' AND p.key IN ('clients.read','clients.write','budgets.read','budgets.write','sales.read','sales.write','inventory.read','requests.read','requests.write','warranties.read','reports.read','notifications.read')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'tecnico' AND p.key IN ('orders.read','orders.write','maintenance.read','maintenance.write','requests.read','notifications.read')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'cliente' AND p.key IN ('clients.read','budgets.read','requests.read','requests.write','warranties.read','sales.read','notifications.read')
ON CONFLICT DO NOTHING;

INSERT INTO services (name, description, active) VALUES
  ('Cámaras de Vigilancia', 'Instalación y mantenimiento de sistemas de videovigilancia HD y 4K', 1),
  ('Sistemas de Alarma', 'Instalación de paneles de alarma inalámbricos y cableados con sensores inteligentes', 1),
  ('Aire Acondicionado', 'Instalación, mantenimiento preventivo y reparación de equipos de climatización', 1),
  ('Cerca Eléctrica', 'Cercas perimetrales electrificadas de alta seguridad y protección perimetral', 1),
  ('Video Portero', 'Video porteros IP y analógicos con pantalla táctil y apertura remota', 1),
  ('Control de Acceso', 'Sistemas biométricos, tarjetas de proximidad y cerraduras electrónicas', 1),
  ('Electricidad', 'Instalaciones eléctricas residenciales, comerciales e industriales', 1),
  ('Cableado Estructurado', 'Cableado de datos y voz Cat6/Cat6A certificado para empresas', 1),
  ('Redes e Internet', 'Instalación y configuración de redes WiFi de alta velocidad, switches y routers', 1)
ON CONFLICT (name) DO NOTHING;
