# INFORME FINAL DE AUDITORÍA Y CORRECCIÓN — SYSTEMHOME

Fecha: 2026-11-18
Rama: `feature/login-correo-real`
Repositorio: `https://github.com/armella828/systemhome.git`
Backend de producción: Node.js/Express (`backend/server.js`) + PostgreSQL vía `DATABASE_URL`.

> **Estado de producción:** NO se ha desplegado ni modificado nada en producción. Todo lo siguiente fue verificado en staging local (`127.0.0.1:3200` / `systemhome_staging`). Se requiere respaldo y autorización antes de desplegar.

---

## 1. Resumen ejecutivo

Se corrigieron las causas de pérdida de datos, se aislaron los espacios de cada cliente, se generó un PDF empresarial real, se implementó el compartir por WhatsApp sin falsos éxitos, se endureció el registro con verificación de correo y se migraron el QR de cobranza y las fotos de inventario de `localStorage`/URLs externas a persistencia en base de datos.

**Resultado de la batería completa (staging):**

| Prueba | Resultado |
| --- | --- |
| `tests/unit.test.js` | 11 pasadas, 0 fallidas |
| `tests/api.test.js` | 14 pasadas, 0 fallidas |
| `tests/stage-final.test.js` | etapa final verificada |
| `tests/persistence.test.js` | persistencia verificada |
| `tests/tenant-isolation.test.js` | 31 PASS, aislamiento y registro verificados |
| `tests/pdf.test.js` | PDF profesional verificado (1/20/60 ítems) |
| `node --check` (11 archivos JS) | todos OK |

---

## 2. Puntos auditados (17 originales + verificaciones adicionales)

### A. Persistencia e integridad

1. **Backend real y una sola fuente de datos.** Se conserva Node.js/Express + PostgreSQL. El frontend consume la API; no se sustituyó la BD por `localStorage`. Python/Flask queda solo como referencia histórica.

2. **Datos persistentes tras reinicio y relogin.** `backend/db.js` ya no ejecuta `DELETE FROM inventory_items`. El seed solo inserta si la tabla está vacía y en producción exige `SEED_DEMO_DATA=1`. Verificado: producto creado, persistido tras logout/login y tras reiniciar backend.

3. **Arranque sin reinicialización.** El servidor exige `DATABASE_URL` en producción y muestra en logs la BD activa. `render.yaml` deja `SEED_DEMO_DATA=0` explícitamente.

4. **Respaldo verificable previo.** `SYSTEMHOME_RESPALDO_2026-11-18_16-20-15` con conteos `users=7`, `clients=8`, `inventory_items=20`, `budgets=9`, `requests=9`, `sales=5` y SHA256 `FBC638D9B6C1D790467C422C98ACBA44F7B0FA5FBD3319DDBF0065AFF9586022`. Procedimiento en `docs/PERSISTENCIA-Y-RESPALDOS.md`.

5. **Todo vinculado.** Admin, inventario, clientes, solicitudes, cotizaciones, ventas, historial, workorders, archivos, garantías y portal del cliente comparten las mismas claves (`client_id`, `request_id`, `budget_id`) y se consultan por API.

### B. Aislamiento y seguridad

6. **Espacio aislado por cliente.** `users.client_id` vincula usuario y cliente sin depender de email/teléfono. `ensureClientAccess()` bloquea export PDF, approve, reject, workorders, archivos y garantías ajenos con HTTP 404. 31 aserciones lo confirman.

7. **Portal del cliente.** Cada cliente ve solo sus cotizaciones, solicitudes, ventas e historial. El SSE de tiempo real filtra por `clientId`. Los accesos por ID en URL ajena son rechazados en backend.

8. **Roles y configuración.** `requireRole()` protege administración, backups, auditoría y workbench. `/api/settings/:key` usa allowlist (`payment_qr` es pública; el resto es admin-only).

9. **JWT y secretos.** `JWT_SECRET` es obligatoria siempre. El token en query string quedó restringido; descargas usan header `Authorization`. Los secretos están solo en variables de entorno; `.env` no está en Git y `.env.example` contiene únicamente placeholders.

### C. Cotizaciones y PDF

10. **PDF profesional verificado.** `renderBudgetPdfProfessional()` usa `pageAdded`, `drawHeader()`, `drawFooter()`, `ensureSpace()`, columnas fijas, `bottomLimit = page.height - 92`, moneda `Bs.`, totales, condiciones, firma/aprobación, logo incrustado y numeración de página. `compress: false` permite auditar el texto.

11. **Sin superposiciones ni cortes.** Pruebas con 1, 20 y 60 ítems: 1, 3 y 6 páginas respectivamente; encabezado/pie en todas; último ítem presente; sin páginas excesivas.

12. **Descarga y correo reales.** `GET /api/budgets/:id/export` usa el buffer del nuevo PDF con `Content-Length` y `Content-Disposition`. `DB.downloadBudgetPdf()` espera la respuesta y valida la firma `%PDF`; no muestra éxito si falla. El correo valida SMTP configurado antes de marcar como enviado.

### D. WhatsApp

13. **PDF real adjunto.** `DB.getBudgetPdfFile()` devuelve un `File` real validado. Si `navigator.canShare({files})` lo acepta, se usa `navigator.share()` con archivo, título y texto.

14. **Fallback honesto.** Sin Web Share API (o si el dispositivo rechaza el PDF), se descarga el PDF y se abre `wa.me` con un mensaje que indica explícitamente que el archivo **debe adjuntarse manualmente y no fue enviado automáticamente**. Si el navegador bloquea `window.open`, se muestra un enlace manual. Cancelar el compartir muestra «Compartir cancelado; no se envió ningún archivo». Verificado en navegador: Web Share con archivo de 85.647 bytes, fallback con mensaje honesto y cancelación.

### E. Registro y verificación

15. **Formulario claro y validado.** Etiquetas con `*`, CI/RUC opcional, dirección, ciudad, tipo de cliente, confirmación de contraseña, usuario de 4–20 caracteres y contraseña de 8+. Errores reales del backend visibles en pantalla.

16. **Correo real y cuenta bloqueada.** `bcryptjs` con hash seguro, tabla `email_verification_tokens`, expiración configurable (`VERIFY_TOKEN_TTL_MINUTES=1440`), reenvío, token de un solo uso. El login rechaza cuentas no verificadas. El registro **no** inicia sesión. En producción con SMTP configurado no se expone `devToken`.

17. **Perfil propio.** `PUT /api/me/profile` permite nombre/teléfono/correo propios; cambiar el correo exige nueva verificación, incrementa `token_version` y cierra la sesión en frontend. Nunca permite cambiar rol ni cliente.

### F. Imágenes seleccionadas desde el equipo

18. **QR de cobranza.** Interfaz sin campo URL: el administrador selecciona PNG/JPG/WEBP desde su equipo. Se guarda en `app_settings` (`payment_qr`) como `data:image/...;base64,` solo tras respuesta exitosa de la API. Verificado: persiste tras borrar `localStorage`, recargar y volver a iniciar sesión. `sales.js` ya no usa `api.qrserver.com`; si no hay QR cargado, indica dónde cargarlo.

19. **Fotos de inventario.** `InventoryModule` usa `FileReader`, sube la imagen vía `POST /api/inventory/:id/image` y espera confirmación antes de mostrar éxito. Verificado: producto QA con imagen `data:image/png;base64,...` de 186 caracteres persistió en BD tras logout/login; dato de prueba eliminado después.

20. **Iconos del portal del cliente.** El editor ya no tiene campo de URL: cada uno de los 8 iconos se selecciona como archivo PNG/JPG/WEBP, se optimiza a 64×64 px en canvas y se guarda como `data:image/png;base64,` dentro de `app_settings` (`portal_icons`). Verificado en navegador: tras recargar y entrar como cliente, el portal muestra la imagen (<img>) en lugar del SVG por defecto. Los valores anteriores por URL o emoji se conservan para no borrar datos, pero el editor no permite cargar URLs nuevas. `tests/stage-final.test.js` comprueba persistencia de emoji y de imagen en base64.

### G. Visibilidad operativa

21. **Toasts visibles.** `.sh-toast` con variantes success/error/warning/info para que los avisos de guardado, PDF y errores no pasen desapercibidos.

---

## 3. Cambios principales por archivo

- `backend/db.js`: seed no destructivo, `users.client_id`, `email_verified`, `token_version`, `email_verification_tokens`, `payment_qr`.
- `backend/server.js`: aislamiento, roles, settings allowlist, registro/verificación/reenvío, perfil propio, PDF profesional, QR e imágenes.
- `backend/mailer.js`, `backend/auth-recovery.js`, `backend/security.js`, `backend/realtime.js`: correo, rate limits, tokens y SSE filtrado.
- `systemhome/js/data.js`: conectores con respuesta completa, PDF File validado, descarga honesta, QR, imágenes, registro/reenvío.
- `systemhome/js/app.js`: registro, verificación, QR por archivo, toasts, perfil.
- `systemhome/js/modules/budgets.js`: PDF, correo y WhatsApp real/fallback.
- `systemhome/js/modules/inventory.js`: imagen por archivo con persistencia antes de mostrar éxito.
- `systemhome/js/modules/sales.js`: QR desde configuración, sin URL externa.
- `systemhome/css/style.css`: `.sh-toast`.
- `systemhome/index.html`: campos nuevos del registro.
- `render.yaml`, `.env.example`: variables de verificación y `SEED_DEMO_DATA=0`.
- `tests/`: `persistence.test.js`, `tenant-isolation.test.js`, `pdf.test.js`.

---

## 4. Pendiente para despliegue (requiere el usuario)

1. Credenciales SMTP reales: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_FROM_NAME`, `APP_URL`. Sin ellas el correo de verificación no se envía y el sistema lo reporta como error.
2. Confirmar `DATABASE_URL` real de Render y los valores exactos de `FRONTEND_URL`/`APP_URL`.
3. **Respaldar PostgreSQL de producción antes de desplegar** y autorizar expresamente el despliegue. No ejecutar migraciones destructivas.
4. Verificar en un dispositivo móvil real con Web Share API el adjunto del PDF a WhatsApp (en escritorio se probó con `navigator.share` simulado y con fallback).

---

## 5. Comandos de verificación

```powershell
$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:5433/systemhome_staging"
node tests/unit.test.js
node tests/api.test.js
node tests/stage-final.test.js
node tests/persistence.test.js
node tests/tenant-isolation.test.js
node tests/pdf.test.js
```

Todos los datos QA creados durante las pruebas fueron eliminados de staging. El QR de prueba quedó guardado a propósito para comprobar persistencia.
