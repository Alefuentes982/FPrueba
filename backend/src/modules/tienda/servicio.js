// Consultas de la tienda en línea. Solo leen: la tienda no crea pedidos hasta el checkout (HU-71, Sprint 6).
// Nunca se seleccionan costo ni margen. El catálogo sale de vw_catalogo_web (productos activos de venta directa) y
// la disponibilidad de vw_stock_disponible (sin lotes vencidos), sumando solo las sucursales que venden en línea.
import { notFound } from '../../core/errors.js';
import { likeParam } from '../../core/sql.js';
import { descuentoVisible, ordenSql } from './reglas.js';

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

// Unidades vendidas por producto en los últimos 90 días (orden "Más vendidos"). No cuenta pedidos sin pagar,
// cancelados ni expirados.
const VENDIDOS = `
  vendidos AS (
    SELECT dp.producto_id, SUM(dp.cantidad)::int AS unidades
      FROM detalle_pedido dp
      JOIN pedido pe ON pe.id = dp.pedido_id
      JOIN estado_pedido ep ON ep.id = pe.estado_pedido_id
     WHERE pe.fecha >= NOW() - INTERVAL '90 days'
       AND ep.nombre NOT IN ('Pago pendiente', 'Cancelado', 'Expirado')
     GROUP BY dp.producto_id
  )`;

// Regla de descuento vigente que se activa con menos unidades (la que conviene mostrar en el catálogo).
const DESCUENTO_VIGENTE = `
  LEFT JOIN LATERAL (
    SELECT r.nombre, r.porcentaje_descuento, r.cantidad_minima
      FROM regla_descuento r
     WHERE r.activa AND (r.categoria_id IS NULL OR r.categoria_id = p.categoria_id)
       AND (r.fecha_inicio IS NULL OR r.fecha_inicio <= NOW()) AND (r.fecha_fin IS NULL OR r.fecha_fin >= NOW())
     ORDER BY r.cantidad_minima, (r.categoria_id IS NULL), r.porcentaje_descuento DESC
     LIMIT 1
  ) d ON TRUE`;

// Precio que ve el cliente: con la oferta si rige desde 1 unidad. Mismo redondeo que descuentoVisible().
const PRECIO_FINAL = `
  CROSS JOIN LATERAL (
    SELECT c.precio - CASE WHEN d.cantidad_minima <= 1 THEN ROUND(c.precio * d.porcentaje_descuento / 100) ELSE 0 END
           AS precio_final
  ) pf`;

const aProducto = (f) => ({
  id: f.id,
  sku: f.sku,
  nombre: f.nombre,
  presentacion: f.presentacion,
  imagen_url: f.imagen_url,
  categoria_id: f.categoria_id,
  categoria: f.categoria,
  precio: Number(f.precio),
  disponible: Number(f.disponible),
  descuento: descuentoVisible(f.descuento_nombre ? {
    nombre: f.descuento_nombre, porcentaje_descuento: f.porcentaje_descuento, cantidad_minima: f.cantidad_minima,
  } : null, f.precio),
});

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

// Catálogo paginado: solo productos con unidades disponibles. Búsqueda por nombre o SKU, filtros por categoría,
// descuento y rango de precio (sobre el precio final), y orden.
export async function listarProductos(db, f) {
  const { rows } = await db.query(
    `WITH ${DISPONIBLE_WEB}, ${VENDIDOS}
     SELECT COUNT(*) OVER() AS total_filas, c.id, c.sku, c.nombre, c.precio, c.categoria, p.categoria_id,
            p.presentacion, p.imagen_url, dw.disponible,
            d.nombre AS descuento_nombre, d.porcentaje_descuento, d.cantidad_minima
       FROM vw_catalogo_web c
       JOIN producto p ON p.id = c.id
       JOIN disponible_web dw ON dw.producto_id = c.id AND dw.disponible > 0
       ${DESCUENTO_VIGENTE}
       ${PRECIO_FINAL}
       LEFT JOIN vendidos v ON v.producto_id = c.id
      WHERE ($1::text IS NULL OR c.nombre ILIKE $1 OR c.sku ILIKE $1)
        AND ($2::uuid IS NULL OR p.categoria_id = $2)
        AND ($3::boolean IS NOT TRUE OR d.porcentaje_descuento > 0)
        AND ($4::numeric IS NULL OR pf.precio_final >= $4)
        AND ($5::numeric IS NULL OR pf.precio_final <= $5)
      ORDER BY ${ordenSql(f.orden)}
      LIMIT $6 OFFSET $7`,
    [likeParam(f.q), f.categoria_id ?? null, f.con_descuento === true, f.precio_min ?? null, f.precio_max ?? null,
      f.limit, (f.page - 1) * f.limit]);
  const total = rows.length ? Number(rows[0].total_filas) : 0;
  return { data: rows.map(aProducto), total, page: f.page, limit: f.limit, paginas: Math.max(Math.ceil(total / f.limit), 1) };
}

// Ficha: datos del producto, reglas de descuento vigentes y unidades por sucursal que vende en línea.
// Un producto sin stock se entrega igual (la ficha lo muestra agotado); uno que no está en la tienda, 404.
export async function fichaProducto(db, id) {
  const { rows } = await db.query(
    `WITH ${DISPONIBLE_WEB}
     SELECT c.id, c.sku, c.nombre, c.precio, c.categoria, p.categoria_id, p.descripcion, p.presentacion,
            p.imagen_url, c.condicion_venta, COALESCE(dw.disponible, 0) AS disponible,
            d.nombre AS descuento_nombre, d.porcentaje_descuento, d.cantidad_minima
       FROM vw_catalogo_web c
       JOIN producto p ON p.id = c.id
       LEFT JOIN disponible_web dw ON dw.producto_id = c.id
       ${DESCUENTO_VIGENTE}
      WHERE c.id = $1`, [id]);
  if (!rows[0]) throw notFound('Producto');
  const f = rows[0];

  const sucursales = await db.query(
    `SELECT s.id, s.nombre, s.direccion, co.nombre AS comuna, COALESCE(sd.disponible, 0)::int AS disponible
       FROM sucursal s
       JOIN comuna co ON co.id = s.comuna_id
       LEFT JOIN vw_stock_disponible sd ON sd.sucursal_id = s.id AND sd.producto_id = $1
      WHERE s.activa AND s.habilita_venta_web
      ORDER BY s.nombre`, [id]);

  const descuentos = await db.query(
    `SELECT r.nombre, r.porcentaje_descuento, r.cantidad_minima, r.cantidad_maxima
       FROM regla_descuento r
      WHERE r.activa AND (r.categoria_id IS NULL OR r.categoria_id = $1)
        AND (r.fecha_inicio IS NULL OR r.fecha_inicio <= NOW()) AND (r.fecha_fin IS NULL OR r.fecha_fin >= NOW())
      ORDER BY r.cantidad_minima`, [f.categoria_id]);

  return {
    ...aProducto(f),
    descripcion: f.descripcion,
    condicion_venta: f.condicion_venta,
    agotado: Number(f.disponible) <= 0,
    sucursales: sucursales.rows,
    descuentos: descuentos.rows.map((r) => ({
      nombre: r.nombre,
      porcentaje: Number(r.porcentaje_descuento),
      desde: r.cantidad_minima,
      hasta: r.cantidad_maxima,
    })),
  };
}
