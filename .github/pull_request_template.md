## Qué cambia
<!-- Historias (HU-xx) y un resumen corto. -->

## Cómo se probó
<!-- Pruebas automáticas, pruebas en el navegador, capturas. -->

## Lista de verificación
- [ ] CI en verde (pruebas del backend, build del frontend y esquema).
- [ ] Si agrega una migración: es idempotente (`BEGIN`/`COMMIT`, `IF NOT EXISTS`) y se regeneró `db/instalacion_completa.sql`.
- [ ] No incluye `.env`, `_privado/`, claves ni tokens.

### Solo para el paso de develop a main (producción)
Ver `deploy/runbooks/paso-a-produccion.md`.
- [ ] Respaldo de producción del día.
- [ ] **Migraciones aplicadas en farmaclick-prod.** Resultado de `deploy/runbooks/revisar-migraciones.sql` en prod (todo `true`):

```
(pega aquí el resultado)
```
