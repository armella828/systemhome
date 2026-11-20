# Garantía de conservación de datos y verificación de correo

Este documento explica, en lenguaje operativo, qué cambios se aplicaron para cumplir dos compromisos:

1. **Ningún dato de negocio se borra automáticamente.** Clientes, usuarios, técnicos, productos, ventas, cotizaciones, órdenes, mantenimientos, imágenes y respaldos se conservan.
2. **El enlace del correo realmente verifica la cuenta.** Después de registrarse, el cliente hace clic en el enlace y ve una confirmación clara antes de iniciar sesión.

---

## 1. Qué se cambió para no perder datos

| Situación | Antes | Ahora |
|---|---|---|
| Reinicio del servicio en Render | Riesgo de base SQLite efímica | `DATABASE_URL` es obligatoria en producción; si falta, el servidor no arranca. Se usa PostgreSQL externo. |
| Seed de datos de ejemplo | Podía borrar inventario real | El seed solo siembra tablas vacías y nunca ejecuta `DELETE`/`TRUNCATE`. `SEED_DEMO_DATA=0` en Render. |
| Eliminar un cliente | `DELETE FROM clients` | Baja lógica: `active = 0`. Ficha, historial, ventas, cotizaciones y documentos permanecen. |
| Eliminar un usuario | `DELETE FROM users` | Baja lógica: `active = 0`. Auditoría y relaciones se conservan; el usuario ya no puede ingresar. |
| Eliminar un técnico | Se borraban asignaciones y se desvinculaban órdenes | Baja lógica: `active = 0`. Se conservan asignaciones, órdenes y mantenimientos. |
| Editar una cotización | Se borraban las líneas anteriores de `budget_items` | Las líneas anteriores quedan como `active = 0` con `superseded_at`; se guarda cada versión. |
| Eliminar un producto | Ya era baja lógica | Se mantiene: `active = 0`, imagen y datos conservados. |
| Respaldos automáticos | Retención de 30 días borraba respaldos antiguos | `BACKUP_RETENTION_DAYS=0` por defecto: se conservan todos. |
| Migración SQLite → PostgreSQL | `TRUNCATE` podía ejecutarse por accidente | Requiere `ALLOW_DESTRUCTIVE_MIGRATION=1` de forma explícita; por defecto aborta sin escribir. |
| Reinicio con `--reset` (servidor Python heredado) | Borraba el SQLite | Requiere `ALLOW_DB_RESET=1` de forma explícita. |

Las imágenes siguen guardándose dentro de la base de datos como `data:image/...;base64` (logotipo, QR de cobranza, iconos del portal y fotos de inventario), de modo que no dependen de enlaces externos que puedan dejar de funcionar.

---

## 2. Qué se cambió en el registro de cuentas

- Se creó `systemhome/verify-email.html`. Antes el correo enviaba a `/verify-email?token=...`, pero esa página no existía y el servidor mostraba el inicio de sesión; por eso parecía que “no se había verificado”.
- La nueva página:
  - lee el `token` de la URL;
  - llama automáticamente a `GET /api/auth/verify-email?token=...`;
  - muestra **“Correo verificado correctamente”** y un enlace para iniciar sesión;
  - si el enlace venció o falla, ofrece un formulario para reenviar correo a través de `POST /api/auth/resend-verification`.
- El formulario de registro usa etiquetas directas y claras —**Nombre completo / Razón social**, **Correo electrónico**, **Teléfono / WhatsApp**, **CI / RUC**, **Ciudad**, **Dirección**, **Nombre de usuario**, **Contraseña** y **Confirmar contraseña**— sin textos explicativos largos.
- Después de crear la cuenta se muestran tres pasos numerados: abrir el correo, hacer clic en **Verificar mi correo** y volver a iniciar sesión.

---

## 3. Cómo comprobarlo

### 3.1 En producción

```powershell
# Debe devolver version 2.1.0-no-delete-verify
Invoke-RestMethod https://systemhome-backend.onrender.com/api/health

# La ruta de verificación debe devolver HTML de SYSTEMHOME, no el login
Invoke-WebRequest "https://systemhome-backend.onrender.com/verify-email?token=prueba" -UseBasicParsing
```

### 3.2 Flujo completo de una cuenta nueva

1. Abrir el portal y elegir **Crear una cuenta**.
2. Llenar los campos siguiendo la ayuda mostrada debajo de cada uno.
3. Enviar el formulario. Debe aparecer: *“Cuenta creada. Revise su correo…”*.
4. Abrir el correo y hacer clic en **Verificar mi correo**.
5. Debe aparecer: *“Correo verificado correctamente. Ya puede iniciar sesión.”*
6. Ingresar con el usuario y la contraseña creados.

Si el correo no llega en 5 minutos, revisar spam o pulsar **Reenviar correo de verificación** en la misma página de verificación.

### 3.3 Baja lógica

Tras desactivar un cliente, usuario o técnico desde el panel de administración:

- el registro deja de estar disponible para operaciones nuevas;
- el registro sigue existiendo en PostgreSQL y en los respaldos;
- el historial, las ventas, las cotizaciones y las órdenes siguen asociados a ese registro.

---

## 4. Variables relacionadas

| Variable | Valor recomendado | Efecto |
|---|---|---|
| `DATABASE_URL` | URL externa de PostgreSQL | Persistencia real; obligatoria en producción. |
| `SEED_DEMO_DATA` | `0` | Evita datos de ejemplo sobre datos reales. |
| `BACKUP_RETENTION_DAYS` | `0` | Conserva todos los respaldos. |
| `BREVO_API_KEY` | Secreto en Render | Envío de correo por puerto 443, compatible con Render Free. |
| `APP_URL` | URL pública del frontend | Genera el enlace `/verify-email?token=...` correcto. |

> Los secretos se configuran solo en las variables de entorno de Render/Vercel. Nunca se versionan en GitHub.
