// Sesión del cliente de la tienda en el navegador (HU-68). Es independiente de la del personal (farmaclick.session):
// cerrar una no cierra la otra. Si el navegador bloquea el almacenamiento, la sesión dura mientras la pestaña esté abierta.
const CLAVE = 'farmaclick.tienda.sesion';
let enMemoria = null;
const almacen = () => { try { return window.localStorage; } catch { return null; } };

export function leerSesionCliente() {
  try { return JSON.parse(almacen()?.getItem(CLAVE) ?? 'null') ?? enMemoria; } catch { return enMemoria; }
}

export function guardarSesionCliente(sesion) {
  enMemoria = sesion;
  try { almacen()?.setItem(CLAVE, JSON.stringify(sesion)); } catch { /* sin persistencia */ }
  window.dispatchEvent(new Event('tienda:sesion'));
}

export function borrarSesionCliente() {
  enMemoria = null;
  try { almacen()?.removeItem(CLAVE); } catch { /* nada que borrar */ }
  window.dispatchEvent(new Event('tienda:sesion'));
}

export const CLAVE_SESION_CLIENTE = CLAVE;
