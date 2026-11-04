# Respaldos de producción (HU-59)

El plan gratuito de Supabase no entrega respaldos descargables. El workflow `Respaldo de producción` hace un `pg_dump` del esquema `public` de farmaclick-prod todos los domingos, lo cifra y lo deja como artefacto del workflow por 35 días.

## Configuración (una vez)

1. En Supabase farmaclick-prod > Connect, copiar la cadena **Session pooler** (puerto 5432, usuario `postgres.<project-ref>`).
2. En GitHub > Settings > Secrets and variables > Actions, crear:
   - `PROD_DB_URL_RESPALDO`: esa cadena, con la contraseña de la base.
   - `RESPALDO_CLAVE`: una frase larga. Guardarla también fuera de GitHub (gestor de contraseñas del equipo). Sin ella los respaldos no se pueden abrir.
3. Opcional: variable `PG_VERSION_PROD` con la versión mayor de PostgreSQL del proyecto (Settings > Infrastructure). Por defecto se usa 16. `pg_dump` debe ser de la misma versión o mayor que el servidor.
4. Hacer merge a `main` (los workflows programados solo corren desde la rama por defecto) y ejecutarlo una vez a mano: Actions > Respaldo de producción > Run workflow.

## Descargar un respaldo

Actions > Respaldo de producción > la ejecución del día > Artifacts > `farmaclick_prod_AAAAMMDD.dump.gpg`. GitHub lo entrega dentro de un .zip.

## Probar la restauración

Con la base local de `docker compose` levantada:

```bash
unzip farmaclick_prod_AAAAMMDD.dump.gpg.zip
RESPALDO_CLAVE='<frase>' bash deploy/restaurar-respaldo.sh farmaclick_prod_AAAAMMDD.dump.gpg
```

El script crea la base `restauracion_prueba` (no toca `farmaclick`), restaura y muestra las filas de las tablas principales. El aviso `schema "public" already exists` es normal. Para la evidencia del plan de pruebas, guardar la salida y una captura.

## Restaurar en un proyecto nuevo de Supabase (desastre)

1. Crear el proyecto. No ejecutar `db/instalacion_completa.sql`: el respaldo ya trae el esquema.
2. `pg_restore --no-owner -d "<Session pooler del proyecto nuevo>" farmaclick_prod_AAAAMMDD.dump`
3. `ALTER ROLE app_backend LOGIN PASSWORD '<secreto>';` y actualizar `DATABASE_URL` en el `.env` de la VM.
4. Activar pg_cron (Database > Extensions) y ejecutar `SELECT fn_programar_jobs();`: los jobs viven en el esquema `cron`, que no está en el respaldo.
5. Los usuarios de Supabase Auth no están en el respaldo (esquema `auth`): hay que recrearlos con el mismo correo y luego actualizar `usuario.id` si cambió.
