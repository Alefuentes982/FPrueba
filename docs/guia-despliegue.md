# Guía de despliegue paso a paso

Del computador de cada desarrollador (Docker) a GitHub, y de GitHub a Oracle Cloud (aplicación) y Supabase (base de datos y autenticación).

```
 Desarrollador ──docker compose──► prueba local
      │ git push (rama feature/*) ──► Pull Request ──► develop ──► GitHub Actions ──► imagen en GHCR ──► VM dev  ──► Supabase dev
      │                                                  │
      └──────────────────────────  Pull Request develop ► main ──► (aprobación) ──► VM prod ─► Balanceador (HTTPS) ──► Supabase prod
```

| Entorno | Rama | Aplicación | Base de datos |
|---|---|---|---|
| Local | cualquiera | `docker compose up` en cada PC | PostgreSQL en Docker |
| Dev / staging | `develop` | VM `farmaclick-dev` de Oracle Cloud, por IP, HTTP | proyecto Supabase `farmaclick-dev` |
| Producción | `main` | VM `farmaclick-prod` detrás de un balanceador con HTTPS y dominio | proyecto Supabase `farmaclick-prod` |

**Orden recomendado:** A (equipo y herramientas) → B (Docker local) → C (Supabase) → D (Oracle Cloud) → E (GitHub) → F (primer despliegue) → G (demostración). Reserva una tarde completa: lo más lento es esperar la creación de las VM y el primer build de las imágenes.

---

## A. Antes de empezar

**Cuentas** (una persona crea las compartidas y agrega a las otras como colaboradoras):
- GitHub: cuenta de cada integrante. El repositorio lo crea una persona (Alejandro, por ejemplo) y agrega a Víctor y Robert como colaboradores.
- Supabase (supabase.com): una cuenta, con los dos proyectos dentro.
- Oracle Cloud (cuenta del programa Oracle Academy): región de origen Santiago.
- DuckDNS (duckdns.org): dominio gratuito para producción. Se entra con la cuenta de GitHub.

**En cada PC:** Git, Docker Desktop (en Windows con WSL 2) y un editor. Nada de Node ni PostgreSQL: todo corre en contenedores. En Windows, ejecuta `git config --global core.autocrlf true` antes de clonar (el repositorio ya trae `.gitattributes` para que los scripts de Linux no se rompan).

**Una sola vez, en el PC de quien arma el repositorio:** una llave SSH exclusiva para desplegar (no la personal):
```bash
ssh-keygen -t ed25519 -f farmaclick_deploy -N "" -C "github-actions-farmaclick"
```
Genera `farmaclick_deploy` (privada, va a GitHub) y `farmaclick_deploy.pub` (pública, va a las VM). No la subas al repositorio.

---

## B. Docker local (los tres desarrolladores)

1. Clona el repositorio y entra: `git clone https://github.com/<usuario>/farmaclick.git && cd farmaclick`.
2. Levanta todo: `docker compose up`. La primera vez tarda varios minutos: descarga imágenes, crea la base con el esquema, un catálogo de 90 productos y los usuarios, e instala dependencias.
3. Espera a ver `FarmaClick API escuchando en http://localhost:3000` y la línea `Local: http://localhost:5173`.
4. Abre http://localhost:5173 e ingresa con `admin@farmaclick.local` / `Admin12345` (o `vendedor@farmaclick.local` / `Vendedor12345`).
5. Comprobaciones útiles:
   - http://localhost:3000/api/health → `{"ok":true}`; http://localhost:3000/api/health/db → `{"ok":true}`.
   - Pruebas automáticas: `docker compose exec api npm test`.
   - Empezar de cero (borra los datos locales): `docker compose down -v && docker compose up`.
   - Si en Windows la API no recarga al guardar: `docker compose restart api`.

Esto es lo que la comisión debe ver: los tres integrantes trabajan con el mismo entorno Docker, sin instalar nada más.

---

## C. Supabase (base de datos y autenticación)

Repite todo para **dos proyectos**: `farmaclick-dev` y `farmaclick-prod`. Plan gratuito permite dos.

### C.1 Crear el proyecto
1. En supabase.com: **New project**. Nombre `farmaclick-dev`, región **South America (São Paulo)**, y una contraseña de base de datos **sin símbolos raros** (solo letras y números, largo; así no hay que escaparla en la URL). Guárdala en un gestor de contraseñas.
2. Espera a que el proyecto termine de crearse (1–2 minutos).

### C.2 Activar pg_cron (antes de cargar el SQL)
**Database → Extensions →** busca `pg_cron` y actívala. Sirve para liberar reservas vencidas y dar de baja lotes vencidos. (Si se te olvida, no pasa nada: se programa después en el paso C.4.)

### C.3 Cargar el esquema
1. **SQL Editor → New query**. Abre en tu PC `db/instalacion_completa.sql`, copia todo y pégalo; **Run**. Debe terminar con *Success*.
   - Si el editor se queja del tamaño, usa la alternativa con psql del recuadro de abajo.
2. En otra consulta, define la contraseña del rol de la API (distinta a la de la base y también sin símbolos raros):
   ```sql
   ALTER ROLE app_backend LOGIN PASSWORD 'ClaveLarga123Solo-Letras';
   ```
3. Solo en `farmaclick-dev`, para tener un catálogo de ejemplo, ejecuta también `db/datos-prueba/datos-prueba.sql`. En producción es opcional (útil para la demostración: 90 productos y stock).

> **Alternativa con psql** (si tienes psql instalado): en **Connect → Session pooler** copia la cadena de conexión y ejecuta `psql "<cadena>" -f db/instalacion_completa.sql`.

### C.4 Programar los jobs
Si pg_cron está activa, ejecuta en el SQL Editor: `SELECT fn_programar_jobs();`. Verifica con `SELECT jobname FROM cron.job;` (aparecen los dos jobs).

### C.5 Anotar los datos de conexión
1. **Connect → Transaction pooler**: copia la URL. Se ve así: `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-…-sa-east-1.pooler.supabase.com:6543/postgres`. Cámbiala para usar el rol de la API:
   - usuario: `app_backend.<ref>` (no `postgres.<ref>`)
   - contraseña: la del `ALTER ROLE`
   Queda: `postgresql://app_backend.<ref>:ClaveLarga123@aws-…-sa-east-1.pooler.supabase.com:6543/postgres`. Esta es tu `DATABASE_URL`.
2. **Project Settings → API Keys**: anota la URL del proyecto (`https://<ref>.supabase.co`), la clave pública (*publishable*, o *anon* en proyectos antiguos) y la clave secreta (*secret*, o *service_role*). Los nombres de variable son `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`; sirven ambos formatos. La clave secreta nunca va a GitHub ni al frontend: solo al `.env` de la VM.
3. **Authentication → Sign In / Providers**: desactiva *Allow new users to sign up* (las cuentas las crea el administrador desde el sistema).

Repite C.1–C.5 con `farmaclick-prod`. Al terminar tienes dos juegos de datos: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, uno por entorno.

> **Plan gratuito:** un proyecto sin actividad por 7 días se pausa, y no tiene respaldos automáticos. El flujo `mantener-activo` (paso E.5) lo consulta cada 3 días para evitarlo.

---

## D. Oracle Cloud

### D.1 Ingresar y revisar los límites
1. Ingresa a cloud.oracle.com con la cuenta del programa, **región Chile (Santiago)**.
2. Menú ☰ → **Governance & Administration → Limits, Quotas and Usage**, servicio *Compute*, filtro de *Ampere*: confirma cuántos OCPU y GB de memoria A1 tienes disponibles. Este plan asume **2 VM de 1 OCPU y 6 GB**; si tu cuenta muestra más, puedes subir el tamaño, pero no es necesario.

### D.2 Red
1. ☰ → **Networking → Virtual cloud networks → Actions → Start VCN Wizard → Create VCN with Internet Connectivity**. Nombre `vcn-farmaclick`, CIDR `10.0.0.0/16`. Crea una subred pública y una privada; usaremos solo la pública.
2. Abre la subred pública → su *Security List* por defecto → **Add Ingress Rules**: origen `0.0.0.0/0`, TCP, puerto destino `443` (para el balanceador). Verifica que ya exista la regla del puerto `22` (SSH).
3. **Network Security Groups** (en la VCN → *Network security groups → Create*):
   - `nsg-dev`: regla de entrada, origen `0.0.0.0/0`, TCP, puerto `80`.
   - `nsg-prod`: regla de entrada, origen `10.0.0.0/16` (solo el balanceador, dentro de la VCN), TCP, puerto `80`.

### D.3 Crear las dos VM
**Compute → Instances → Create instance** (dos veces):
- Nombre: `farmaclick-dev` y `farmaclick-prod`.
- Imagen: **Canonical Ubuntu 24.04** (la versión *aarch64*/Arm). Forma: **Ampere → VM.Standard.A1.Flex**, 1 OCPU, 6 GB.
- Red: tu VCN, **subred pública**, *Assign a public IPv4 address* activado, y en *Network security groups* selecciona `nsg-dev` o `nsg-prod` según la VM.
- Llaves SSH: **Paste public keys** y pega el contenido de `farmaclick_deploy.pub`. Así se entra con `ssh -i farmaclick_deploy ubuntu@<IP>`.
- Volumen de arranque: el mínimo (≈50 GB).
- Si aparece *Out of host capacity*: prueba otro *Availability domain* o reintenta más tarde (es normal en A1).

Anota la IP pública de cada VM.

### D.4 Preparar cada VM
Desde tu PC, en la carpeta del repositorio (hazlo para dev y prod):
```bash
scp -i farmaclick_deploy deploy/preparar-vm.sh ubuntu@<IP-VM>:
ssh -i farmaclick_deploy ubuntu@<IP-VM> "bash preparar-vm.sh"
```
Instala Docker, abre el puerto 80 en el firewall de Ubuntu y crea `~/farmaclick`. Si es la primera vez en tu PC, SSH pregunta por la huella: responde `yes`.

### D.5 Archivo `.env` de cada VM
Entra por SSH (`ssh -i farmaclick_deploy ubuntu@<IP>`), y crea el archivo:
```bash
cd ~/farmaclick && nano .env && chmod 600 .env
```
Copia el contenido de `deploy/.env.example` y complétalo:

| Variable | Dev | Prod |
|---|---|---|
| `GHCR_OWNER` | usuario u organización de GitHub **en minúsculas** | igual |
| `IMAGE_TAG` | `dev` | `prod` |
| `DATABASE_URL`, `SUPABASE_*` | del proyecto `farmaclick-dev` | del proyecto `farmaclick-prod` |
| `TRUST_PROXY` | `1` (no hay balanceador) | `2` |
| `CORS_ORIGIN` | `http://<IP-VM-dev>` | `https://<dominio-duckdns>` |
| `EMPRESA_*` | datos de MediFarm (aparecen en los PDF) | igual |

### D.6 Dominio, certificado y balanceador (solo producción)
1. **Dominio.** En duckdns.org crea un subdominio, por ejemplo `farmaclick-medifarm` (queda `farmaclick-medifarm.duckdns.org`). Aún no pongas la IP; falta el balanceador.
2. **Balanceador.** ☰ → **Networking → Load balancers → Create load balancer** → *Load balancer*:
   - Visibilidad: pública. Forma: **Flexible**, ancho de banda mínimo y máximo **10 Mbps** (es el que entra en Always Free).
   - Red: tu VCN y la subred pública.
   - Backend: política *Weighted round robin*; **Add backends** → *Instances* → `farmaclick-prod`, puerto `80`. Comprobación de salud: protocolo HTTP, puerto `80`, ruta `/healthz`, estado esperado `200`.
   - Listener: crea uno **HTTP puerto 80** por ahora (sin HTTPS) para probar. Termina de crear.
   - Anota la IP pública del balanceador y escríbela en DuckDNS como IP del subdominio (*update ip*).
   - Prueba: `http://<dominio>` debe mostrar el login (si el estado de salud del backend aparece *OK* en la consola).
3. **Certificado (Let's Encrypt, gratis, vía DNS).** Se hace en la VM de producción (o en cualquier PC con Linux):
   ```bash
   curl https://get.acme.sh | sh -s email=tucorreo@dominio.cl
   source ~/.bashrc
   export DuckDNS_Token="<token-de-duckdns>"
   acme.sh --issue --dns dns_duckdns -d <dominio>.duckdns.org --keylength 2048 --server letsencrypt
   ```
   Quedan los archivos en `~/.acme.sh/<dominio>.duckdns.org/`: `<dominio>.duckdns.org.cer` (certificado), `ca.cer` (cadena) y `<dominio>.duckdns.org.key` (llave privada). Muéstralos con `cat`.
4. **Importar el certificado al balanceador.** En el balanceador → **Certificates → Add certificate → Load certificate bundle**: pega el certificado en *Public certificate*, `ca.cer` en *CA certificate* y la llave en *Private key*.
5. **Listener HTTPS.** *Listeners → Create listener*: HTTPS, puerto `443`, backend set el mismo, y en *SSL* elige el certificado que cargaste (**no** actives SSL hacia el backend: la VM habla HTTP en el puerto 80). Luego **elimina el listener HTTP 80** para que no quede acceso sin cifrar.
6. Prueba `https://<dominio>.duckdns.org/api/health` → `{"ok":true}` (después del primer despliegue).

> El certificado dura 90 días. Anota en el calendario renovarlo antes: `acme.sh --renew -d <dominio>.duckdns.org --force` y volver a pegar los tres archivos en el balanceador (Certificates → agregar uno nuevo y cambiarlo en el listener). Para la evaluación no es necesario más.

---

## E. GitHub

### E.1 Repositorio público e historial
1. En github.com → **New repository**: nombre `farmaclick`, **Public**, **sin** README, sin .gitignore, sin licencia (debe estar vacío).
2. **Settings → Collaborators**: agrega a los otros dos integrantes.
3. Genera el historial con el script `crear-historial.sh` (se entrega aparte, junto con `autores.conf`):
   - Edita `autores.conf`: nombre y correo reales de cada uno (el correo verificado en su GitHub) y **quién hizo realmente cada módulo**.
   - `./crear-historial.sh <carpeta-del-proyecto> <carpeta-nueva>`. Crea el repositorio con una rama por funcionalidad, commits de cada autor y Pull Requests simulados hacia `develop`.
4. Sube todo:
   ```bash
   cd <carpeta-nueva>
   git remote add origin https://github.com/<usuario>/farmaclick.git
   git push -u origin develop main
   git push origin --all
   ```
   **Antes de este paso conviene tener hecho D y E.2–E.4** para que el primer despliegue funcione; si no, las pruebas y las imágenes se generan igual, y solo falla el último paso (despliegue) hasta que configures los secretos; se re-ejecuta desde la pestaña *Actions* con *Re-run*.

### E.2 Entornos y secretos
**Settings → Environments → New environment**, dos veces:

| Entorno | Reglas | Secretos del entorno |
|---|---|---|
| `dev` | sin aprobación | `VM_HOST` = IP pública de `farmaclick-dev`; `VM_USER` = `ubuntu`; `VM_SSH_KEY` = contenido completo del archivo `farmaclick_deploy` (con las líneas `-----BEGIN…` y `-----END…`) |
| `prod` | *Required reviewers*: otra persona del equipo | `VM_HOST` = IP pública de `farmaclick-prod`; `VM_USER` = `ubuntu`; `VM_SSH_KEY` = el mismo contenido |

### E.3 Variables del repositorio
**Settings → Secrets and variables → Actions → Variables**: `URL_DEV` = `http://<IP-VM-dev>` y `URL_PROD` = `https://<dominio>.duckdns.org`.

### E.4 Protección de ramas (después del primer push)
**Settings → Branches → Add branch ruleset** (o *protection rule*) para `main` y `develop`: exigir Pull Request antes de fusionar y que pasen las comprobaciones `backend`, `esquema` y `frontend`. (Aparecen en la lista una vez que se ejecutaron.) Así nadie sube directo a producción.

### E.5 Lo que hace GitHub Actions
- **CI** (`.github/workflows/ci.yml`), en cada Pull Request y en cada push a `develop`/`main`: pruebas del backend, esquema SQL sobre un PostgreSQL limpio, compilación del frontend.
- En push a `develop`/`main`: construye las imágenes `farmaclick-api` y `farmaclick-web` para ARM64, las publica en GitHub Container Registry (etiquetas `dev` o `prod` y el id del commit) y las despliega por SSH en la VM del entorno (`docker compose pull && up -d`). `main` espera aprobación.
- **Mantener activo** (`mantener-activo.yml`): cada 3 días consulta `/api/health/db` de ambos entornos.

---

## F. Primer despliegue y verificación

1. En GitHub → pestaña **Actions**: al hacer el push se ejecutan los flujos de `develop` y `main`. Espera que `desplegar` en `dev` quede en verde. En `main`, aprueba el despliegue a `prod` (**Review deployments → prod → Approve**).
2. **Paquetes públicos (si falla el `pull`).** El primer build crea los paquetes en GitHub Container Registry. Si la VM responde `denied`, en tu perfil o la organización → **Packages** → `farmaclick-api` y `farmaclick-web` → *Package settings* → *Change visibility* → **Public**, y vuelve a ejecutar el job desplegar (*Re-run*).
3. **Primer administrador de cada entorno** (la base de Supabase está vacía de usuarios):
   ```bash
   ssh -i farmaclick_deploy ubuntu@<IP-VM>
   cd ~/farmaclick
   docker compose exec api node scripts/crear-admin.js admin@medifarm.cl "UnaClaveSegura123" "Administrador"
   ```
4. **Verificación.**
   - `http://<IP-VM-dev>/api/health` y `/api/health/db` → `{"ok":true}`; `http://<IP-VM-dev>` → login; ingresa con el administrador del paso 3.
   - `https://<dominio>.duckdns.org` → login, candado de HTTPS válido.
   - En la consola de Oracle, el backend del balanceador en estado *OK*.
   - En Supabase → *Table Editor* → `usuario`: aparece el administrador.
5. Crea los primeros datos reales desde el sistema (un proveedor, un producto, una orden de compra y su recepción) para comprobar el recorrido completo.

---

## G. Flujo de trabajo y demostración

### G.1 Día a día de un desarrollador
```bash
git checkout develop && git pull
git checkout -b feature/nombre-de-la-funcionalidad
docker compose up            # trabajar y probar en local
git add -A && git commit -m "feat(modulo): qué se hizo"
git push -u origin feature/nombre-de-la-funcionalidad
```
Luego en GitHub: **Pull Request** hacia `develop`, un compañero lo revisa, pasa la integración continua y se fusiona. Al fusionar, `develop` se despliega sola en la VM de dev. Cuando `develop` está estable: Pull Request `develop → main` y aprobar el despliegue a producción.

Si cambias la base de datos: archivo nuevo en `db/migraciones/` (idempotente), `./db/generar-instalacion.sh`, y ejecutar esa migración a mano en el SQL Editor de Supabase de cada entorno (los despliegues no tocan la base).

### G.2 Guion sugerido para la comisión (10–15 minutos)
1. **Equipo y entorno:** mostrar el repositorio público, el historial (*Insights → Network* o la lista de Pull Requests) con los tres colaboradores, y el `docker-compose.yml`.
2. **Docker local:** `docker compose up` y el sistema en `localhost:5173`.
3. **Cambio en vivo:** en una rama nueva cambiar un texto visible (por ejemplo el nombre en la barra de navegación), commit, push, Pull Request, mostrar la integración continua en verde y fusionar.
4. **Despliegue automático:** en *Actions*, ver cómo construye las imágenes y despliega; recargar `http://<IP-VM-dev>` y mostrar el cambio.
5. **Producción:** Pull Request `develop → main`, aprobación del despliegue, y abrir `https://<dominio>.duckdns.org`.
6. **Supabase:** el proyecto en São Paulo, tablas, el usuario administrador y los jobs de pg_cron.
7. **Recorrido funcional:** orden de compra → recepción → stock → venta en caja → devolución → cuadratura → dashboard.
8. **Alcance:** lo construido (módulos de backoffice) y lo que sigue (tienda en línea y pago con Webpay).

---

## H. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `docker compose up` falla con puerto ocupado | Cierra el programa que usa 5173, 3000 o 54329, o cambia el puerto en `docker-compose.yml`. |
| El login local no funciona | La base se inicializó con otra versión: `docker compose down -v && docker compose up`. |
| *Out of host capacity* al crear la VM | Otro *Availability domain* o reintentar más tarde. |
| `ssh` pide contraseña / `Permission denied` | Usuario `ubuntu`, llave `farmaclick_deploy` con `-i`, y la pública pegada al crear la VM. |
| El job `desplegar` falla en `ssh` | Revisa `VM_HOST`, `VM_USER` y que `VM_SSH_KEY` esté completa (incluye `BEGIN/END` y el salto de línea final). |
| `pull access denied` | Paquetes de GHCR privados: ponerlos en *Public* (F.2) y `GHCR_OWNER` en minúsculas. |
| `exec format error` en la VM | La imagen no es ARM64: la VM debe ser Ampere A1 (no `E2.Micro`). |
| La web carga pero el login responde error 500 | Falta o es incorrecta alguna variable del `.env` (`SUPABASE_*`); revisa con `docker compose logs api`. |
| `/api/health/db` falla | `DATABASE_URL` mal escrita: usuario `app_backend.<ref>`, puerto `6543`, contraseña del `ALTER ROLE`. |
| Balanceador con backend *Critical* | `nsg-prod` sin regla 80 desde `10.0.0.0/16`, o firewall de la VM sin puerto 80 (`preparar-vm.sh`). |
| `ERR_CERT` en el navegador | El certificado no corresponde al dominio o falta la cadena (`ca.cer`). |
| Supabase pausado | Reanudar desde su panel; el flujo `mantener-activo` evita que vuelva a ocurrir. |
| La VM fue reclamada por Oracle | Oracle libera VM Always Free ociosas. El flujo `mantener-activo` genera actividad; si ocurre, crea la VM de nuevo y repite D.3–D.5. |

---

## I. Lista de verificación antes de la evaluación

- [ ] Los tres integrantes aparecen como colaboradores y con commits en el repositorio público.
- [ ] `docker compose up` funciona desde un clon limpio, en el PC de cada uno.
- [ ] Integración continua en verde en `develop` y `main`.
- [ ] `http://<IP-dev>` y `https://<dominio>` responden y permiten iniciar sesión.
- [ ] Supabase dev y prod con el esquema cargado y un administrador creado.
- [ ] Una orden de compra recibida, una venta en caja y una devolución de prueba hechas en producción.
- [ ] Las claves (`.env`, `farmaclick_deploy`, claves de Supabase) **no** están en el repositorio.
- [ ] El día anterior: abrir ambos entornos para confirmar que no estén pausados.
