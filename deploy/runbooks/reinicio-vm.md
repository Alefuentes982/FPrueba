# Reinicio de las VM por actualizaciones de seguridad (OPS-01)

Ubuntu instala las actualizaciones de seguridad solo, pero algunas (el kernel, por ejemplo) se aplican recién al
reiniciar. Cuando al entrar por SSH aparece `*** System restart required ***`, hay que reiniciar. Los contenedores de
FarmaClick vuelven solos (`restart: unless-stopped` en `docker-compose.yml`).

**Nunca** ejecutes `do-release-upgrade`: cambiar de versión de Ubuntu es otra tarea, con su propio plan.

## 1. Acordar el horario
- dev: cuando no haya nadie probando (avisa en el canal del equipo).
- producción: el horario que fije el PO, fuera del horario de la farmacia (9:00 a 22:00). Sin servicio menos de 5 minutos.

## 2. En cada VM (primero dev, después producción)
```bash
ssh -i <tu-llave> ubuntu@<ip-de-la-vm>
cat /var/run/reboot-required.pkgs 2>/dev/null   # qué paquetes lo piden (puede no existir)
sudo apt update && sudo apt upgrade -y
cd ~/farmaclick && docker compose ps            # anota el estado antes
sudo reboot
```
La conexión se corta. Espera 1 a 2 minutos y vuelve a entrar.

## 3. Comprobar
```bash
ssh -i <tu-llave> ubuntu@<ip-de-la-vm>   # ya no debe decir "System restart required"
cd ~/farmaclick && docker compose ps     # api y web en estado "Up"
curl -s localhost/api/health             # {"ok":true} (la web, en el puerto 80, reenvía /api a la API)
```
Desde tu equipo: `curl -s https://<dominio>/api/health` y abre la tienda.

## Si algo falla
| Qué ves | Qué hacer |
|---|---|
| Un contenedor no está `Up` después de 3 minutos | `docker compose logs --tail 50 api` y `docker compose up -d` |
| No puedes entrar por SSH después de 5 minutos | Oracle Cloud > Compute > Instances > la VM > **Reboot**; si sigue, **Console connection** |
| El sitio responde pero la tienda falla | Revisa que no haya quedado una migración pendiente (`paso-a-produccion.md`, paso 1) |

Evidencia para OPS-01: captura del SSH sin el aviso de reinicio y de `docker compose ps` en las dos VM.
