# Entrega a GitHub por módulos

El repositorio se sube por partes, una por módulo (ver `hoja-de-ruta.md`). El historial ya viene dividido: cada parte es un commit y tiene su rama y su etiqueta.

| Parte | Rama | Etiqueta |
|---|---|---|
| 0 Base y acceso | `parte/0-base` | `parte-0` |
| 1 Usuarios y permisos | `parte/1-usuarios` | `parte-1` |
| 2 Proveedores | `parte/2-proveedores` | `parte-2` |
| 3 Productos | `parte/3-productos` | `parte-3` |
| 4 Órdenes de compra | `parte/4-ordenes-compra` | `parte-4` |
| 5 Inventario | `parte/5-inventario` | `parte-5` |
| 6 Pedidos | `parte/6-pedidos` | `parte-6` |
| 7 Caja y venta presencial | `parte/7-pos` | `parte-7` |
| 8 Devoluciones | `parte/8-devoluciones` | `parte-8` |
| 9 Cuadratura de caja | `parte/9-cuadratura` | `parte-9` |

Cada rama contiene las anteriores, así que un Pull Request de `parte/N` hacia `main` muestra solo lo de ese módulo.

## Subir la primera parte
```bash
git remote add origin https://github.com/<usuario>/<repositorio>.git
git push origin parte/0-base:main
```

## Subir cada parte siguiente (con Pull Request)
```bash
git push origin parte/1-usuarios
# En GitHub: abrir un Pull Request de parte/1-usuarios hacia main y fusionarlo.
git fetch origin && git checkout main && git pull
```
Para subirla directo, sin Pull Request: `git push origin parte/1-usuarios:main`.

`main` local contiene todas las partes; no lo suba hasta terminar. Para la parte siguiente se trabaja en una rama nueva a partir de la última parte entregada.

## Reglas del repositorio
- Nunca subir `.env` ni las claves de Supabase (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`). `.env.example` y `.env.local` solo contienen valores de ejemplo y de desarrollo local.
- Un módulo nuevo = su carpeta en `backend/src/modules/` y `frontend/src/modules/`, una línea en cada registro (`modules/index.js`), su migración numerada en `db/migraciones/` si cambia el esquema, y su línea en el README.
- Mensajes de commit: `feat(modulo): …`, `fix(modulo): …`, `docs: …`.
- Al agregar una parte, ejecutar antes `npm test` (backend) y `npm run build` (frontend).
