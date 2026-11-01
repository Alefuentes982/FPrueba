// Reglas del carrito en el navegador. Los precios y el stock definitivos los calcula el servidor (cotización); aquí
// solo se guardan producto y cantidad, y se limita la cantidad a lo que el servidor informó como disponible.
export const MAX_CANTIDAD = 99;
export const CLAVE = 'farmaclick.tienda.carrito';

export function leerCarrito(almacen) {
  try {
    const lista = JSON.parse(almacen?.getItem(CLAVE) ?? '[]');
    return Array.isArray(lista)
      ? lista.filter((x) => typeof x?.producto_id === 'string' && Number.isInteger(x.cantidad) && x.cantidad > 0)
      : [];
  } catch {
    return [];
  }
}

export function guardarCarrito(almacen, items) {
  try { almacen?.setItem(CLAVE, JSON.stringify(items)); } catch { /* modo privado o almacenamiento lleno */ }
}

const tope = (disponible) => Math.max(0, Math.min(MAX_CANTIDAD, disponible ?? MAX_CANTIDAD));

// Suma unidades de un producto sin pasar lo disponible. Devuelve la lista nueva y cuántas se agregaron.
export function agregarItem(items, producto, cantidad = 1) {
  const actual = items.find((x) => x.producto_id === producto.id)?.cantidad ?? 0;
  const nueva = Math.min(actual + cantidad, tope(producto.disponible));
  const agregadas = Math.max(nueva - actual, 0);
  if (agregadas === 0) return { items, agregadas };
  const lista = actual
    ? items.map((x) => (x.producto_id === producto.id ? { ...x, cantidad: nueva } : x))
    : [...items, { producto_id: producto.id, cantidad: nueva }];
  return { items: lista, agregadas };
}

// Fija la cantidad de un producto (0 lo quita).
export function fijarCantidad(items, productoId, cantidad, disponible) {
  const n = Math.min(Math.max(Math.trunc(cantidad) || 0, 0), tope(disponible));
  return n === 0 ? items.filter((x) => x.producto_id !== productoId)
    : items.map((x) => (x.producto_id === productoId ? { ...x, cantidad: n } : x));
}

export const unidades = (items) => items.reduce((s, x) => s + x.cantidad, 0);
