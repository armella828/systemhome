# Catálogo de productos en PDF

## Botón de descarga

Se agregó **📄 Descargar PDF** en dos lugares:

1. **Portal del cliente** → catálogo: descarga el catálogo completo o solo la categoría activa del filtro.
2. **Administración** → Inventario y Catálogo: descarga el catálogo completo de los productos publicados.

El botón usa `DB.fetchCatalogPdf(category, true)`, valida la firma `%PDF` y descarga el archivo con el nombre que devuelve el servidor (por ejemplo `catalogo-systemhome-camaras.pdf`).

## Endpoint

`GET /api/catalog/pdf` — público, igual que `GET /api/catalog`.

| Parámetro | Uso |
|---|---|
| `category=all` (por defecto) | Todos los productos publicados |
| `category=camaras` | Solo esa categoría (`camaras`, `alarmas`, `dvr_nvr`, `ac`, `cercas`, `videoporteros`, `control_acceso`, `redes`, `cableado`, `accesorios`, `otro`, etc.) |
| `download=1` | Fuerza descarga (`Content-Disposition: attachment`) |

Ejemplo:

```
https://systemhome-backend.onrender.com/api/catalog/pdf?category=camaras&download=1
```

## Generación

- Encabezado corporativo con logo en la esquina superior izquierda y **`Yacuiba, Bolivia`**.
- Pie con WhatsApp `+591 64595762`, `Yacuiba, Bolivia` y numeración de página.
- Precios en **Bs.**, disponibilidad y stock por producto.
- Fotos data URL guardadas en la BD; también se leen archivos locales de `backend/uploads`. **No se descargan imágenes externas**: el PDF siempre se genera aunque no haya Internet.
- Paginación automática: filas con altura calculada con `heightOfString`, sin texto superpuesto (17 productos de prueba → 3 páginas).

## Verificación

Nueva suite: `npm run test:catalog`.

Comprueba: endpoint público, HTTP 200, `Content-Type: application/pdf`, firma `%PDF`, título, `Yacuiba, Bolivia`, ausencia de `Asunción`/RUC/Timbrado, precios `Bs.`, primer y último producto, **3 páginas** con 17 productos, filtro `?category=camaras`, productos de otras categorías ausentes y **0 posiciones de texto duplicadas**.

Todas las suites: `npm run test:all` (unitarias, API, no-borrado, PDF cotización, PDF factura y PDF catálogo).
