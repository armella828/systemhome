# Exportación a Excel y perfiles individuales de técnicos

## 1. Error al exportar el reporte a Excel

### Causa
`DB.exportServiceReport()` construía la URL así:

```
/api/reports/services/export?serviceType=all&clientId=all&status=all?token=...
```

Había **dos signos `?`**. Como los filtros siempre vienen con valor `all`, el segundo `?` quedaba dentro del valor de `status` y el token no se enviaba. El servidor respondía `401 {"error":"Token de autenticación requerido"}` y el navegador mostraba ese JSON en lugar del archivo.

Además, el endpoint de exportación **ignoraba los filtros**: siempre descargaba todas las cotizaciones, aunque la tabla mostrara solo un subconjunto.

### Corrección
- La descarga ahora usa `fetch` con cabecera `Authorization: Bearer <token>`, valida la respuesta y dispara el archivo con `_downloadBlob`. Ya no se construyen URLs con dos `?`.
- Se extrajo `buildServiceReportFilter(req)` y lo usan **la tabla y el CSV**, así el archivo coincide con lo filtrado en pantalla.
- El rango `Hasta` incluye el día completo (`T23:59:59.999Z`).
- Se agrega BOM UTF-8 y se escapan celdas que empiezan con `=`, `+`, `-` o `@` para evitar fórmulas inesperadas en Excel.
- `ReportsModule.exportReport('excel')` ahora espera la descarga y muestra mensaje de éxito o error real.

Endpoint: `GET /api/reports/services/export` (acepta `serviceType`, `clientId`, `status`, `from`, `to`; token por cabecera o por `?token=`).

## 2. Cada técnico entra con su propio perfil

Antes existía un único usuario genérico `tecnico` y los técnicos `Carlos Mendoza` / `Marcos Benítez` no tenían usuario. Al asignar una orden no se sabía quién la ejecutaría, y un técnico sin vínculo podía ver **todas** las órdenes.

### Cambios
- **Alta de técnico**: ahora exige `usuario` y `contraseña` (mínimo 6). Se crea el usuario con rol `tecnico` y queda vinculado por `user_id`.
- **Edición de técnico histórico**: si no tiene `user_id`, el panel muestra el aviso y los campos de acceso obligatorios. El backend `PUT /api/technicians/:id` crea el usuario, lo vincula y permite cambiar usuario/contraseña a los que ya tienen perfil.
- **Listado de técnicos**: muestra el usuario o una insignia `Sin acceso` para identificar rápidamente a quién falta darle perfil.
- **Asignación de órdenes**: los desplegables de órdenes y cotizaciones muestran `Nombre · usuario · especialidad` y solo listan técnicos activos.
- **Aislamiento real**:
  - `GET /api/workorders` filtra por `technicians.user_id = req.user.id`. Si no hay vínculo, devuelve cero órdenes (fail closed).
  - Detalle, edición, inicio, finalización y PDF de orden verifican que la orden pertenezca al técnico autenticado; si no, devuelven `404`.

### Cómo dar acceso a los técnicos actuales
En **Técnicos**, presionar ✏️ sobre cada técnico con insignia `Sin acceso`, completar **Usuario de acceso** y **Contraseña** y guardar. Desde entonces ese técnico inicia sesión con ese usuario y solo ve sus órdenes asignadas.

No se crean cuentas automáticamente ni se modifica ninguna orden existente: el vínculo se agrega al técnico y el historial se conserva.

## Verificación

```bash
npm run test:reports        # exportación CSV con/sin filtros y autenticación
npm run test:tech-profiles  # login por técnico, aislamiento de órdenes y perfil histórico
npm run test:all            # todas las suites
```
