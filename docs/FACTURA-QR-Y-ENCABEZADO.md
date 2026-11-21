# Factura de cobro QR y encabezado corporativo

## Problema corregido

Al realizar un cobro con QR y descargar la factura, el PDF salía con **letras desordenadas y sobrepuestas**.

Causa: el generador usaba posiciones relativas incorrectas después de dibujar texto con coordenadas explícitas (`doc.y - 42`, `doc.y + 3`, `doc.y + 2`) y una tabla con `currentY` manual sin saltos de página. Con varios productos, las líneas se apilaban y salían del papel.

## Solución

La factura ahora usa el mismo patrón que las cotizaciones profesionales:

- Encabezado con logo en la esquina superior izquierda y texto corporativo a la derecha, sin superposición.
- Altura de los bloques calculada con `heightOfString` (nada de offsets manuales sobre `doc.y`).
- Tabla con columnas con ancho definido, altura por fila y **salto automático de página**.
- Totales, IVA estimado, nota SIFEN, firma y numeración de página en cada hoja.
- Generación en buffer antes de responder, con firma `%PDF` y `Content-Length`.

El generador de órdenes de trabajo tenía el mismo defecto en el bloque de datos del cliente; también quedó corregido.

## Encabezado actual

El bloque anterior:

```
RUC: 80099887-1 · Timbrado Electrónico: 16548920
Seguridad Electrónica, Climatización y Telecomunicaciones
WhatsApp: +591 64595762 · Asunción, Paraguay
```

fue reemplazado por:

```
SYSTEMHOME S.A.
Yacuiba, Bolivia
```

El WhatsApp se conserva en el pie del documento. El cambio aplica a **cotizaciones, facturas, órdenes de trabajo**, al modal de factura del módulo de ventas y a la información de la empresa del panel.

## Descarga

- Ruta: `GET /api/invoices/:id/pdf` (acepta `?download=1` para forzar descarga).
- JWT por cabecera `Authorization` o por `?token=` (los navegadores no envían cabeceras en descargas).
- Un cliente solo puede descargar sus propias facturas; los roles internos pueden ver todas.

## Verificación

Nueva suite de regresión: `npm run test:invoice`

Comprueba cobros QR de 1 y 25 ítems: HTTP 200, firma `%PDF`, 1 y 2 páginas, encabezado `SYSTEMHOME`, texto `Yacuiba, Bolivia`, ausencia de `Asunción`/RUC/Timbrado, último ítem presente, total, SIFEN y **cero posiciones de texto duplicadas**.

Todas las suites: `npm run test:all` (unitarias, API, no-borrado, PDF de cotización y PDF de factura).

Commit: `10246fd` — `fix: factura QR sin texto superpuesto y encabezado Yacuiba Bolivia`.
