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

## Módulos
Cada módulo se entrega por separado (ver `docs/entrega-github.md`) y se registra en `backend/src/modules/index.js` y `frontend/src/modules/index.js`.

- **Base y acceso** — login con Supabase Auth, sesión, permisos por módulo (`rol_permiso`), registro de módulos. <!-- parte:0 -->

## Acceso y permisos
Login con Supabase Auth (correo y contraseña); cada cuenta tiene una fila en `usuario` con el mismo id. Cada módulo declara la clave de permiso que exige (tabla `modulo`) y los permisos se leen en cada request, así que quitar uno rige de inmediato. Los módulos con `publico: true` no exigen sesión (login hoy; tienda en línea más adelante).

## API (prefijo /api)
- `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`; el resto exige `Authorization: Bearer <token>`. `GET /catalogos`: listas de apoyo que aporta cada módulo. <!-- parte:0 -->
