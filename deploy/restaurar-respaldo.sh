#!/usr/bin/env bash
# HU-59. Restaura un respaldo de producción en una base de prueba para comprobar que sirve.
# Uso:
#   RESPALDO_CLAVE='<frase>' bash deploy/restaurar-respaldo.sh farmaclick_prod_AAAAMMDD.dump.gpg [URL_SERVIDOR]
# URL_SERVIDOR por defecto es la base local de docker compose: postgresql://postgres:postgres@localhost:54329
# Crea (o reemplaza) la base "restauracion_prueba" en ese servidor; no toca la base "farmaclick".
# Usa psql y pg_restore instalados o, si no están, la imagen postgres:16 de Docker.
set -euo pipefail

archivo="${1:?Indique el archivo .dump o .dump.gpg}"
servidor="${2:-postgresql://postgres:postgres@localhost:54329}"
base="restauracion_prueba"
trabajo="$(mktemp -d)"
trap 'rm -rf "$trabajo"' EXIT

if command -v pg_restore >/dev/null && command -v psql >/dev/null; then
  PSQL() { psql "$@"; }
  PG_RESTORE() { pg_restore "$@"; }
  ruta() { echo "$1"; }
else
  red="--network host"
  PSQL() { docker run --rm -i $red -v "$trabajo":/r postgres:16 psql "$@"; }
  PG_RESTORE() { docker run --rm -i $red -v "$trabajo":/r postgres:16 pg_restore "$@"; }
  ruta() { echo "/r/$(basename "$1")"; }
fi

# 1. Descifrar
dump="$trabajo/respaldo.dump"
case "$archivo" in
  *.gpg)
    : "${RESPALDO_CLAVE:?Defina RESPALDO_CLAVE con la frase de cifrado}"
    gpg --batch --yes --pinentry-mode loopback --passphrase "$RESPALDO_CLAVE" -o "$dump" -d "$archivo" ;;
  *) cp "$archivo" "$dump" ;;
esac

# 2. Base vacía con los roles y extensiones que el esquema espera (en Supabase ya existen)
PSQL "$servidor/postgres" -v ON_ERROR_STOP=1 -q <<SQL
DROP DATABASE IF EXISTS $base;
CREATE DATABASE $base;
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backend') THEN CREATE ROLE app_backend NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END \$\$;
SQL
PSQL "$servidor/$base" -v ON_ERROR_STOP=1 -q -c "CREATE EXTENSION IF NOT EXISTS btree_gist; CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# 3. Restaurar. Los objetos propios de Supabase que no existen en local se informan como advertencias.
PG_RESTORE --no-owner -d "$servidor/$base" "$(ruta "$dump")" 2> "$trabajo/errores.txt" || true
if [ -s "$trabajo/errores.txt" ]; then
  echo "Advertencias de pg_restore (revisar si alguna afecta tablas del negocio):"
  grep -E "error|ERROR" "$trabajo/errores.txt" | head -20 || true
fi

# 4. Evidencia: filas por tabla principal
PSQL "$servidor/$base" -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'producto' AS tabla, COUNT(*) AS filas FROM producto
UNION ALL SELECT 'lote', COUNT(*) FROM lote
UNION ALL SELECT 'movimiento_inventario', COUNT(*) FROM movimiento_inventario
UNION ALL SELECT 'pedido', COUNT(*) FROM pedido
UNION ALL SELECT 'transaccion_pago', COUNT(*) FROM transaccion_pago
UNION ALL SELECT 'turno_caja', COUNT(*) FROM turno_caja
UNION ALL SELECT 'orden_compra', COUNT(*) FROM orden_compra;
SQL
echo "Restauración terminada en la base $base."
