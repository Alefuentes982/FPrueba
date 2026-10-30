// Reglas de la tienda en línea que no dependen de la base de datos (se prueban con node --test sin conexión).

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
