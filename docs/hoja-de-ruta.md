# Hoja de ruta por módulos

Orden de construcción y entrega según dependencias. Cada parte debe funcionar por sí sola sobre las anteriores e incluir su migración (si la necesita), sus pruebas y su línea en el README.

| # | Módulo | Qué incluye | Depende de |
|---|---|---|---|
| 0 | Base y acceso | estructura, esquema, login, sesión, permisos por módulo, registro de módulos | — |
| 1 | Usuarios y permisos | personal, roles, matriz de permisos | 0 |
| 2 | Proveedores | CRUD con RUT validado | 1 |
| 3 | Productos | CRUD, margen/precio, proveedores por producto | 1, 2 |
| 4 | Órdenes de compra | borrador → emitida → recepción, PDF, correlativo, filtro de fechas | 2, 3 |
| 5 | Inventario | stock por sucursal, lotes, kardex, vencimientos, mermas y ajustes | 3, 4 |
| 6 | Pedidos | núcleo de venta compartido: pedido, líneas, reserva FEFO, pagos, estados | 3, 5 |
| 7 | Caja y venta presencial | apertura de turno, venta al público (POS), pago en efectivo y tarjeta, comprobante | 6 |
| 8 | Devoluciones | devolución de productos de un pedido entregado: reembolso por los medios de pago originales, reingreso opcional de stock, descuenta el efectivo en el cierre de caja, comprobante PDF | 6, 7 |
| 9 | Cuadratura de caja | historial de turnos, desglose por medio de pago, diferencias y Cierre Z en PDF (el cierre básico ya está en la parte 7) | 7, 8 |
| 10 | Dashboards y reportes | indicadores, ventas netas de devoluciones, inventario, compras, caja; exportación a CSV y PDF | 4 a 9 |
| 11 | E-commerce (futuro) | catálogo web, carrito, pago en línea, despacho o retiro | 6 y la API pública |

## Cómo se prepara la venta en línea desde ahora
La venta presencial y la web comparten el mismo modelo (`pedido`, `detalle_pedido`, `transaccion_pago`, `canal_venta`); solo cambian el canal y las reglas:

- **Un solo núcleo de venta (parte 6).** Presencial y web crean pedidos con el mismo servicio. El canal `Presencial` exige turno de caja abierto; el canal `Online` no.
- **Stock con las mismas reglas.** Reserva FEFO (`fn_reservar_pedido`), liberación y vencimientos las resuelve la base; el módulo de inventario no sabe de canales.
- **API pública separada.** El registro de módulos admite `publico: true`; la tienda será un módulo con sus rutas bajo `/api/tienda`, sin mezclarse con el backoffice. El catálogo sale de `vw_catalogo_web`.
- **Pagos.** `transaccion_pago` ya prevé pasarela y medio de pago; la caja usa efectivo y tarjeta, la web usará la pasarela.
- **Documentos.** `core/documentos` (PDF y numeración correlativa) sirve para órdenes de compra, comprobantes de venta y reportes.

## Dashboards y reportes (parte 10)
- Solo lectura: consultas y vistas SQL; el backend ya tiene SELECT sobre las tablas necesarias.
- Permiso `dashboard` (ya existe en la tabla `modulo`).
- Filtros por rango de días con `core/fechas` y `FiltroFechas`, igual que los listados.
- Exportación con `core/documentos` (PDF) y CSV.
- Los módulos pueden aportar tarjetas al dashboard mediante los puntos de extensión del frontend (`Slot`), sin que el dashboard los importe.
- Cada informe se define una vez (`backend/src/modules/dashboard/informes.js`: consulta, columnas, permiso) y de ahí salen la tabla de la pantalla, el CSV y el PDF. Agregar un informe es sumar una entrada a ese catálogo.
- Una venta es un pedido pagado en adelante (no cuenta pendiente, cancelado ni expirado); las devoluciones se restan en el día en que se hicieron.
