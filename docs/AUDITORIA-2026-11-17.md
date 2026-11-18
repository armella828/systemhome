# AUDITORÍA TÉCNICA — SYSTEMHOME
Fecha: 2026-11-17

## Backend activo en Render
- **Node.js / Express** (`backend/server.js`, `npm start`). No Python/Flask.
- Evidencia: `render.yaml` -> runtime node, `/api/health` responde con `uptime` (server.js:42), login JWT con `jsonwebtoken`.
- Persistencia en vivo confirmada: datos sobreviven reinicios => PostgreSQL externo vía `DATABASE_URL`. El SQLite del ZIP es un snapshot de desarrollo.

## Verificado operativo (con evidencia)
- `GET /`, `/api/health`: 200.
- Login admin/vendedor: 200 + JWT.
- `GET /api/clients`, `/api/inventory`, `/api/users`, `/api/dashboard`, `/api/audit`, `/api/sales` con token: 200.
- RBAC: vendedor recibe 403 en `/api/users`, `/api/backup`, `/api/audit`; sin token 401.
- `POST /api/sales`: 201, descuenta stock, crea pago y factura.
- SQLite local: `integrity_check=ok`, 29 tablas, 0 huérfanos, 0 duplicados.

## Fallas / incompletos
- Rutas inexistentes devuelven SPA HTML 200: `/api/work-orders`, `/api/stats`, `/api/reports/dashboard`.
- Sin logout, refresco de token, rate limit, CSRF; token aceptado por query string.
- Sin módulo predictivo, ETL ni backups automáticos de Postgres.
- Datos mojibake en SQLite.
- `migrate-pg.js` no migra registros (solo esquema + datos demo).

## Seguridad (crítico)
1. Credenciales demo activas en producción: admin/admin123, vendedor/vendedor123, tecnico/tecnico123, cliente/cliente123.
2. CORS refleja cualquier Origin (probado con evil.example.com).
3. JWT_SECRET por defecto en código y .env del ZIP. `.env` NO está en GitHub (API 404, árbol Git solo .env.example).
4. Registro público sin aprobación.
5. Subida de archivos sin whitelist MIME ni límite real.
6. Sin helmet; PDFs sin verificación de propiedad.
7. Dinero en DOUBLE PRECISION/REAL (debe ser NUMERIC).

## Respaldo Etapa 2
- Copia completa en `SYSTEMHOME_RESPALDO_2026-11-17/` (50 archivos, 2.907.902 bytes) con MANIFEST.sha256.csv.
- No se ejecutaron operaciones destructivas en producción.

## Nota
Se creó una venta de prueba VTA-0001 en producción durante las pruebas; el usuario autorizó su eliminación controlada.
