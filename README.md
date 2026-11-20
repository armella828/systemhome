# SYSTEMHOME - Sistema Integral de Gestión Comercial y Técnica

## 1. Nombre del Proyecto

**SYSTEMHOME** - Sistema Web Integral de Gestión para empresas de seguridad, climatización y tecnología.

## 2. Descripción

SYSTEMHOME es un sistema web integral de gestión empresarial diseñado para empresas especializadas en:
- Cámaras de Vigilancia
- Sistemas de Alarma
- Aire Acondicionado
- Cercas Eléctricas
- Video Portero
- Electricidad
- Cableado Estructurado
- Redes e Internet

El sistema permite gestionar clientes, presupuestos, órdenes de trabajo, técnicos, inventario, mantenimientos e historiales completos, todo con control de acceso por roles.

## 3. Tecnologías Utilizadas

### Backend (producción)
- **Node.js 20+** con **Express** (`backend/server.js`) — backend único en Render
- **PostgreSQL** en la nube (`DATABASE_URL`); **SQLite** solo para desarrollo local
- Adaptador síncrono con Worker real + `SharedArrayBuffer` (misma interfaz `db.prepare()`)
- JWT + bcryptjs, helmet, CORS estricto, rate limiting, revocación de sesiones
- Nodemailer (SMTP real), Cloudinary (opcional), PDFKit
- Motor **SYSTEMHOME INTELLIGENCE** (ETL + modelos analíticos en JavaScript puro)
- Backups cifrados AES-256 con `pg_dump`/`pg_restore`

> El backend Python/Flask (`backend/server.py`) se conserva como **referencia histórica**, no se despliega en Render.

### Frontend
- **HTML5** + **CSS3** (tema profesional navy/cian, responsive)
- **JavaScript** puro (vanilla JS, sin framework)
- Portal del cliente y panel administrativo con diseño unificado
- Leaflet para geolocalización

## 4. Requisitos para Ejecutar el Sistema

- **Node.js 20+** y **npm**
- **PostgreSQL 12+** (local o en la nube)
- Navegador web moderno (Chrome, Firefox, Edge)
- Opcional: `pg_dump`/`pg_restore` para backups, cliente SMTP para correo real

## 5. Instalación de Dependencias

```bash
npm install
```

Dependencias principales: `express`, `pg`, `bcryptjs`, `jsonwebtoken`, `helmet`, `cors`,
`nodemailer`, `pdfkit`, `cloudinary`, `multer`, `dotenv`.

Para el migrador SQLite → PostgreSQL (Python):
```bash
pip install psycopg2-binary
```

## 6. Configuración de la Base de Datos

El sistema utiliza **SQLite** como base de datos relacional. La base de datos se crea automáticamente en:
```
backend/database/systemhome.sqlite
```

Las tablas se crean automáticamente al iniciar el servidor desde el archivo:
```
backend/database/schema.sql
```

### Tablas del sistema:
- `roles` - Roles de usuario
- `permissions` - Permisos del sistema
- `role_permissions` - Relación roles-permisos
- `users` - Usuarios del sistema
- `clients` - Clientes
- `services` - Servicios ofrecidos
- `budgets` - Presupuestos
- `budget_items` - Líneas detalle del presupuesto
- `technicians` - Técnicos
- `work_orders` - Órdenes de trabajo
- `work_order_assignments` - Asignaciones de técnicos
- `inventory_items` - Equipos y materiales
- `inventory_movements` - Movimientos de inventario
- `maintenances` - Programación de mantenimientos
- `client_history` - Historial de clientes
- `order_history` - Historial de órdenes

## 7. Configuración del Archivo .env

Cree un archivo `.env` en la raíz del proyecto con:

```
PORT=3000
JWT_SECRET=su-secreto-seguro-aqui
DB_PATH=./backend/database/systemhome.sqlite
FRONTEND_URL=http://localhost:3000
```

También se incluye un archivo `.env.example` como plantilla de referencia.

## 8. Creación de Tablas o Ejecución de Migraciones

Las tablas se crean automáticamente la primera vez que se inicia el servidor. No se requiere ejecutar migraciones manualmente.

Para **resetear** la base de datos (eliminar y recrear):

```bash
python backend/server.py --reset
```

## 9. Inserción de Datos Iniciales

El sistema crea automáticamente datos de prueba (seed) la primera vez que se inicia:

- 7 roles de usuario
- 10 permisos del sistema
- 7 usuarios de prueba
- 8 servicios (Cámaras, Alarmas, A/A, etc.)
- 3 técnicos de ejemplo
- 3 equipos en inventario
- 1 cliente de ejemplo con presupuesto y orden vinculada

## 10. Cómo Iniciar el Backend

```bash
python backend/server.py
```

El servidor se iniciará en: `http://localhost:3000`

También puede ejecutar:
```bash
python -m backend.server
```

### Iniciar el backend con Node.js (opcional):
```bash
node backend/server.js
```

## 11. Cómo Iniciar el Frontend

El frontend es servido automáticamente por el backend. Simplemente abra:

```
http://localhost:3000
```

No requiere configuración adicional. El frontend se sirve desde la carpeta `systemhome/`.

## 12. Usuarios de Prueba

| Usuario      | Contraseña     | Rol           |
|--------------|---------------|---------------|
| `admin`      | `admin123`    | Administrador |
| `gerente`    | `gerente123`  | Gerente       |
| `supervisor` | `supervisor123` | Supervisor  |
| `tecnico`    | `tecnico123`  | Técnico       |
| `almacenista`| `almacenista123` | Almacenista |
| `vendedor`   | `vendedor123` | Vendedor      |
| `cliente`    | `cliente123`  | Cliente       |
 
## Cambios recientes (agosto 2026)

Se han añadido mejoras visuales y de gestión de imágenes en el inventario:

- Paleta y estilo más profesional con tonos azules (archivo: `systemhome/css/style.css`).
- Login con estilo renovado y fondo en gama azul, usando el logo del proyecto.
- Inventario: miniaturas en la lista, vista previa al editar y soporte de imágenes por item.
- Gestión de imágenes en masa: modal para subir varias imágenes y asignarlas a equipos.
- Subida individual de imagen directamente desde la fila del inventario (botón 🖼️).
- Backend guarda las imágenes en `backend/uploads/inventory/` y las sirve vía `/uploads/<ruta>`.

Recomendación de uso: subir las imágenes directamente al sistema (no depender de URLs externas) para garantizar que no se borren.

## Cómo probar localmente (rápido)

1. Instalar dependencias Python:

```bash
pip install -r requirements.txt
```

2. Iniciar el servidor (crea/seed la base de datos automáticamente):

```bash
python backend/server.py
```

3. Abrir en el navegador:

```
http://localhost:3000
```

4. Probar endpoints básicos desde la terminal (ejemplo):

```bash
python tools/api_check.py
```

5. En la sección Inventario del panel puedes:
	- Crear/editar equipos y subir una imagen en el formulario.
	- Hacer click en 🖼️ en la fila para asignar una imagen individualmente.
	- Abrir "Gestionar Imágenes" para cargar varias imágenes y asignarlas a equipos.

## Documentación adicional

- Auditoría inicial: `docs/AUDITORIA-2026-11-17.md`
- Garantía de no borrado y verificación de correo: `docs/NO-BORRADO-Y-VERIFICACION.md`
- Guía de operación empresarial: sección 19 más abajo.


## 13. Estructura del Proyecto

```
SYSTEMHOME/
├── backend/
│   ├── database/
│   │   ├── schema.sql          # Esquema SQL de la base de datos
│   │   └── systemhome.sqlite   # Base de datos SQLite (se genera automáticamente)
│   ├── db.py                   # Conexión y seed de datos (Python)
│   ├── db.js                   # Conexión y seed de datos (Node.js)
│   ├── server.py               # API Flask (backend principal)
│   └── server.js               # API Express (backend alternativo)
├── systemhome/
│   ├── index.html              # Página principal del sistema
│   ├── assets/
│   │   ├── LOGO.png            # Logo de la empresa
│   │   └── logo.svg            # Logo SVG (respaldo)
│   ├── css/
│   │   └── style.css           # Estilos del sistema
│   └── js/
│       ├── app.js              # Aplicación principal y navegación
│       ├── data.js             # Cliente API (conexión con backend)
│       └── modules/
│           ├── clients.js      # Módulo de clientes + historial
│           ├── budgets.js      # Módulo de presupuestos
│           ├── workorders.js   # Módulo de órdenes de trabajo
│           ├── inventory.js    # Módulo de inventario
│           ├── maintenances.js # Módulo de mantenimientos
│           └── client-portal.js# Portal del cliente
├── .env                        # Variables de entorno (local)
├── .env.example                # Plantilla de variables de entorno
├── .gitignore                  # Archivos ignorados por git
├── package.json                # Dependencias Node.js
├── requirements.txt            # Dependencias Python
└── README.md                   # Este archivo
```

## 14. Comandos para GitHub

### Inicializar repositorio y hacer commit:

```bash
# Inicializar repositorio git
git init

# Agregar todos los archivos
git add .

# Crear commit inicial
git commit -m "Sistema SYSTEMHOME - Gestión Integral v3.0"

# Conectar con repositorio remoto
git remote add origin https://github.com/yuleabigail19-droid/systemhome.git

# Subir al repositorio
git push -u origin master
```

O si prefiere usar `main` como rama principal:

```bash
git branch -M main
git push -u origin main
```

## 15. Dónde se Almacenan los Datos

Todos los datos del sistema se almacenan de forma permanente en la base de datos SQLite:

```
backend/database/systemhome.sqlite
```

### Verificar que los datos se guardan:

1. **Inicie el servidor**: `python backend/server.py`
2. **Abra el navegador**: `http://localhost:3000`
3. **Inicie sesión** con `admin` / `admin123`
4. **Cree un cliente** en el módulo Clientes
5. Para verificar que se guardó en la BD:

**Opción A** - Con la API:
```bash
curl -H "Authorization: Bearer TU_TOKEN" http://localhost:3000/api/clients
```

**Opción B** - Con Python (directo a la BD):
```python
import sqlite3
conn = sqlite3.connect('backend/database/systemhome.sqlite')
rows = conn.execute('SELECT * FROM clients ORDER BY id DESC LIMIT 5').fetchall()
print(rows)  # Verá los clientes guardados
conn.close()
```

**Opción C** - Con el navegador:
- Inicie sesión en el sistema
- Vaya a Clientes → verá los clientes creados que se cargan desde la BD

## 16. Funcionalidades Implementadas por Historia de Usuario

### Sprint 1 - Completado ✅
- **SH-A01**: Registro de clientes con validación anti-duplicados
- **SH-A02**: Gestión de presupuestos con cálculo automático y exportación PDF
- **SH-O01**: Creación de órdenes desde presupuestos aprobados
- **SH-O02**: Asignación de técnicos y control de estados
- **SH-I01**: Inventario básico con descuento automático de stock

### Funcionalidades Adicionales ✅
- **SH-A03**: Historial completo del cliente con filtros
- **SH-O03**: Cierre de orden con materiales y firma del cliente
- **SH-O04**: Historial de órdenes con filtros y exportación
- **SH-I02**: Control de movimientos de inventario
- **SH-M01**: Programación de mantenimientos

## 17. Reglas de Negocio Implementadas

✅ Solo se genera orden desde presupuesto aprobado
✅ Un técnico se asigna a una orden a la vez
✅ El inventario se descuenta automáticamente al usar materiales
✅ No se permite salida con stock cero
✅ Las órdenes completadas conservan todo su historial
✅ No se duplican clientes con el mismo CI/RUC
✅ Los presupuestos rechazados no generan órdenes
✅ Los cambios importantes quedan registrados
✅ Control de acceso por roles

## 18. Roles y Permisos

| Módulo | Admin | Gerente | Supervisor | Técnico | Almacenista | Vendedor |
|--------|-------|---------|------------|---------|-------------|----------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Clientes | ✅ | ✅ | ✅ | - | - | ✅ |
| Presupuestos | ✅ | ✅ | ✅ | - | - | ✅ |
| Órdenes | ✅ | ✅ | ✅ | ✅ | - | - |
| Inventario | ✅ | ✅ | ✅ | - | ✅ | - |
| Mantenimientos | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| Usuarios | ✅ | ✅ | - | - | - | - |
| Configuración | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 19. Guía de Operación Empresarial (noviembre 2026)

### 19.1 Arquitectura de producción

```
Navegador (systemhome/index.html + portal cliente)
        │  HTTPS / JWT
        ▼
Render Web Service  →  npm start  →  backend/server.js (Node/Express)
        │                              │
        │                              ├── PostgreSQL cloud (DATABASE_URL)
        │                              ├── SMTP real (recuperación de contraseña)
        │                              ├── Cloudinary opcional (imágenes)
        │                              └── SYSTEMHOME INTELLIGENCE (datasets + métricas)
        └── frontend estático servido por el propio Express
```

- `render.yaml`: `runtime: node`, `buildCommand: npm install`, `startCommand: npm start`,
  `healthCheckPath: /api/health`.
- Python/Flask queda como referencia; **no se usa en Render**.
- La persistencia en producción depende de `DATABASE_URL` (PostgreSQL). Si no está definida,
  el backend usa SQLite solo en local.

### 19.2 Variables de entorno

Copiar `.env.example` a `.env` y completar. **Nunca subir `.env` a GitHub** (ya está en `.gitignore`).

| Variable | Uso | Observación |
|---|---|---|
| `DATABASE_URL` | Cadena PostgreSQL | Obligatoria en Render (Neon/Supabase/Render PG) |
| `JWT_SECRET` | Firma de tokens | ≥32 caracteres aleatorios; producción falla si es débil |
| `NODE_ENV` | Entorno | `production` en Render |
| `PORT` | Puerto HTTP | Render asigna 10000 |
| `FRONTEND_URL`, `APP_URL` | CORS estricto | URL exacta de la app (sin comillas ni barra final) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_FROM_NAME` | Correo real | Necesario para recuperación de contraseña |
| `RESET_TOKEN_TTL_MINUTES` | Vigencia del token de reseteo | Default 30 |
| `CLOUDINARY_*` | Imágenes en la nube | Opcional; si falta se usa almacenamiento local |
| `BACKUP_ENCRYPTION_KEY` | Cifrado AES-256 de backups | Generar con `openssl rand -hex 32` |
| `BACKUP_DIR`, `BACKUP_RETENTION_DAYS`, `PG_BIN` | Backups | Opcionales |
| `ADMIN_PASSWORD`, `VENDEDOR_PASSWORD`, `TECNICO_PASSWORD`, `CLIENTE_PASSWORD` | Rotación de credenciales demo | Usar `node backend/rotate-credentials.js` |

### 19.3 Arranque local con PostgreSQL

```bash
# 1) Base de datos
createdb systemhome_staging
export DATABASE_URL='postgresql://usuario:clave@127.0.0.1:5432/systemhome_staging'

# 2) Migrar datos desde el respaldo SQLite (repetible, conserva IDs)
python backend/migrate_sqlite_to_pg.py \
  --sqlite ruta/systemhome.sqlite \
  --pg "$DATABASE_URL"
# Verificación sin escribir: añadir --verify-only

# 3) Backend y frontend
npm install
npm start
# Abrir http://localhost:3000
```

Credenciales demo locales: `admin/admin123`, `vendedor/vendedor123`, `tecnico/tecnico123`,
`cliente/cliente123`. En producción deben rotarse con `npm run rotate-credentials`.

### 19.4 Seguridad

- CORS solo para `FRONTEND_URL`/`APP_URL` (y localhost en desarrollo).
- Helmet (cabeceras), `X-Powered-By` desactivado, rate limit de login/recuperación.
- Logout revoca el JWT; cambio de contraseña autenticado; reseteo por token de un solo uso.
- Validación MIME/base64/tamaño (10 MB) en subidas.
- PDFs de cotizaciones, órdenes y facturas con control de propiedad por cliente.
- Rotación de credenciales demo: `npm run rotate-credentials` (lee secretos del entorno).

### 19.5 Backups cifrados

```bash
# Crear backup (pg_dump → AES-256-CBC + SHA256 + retención)
npm run backup

# Restaurar (ADVERTENCIA: sobrescribe la BD destino)
npm run restore -- archivo.dump.enc --yes --db "$DATABASE_URL"
# Sin --yes solicita confirmación escribiendo SI
```

Cada backup genera `systemhome-<fecha>.dump.enc` y un `manifest-*.json` con SHA256.
Los datasets generados por INTELLIGENCE y los backups están excluidos de Git.
La retención está desactivada por defecto (`BACKUP_RETENTION_DAYS=0`): ningún respaldo se borra automáticamente.

### 19.6 SYSTEMHOME INTELLIGENCE

- Acceso: menú **Análisis & Auditoría → INTELLIGENCE** (solo admin).
- Endpoints: `GET /api/intelligence/status`, `/metrics`, `/insights`;
  `POST /api/intelligence/run` (admin).
- Procesa 11 entidades reales, genera CSV en `backend/intelligence/datasets/`
  (ignorados por Git), calcula 21 métricas y hallazgos de ventas, cobranza, RFM,
  inventario y técnicos.
- El pronóstico usa regresión lineal y media móvil; si hay menos de 2 meses de datos,
  cambia automáticamente a granularidad diaria (`grain: day`).
- Ejecución verificada: 85 registros, 21 métricas, 5 insights, ~111 ms.

### 19.7 Pruebas automatizadas

```bash
npm test                 # 11 pruebas unitarias (seguridad + modelos)
TEST_BASE_URL=http://127.0.0.1:3200 npm run test:api   # 14 pruebas HTTP reales
# Opcional: probar bloqueo por intentos de login
TEST_RATE_LIMIT=1 npm run test:api
```

La suite API crea y elimina un usuario temporal; no modifica datos de negocio.
Verificación de integridad de migración:

```bash
python backend/migrate_sqlite_to_pg.py --sqlite respaldo.sqlite --pg "$DATABASE_URL" --verify-only
```

> Nota: después de usar el sistema, `audit_logs` crece con cada acción (login, análisis, etc.),
> por lo que esa tabla puede mostrar `DIF` frente al SQLite original. El resto de las tablas
> de negocio debe permanecer `OK`, con 0 huérfanos y sumas monetarias idénticas.

### 19.8 Despliegue en Render (checklist)

1. Crear PostgreSQL en Render/Neon y copiar `DATABASE_URL`.
2. Configurar todas las variables de la tabla 19.2 en el Dashboard de Render.
3. Importar los datos con el migrador (Etapa 3) sobre la BD cloud de **staging**.
4. Verificar `/api/health`, login, clientes/ventas/dashboard y endpoints de INTELLIGENCE.
5. Rotar credenciales demo (`npm run rotate-credentials`) y guardar las nuevas claves en un gestor seguro.
6. Crear el primer backup cifrado (`npm run backup`) y probar una restauración en BD temporal.
7. Solo tras autorización confirmada: borrado controlado de la venta de prueba `VTA-0001` en producción.

### 19.9 Estado y pendientes externos

- ✅ Auditoría, respaldo original, migración verificada, seguridad, backups, INTELLIGENCE,
  interfaz profesional, pruebas y configuración Render completados y commiteados.
- ⏳ Requiere datos externos: `DATABASE_URL` cloud real, credenciales SMTP, URLs exactas
  de `FRONTEND_URL`/`APP_URL`, acceso a producción para el borrado autorizado de `VTA-0001`
  y permisos para hacer `git push` al repositorio remoto (hasta ahora solo hay commits locales).
- ⚠️ No ejecutar migraciones ni restauraciones sobre producción sin respaldo y autorización.

 
