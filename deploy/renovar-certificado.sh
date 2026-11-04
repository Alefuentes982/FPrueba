#!/usr/bin/env bash
# HU-60. Renueva el certificado de Let's Encrypt en la VM de producción y deja los archivos listos para cargarlos en
# el balanceador de Oracle (deploy/runbooks/certificado-https.md, paso 3).
# Uso en la VM:  bash renovar-certificado.sh [dominio]
set -euo pipefail
dominio="${1:-farmaclick-medifarm.duckdns.org}"
acme="$HOME/.acme.sh/acme.sh"
[ -x "$acme" ] || { echo "No está acme.sh en $acme. Ver Manual Técnico, sección 9.2."; exit 1; }
[ -n "${DuckDNS_Token:-}" ] || { echo "Defina DuckDNS_Token (export DuckDNS_Token=...) antes de renovar."; exit 1; }

"$acme" --renew -d "$dominio" --force

origen="$HOME/.acme.sh/${dominio}_ecc"; [ -d "$origen" ] || origen="$HOME/.acme.sh/$dominio"
destino="$HOME/certificados/$(date +%Y-%m)"
mkdir -p "$destino"
cp "$origen/$dominio.cer" "$destino/certificado.cer"
cp "$origen/ca.cer" "$destino/ca.cer"
cp "$origen/$dominio.key" "$destino/clave-privada.key"
chmod 600 "$destino/clave-privada.key"
echo "Vence: $(openssl x509 -in "$destino/certificado.cer" -noout -enddate | cut -d= -f2)"
echo "Archivos para el balanceador en $destino. Nombre sugerido: cert-farmaclick-$(date +%Y-%m)"
