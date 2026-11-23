# Paso de develop a main (producción) (OPS-02)

**Regla:** producción nunca recibe código sin las migraciones que ese código necesita. Primero la base, después el
código. En el Sprint 6 se unió develop a main (PR #9 del 05-11 y #15 del 11-11) sin aplicar las migraciones 011 a 014
en **farmaclick-prod** y la tienda de producción estuvo sin productos del 05-11 al 11-11-2026. Esta lista lo evita.

Quién: el PO (Alejandro) hace el paso; otro integrante revisa el PR. Tiempo: 15 a 20 minutos.

## 1. Revisar qué migraciones tiene cada base
En Supabase, proyecto **farmaclick-dev** > **SQL Editor**, pega y corre `deploy/runbooks/revisar-migraciones.sql`
(solo lee). Repite en **farmaclick-prod**.

- En dev todo debe salir `true`. Si no, el código de develop no se probó con esa migración: detente y revisa.
- En prod, anota las filas en `false`: son las que hay que aplicar.

## 2. Respaldo de producción
Antes de tocar prod, en GitHub > **Actions** > **Respaldo de producción** > **Run workflow** (rama `main`) y espera
que termine en verde. Así hay un respaldo del día por si hay que volver atrás (runbook `respaldos.md`).

## 3. Aplicar en prod las migraciones que faltan
En **farmaclick-prod** > **SQL Editor**, en orden de número, pega el contenido de cada `db/migraciones/0NN_*.sql`
que salió `false` y presiona **Run**. Todas son idempotentes (van entre `BEGIN` y `COMMIT` y se pueden repetir).
No uses `instalacion_completa.sql` en prod: crea todo desde cero.

Vuelve a correr `revisar-migraciones.sql` en prod: ahora todo debe salir `true`.

## 4. Configuración que piden las migraciones nuevas
Revisa la sección "Producción" de la guía del sprint. En el Sprint 7:
- 016: el Administrador carga los costos en **Despacho** antes de anunciar el despacho a domicilio (sin costos, la
  tienda solo ofrece retiro).
- 019: los correos al cliente salen si el `.env` de la VM tiene `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM`.
  Sin SMTP los avisos quedan en la tabla `correo_pedido` y se envían cuando se configure.
- 020: la vida útil mínima de la tienda parte en 30 días; el Administrador la ajusta en **Despacho**.
- 021: las fotos se suben desde **Productos > Fotos en lote**. La API crea sola el bucket público `productos` en
  Supabase Storage con `SUPABASE_SERVICE_ROLE_KEY` (ya está en el `.env`). Plan gratuito: 1 GB de espacio y 5 GB de
  descarga al mes; las fotos se guardan reducidas (unos 50 KB cada una).

## 5. Pull Request de develop a main
Abre el PR en GitHub (base `main`, compare `develop`). La plantilla trae la lista; completa:
- [x] Migraciones aplicadas en prod, con el resultado de `revisar-migraciones.sql` pegado.
- [x] Respaldo del día.
- [x] CI en verde.

El revisor no aprueba si falta el resultado de la consulta. Recién entonces **Merge**.

## 6. Verificar
1. GitHub Actions publica las imágenes y despliega (espera el check verde del workflow).
2. `curl -s https://<dominio-prod>/api/health` → `{"ok":true}`.
3. Abre la tienda de producción: se ven productos y la comuna de despacho.
4. Entra al sistema con un usuario del personal y abre Pedidos web.

## Si algo falla
| Qué ves | Qué hacer |
|---|---|
| La tienda no muestra productos o da error 500 después del merge | Falta una migración: corre `revisar-migraciones.sql` en prod y aplica las `false` |
| Una migración da error en prod | No sigas: copia el error, revisa que la anterior esté aplicada y avisa en el canal del equipo |
| Hay que volver atrás | Revierte el merge en GitHub (Revert) y despliega; las migraciones no se deshacen: son compatibles con el código anterior |
