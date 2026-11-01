// Reglas de la tienda en línea que no dependen de la base de datos (se prueban con node --test sin conexión).

export const MAX_CANTIDAD = 99;   // unidades de un mismo producto por compra
export const MAX_LINEAS = 30;     // productos distintos en un carrito

// Orden del catálogo: clave pública -> ORDER BY. Solo se interpola un valor de esta lista, nunca lo que llega.
//   relevancia: más vendidos en los últimos 90 días (v.unidades), luego por nombre
//   descuento: mayor porcentaje de descuento vigente primero
// pf.precio_final es el precio que ve el cliente (con la oferta que rige desde 1 unidad, si hay).
export const ORDENES = {
  relevancia: 'COALESCE(v.unidades, 0) DESC, c.nombre ASC',
  nombre: 'c.nombre ASC',
  precio_asc: 'pf.precio_final ASC, c.nombre ASC',
  precio_desc: 'pf.precio_final DESC, c.nombre ASC',
  descuento: 'COALESCE(d.porcentaje_descuento, 0) DESC, c.nombre ASC',
};
export const ordenSql = (orden) => ORDENES[orden] ?? ORDENES.relevancia;

// Junta las líneas repetidas de un carrito (el navegador puede mandar el mismo producto dos veces) y limita la
// cantidad por producto. Mantiene el orden en que llegaron.
export function unirLineas(items) {
  const porProducto = new Map();
  for (const it of items) {
    const previa = porProducto.get(it.producto_id) ?? 0;
    porProducto.set(it.producto_id, Math.min(previa + it.cantidad, MAX_CANTIDAD));
  }
  return [...porProducto].map(([producto_id, cantidad]) => ({ producto_id, cantidad }));
}

// Estado de una línea del carrito frente al catálogo y al stock de las sucursales que venden en línea.
//   no_disponible: el producto ya no está en la tienda (inactivo o de venta con receta)
//   agotado: no hay unidades
//   stock_insuficiente: hay menos unidades de las pedidas
export function estadoLinea({ enCatalogo, disponible, cantidad }) {
  if (!enCatalogo) return 'no_disponible';
  if (disponible <= 0) return 'agotado';
  if (cantidad > disponible) return 'stock_insuficiente';
  return 'ok';
}

// Totales del carrito con las líneas vendibles. Neto e IVA con la misma fórmula que cotizar() y el pedido.
export function totalesCarrito(lineas) {
  const vendibles = lineas.filter((l) => l.estado === 'ok');
  const subtotal = vendibles.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
  const total = vendibles.reduce((s, l) => s + l.subtotal, 0);
  const neto = Math.round(total / 1.19);
  return {
    subtotal_bruto: subtotal,
    descuento_total: subtotal - total,
    total,
    subtotal_neto: neto,
    iva: total - neto,
    unidades: vendibles.reduce((s, l) => s + l.cantidad, 0),
    puede_continuar: lineas.length > 0 && vendibles.length === lineas.length,
  };
}

// Descuento que se muestra en el catálogo: la regla vigente que se activa con menos unidades.
// Si se activa desde 1 unidad, el precio rebajado se calcula con el mismo redondeo que el trigger de la línea.
export function descuentoVisible(regla, precio) {
  if (!regla || regla.porcentaje_descuento == null) return null;
  const porcentaje = Number(regla.porcentaje_descuento);
  if (!(porcentaje > 0)) return null;
  const desde = Number(regla.cantidad_minima);
  return {
    nombre: regla.nombre,
    porcentaje,
    desde,
    precio_con_descuento: desde <= 1 ? Number(precio) - Math.round((Number(precio) * porcentaje) / 100) : null,
  };
}
