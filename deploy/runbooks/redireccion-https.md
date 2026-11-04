# Redirección de http a https (HU-62)

Hoy el balanceador solo escucha en el 443. Quien escribe `http://farmaclick-medifarm.duckdns.org` recibe un error en vez de llegar al sitio.

## Pasos en OCI

1. Networking > Virtual cloud networks > la VCN > Security Lists > Default Security List: agregar una regla de entrada TCP 80 desde `0.0.0.0/0` (hoy solo está el 443).
2. Load balancers > `lb-farmaclick-prod` > Rule sets > Create rule set:
   - Nombre: `redirigir_https`
   - Regla **URL redirect rules**: Source path `/`, Match type `Force longest prefix match`.
   - Redirect to: Protocol `HTTPS`, Host `{host}`, Port `443`, Path `{path}`, Query `{query}`. Response code `301`.
3. Listeners > Create listener:
   - Nombre `http`, protocolo `HTTP`, puerto `80`, el mismo backend set del listener `https`.
   - Rule sets: `redirigir_https`.
4. Comprobar:
   ```bash
   curl -sI http://farmaclick-medifarm.duckdns.org/tienda | grep -iE "^HTTP|^location"
   ```
   Debe responder `301` y `Location: https://farmaclick-medifarm.duckdns.org/tienda`.
