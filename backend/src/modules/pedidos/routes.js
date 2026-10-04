import { Router } from 'express';
import { z } from 'zod';
import { pool, withTx } from '../../core/db.js';
import { clp, fechaDMA, generarDocumentoPdf, pdfABuffer } from '../../core/documentos.js';
import { condicionRango, rangoFechas } from '../../core/fechas.js';
import { HttpError } from '../../core/errors.js';
import { likeParam, listResponse, paging, uuid } from '../../core/sql.js';
import { estadoSchema, pagosSchema, pedidoSchema } from './esquemas.js';
import {
  cambiarEstado, cancelarPedido, codigoPedido, crearPedido, detallePedido, ESTADO, expirarPendientes,
  registrarPagos, reemplazarPedido, reservarPedido,
} from './servicio.js';

const r = Router();

// Productos vendibles con su precio y stock disponible en una sucursal (buscador de líneas del pedido y de la caja).
// Por un canal a distancia solo se ofrecen los de condición de venta permitida online.
r.get('/catalogo', async (req, res) => {
  const { limit } = paging(req.query);
  const remoto = req.query.canal !== 'Presencial';
  const { rows } = await pool.query(
    `SELECT p.id, p.sku, p.nombre, p.precio, c.nombre AS categoria, cv.nombre AS condicion_venta,
            COALESCE(sd.disponible, 0) AS disponible
       FROM producto p
       JOIN categoria c ON c.id = p.categoria_id
       JOIN condicion_venta cv ON cv.id = p.condicion_venta_id
       LEFT JOIN vw_stock_disponible sd ON sd.producto_id = p.id AND sd.sucursal_id = $1
      WHERE p.activo AND cv.activa AND (NOT $2::boolean OR cv.permite_venta_online)
        AND ($3::text IS NULL OR p.sku ILIKE $3 OR p.nombre ILIKE $3)
      ORDER BY (COALESCE(sd.disponible, 0) > 0) DESC, p.nombre LIMIT $4`,
    [req.query.sucursal_id || null, remoto, likeParam(req.query.q), Math.min(limit, 50)]);
  res.json(rows);
});

r.get('/', async (req, res) => {
  const { limit, page, offset } = paging(req.query);
  const { desde, hasta } = rangoFechas(req.query);
  const texto = String(req.query.q ?? '').trim();
  // "PED-000123", "123" o "ped 123" buscan por número; cualquier otro texto, por cliente.
  const numero = /^(ped[-\s]?)?\d+$/i.test(texto) ? Number(texto.replace(/\D/g, '')) : null;
  const { rows } = await pool.query(
    `SELECT COUNT(*) OVER() AS total_filas, p.id, p.numero, p.fecha, p.total, p.nombre_cliente,
            e.nombre AS estado, cv.nombre AS canal, s.nombre AS sucursal, u.nombre AS vendedor
       FROM pedido p
       JOIN estado_pedido e ON e.id = p.estado_pedido_id
       JOIN canal_venta cv ON cv.id = p.canal_venta_id
       LEFT JOIN sucursal s ON s.id = p.sucursal_id
       LEFT JOIN usuario u ON u.id = p.vendedor_id
      WHERE ($1::uuid IS NULL OR p.estado_pedido_id = $1)
        AND ($2::uuid IS NULL OR p.canal_venta_id = $2)
        AND ($3::uuid IS NULL OR p.sucursal_id = $3)
        AND ($4::bigint IS NOT NULL AND p.numero = $4 OR $4::bigint IS NULL AND ($5::text IS NULL OR p.nombre_cliente ILIKE $5))
        AND ${condicionRango('p.fecha', 6, 7)}
      ORDER BY p.numero DESC LIMIT $8 OFFSET $9`,
    [req.query.estado_id || null, req.query.canal_id || null, req.query.sucursal_id || null, numero,
      numero === null ? likeParam(texto) : null, desde, hasta, limit, offset]);
  res.json(listResponse(rows.map((p) => ({ ...p, codigo: codigoPedido(p.numero) })), { page, limit }));
});

r.get('/:id', async (req, res) => res.json(await detallePedido(pool, req.params.id)));

// Pedido a distancia (canal Online) creado desde el backoffice, p. ej. telefónico. La venta presencial entra por la caja.
r.post('/', async (req, res) => {
  const d = pedidoSchema.parse(req.body);
  const id = await withTx(req.usuarioId, (db) => crearPedido(db, d, { canal: 'Online', usuarioId: req.usuarioId }));
  res.status(201).json(await detallePedido(pool, id));
});

r.put('/:id', async (req, res) => {
  const d = pedidoSchema.parse(req.body);
  await withTx(req.usuarioId, (db) => reemplazarPedido(db, req.params.id, d));
  res.json(await detallePedido(pool, req.params.id));
});

r.post('/expirar-pendientes', async (req, res) => {
  const { minutos } = z.object({ minutos: z.number().int().min(1).max(1440).default(20) }).parse(req.body ?? {});
  const expirados = await withTx(req.usuarioId, (db) => expirarPendientes(db, minutos));
  res.json({ expirados });
});

r.post('/:id/reservar', async (req, res) => {
  await withTx(req.usuarioId, (db) => reservarPedido(db, req.params.id));
  res.json(await detallePedido(pool, req.params.id));
});

r.post('/:id/pagos', async (req, res) => {
  const { pagos } = pagosSchema.parse(req.body);
  await withTx(req.usuarioId, (db) => registrarPagos(db, req.params.id, pagos));
  res.json(await detallePedido(pool, req.params.id));
});

r.post('/:id/estado', async (req, res) => {
  const { estado } = estadoSchema.parse(req.body);
  await withTx(req.usuarioId, (db) => cambiarEstado(db, req.params.id, estado));
  res.json(await detallePedido(pool, req.params.id));
});

r.post('/:id/cancelar', async (req, res) => {
  await withTx(req.usuarioId, (db) => cancelarPedido(db, req.params.id));
  res.json(await detallePedido(pool, req.params.id));
});

// Comprobante del pedido (no es un documento tributario). Se entrega como JSON/base64: ver ordenes-compra.
r.get('/:id/pdf', async (req, res) => {
  uuid.parse(req.params.id);
  const p = await detallePedido(pool, req.params.id);
  const cliente = [p.nombre_cliente, p.telefono && `Tel. ${p.telefono}`, p.direccion_pedido, p.comuna].filter(Boolean);
  const pagado = p.pagos.filter((x) => x.estado === 'Aprobado');
  const doc = generarDocumentoPdf({
    titulo: 'COMPROBANTE DE PEDIDO',
    codigo: p.codigo,
    emisor: {
      nombre: process.env.EMPRESA_NOMBRE || 'FarmaClick',
      lineas: [process.env.EMPRESA_RUT && `RUT ${process.env.EMPRESA_RUT}`, process.env.EMPRESA_DIRECCION].filter(Boolean),
    },
    metadatos: [['Fecha', fechaDMA(p.fecha)], ['Estado', p.estado], ['Atendió', p.vendedor ?? '—']],
    partes: [
      { titulo: 'Cliente', lineas: cliente },
      { titulo: 'Sucursal', lineas: [p.sucursal, p.sucursal_direccion, p.sucursal_telefono && `Tel. ${p.sucursal_telefono}`] },
    ],
    columnas: [
      { header: 'SKU', key: 'sku', ancho: 0.14 },
      { header: 'Producto', key: 'producto', ancho: 0.34 },
      { header: 'Cant.', key: 'cantidad', ancho: 0.08, alinear: 'right' },
      { header: 'Precio unit.', key: 'precio', ancho: 0.15, alinear: 'right' },
      { header: 'Desc.', key: 'descuento', ancho: 0.12, alinear: 'right' },
      { header: 'Subtotal', key: 'subtotal', ancho: 0.17, alinear: 'right' },
    ],
    filas: p.lineas.map((l) => ({
      sku: l.sku, producto: l.nombre_producto, cantidad: l.cantidad, precio: clp(l.precio_unitario),
      descuento: Number(l.descuento_monto) ? `-${clp(l.descuento_monto)}` : '', subtotal: clp(l.subtotal),
    })),
    totales: [
      ['Subtotal', clp(p.subtotal_bruto)],
      ...(p.descuento_total ? [['Descuentos', `-${clp(p.descuento_total)}`]] : []),
      ['Neto', clp(p.subtotal_neto)], ['IVA 19%', clp(p.iva)], ['Total', clp(p.total)],
    ],
    nota: pagado.length
      ? `Pagado con: ${pagado.map((x) => `${x.medio_pago} ${clp(x.monto)}`).join(', ')}. Documento no tributario.`
      : 'Documento no tributario.',
    sello: p.estado === ESTADO.PENDIENTE ? 'PENDIENTE' : [ESTADO.CANCELADO, ESTADO.EXPIRADO].includes(p.estado) ? 'ANULADO' : null,
  });
  const pdf = await pdfABuffer(doc);
  res.json({ archivo: `${p.codigo}.pdf`, tipo: 'application/pdf', base64: pdf.toString('base64') });
});

export default r;
