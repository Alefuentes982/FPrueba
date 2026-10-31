import { ApiError, qs } from '../api.js';

// Cliente de la API pública de la tienda. No envía el token del personal: la tienda funciona sin sesión y un 401
// aquí no debe cerrar la sesión de nadie.
const BASE = `${import.meta.env.VITE_API_URL ?? '/api'}/tienda`;

async function pedir(ruta, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + ruta, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || `Error ${res.status}`, res.status, data?.details);
  return data;
}

export const tiendaApi = {
  sucursales: () => pedir('/sucursales'),
  categorias: () => pedir('/categorias'),
  productos: (filtros) => pedir(`/productos${qs(filtros)}`),
};
