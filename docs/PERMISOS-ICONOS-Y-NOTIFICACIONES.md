# Permisos de configuración, solicitudes y cadena de notificaciones

## 1. Configuración de iconos y QR: solo administrador

Antes las tarjetas **📱 QR de Cobranzas** y **🎨 Iconos del Portal del Cliente** se pintaban para cualquier rol en `Configuración`. El endpoint de escritura ya era administrador-only, pero la interfaz invitaba a técnicos y vendedores a usarla.

Ahora:

- `App.isAdminUser()` / `App.requireAdminSettings(action)` centralizan la comprobación de rol.
- Las tarjetas de **Logo**, **QR de Cobranzas** e **Iconos del Portal del Cliente** solo se renderizan cuando `isAdmin === true`.
- Además de ocultarlas, se blindaron los métodos que escriben: `savePortalIcons`, `resetPortalIcons`, `onPortalIconSelected`, `removePortalIcon`, `handleQRCodeUpload`, `updateQRCode`, `handleLogoUpload` y `resetCompanyLogo`. Si se invocan desde consola o código antiguo con otro rol, muestran el aviso y no hacen nada.
- El backend ya tenía `PUT /api/settings/:key` con `requireRole(['admin'])`; se mantuvo sin cambios.

## 2. Solicitudes: el técnico no las ve

- Se quitó `'requests'` del array de vistas permitidas del rol `tecnico` en `app.js`.
- `GET /api/requests` ya era `admin` + `vendedor`; se reforzaron las rutas sueltas:
  - `GET /api/requests/:id` ahora devuelve `403` para cualquier rol que no sea administración o el cliente dueño de la solicitud.
  - `POST /api/requests/:id/files` devuelve `403` para técnicos.
- El vendedor conserva su acceso a solicitudes, porque forma parte del flujo comercial. Si se desea que también quede solo en administración, es un cambio de una línea en `allowedViews` y en `requireRole` de `GET /api/requests`.

## 3. Cadena de notificaciones conectada

| Evento | Aviso en panel | Correo |
| --- | --- | --- |
| Nueva solicitud de cotización | Administrador (`nueva_solicitud`) | Administrador, con los datos de la solicitud |
| Cotización enviada o enviada por correo | Cliente vinculado (`cotizacion_enviada`) | Cliente (endpoint `/api/budgets/:id/email` con PDF adjunto) |
| Visto bueno del cliente | Administrador (`cotizacion_aprobada`) + técnico asignado (`orden_asignada`) + confirmación al cliente | Administrador |
| Rechazo del cliente | Administrador (`cotizacion_rechazada`) | Administrador |
| Orden cerrada | Cliente vinculado (`orden_cerrada`) | — |

Cambios concretos:

- En `POST /api/requests` se eliminó `notifyRole('tecnico', ...)` y el correo ahora se envía únicamente a `['admin']`.
- Se agregó `getUserIdsForClient(clientId)` / `notifyClient(...)`. Busca al usuario por `users.client_id` **y** por `clients.created_by_user_id`, de modo que no depende de que el email o el teléfono coincidan exactamente. Se aplicó al envío de cotizaciones, a la aprobación y al cierre de orden.
- En la aprobación se eliminó `notifyRole('tecnico', 'orden_asignada', ...)`. Ahora se notifica solo al `user_id` del técnico asignado a la orden creada; los demás técnicos no reciben nada.
- Se añadieron `htmlEscape` y `notifyAdminsByEmail` para que aprobaciones y rechazos también lleguen al correo del administrador sin inyectar HTML del motivo del rechazo.
- Endpoint de diagnóstico sin secretos: `GET /api/system/mail-status` (solo administrador) devuelve `configured`, `provider`, `from`, `appUrl` y las direcciones de correo de los administradores. No devuelve claves ni contraseñas.

## 4. Verificación

```bash
npm run test:notifications  # permisos + cadena completa de avisos
npm run test:all            # todas las suites
```

La suite crea solicitudes y cotizaciones de prueba en la base local, comprueba las notificaciones por `requestId`/`budgetId`/`orderId`, verifica que el técnico asignado recibe la orden y que otro técnico no, y al final da de baja lógicamente los técnicos QA (no los elimina).

En producción se verificó además el estado del correo con `GET /api/system/mail-status` usando el token de administrador; el valor de `BREVO_API_KEY` nunca se muestra ni se guarda en el repositorio.
