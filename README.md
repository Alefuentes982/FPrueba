# FarmaClick

Sistema de gestión para farmacias (proyecto de título MediFarm × D-Software): abastecimiento, inventario, venta presencial con cuadratura de caja y reportes. La venta en línea (tienda y Webpay) es la etapa siguiente.

- `backend/` — API Node.js 22 + Express sobre PostgreSQL. Un módulo por carpeta en `src/modules/`; lo compartido en `src/core/`.
- `frontend/` — React + Vite + Bootstrap. Misma organización en `src/modules/`.
- `db/` — esquema base, migraciones `001`–`008` e `instalacion_completa.sql` (todo en un archivo; se regenera con `db/generar-instalacion.sh`). `desarrollo.sql` solo se usa en el entorno Docker local.
- `deploy/` y `.github/workflows/` — despliegue en Oracle Cloud (Docker Compose) e integración continua.
- `docs/guia-despliegue.md` — guía paso a paso: Docker local, GitHub, Supabase, Oracle Cloud.

## Desarrollo local con Docker
Requisitos: Docker Desktop y Git. Nada más (no hace falta instalar Node ni PostgreSQL).

```bash
git clone https://github.com/<organizacion>/farmaclick.git && cd farmaclick
docker compose up
```
Abre http://localhost:5173. Usuarios de desarrollo: `admin@farmaclick.local` / `Admin12345` y `vendedor@farmaclick.local` / `Vendedor12345`.
La primera vez se crea la base con el esquema, un catálogo de 90 productos y los usuarios. Para empezar de cero: `docker compose down -v && docker compose up`.
La API queda en http://localhost:3000/api/health y PostgreSQL en `localhost:54329` (usuario `postgres`, clave `postgres`, base `farmaclick`). Las pruebas: `docker compose exec api npm test`.

El login local (`AUTH_MODE=local`) solo existe para desarrollo y la API se niega a arrancar con él en producción. En Supabase la autenticación es la real.

## Módulos
| Módulo | Qué hace | Migración |
|---|---|---|
| Base y acceso | Login con Supabase Auth, sesión, permisos por módulo | — |
| Usuarios y permisos | Personal, roles y matriz de permisos | — |
| Proveedores | CRUD con validación de RUT | — |
| Productos | CRUD, margen, precio calculado por la base, proveedores por producto | — |
| Órdenes de compra | Borrador → emitida → recepción total o parcial (lotes, kardex, PMP), PDF | 001 |
| Inventario | Stock por sucursal, lotes y vencimientos, kardex, ajustes y mermas | 002 |
| Pedidos | Núcleo de venta de todos los canales: reserva FEFO, pago dividido, estados, comprobante | 003 |
| Caja y venta presencial | Turnos, venta en mostrador, cierre ciego | — |
| Devoluciones | Reembolso prorrateado, reingreso opcional de stock, comprobante | 004, 006 |
| Cuadratura de caja | Historial de turnos, revisión por supervisión, Cierre Z / reporte X | 005 |
| Dashboard y reportes | Ventas, inventario y compras con exportación CSV y PDF | — |
| Jefe de local | Rol con permisos de operación y supervisión de caja | 007 |

Cada módulo se registra en `backend/src/modules/index.js` y `frontend/src/modules/index.js`; sumar uno es crear su carpeta y agregarlo ahí. Los permisos se leen de la base en cada request.

## Flujo de trabajo en equipo
- `main` = producción, `develop` = dev/staging, `feature/<nombre>` = cada funcionalidad. Se trabaja en una rama `feature/*`, se abre un Pull Request hacia `develop` y se fusiona cuando pasa la integración continua.
- Al fusionar en `develop` se construyen las imágenes `dev` y se despliegan solas en la VM de dev. Un Pull Request de `develop` hacia `main` publica y despliega producción (pide aprobación).
- Cualquier cambio de base de datos va en una migración nueva en `db/migraciones/` (idempotente); luego `./db/generar-instalacion.sh`.

## Despliegue
GitHub Actions (`ci.yml`): pruebas del backend, esquema SQL aplicado sobre PostgreSQL 16 limpio, compilación del frontend, imágenes `linux/arm64` hacia GitHub Container Registry y despliegue por SSH a la VM de Oracle Cloud del entorno. `mantener-activo.yml` consulta `/api/health/db` cada 3 días para que Supabase (plan gratuito) no pause el proyecto. Detalle y configuración en `docs/guia-despliegue.md`.

## Variables de entorno
Backend: `backend/.env.example`. Producción: `deploy/.env.example` (se copia como `.env` en cada VM, nunca a Git). La clave `SUPABASE_SERVICE_ROLE_KEY` solo vive en el backend.
