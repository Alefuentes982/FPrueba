// Consultas de la tienda en línea. Solo leen: la tienda no crea pedidos hasta el checkout (HU-71, Sprint 6).
// Nunca se seleccionan costo ni margen. El catálogo sale de vw_catalogo_web (productos activos de venta directa) y
// la disponibilidad de vw_stock_disponible (sin lotes vencidos), sumando solo las sucursales que venden en línea.

// Unidades disponibles por producto en las sucursales activas que venden en línea.
const DISPONIBLE_WEB = `
  disponible_web AS (
    SELECT sd.producto_id, SUM(sd.disponible)::int AS disponible
      FROM vw_stock_disponible sd
      JOIN sucursal s ON s.id = sd.sucursal_id AND s.activa AND s.habilita_venta_web
     GROUP BY sd.producto_id
  )`;

// Sucursales que venden en línea: la tienda las muestra para el retiro y en la página de información.
export async function sucursalesWeb(db) {
  const { rows } = await db.query(
    `SELECT s.id, s.nombre, s.direccion, s.telefono, co.nombre AS comuna, r.nombre AS region
       FROM sucursal s
       JOIN comuna co ON co.id = s.comuna_id
       JOIN region r ON r.id = co.region_id
      WHERE s.activa AND s.habilita_venta_web
      ORDER BY s.nombre`);
  return rows;
}

// Categorías con al menos un producto disponible en la tienda.
export async function listarCategorias(db) {
  const { rows } = await db.query(
    `WITH ${DISPONIBLE_WEB}
     SELECT cat.id, cat.nombre, COUNT(*)::int AS productos
       FROM vw_catalogo_web c
       JOIN producto p ON p.id = c.id
       JOIN categoria cat ON cat.id = p.categoria_id
       JOIN disponible_web dw ON dw.producto_id = c.id AND dw.disponible > 0
      GROUP BY cat.id, cat.nombre
      ORDER BY cat.nombre`);
  return rows;
}
