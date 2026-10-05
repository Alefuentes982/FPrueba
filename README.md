# FarmaClick

Sistema de gestión para farmacias (proyecto de título MediFarm × D-Software): abastecimiento, inventario, venta presencial con cuadratura de caja, reportes y, más adelante, venta en línea.

- `backend/` — API Node.js + Express sobre PostgreSQL (Supabase). Organizada por módulos en `src/modules/`; lo compartido está en `src/core/`.
- `frontend/` — React + Vite + Bootstrap. Misma organización: `src/modules/<módulo>/`.
- `db/` — esquema base (`farmaclick_postgresql_completo.sql`) y migraciones numeradas (`db/migraciones/`).
- `docs/` — hoja de ruta por módulos y guía de entrega a GitHub.

## Modo local (sin Supabase)
No requiere instalar Postgres ni cuenta de Supabase. En tres terminales:
1. `cd backend && npm install && npm run dev:db` — PostgreSQL embebido con el esquema de `db/`, datos de ejemplo (`backend/scripts/seeds/`) y un admin (`admin@farmaclick.local` / `Admin12345`). Los datos persisten en `backend/.pgdata`.
2. `cd backend && npm run dev:local` — API en :3000 con login de desarrollo (`AUTH_MODE=local`; solo desarrollo, se niega a arrancar con `NODE_ENV=production`).
3. `cd frontend && npm install && npm run dev` — http://localhost:5173.

Limitación: no hay pg_cron, así que no corren los jobs de expiración de reservas ni de baja de vencidos.

## Puesta en marcha (Supabase)
1. En Supabase ejecutar `db/farmaclick_postgresql_completo.sql` y luego `ALTER ROLE app_backend LOGIN PASSWORD '<secreto>';`.
2. `cd backend && cp .env.example .env` y completar `DATABASE_URL` (pooler, usuario `app_backend.<project-ref>`) y las claves de Supabase Auth (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). La service role key solo vive en el backend.
3. `npm install`, crear el primer administrador con `npm run crear-admin -- correo@dominio.cl "Contraseña" "Nombre"` y `npm run dev` (API en :3000). Pruebas: `npm test`.
4. `cd frontend && npm install && npm run dev` (http://localhost:5173, proxy de `/api` al backend).
5. Ejecutar a mano, en el editor SQL y en orden, las migraciones de `db/migraciones/` que correspondan a los módulos desplegados. <!-- parte:4 -->

## Módulos
Cada módulo se entrega por separado (ver `docs/entrega-github.md`) y se registra en `backend/src/modules/index.js` y `frontend/src/modules/index.js`.

- **Base y acceso** — login con Supabase Auth, sesión, permisos por módulo (`rol_permiso`), registro de módulos. <!-- parte:0 -->
- **Usuarios y permisos** — alta y edición de personal, matriz de roles y permisos. <!-- parte:1 -->
- **Proveedores** — CRUD con validación de RUT. <!-- parte:2 -->
- **Productos** — CRUD, margen y precio calculado por la base, proveedores por producto. <!-- parte:3 -->
- **Órdenes de compra** — borrador → emitida → recepción total o parcial (lotes, kardex, PMP), número correlativo, PDF, filtro por fechas. Migración `001`. <!-- parte:4 -->
- **Inventario** — stock por sucursal con alerta de stock mínimo, lotes y vencimientos (baja de vencidos), kardex con filtros y ajustes/mermas con motivo obligatorio. Migración `002`. <!-- parte:5 -->
- **Pedidos** — núcleo de venta compartido por todos los canales: pedido con número correlativo (PED-000123), precio y descuentos por cantidad fijados por la base, reserva de stock FEFO, pago dividido en varios medios, avance de estados, cancelación y expiración de pagos pendientes, comprobante PDF. Hoy se crean pedidos a distancia (canal Online) desde el backoffice; la caja (parte 7) y la tienda (parte 11) usan el mismo servicio (`modules/pedidos/servicio.js`). Migración `003`. <!-- parte:6 -->
- **Caja y venta presencial** — apertura de turno con efectivo inicial, venta en el mostrador (buscador por SKU o nombre con lector de código, carrito, descuentos por cantidad, pago dividido con vuelto), comprobante, ventas del turno y cierre ciego con la diferencia de caja. Una sola operación crea el pedido, reserva el stock, cobra y entrega; si algo falla no queda nada a medias. Configuración de cajas para administradores. Sin migración. <!-- parte:7 -->
- **Devoluciones** — devolución de productos de un pedido entregado (hasta 30 días, configurable con `DEVOLUCION_MAX_DIAS`): reembolso prorrateado con el descuento de la compra, devuelto por los mismos medios con que se pagó y sin exceder lo pagado por cada uno; reingreso opcional de stock al lote de origen (por defecto no se reingresa); el efectivo sale de la caja del turno y se descuenta en el cierre. Registros inmutables con totales verificados por la base, comprobante PDF y permiso propio (`devoluciones`: Administrador y Vendedor, ajustable en Roles y permisos). Migración `004`. <!-- parte:8 -->
- **Cuadratura de caja** — historial de turnos con indicadores del período (ventas netas, diferencia neta, faltantes y sobrantes, pendientes de revisión), filtros por estado, sucursal, cajero y fechas, desglose por medio de pago y por cajero, ficha del turno con el cuadre del efectivo (inicial + ventas − devoluciones = esperado vs. contado), revisión conforme u observada por otra persona (con permiso de administración; nadie revisa su propio turno) y PDF de Cierre Z (turno cerrado) o reporte X (abierto). Quien administra ve todo; el cajero solo sus turnos y sin el esperado de un turno abierto. En la caja, ayuda para contar por denominación. Migración `005`. <!-- parte:9 -->
- **Dashboard y reportes** — portada de solo lectura con indicadores del período (ventas netas de devoluciones, ticket promedio, unidades, devoluciones) y tres pestañas: **Ventas** (serie diaria con gráfico, por canal, medio de pago, categoría y sucursal, los 10 productos más vendidos), **Inventario** (valor al costo, stock bajo el mínimo, lotes por vencer o vencidos, valorizado por sucursal y categoría) y **Compras** (por proveedor, órdenes por recibir con días de atraso). Filtros por rango de fechas y sucursal; cada informe se exporta a CSV (para Excel) y PDF. Inventario y Compras se ven solo con el permiso de ese módulo. Otros módulos agregan tarjetas con el slot `dashboard.tarjetas` (hoy, la de Caja de Cuadratura). Sin migración. <!-- parte:10 -->
- **Redondeo del efectivo (Ley 20.956)** — el efectivo se cobra y se devuelve redondeado al múltiplo de $10 más cercano (terminaciones 1 a 4 bajan, 5 a 9 suben); tarjetas y transferencias van por el monto exacto. El total del pedido no cambia: la diferencia queda en `pedido.redondeo` y `devolucion.redondeo`, se ve en la caja, en los comprobantes y en la cuadratura, y el cierre de caja usa el efectivo realmente recibido. El efectivo devuelto nunca pasa de lo que el cliente pagó en efectivo. Migración `006`. <!-- ajustes:1 -->
- **Ajustes tras las pruebas** — botón Imprimir (junto a Ver y Descargar) en los comprobantes de venta, pedido y devolución; estado actual de la orden de compra en su PDF (con lo recibido por línea y un sello cuando ya hubo recepción); buscador por SKU o nombre al registrar ajustes de inventario. <!-- ajustes:1 -->

## Datos de prueba
`db/datos-prueba/` trae 90 productos de ejemplo con 6 proveedores ficticios y stock inicial en Casa Matriz (San Bernardo), para probar el sistema. Se carga con un SQL idempotente (editor SQL de Supabase o `npm run datos-prueba:local`) y se puede reemplazar por otro catálogo editando los CSV (`npm run datos-prueba`). Ver `db/datos-prueba/README.md`.

## Acceso y permisos
Login con Supabase Auth (correo y contraseña); cada cuenta tiene una fila en `usuario` con el mismo id. Cada módulo declara la clave de permiso que exige (tabla `modulo`) y los permisos se leen en cada request, así que quitar uno rige de inmediato. Los módulos con `publico: true` no exigen sesión (login hoy; tienda en línea más adelante).

## API (prefijo /api)
- `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`; el resto exige `Authorization: Bearer <token>`. `GET /catalogos`: listas de apoyo que aporta cada módulo. <!-- parte:0 -->
- `/usuarios` (GET, GET :id, POST, PUT :id), `/roles` (GET, PUT :id/permisos). <!-- parte:1 -->
- `/proveedores` (GET, GET :id, POST, PUT :id). <!-- parte:2 -->
- `/productos` (GET, GET :id, GET proveedor/:proveedorId, POST, PUT :id, PATCH :id/activo, PUT :id/proveedores). <!-- parte:3 -->
- `/ordenes-compra` (GET, GET :id, POST, PUT :id, POST :id/emitir, POST :id/cancelar, POST :id/recibir, GET :id/pdf). Los listados aceptan `desde` y `hasta` (AAAA-MM-DD, días de Chile). El PDF llega como JSON con base64 (los gestores de descarga como IDM interceptan `application/pdf`). Datos de la empresa en el PDF: `EMPRESA_NOMBRE`, `EMPRESA_RUT`, `EMPRESA_DIRECCION`. <!-- parte:4 -->
- `/inventario/stock` (GET, PUT minimo), `/inventario/lotes` (GET, POST :id/baja-vencido, POST bajas-vencidos), `/inventario/kardex` (GET con filtros y rango de fechas), `/inventario/ajustes` (POST: ajuste positivo, ajuste negativo, merma). El kardex es inmutable: una corrección es un ajuste en sentido contrario. <!-- parte:5 -->
- `/pedidos` (GET con filtros y fechas, GET catalogo, GET :id, POST, PUT :id, POST :id/reservar, :id/pagos, :id/estado, :id/cancelar, POST expirar-pendientes, GET :id/pdf). Ciclo: Pago pendiente → Pagado → En preparación → Listo para retiro o En despacho → Entregado; se cancela hasta "Listo para retiro". Un pedido sin pagar expira a los 20 minutos: en Supabase lo hace el job de pg_cron, en modo local el botón "Expirar pendientes". <!-- parte:6 -->
- `/pos` (GET turno, POST turnos, POST turnos/:id/cerrar, GET turno/ventas, GET productos, POST cotizar, POST ventas, GET ventas/:id/pdf, GET/POST cajas, PATCH cajas/:id). Exige el permiso `pos`; crear o desactivar cajas, además, el de administración de usuarios. Un turno abierto por usuario y por caja; solo quien lo abrió lo cierra. El monto en efectivo de `pagos` se informa ya redondeado (Ley 20.956); el servidor rechaza otro valor y explica cuál corresponde. <!-- parte:7 -->
- `/devoluciones` (GET con filtros y fechas, GET buscar-pedidos, GET pedido/:id, POST cotizar, POST, GET :id, GET :id/pdf). Exige el permiso `devoluciones`. Una devolución en efectivo exige turno de caja abierto; el cierre (`fn_cierre_esperado_efectivo`) descuenta el efectivo devuelto. <!-- parte:8 -->
- `/cuadratura` (GET turnos con filtros y fechas, GET resumen, GET turnos/:id, POST turnos/:id/revision, GET turnos/:id/pdf). Exige el permiso `cuadratura`; revisar turnos, además, el de administración de usuarios. <!-- parte:9 -->
- `/dashboard` (GET resumen, GET informes, GET informes/:id, GET informes/:id/exportar?formato=csv|pdf). Exige el permiso `dashboard`; los informes de inventario y de compras, además, `inventario` y `proveedores`. Filtros: `desde`, `hasta` (hasta 2 años), `sucursal_id`; `dias` (lotes por vencer) y `limite`. Solo lectura. La exportación llega como JSON con base64, igual que los PDF. <!-- parte:10 -->
