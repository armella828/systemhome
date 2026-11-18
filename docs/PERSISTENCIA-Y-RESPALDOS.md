# SystemHome — Persistencia y respaldos

## Causa corregida de pérdida de datos

`backend/db.js` ejecutaba `seedData()` en cada arranque. Si el inventario tenía
**menos de 10 productos**, hacía `DELETE FROM inventory_items` y volvía a
insertar 17 productos de ejemplo. Eso borraba inventario real del usuario.

Corrección aplicada:

- El seed **nunca elimina** filas.
- Solo siembra datos demo cuando la tabla correspondiente está **vacía**.
- En `NODE_ENV=production` los datos demo requieren `SEED_DEMO_DATA=1`.
- Si falta `DATABASE_URL` en producción, el servidor **falla al arrancar**
  en lugar de crear una SQLite efímera dentro del contenedor.
- El arranque imprime en consola la base de datos activa.

## Causa corregida de “admin ve vacío, cliente no”

- `/api/catalog` es público y sigue mostrando productos.
- `/api/inventory` exige token. Si el token expiraba, `DB.getInventory()`
  devolvía `[]` sin avisar.
- Ahora se muestra un error claro: “Su sesión expiró…”.

## Respaldos

### Antes de cualquier cambio en producción

1. Conocer la BD real (Render Shell):

   ```bash
   node -e "const u=new URL(process.env.DATABASE_URL); console.log(u.hostname, u.pathname)"
   ```

2. Verificar conteos:

   ```sql
   SELECT 'users' AS tabla, count(*) FROM users
   UNION ALL SELECT 'clients', count(*) FROM clients
   UNION ALL SELECT 'inventory_items', count(*) FROM inventory_items
   UNION ALL SELECT 'budgets', count(*) FROM budgets
   UNION ALL SELECT 'requests', count(*) FROM requests
   UNION ALL SELECT 'sales', count(*) FROM sales;
   ```

3. Copia legible:

   ```bash
   pg_dump --format=custom --no-owner --no-privileges \
     --file=systemhome_pre_cambios.dump "$DATABASE_URL"
   pg_restore -l systemhome_pre_cambios.dump | head
   ```

4. Copia cifrada del proyecto:

   ```bash
   BACKUP_ENCRYPTION_KEY=<clave> npm run backup
   ```

5. Guardar ambos archivos **fuera de Render** (filesystem efímero).

### Restauración (solo en staging o tras autorización explícita)

```bash
RESTORE_DATABASE_URL=<url_staging> npm run restore -- <archivo>.dump.enc --db "$RESTORE_DATABASE_URL"
```

> `restore.js` usa `pg_restore --clean --if-exists`: sobrescribe la BD destino.
> Nunca omitas `--db`; por defecto tomaría `DATABASE_URL`.

## Variables obligatorias en Render

- `DATABASE_URL` — URL de PostgreSQL administrado (Neon/Render). **Obligatoria**.
- `JWT_SECRET` — secreto persistente; si se regenera, caducan las sesiones.
- `FRONTEND_URL` / `APP_URL` — origen exacto para CORS.
- `SEED_DEMO_DATA` — dejar **sin definir** en producción (o `0`). Nunca `1`
  salvo que se quiera poblar una BD nueva deliberadamente.
