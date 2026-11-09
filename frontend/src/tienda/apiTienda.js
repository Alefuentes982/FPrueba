import { ApiError, qs } from '../api.js';
import { borrarSesionCliente, guardarSesionCliente, leerSesionCliente } from './sesionTienda.js';

// Cliente de la API pública de la tienda. No envía el token del personal: la tienda funciona sin sesión y un 401
// aquí no debe cerrar la sesión de nadie. Las rutas de la cuenta de cliente (HU-68) usan la sesión propia de la
// tienda (sesionTienda.js), que se renueva sola una vez si el token venció.
const BASE = `${import.meta.env.VITE_API_URL ?? '/api'}/tienda`;

async function enviar(ruta, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + ruta, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(data?.error || `Error ${res.status}`, res.status, data?.details);
    err.codigo = data?.codigo;
    throw err;
  }
  return data;
}

const pedir = (ruta, opciones) => enviar(ruta, opciones);

// Con sesión de cliente. Si el token venció, se renueva una vez; si tampoco se puede, se cierra la sesión.
let renovando = null;
export async function pedirConSesion(ruta, opciones = {}) {
  const sesion = leerSesionCliente();
  if (!sesion) throw new ApiError('Inicia sesión para continuar.', 401);
  try {
    return await enviar(ruta, { ...opciones, token: sesion.access_token });
  } catch (err) {
    if (err.status !== 401) throw err;
    renovando ??= enviar('/cuenta/refresh', { method: 'POST', body: { refresh_token: sesion.refresh_token } })
      .then((nueva) => { guardarSesionCliente({ ...sesion, ...nueva }); return nueva; })
      .catch(() => { borrarSesionCliente(); return null; })
      .finally(() => { renovando = null; });
    const nueva = await renovando;
    if (!nueva) throw err;
    return enviar(ruta, { ...opciones, token: nueva.access_token });
  }
}

export const tiendaApi = {
  sucursales: () => pedir('/sucursales'),
  categorias: () => pedir('/categorias'),
  comunas: () => pedir('/comunas'),
  productos: (filtros) => pedir(`/productos${qs(filtros)}`),
  producto: (id) => pedir(`/productos/${id}`),
  cotizar: (items) => pedir('/carrito/cotizar', { method: 'POST', body: { items } }),
};

// Cuenta de cliente (HU-68).
export const cuentaApi = {
  registrar: (datos) => pedir('/cuenta/registro', { method: 'POST', body: datos }),
  ingresar: (correo, password) => pedir('/cuenta/ingreso', { method: 'POST', body: { correo, password } }),
  reenviarConfirmacion: (correo) => pedir('/cuenta/reenviar', { method: 'POST', body: { correo } }),
  recuperar: (correo) => pedir('/cuenta/recuperar', { method: 'POST', body: { correo } }),
  nuevaClave: (accessToken, password) => pedir('/cuenta/nueva-clave', { method: 'POST', body: { access_token: accessToken, password } }),
  yo: () => pedirConSesion('/cuenta/yo'),
};

// Checkout y pedido web (HU-71). Solo con sesión de cliente.
export const pedidosApi = {
  opciones: (items) => pedirConSesion('/pedidos/opciones', { method: 'POST', body: { items } }),
  crear: (datos) => pedirConSesion('/pedidos', { method: 'POST', body: datos }),
  ver: (id) => pedirConSesion(`/pedidos/${id}`),
  cancelar: (id) => pedirConSesion(`/pedidos/${id}/cancelar`, { method: 'POST' }),
};
