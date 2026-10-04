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

## Acceso y permisos
Login con Supabase Auth (correo y contraseña); cada cuenta tiene una fila en `usuario` con el mismo id. Cada módulo declara la clave de permiso que exige (tabla `modulo`) y los permisos se leen en cada request, así que quitar uno rige de inmediato. Los módulos con `publico: true` no exigen sesión (login hoy; tienda en línea más adelante).

## API (prefijo /api)
- `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`; el resto exige `Authorization: Bearer <token>`. `GET /catalogos`: listas de apoyo que aporta cada módulo. <!-- parte:0 -->
- `/usuarios` (GET, GET :id, POST, PUT :id), `/roles` (GET, PUT :id/permisos). <!-- parte:1 -->
- `/proveedores` (GET, GET :id, POST, PUT :id). <!-- parte:2 -->
- `/productos` (GET, GET :id, GET proveedor/:proveedorId, POST, PUT :id, PATCH :id/activo, PUT :id/proveedores). <!-- parte:3 -->
- `/ordenes-compra` (GET, GET :id, POST, PUT :id, POST :id/emitir, POST :id/cancelar, POST :id/recibir, GET :id/pdf). Los listados aceptan `desde` y `hasta` (AAAA-MM-DD, días de Chile). El PDF llega como JSON con base64 (los gestores de descarga como IDM interceptan `application/pdf`). Datos de la empresa en el PDF: `EMPRESA_NOMBRE`, `EMPRESA_RUT`, `EMPRESA_DIRECCION`. <!-- parte:4 -->
