# Acceso público por Cloudflare (HU-92)

Algunas redes (colegios, empresas y ciertos operadores móviles) bloquean los dominios de DNS dinámico como DuckDNS, y
desde ellas FarmaClick no abre. Un **Worker de Cloudflare** publica el sistema en una dirección `*.workers.dev`, que esas
redes no bloquean, y reenvía cada visita a producción. El dominio actual sigue funcionando igual.

```
Navegador ──https──> farmaclick.<cuenta>.workers.dev (Worker) ──https──> dominio de producción (balanceador → Nginx → API)
```

El Worker agrega dos cabeceras: `X-FarmaClick-IP` (la IP real de quien visita) y `X-FarmaClick-Secreto`. La API solo
cree la IP si el secreto calza con `WORKER_SECRETO` (`backend/src/core/ipCliente.js`). Así el límite de intentos del
login y de la tienda sigue siendo por persona y nadie puede inventar su IP.

## 1. Generar el secreto (una vez)
En Git Bash: `openssl rand -hex 32`. Guárdalo en el gestor de contraseñas del equipo. **No va al repositorio.**

## 2. Crear el Worker
1. Entra a https://dash.cloudflare.com con la cuenta del proyecto > **Workers & Pages** > **Create** > **Create Worker**.
2. Nombre: `farmaclick` > **Deploy** > **Edit code**. Borra el ejemplo, pega `deploy/cloudflare/worker.js` y **Deploy**.
3. **Settings > Variables and Secrets** > **Add**:
   - `ORIGEN` (Text) = la dirección de producción con `https://`, sin `/` al final.
   - `SECRETO` (Secret) = el valor del paso 1.
4. **Deploy** otra vez. La dirección queda en **Settings > Domains & Routes** (`farmaclick.<cuenta>.workers.dev`).

Con Wrangler (opcional): `cd deploy/cloudflare`, completa `ORIGEN` en `wrangler.toml`, `npx wrangler secret put SECRETO` y `npx wrangler deploy`.

## 3. Configurar producción
En la VM de producción, `~/farmaclick/.env`:
```
WORKER_SECRETO=<el mismo valor del paso 1>
PUBLICO_URL=https://farmaclick.<cuenta>.workers.dev
CORS_ORIGIN=https://<dominio-prod>,https://farmaclick.<cuenta>.workers.dev
```
Luego `docker compose up -d` (recrea la API con el `.env` nuevo).

`PUBLICO_URL` pasa a ser la dirección del Worker: es la que llevan los correos de la cuenta de cliente y el regreso desde
Webpay. En Supabase (proyecto **farmaclick-prod**) > **Authentication > URL Configuration**: Site URL = la del Worker y,
en Redirect URLs, agregar `https://farmaclick.<cuenta>.workers.dev/tienda/**`.

## 4. Probar
1. Desde una red que bloquea DuckDNS (por ejemplo, el wifi de la universidad) abre la dirección del Worker: deben cargar
   la tienda (`/tienda`) y el login del personal.
2. `curl -s https://farmaclick.<cuenta>.workers.dev/api/health` → `{"ok":true}`.
3. Límite por persona: 21 intentos de login fallidos seguidos desde un celular deben dar
   "Demasiados intentos"; desde otro equipo, en ese mismo momento, el login debe seguir funcionando.
4. Un pago de prueba con Webpay desde el Worker debe volver a la dirección del Worker, no a la de DuckDNS.

Evidencia para HU-92: captura de la tienda abierta desde la red bloqueada (con la dirección visible) y del punto 3.

## Pruebas automáticas del Worker
Node corre dentro de Docker, así que la prueba se ejecuta en un contenedor de Node 22, desde la raíz del proyecto:

- PowerShell: `docker run --rm -v "${PWD}/deploy/cloudflare:/w" -w /w node:22-alpine node --test worker.test.mjs`
- Git Bash: `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/deploy/cloudflare:/w" -w /w node:22-alpine node --test worker.test.mjs`

Debe terminar con `# fail 0`.

## Si algo falla
| Qué ves | Qué hacer |
|---|---|
| `Worker sin configurar: faltan ORIGEN o SECRETO.` | Revisa las variables del paso 2.3 y vuelve a desplegar |
| Error 1016 o 522 de Cloudflare | `ORIGEN` está mal escrito o producción no responde: abre `ORIGEN` directo en el navegador |
| El límite de intentos bloquea a todos a la vez | `WORKER_SECRETO` no está en el `.env` de la VM o no es igual al `SECRETO` del Worker |
| El correo de la cuenta o el regreso de Webpay lleva a DuckDNS | Falta cambiar `PUBLICO_URL` (paso 3) o las Redirect URLs de Supabase |
