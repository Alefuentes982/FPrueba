import { Router } from 'express';
import { z } from 'zod';
import { pool, withTx } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { likeParam, listResponse, paging, uuid } from '../utils/sql.js';

const r = Router();

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD).');
const linea = z.object({
  producto_id: uuid,
  cantidad_solicitada: z.number().int().positive(),
  costo_unitario: z.number().min(0),
});
const lineas = z
  .array(linea)
  .min(1, 'La orden necesita al menos una línea.')
  .refine((l) => new Set(l.map((x) => x.producto_id)).size === l.length, 'Producto repetido en la orden.');

const crear = z.object({
  proveedor_id: uuid,
  sucursal_id: uuid,
  fecha_esperada: fecha.nullish().transform((v) => v ?? null),
  items: lineas,
});
const editar = z.object({
  fecha_esperada: fecha.nullish().transform((v) => v ?? null),
  items: lineas,
});
const recibir = z.object({
  items: z
    .array(z.object({
      detalle_id: uuid,
      cantidad: z.number().int().positive(),
      numero_lote: z.string().trim().max(50).nullish().transform((v) => v || null),
      fecha_vencimiento: fecha.nullish().transform((v) => v ?? null),
    }))
    .min(1, 'Indique al menos una línea a recibir.'),
});

async function estadoId(db, nombre) {
  const { rows } = await db.query('SELECT id FROM estado_orden_compra WHERE nombre = $1', [nombre]);
  if (!rows[0]) throw new HttpError(500, `Falta el estado de orden de compra "${nombre}".`);
  return rows[0].id;
}

async function getOrden(db, id) {
  const { rows } = await db.query(
    `SELECT oc.id, oc.fecha, oc.fecha_esperada, oc.subtotal_neto, oc.iva, oc.total,
            oc.estado_orden_compra_id, e.nombre AS estado,
            oc.proveedor_id, pr.nombre AS proveedor, pr.rut AS proveedor_rut,
            oc.sucursal_id, s.nombre AS sucursal, oc.usuario_id, u.nombre AS usuario
       FROM orden_compra oc
       JOIN estado_orden_compra e ON e.id = oc.estado_orden_compra_id
       JOIN proveedor pr ON pr.id = oc.proveedor_id
       JOIN sucursal s ON s.id = oc.sucursal_id
       JOIN usuario u ON u.id = oc.usuario_id
      WHERE oc.id = $1`, [id]);
  if (!rows[0]) throw notFound('Orden de compra');
  const items = await db.query(
    `SELECT d.id, d.producto_id, p.sku, p.nombre AS producto, p.requiere_lote, p.requiere_vencimiento,
            d.cantidad_solicitada, d.cantidad_recibida, d.costo_unitario
       FROM orden_compra_detalle d JOIN producto p ON p.id = d.producto_id
      WHERE d.orden_compra_id = $1 ORDER BY p.nombre`, [id]);
  return { ...rows[0], items: items.rows };
}

// Bloquea la orden y exige estado "Pendiente" sin recepciones (para editar o cancelar).
async function lockPendienteSinRecepciones(db, id) {
  const { rows } = await db.query(
    `SELECT e.nombre AS estado,
            EXISTS (SELECT 1 FROM orden_compra_detalle d WHERE d.orden_compra_id = oc.id AND d.cantidad_recibida > 0) AS con_recepcion
       FROM orden_compra oc JOIN estado_orden_compra e ON e.id = oc.estado_orden_compra_id
      WHERE oc.id = $1 FOR UPDATE OF oc`, [id]);
  if (!rows[0]) throw notFound('Orden de compra');
  if (rows[0].estado !== 'Pendiente' || rows[0].con_recepcion) {
    throw new HttpError(409, 'Solo se puede modificar una orden Pendiente que no tenga recepciones.');
  }
}

async function insertarLineas(db, ocId, items) {
  for (const it of items) {
    await db.query(
      `INSERT INTO orden_compra_detalle (orden_compra_id, producto_id, cantidad_solicitada, costo_unitario)
       VALUES ($1,$2,$3,$4)`, [ocId, it.producto_id, it.cantidad_solicitada, it.costo_unitario]);
  }
}

r.get('/', async (req, res) => {
  const { limit, page, offset } = paging(req.query);
  const { rows } = await pool.query(
    `SELECT COUNT(*) OVER() AS total, oc.id, oc.fecha, oc.fecha_esperada, oc.subtotal_neto, oc.iva, oc.total,
            e.nombre AS estado, pr.nombre AS proveedor, s.nombre AS sucursal
       FROM orden_compra oc
       JOIN estado_orden_compra e ON e.id = oc.estado_orden_compra_id
       JOIN proveedor pr ON pr.id = oc.proveedor_id
       JOIN sucursal s ON s.id = oc.sucursal_id
      WHERE ($1::uuid IS NULL OR oc.estado_orden_compra_id = $1)
        AND ($2::uuid IS NULL OR oc.proveedor_id = $2)
        AND ($3::text IS NULL OR pr.nombre ILIKE $3 OR oc.id::text ILIKE $3)
      ORDER BY oc.fecha DESC LIMIT $4 OFFSET $5`,
    [req.query.estado_id || null, req.query.proveedor_id || null, likeParam(req.query.q), limit, offset]);
  res.json(listResponse(rows, { page, limit }));
});

r.get('/:id', async (req, res) => res.json(await getOrden(pool, req.params.id)));

r.post('/', async (req, res) => {
  const d = crear.parse(req.body);
  const id = await withTx(req.usuarioId, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO orden_compra (fecha_esperada, estado_orden_compra_id, proveedor_id, usuario_id, sucursal_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [d.fecha_esperada, await estadoId(db, 'Pendiente'), d.proveedor_id, req.usuarioId, d.sucursal_id]);
    await insertarLineas(db, rows[0].id, d.items); // los totales los recalcula el trigger
    return rows[0].id;
  });
  res.status(201).json(await getOrden(pool, id));
});

// Edita fecha esperada y líneas. Proveedor y sucursal no se pueden cambiar (el backend no tiene ese permiso).
r.put('/:id', async (req, res) => {
  const d = editar.parse(req.body);
  await withTx(req.usuarioId, async (db) => {
    await lockPendienteSinRecepciones(db, req.params.id);
    await db.query('UPDATE orden_compra SET fecha_esperada = $1 WHERE id = $2', [d.fecha_esperada, req.params.id]);
    await db.query('DELETE FROM orden_compra_detalle WHERE orden_compra_id = $1', [req.params.id]);
    await insertarLineas(db, req.params.id, d.items);
  });
  res.json(await getOrden(pool, req.params.id));
});

r.post('/:id/cancelar', async (req, res) => {
  await withTx(req.usuarioId, async (db) => {
    await lockPendienteSinRecepciones(db, req.params.id);
    await db.query('UPDATE orden_compra SET estado_orden_compra_id = $1 WHERE id = $2',
      [await estadoId(db, 'Cancelada'), req.params.id]);
  });
  res.json(await getOrden(pool, req.params.id));
});

// Recepción (total o parcial): crea el lote, registra el movimiento "Recepción OC" en el kardex
// (los triggers suman el stock y recalculan el costo por PMP) y actualiza el estado de la orden.
r.post('/:id/recibir', async (req, res) => {
  const d = recibir.parse(req.body);
  await withTx(req.usuarioId, async (db) => {
    const oc = await db.query(
      `SELECT oc.sucursal_id, e.nombre AS estado FROM orden_compra oc
         JOIN estado_orden_compra e ON e.id = oc.estado_orden_compra_id
        WHERE oc.id = $1 FOR UPDATE OF oc`, [req.params.id]);
    if (!oc.rows[0]) throw notFound('Orden de compra');
    if (!['Pendiente', 'Recibida parcial'].includes(oc.rows[0].estado)) {
      throw new HttpError(409, `No se puede recibir una orden en estado "${oc.rows[0].estado}".`);
    }
    const motivo = await db.query("SELECT id FROM motivo_movimiento WHERE nombre = 'Recepción OC'");
    if (!motivo.rows[0]) throw new HttpError(500, 'Falta el motivo de movimiento "Recepción OC".');

    const detalles = await db.query(
      `SELECT d.id, d.producto_id, d.cantidad_solicitada, d.cantidad_recibida, p.requiere_lote
         FROM orden_compra_detalle d JOIN producto p ON p.id = d.producto_id
        WHERE d.orden_compra_id = $1`, [req.params.id]);
    const porId = new Map(detalles.rows.map((x) => [x.id, x]));
    const vistos = new Set();

    for (const it of d.items) {
      const det = porId.get(it.detalle_id);
      if (!det) throw new HttpError(400, 'Una de las líneas no pertenece a esta orden.');
      if (vistos.has(it.detalle_id)) throw new HttpError(400, 'Línea repetida en la recepción.');
      vistos.add(it.detalle_id);
      const pendiente = det.cantidad_solicitada - det.cantidad_recibida;
      if (it.cantidad > pendiente) {
        throw new HttpError(400, `La cantidad a recibir (${it.cantidad}) supera lo pendiente (${pendiente}).`);
      }
      // Sin lote exigido se genera uno técnico: la restricción única (producto, sucursal, lote) no admite dos NULL.
      const numeroLote = it.numero_lote ?? (det.requiere_lote ? null
        : `OC-${req.params.id.slice(0, 8)}-${Date.now().toString(36)}`);

      const lote = await db.query(
        `INSERT INTO lote (numero_lote, fecha_vencimiento, cantidad_recibida, producto_id, sucursal_id, orden_compra_detalle_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [numeroLote, it.fecha_vencimiento, it.cantidad, det.producto_id, oc.rows[0].sucursal_id, det.id]);
      await db.query(
        `INSERT INTO movimiento_inventario (producto_id, sucursal_id, cantidad, motivo_movimiento_id, lote_id, usuario_id, orden_compra_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [det.producto_id, oc.rows[0].sucursal_id, it.cantidad, motivo.rows[0].id, lote.rows[0].id, req.usuarioId, req.params.id]);
      await db.query('UPDATE orden_compra_detalle SET cantidad_recibida = cantidad_recibida + $1 WHERE id = $2', [it.cantidad, det.id]);
    }

    const { rows } = await db.query(
      'SELECT bool_and(cantidad_recibida >= cantidad_solicitada) AS completa FROM orden_compra_detalle WHERE orden_compra_id = $1',
      [req.params.id]);
    await db.query('UPDATE orden_compra SET estado_orden_compra_id = $1 WHERE id = $2',
      [await estadoId(db, rows[0].completa ? 'Recibida' : 'Recibida parcial'), req.params.id]);
  });
  res.json(await getOrden(pool, req.params.id));
});

export default r;
