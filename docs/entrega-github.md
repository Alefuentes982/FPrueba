# Entrega a GitHub por módulos

El proyecto se sube a GitHub **por partes, una por módulo** (ver `hoja-de-ruta.md`). Este documento explica cómo está organizado, cómo ver cada parte en la carpeta del proyecto y cómo subirlas paso a paso.

## 1. Cómo está organizado

La carpeta del proyecto muestra siempre **un solo estado**: el de la rama en la que se esté. Hoy es `main`, que contiene todas las partes juntas. La separación por módulos **no son subcarpetas**: está en el historial de git.

- Cada parte es **un commit** (a veces con algún commit de apoyo, como un `fix` o un `docs`).
- Cada parte tiene una **rama** `parte/N-nombre` y una **etiqueta** `parte-N` que apuntan a ese punto del historial.
- La fila "Ajustes tras las pruebas" no es un módulo nuevo: reúne lo que se hizo después de la parte 10 (cambios sobre módulos ya entregados y los datos de prueba). Se sube igual que una parte, como último Pull Request, después de la parte 10.

Cada rama **contiene las anteriores**: `parte/4-ordenes-compra` tiene las partes 0 a 4. Por eso un Pull Request de la parte N hacia `main` muestra únicamente lo que agrega esa parte.

| Parte | Rama | Etiqueta | Qué agrega |
|---|---|---|---|
| 0 Base y acceso | `parte/0-base` | `parte-0` | estructura, esquema de la base, login, permisos, registro de módulos |
| 1 Usuarios y permisos | `parte/1-usuarios` | `parte-1` | alta y edición de personal, matriz de roles y permisos |
| 2 Proveedores | `parte/2-proveedores` | `parte-2` | CRUD con validación de RUT |
| 3 Productos | `parte/3-productos` | `parte-3` | CRUD, margen, proveedores por producto |
| 4 Órdenes de compra | `parte/4-ordenes-compra` | `parte-4` | borrador, emisión, recepción, PDF, correlativo (migración 001) |
| 5 Inventario | `parte/5-inventario` | `parte-5` | stock, lotes, vencimientos, kardex, ajustes (migración 002) |
| 6 Pedidos | `parte/6-pedidos` | `parte-6` | núcleo de venta, reserva de stock, pagos, estados (migración 003) |
| 7 Caja y venta presencial | `parte/7-pos` | `parte-7` | turnos de caja, venta en el mostrador, cierre ciego |
| 8 Devoluciones | `parte/8-devoluciones` | `parte-8` | devolución con reembolso, stock y cierre de caja (migración 004) |
| 9 Cuadratura de caja | `parte/9-cuadratura` | `parte-9` | historial de turnos, revisión, Cierre Z (migración 005) |
| 10 Dashboards y reportes | `parte/10-dashboards` | `parte-10` | indicadores, informes, exportación CSV y PDF |
| Ajustes tras las pruebas | `ajustes/1-pruebas` | `ajustes-1` | datos de prueba, redondeo del efectivo, botón Imprimir, estado en el PDF de la orden, buscador en ajustes (migración 006) |

## 2. Ver la separación en la carpeta del proyecto

Hay tres formas, de la más simple a la más cómoda.

### a) Cambiar la carpeta a una parte
```bash
git checkout parte/4-ordenes-compra   # la carpeta pasa a tener solo las partes 0 a 4
git checkout main                     # vuelve a tener todo
```
- Los módulos posteriores desaparecen de la carpeta mientras estés en esa rama, y vuelven al regresar a `main`.
- Antes de cambiar de rama, **guarda tus cambios** con un commit (o `git stash`); si no, git puede negarse a cambiar.
- `node_modules`, `.env` y `backend/.pgdata` no los controla git, así que no se ven afectados.

### b) Ver qué agregó cada parte sin tocar la carpeta
```bash
git log --oneline                       # un commit por parte
git show --stat parte-7                 # archivos que agregó la parte 7
git diff parte-6 parte-7 --stat         # diferencia entre dos partes
git diff parte-6 parte-7 -- backend/    # el detalle, solo del backend
```

### c) Tener varias partes abiertas a la vez, en carpetas separadas
```bash
git worktree add ../FarmaClick-parte4 parte-4
git worktree add ../FarmaClick-parte7 parte-7
git worktree list                             # ver las carpetas creadas
git worktree remove ../FarmaClick-parte4      # quitar una
```
Cada una queda como una carpeta junto a la del proyecto. No traen `node_modules`: para ejecutar una, correr `npm install` dentro de `backend/` y `frontend/`.

## 3. Dos casos: repositorio compartido o repositorio vacío

- **Repositorio compartido que ya tiene archivos y donde solo el dueño fusiona** (caso del proyecto de título): sección 3A. **No necesita estar vacío.**
- **Repositorio propio y vacío**: sección 3B.

## 3A. Repositorio compartido con archivos y fusión por el dueño

Idea: el código del sistema va **dentro de una carpeta** del repositorio (aquí, `farmaclick/`), sin tocar los archivos que ya existen. Dentro de esa carpeta quedan `backend/`, `frontend/`, `db/`, `docs/` y el `README.md` del sistema. Cada parte se sube como una **rama con su Pull Request**, y el dueño la fusiona.

Conviene preguntar al dueño dos cosas: (1) el nombre de la carpeta, si hay una convención (se usa `farmaclick/` de ejemplo); (2) si tienes permiso de escritura en el repositorio. Con permiso, se suben las ramas directamente. **Sin permiso**, se hace un *fork* (botón **Fork** en GitHub), se suben las ramas al fork y los Pull Request se abren desde el fork hacia el repositorio compartido. Los comandos son los mismos; solo cambia la URL de `origin`.

### Preparación (una sola vez)
```bash
git clone https://github.com/<organizacion>/<repositorio-compartido>.git trabajo-equipo
cd trabajo-equipo
git remote add farmaclick "C:/Users/vic20/Desktop/SistemaFarmaClick"   # tu carpeta local del sistema
git fetch --no-tags farmaclick
git branch -r                                                           # deben verse farmaclick/parte/0-base, etc.
```
- `trabajo-equipo` es una carpeta **nueva**, distinta de la del sistema: es el clon del repositorio compartido.
- `--no-tags` evita traer las etiquetas `parte-N` al repositorio compartido, donde no corresponden.
- Si el repositorio compartido usa otra rama principal que `main` (por ejemplo `master`), reemplázala en los comandos.

### Subir cada parte (el ejemplo es la parte 0; las siguientes son iguales)
```bash
git fetch origin                                   # trae lo último del repositorio compartido
git checkout -b parte/0-base origin/main           # rama nueva, partiendo de lo que ya fusionó el dueño
git rm -r -q --ignore-unmatch farmaclick           # vacía la carpeta (en la parte 0 aún no existe; no pasa nada)
git read-tree --prefix=farmaclick/ -u farmaclick/parte/0-base   # copia ahí la parte
git add -A
git commit                                         # escribe aquí la descripción de la parte (ver sección 4)
git push origin parte/0-base
```
Luego, en GitHub, abre el Pull Request de `parte/0-base` hacia `main` y escribe su descripción. El dueño lo revisa y lo fusiona.

Para la **parte siguiente**, espera a que el dueño fusione la anterior y repite los mismos comandos cambiando el nombre (`parte/1-usuarios`, y en `read-tree` `farmaclick/parte/1-usuarios`). El `git fetch origin` del primer paso trae lo fusionado, así el Pull Request muestra **solo lo que agrega esa parte**. Esto se comprobó en una prueba: con la parte 0 fusionada, el Pull Request de la parte 1 mostró únicamente los 10 archivos de esa parte.

### Si el dueño tarda en fusionar
Puedes dejar preparadas varias ramas, pero los Pull Request posteriores incluirán también las partes anteriores que aún no se fusionan. Lo más limpio es **un Pull Request a la vez**, en orden. Si quieres adelantar trabajo, arma la rama de la parte siguiente partiendo de la anterior (`git checkout -b parte/1-usuarios parte/0-base`, y luego los tres comandos de `rm`/`read-tree`/`commit`) y, al abrir el Pull Request, elige como destino la rama de la parte anterior; cuando el dueño fusione la anterior, cambia el destino a `main`.

### Qué verifica el dueño al revisar
- Que los cambios estén **solo dentro de `farmaclick/`** (no se modificó nada de lo que ya había).
- Que no haya secretos (`.env`, claves). La revisión previa está en la sección 3B.
- Para ejecutar una parte ya subida: `cd farmaclick/backend && npm install && npm run dev:db`, y el resto del `README.md` de la carpeta `farmaclick/`.

### Cuidados
- **Las migraciones** viajan con la parte que las necesita, en `farmaclick/db/migraciones/`. En Supabase se ejecutan a mano, en orden.
- **Los `.gitignore` del sistema** quedan dentro de `farmaclick/` y siguen funcionando (`node_modules`, `.env`, `.pgdata`).
- **Este comando reemplaza toda la carpeta** `farmaclick/` por el contenido exacto de la parte. Si alguien del equipo editó a mano archivos dentro de esa carpeta en el repositorio compartido, esos cambios se pisarían: avisa antes y se revisa.
- **No se conserva el historial de commits original** del sistema, porque cada parte entra como un solo commit nuevo en el repositorio compartido. La descripción que escribas en ese commit y en el Pull Request es el registro de la parte.
- Para ver cómo quedó una parte antes de subirla: `git diff --stat origin/main HEAD` en la rama recién creada.

## 3B. Subir a un repositorio propio y vacío

### Antes de empezar
1. Tener git instalado y haber iniciado sesión en GitHub (en la terminal pedirá usuario y un *token* de acceso personal, o se usa GitHub Desktop / el administrador de credenciales de Windows).
2. Crear el repositorio en GitHub: botón **New repository**, **vacío** (sin README, sin `.gitignore`, sin licencia). Si se crea con archivos, el primer `push` fallará por historiales distintos.
3. Revisar que no vayan secretos:
   ```bash
   git ls-files | grep -i env     # solo debe salir .env.example (y .env.local, que es de desarrollo local)
   ```
   Si aparece un `.env` real, avisar antes de subir.

### Conectar el repositorio
Desde la carpeta del proyecto (una sola vez):
```bash
git remote add origin https://github.com/<usuario>/<repositorio>.git
git remote -v                  # comprobar que quedó bien
```

### Subir la parte 0 (crea `main` en GitHub)
```bash
git push origin parte/0-base:main
```
Esto significa: "sube la rama local `parte/0-base` y llámala `main` en GitHub".

### Subir cada parte siguiente (con Pull Request)
Ejemplo con la parte 1; el resto es igual cambiando el nombre de la rama (ver la tabla):
```bash
git push origin parte/1-usuarios
```
1. En GitHub aparece el aviso **Compare & pull request**; abrir un Pull Request de `parte/1-usuarios` hacia `main`.
2. Escribir el título y la descripción (ver sección 4) y fusionarlo con **Merge pull request**.
3. Traer lo fusionado a tu equipo:
   ```bash
   git fetch origin
   git checkout main
   git pull
   ```
   `git pull` puede mostrar un conflicto, porque tu `main` local ya tiene todas las partes y el de GitHub solo algunas. Si pasa, **no resuelvas a ciegas**: avisa y se revisa. Una alternativa que lo evita es no hacer `pull` y seguir subiendo ramas, abriendo cada Pull Request desde la rama siguiente.

Para subir una parte directo a `main`, sin Pull Request: `git push origin parte/1-usuarios:main`. Sirve, pero no deja registro de revisión por módulo.

### Subir las etiquetas (opcional)
```bash
git push origin --tags
```
Las etiquetas `parte-0` … `parte-10` aparecen en GitHub, en **Releases / Tags**.

### Qué no hacer (repositorio vacío)
- **No subir `main` local tal cual** (`git push origin main`): llevaría las 11 partes de una vez y se pierde la entrega por módulos.
- **No usar `--force`** salvo que se entienda para qué; reescribe el historial en GitHub.
- **No subir partes fuera de orden**: la parte 5 depende de la 4, y así.

## 4. Describir lo que trae cada parte

Sí: lo que se escribe al hacer el commit y al abrir el Pull Request es una descripción de lo que agrega esa parte, y conviene hacerlo. Hay dos lugares.

### El mensaje del commit
Las partes ya traen su mensaje, con un título y viñetas de lo que incluyen. Se pueden ver con `git show parte-4 --no-patch`. Formato recomendado:
```
feat(modulo): resumen corto de lo que agrega

- Qué hace, en una línea por funcionalidad.
- Cambios en la base de datos (migración NNN), si los hay.
- Decisiones o reglas que conviene conocer.
```
Tipos de mensaje: `feat(módulo)` para funcionalidad nueva, `fix(módulo)` para correcciones, `docs` para documentación.

**Si quieres cambiar el mensaje de una parte ya hecha** (por ejemplo, de la última):
```bash
git checkout parte/10-dashboards
git commit --amend            # abre el editor con el mensaje para modificarlo
```
Esto reescribe ese commit: su identificador cambia, y también hay que actualizar la etiqueta (`git tag -f parte-10`) y llevar `main` al nuevo commit. Para partes intermedias es más delicado, porque las ramas posteriores contienen el commit viejo. **Mientras no hayas subido nada a GitHub es seguro, pero pide ayuda para hacerlo**, para no romper la cadena de ramas.

### La descripción del Pull Request
Es el lugar más cómodo para explicar cada parte a quien revisa, y se puede escribir o editar después sin tocar git. Una plantilla útil:
```
## Qué agrega
- …

## Cómo probarlo
1. `cd backend && npm test`
2. …

## Cambios en la base de datos
Migración `00N_…sql` (ejecutarla en Supabase antes de usar esta parte).

## Dependencias
Requiere las partes 0 a N-1.
```
El `README.md` tiene una línea por módulo (con una marca `<!-- parte:N -->`), que sirve de resumen general del proyecto.

## 5. Reglas del repositorio
- Nunca subir `.env` ni las claves de Supabase (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`). `.env.example` y `.env.local` solo contienen valores de ejemplo y de desarrollo local.
- Un módulo nuevo = su carpeta en `backend/src/modules/` y `frontend/src/modules/`, una línea en cada registro (`modules/index.js`), su migración numerada en `db/migraciones/` si cambia el esquema, y su línea en el README.
- Mensajes de commit: `feat(modulo): …`, `fix(modulo): …`, `docs: …`.
- Al agregar una parte, ejecutar antes `npm test` (backend) y `npm run build` (frontend).
- Para la parte siguiente se trabaja en una rama nueva a partir de la última parte entregada.

## 6. Preguntas frecuentes

**¿El repositorio tiene que estar vacío?** No. Si ya tiene archivos y solo el dueño fusiona, usa la sección 3A (el sistema va dentro de una carpeta). Vacío solo hace falta en la 3B.

**¿Puedo subirlo a otro repositorio, distinto al que tenía pensado?** Sí. En 3B basta con apuntar `origin` al nuevo: `git remote set-url origin https://github.com/<usuario>/<otro-repositorio>.git`; en 3A, se clona el otro repositorio.

**¿Puedo subir solo algunas partes y las demás después?** Sí, siempre que sea en orden: primero la 0, luego la 1, y así.

**Cambié algo en el código después de una parte. ¿Dónde lo guardo?** Haz el commit en la rama de esa parte (o en una rama nueva a partir de ella) y mantén al día `main`. Si no estás seguro, pide ayuda antes: un cambio en una parte intermedia afecta a las ramas posteriores.

**Las migraciones de la base, ¿se suben?** Sí, están en `db/migraciones/` y viajan con la parte que las necesita. En Supabase se ejecutan a mano, en orden, en el editor SQL; en modo local se aplican solas.
