# Deuda técnica de configuración (HU-64)

## 1. Plantillas .env

`backend/.env.example` y `deploy/.env.example` documentan todas las variables que lee la API (`process.env.*`), incluidas `SMTP_*`, `TAREAS_CAJA` y, solo para desarrollo, `AUTH_MODE` y `LOCAL_AUTH_SECRET`. Para revisarlo de nuevo:

```bash
grep -rhoE "process\.env\.[A-Z_]+" backend/src backend/scripts | sort -u
```

## 2. Presupuesto con alerta en OCI

1. Billing & Cost Management > Budgets > Create Budget.
2. Compartment: el raíz (tenancy). Monthly budget amount: `1` (USD).
3. Alert rule: Actual spend, threshold `1` % del presupuesto, correo del equipo.
4. Con eso llega un aviso apenas aparezca cualquier cargo fuera de Always Free.

## 3. Limpieza de las VM (dev y prod)

```bash
df -h /
docker image prune -af          # imágenes antiguas de cada despliegue
docker builder prune -af
sudo journalctl --vacuum-time=14d
ls -la ~ ~/farmaclick           # borrar a mano archivos temporales (.tar, .sql, .dump, certificados viejos)
df -h /
```

Guardar el `df -h` de antes y después como evidencia.
