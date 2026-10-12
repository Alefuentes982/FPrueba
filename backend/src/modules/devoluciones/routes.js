import { Router } from 'express';
import { pool, withTx } from '../../core/db.js';
import { condicionRango, rangoFechas } from '../../core/fechas.js';
import { likeParam, listResponse, paging, uuid } from '../../core/sql.js';
import { codigoPedido } from '../pedidos/servicio.js';
import { correoSchema } from '../../core/correo.js';
import { comprobanteDevolucion, enviarComprobanteDevolucion } from './comprobante.js';
import { cotizacionSchema, devolucionSchema } from './esquemas.js';
import { codigoDevolucion, cotizarDevolucion, crearDevolucion, detalleDevolucion, pedidoDevolvible } from './servicio.js';

const r = Router();

r.get('/', async (req, res) => {
  const { limit, page, offset } = paging(req.query);
  const { desde, hasta } = rangoFechas(req.query);
  const texto = String(req.query.q ?? '').trim();
  // "DEV-000012", "12" buscan por número de devolución; "PED-000123" por pedido; otro texto, por cliente.
  const dev = /^(dev[-\s]?)?\d+$/i.test(texto) ? Number(texto.replace(/\D/g, '')) : null;
  const ped = /^ped[-\s]?\d+$/i.test(texto) ? Number(texto.replace(/\D/g, '')) : null;
  const { rows } = await pool.query(
    `SELECT COUNT(*) OVER() AS total_filas, d.id, d.numero, d.fecha, d.motivo, d.total_reembolso, d.pedido_id,
            p.numero AS pedido_numero, p.nombre_cliente, s.nombre AS sucursal, u.nombre AS usuario
       FROM devolucion d
       JOIN pedido p ON p.id = d.pedido_id
       LEFT JOIN sucursal s ON s.id = p.sucursal_id
       JOIN usuario u ON u.id = d.usuario_id
      WHERE ($1::uuid IS NULL OR d.pedido_id = $1)
        AND ($2::uuid IS NULL OR p.sucursal_id = $2)
        AND (($3::bigint IS NULL AND $4::bigint IS NULL AND ($5::text IS NULL OR p.nombre_cliente ILIKE $5))
             OR ($3::bigint IS NOT NULL AND d.numero = $3) OR ($4::bigint IS NOT NULL AND p.numero = $4))
        AND ${condicionRango('d.fecha', 6, 7)}
      ORDER BY d.numero DESC LIMIT $8 OFFSET $9`,
    [req.query.pedido_id || null, req.query.sucursal_id || null, ped === null ? dev : null, ped,
      dev === null && ped === null ? likeParam(texto) : null, desde, hasta, limit, offset]);
  res.json(listResponse(
    rows.map((d) => ({ ...d, codigo: codigoDevolucion(d.numero), pedido_codigo: codigoPedido(d.pedido_numero) })),
    { page, limit }));
});

// Pedidos entregados que se pueden buscar para devolver (por número o cliente).
r.get('/buscar-pedidos', async (req, res) => {
  const texto = String(req.query.q ?? '').trim();
  if (texto.length < 1) return res.json([]);
  const numero = /^(ped[-\s]?)?\d+$/i.test(texto) ? Number(texto.replace(/\D/g, '')) : null;
  const { rows } = await pool.query(
    `SELECT p.id, p.numero, p.fecha, p.total, p.nombre_cliente, s.nombre AS sucursal
       FROM pedido p JOIN estado_pedido e ON e.id = p.estado_pedido_id LEFT JOIN sucursal s ON s.id = p.sucursal_id
      WHERE e.nombre = 'Entregado'
        AND ($1::bigint IS NOT NULL AND p.numero = $1 OR $1::bigint IS NULL AND p.nombre_cliente ILIKE $2)
      ORDER BY p.numero DESC LIMIT 10`, [numero, numero === null ? likeParam(texto) : null]);
  res.json(rows.map((p) => ({ ...p, codigo: codigoPedido(p.numero) })));
});

// Pedido con lo devuelto y lo que queda por devolver (líneas y medios de pago).
r.get('/pedido/:id', async (req, res) => res.json(await pedidoDevolvible(pool, uuid.parse(req.params.id))));

// Reembolso por línea, total y reparto sugerido por medio de pago, sin guardar nada.
r.post('/cotizar', async (req, res) => {
  const { pedido_id: pedidoId, items } = cotizacionSchema.parse(req.body);
  res.json(cotizarDevolucion(await pedidoDevolvible(pool, pedidoId), items));
});

r.post('/', async (req, res) => {
  const d = devolucionSchema.parse(req.body);
  const id = await withTx(req.usuarioId, (db) => crearDevolucion(db, d, { usuarioId: req.usuarioId }));
  res.status(201).json(await detalleDevolucion(pool, id));
});

r.get('/:id', async (req, res) => res.json(await detalleDevolucion(pool, uuid.parse(req.params.id))));

r.post('/:id/enviar', async (req, res) => {
  const { correo } = correoSchema.parse(req.body);
  res.json(await enviarComprobanteDevolucion(pool, uuid.parse(req.params.id), correo));
});

r.get('/:id/pdf', async (req, res) => res.json(await comprobanteDevolucion(pool, uuid.parse(req.params.id))));

export default r;
