# Renovación del certificado HTTPS (HU-60)

El certificado de Let's Encrypt de `farmaclick-medifarm.duckdns.org` dura 90 días y está cargado en el listener `https` del balanceador `lb-farmaclick-prod`. acme.sh lo renueva solo en la VM cada 60 días, pero el balanceador **no** toma el archivo nuevo: hay que cargarlo a mano. Próximo vencimiento según el Manual Técnico: revisar el 15-12-2026.

Aviso automático: el workflow `Vigilar certificado HTTPS` revisa el certificado todos los días y falla (GitHub envía un correo) cuando quedan menos de 21 días.

## Pasos

1. En la VM de producción:
   ```bash
   export DuckDNS_Token="<token de DuckDNS>"
   bash ~/farmaclick/renovar-certificado.sh
   ```
   (copiar antes `deploy/renovar-certificado.sh` a la VM). Deja en `~/certificados/AAAA-MM/` los archivos `certificado.cer`, `ca.cer` y `clave-privada.key`, y muestra la fecha de vencimiento nueva.
2. Copiar los tres archivos al computador (`scp`) o abrirlos con `cat` para pegarlos.
3. OCI > Networking > Load balancers > `lb-farmaclick-prod` > Certificates and ciphers > Add certificate:
   - Nombre: `cert-farmaclick-AAAA-MM`
   - SSL certificate: `certificado.cer`; CA certificate: `ca.cer`; Private key: `clave-privada.key`
4. Listeners > `https` > Edit > elegir el certificado nuevo > Save.
5. Comprobar: `echo | openssl s_client -connect farmaclick-medifarm.duckdns.org:443 -servername farmaclick-medifarm.duckdns.org 2>/dev/null | openssl x509 -noout -enddate`, y ejecutar a mano el workflow `Vigilar certificado HTTPS`.
6. Borrar `~/certificados/AAAA-MM/clave-privada.key` de la VM y del computador una vez cargado. Eliminar del balanceador el certificado anterior.
