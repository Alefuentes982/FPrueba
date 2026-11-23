import { Router } from 'express';
import { z } from 'zod';
import { pool, withTx } from '../../core/db.js';
import { condicionRango, rangoFechas } from '../../core/fechas.js';
import { likeParam, listResponse, paging, uuid } from '../../core/sql.js';
import { HttpError } from '../../core/errors.js';
import { correoSchema } from '../../core/correo.js';
import { comprobantePedido, enviarComprobantePedido } from './comprobante.js';
import { accionesWeb, ESTADOS_COLA, minutosDesde, revisarCambioWeb, revisarEntregaRetiro } from './cola.js';
import { normalizarRut } from '../proveedores/rut.js';
import { estadoSchema, pagosSchema, pedidoSchema } from './esquemas.js';
import { anularYReembolsar, pagoWebpay, reembolsosDelPedido, revisarAnulacion } from './reembolso.js';
import { esAdministrador } from '../../core/roles.js';
import {
  bloquearPedido, buscarProductosVendibles, cambiarEstado, cancelarPedido, codigoPedido, crearPedido, detallePedido, expirarPendientes,
  registrarPagos, reemplazarPedido, reservarPedido,
} from './servicio.js';

const r = Router();

// Buscador de líneas del pedido: productos vendibles con su precio y stock disponible en la sucursal.
r.get('/catalogo', async (req, res) => {
  const { limit } = paging(req.query);
  res.json(await buscarProductosVendibles(pool, {
    sucursalId: req.query.sucursal_id, q: String(req.query.q ?? '').trim() || null, remoto: req.query.canal !== 'Presencial', limit,
  }));
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

// Cola de pedidos web (HU-76): pedidos de la tienda que esperan al personal, los más antiguos primero. "pagado" es
// cuándo quedó pagado (del historial); "nuevos" son los pagados que nadie empezó a preparar.
r.get('/web', async (req, res) => {
  const filtro = z.object({
    estado: z.enum(ESTADOS_COLA).optional().or(z.literal('').transform(() => undefined)),
    sucursal_id: uuid.optional().or(z.literal('').transform(() => undefined)),
    entrega: z.enum(['retiro', 'despacho']).optional().or(z.literal('').transform(() => undefined)),
  }).parse(req.query);
  const { rows } = await pool.query(
    `SELECT p.id, p.numero, p.fecha, p.total, p.nombre_cliente, p.telefono, p.tipo_entrega, p.direccion_pedido,
            c.nombre AS comuna, e.nombre AS estado, s.id AS sucursal_id, s.nombre AS sucursal,
            (SELECT SUM(d.cantidad)::int FROM detalle_pedido d WHERE d.pedido_id = p.id) AS unidades,
            (SELECT MIN(h.fecha) FROM pedido_estado_historial h JOIN estado_pedido x ON x.id = h.estado_nuevo_id
              WHERE h.pedido_id = p.id AND x.nombre = 'Pagado') AS pagado,
            (SELECT MAX(h.fecha) FROM pedido_estado_historial h WHERE h.pedido_id = p.id) AS cambio
       FROM pedido p
       JOIN estado_pedido e ON e.id = p.estado_pedido_id
       JOIN canal_venta cv ON cv.id = p.canal_venta_id
       LEFT JOIN sucursal s ON s.id = p.sucursal_id
       LEFT JOIN comuna c ON c.id = p.comuna_id
      WHERE cv.nombre = 'Online' AND p.tipo_entrega IS NOT NULL AND e.nombre = ANY($1)
        AND ($2::uuid IS NULL OR p.sucursal_id = $2)
        AND ($3::text IS NULL OR p.tipo_entrega = $3)
      ORDER BY array_position($1, e.nombre::text), p.numero`,
    [ESTADOS_COLA, filtro.sucursal_id ?? null, filtro.entrega ?? null]);
  const ahora = new Date();
  const pedidos = rows.map((p) => ({
    ...p, codigo: codigoPedido(p.numero), total: Number(p.total),
    minutos_pagado: p.pagado ? minutosDesde(p.pagado, ahora) : null, minutos_estado: minutosDesde(p.cambio ?? p.fecha, ahora),
  }));
  const conteo = Object.fromEntries(ESTADOS_COLA.map((x) => [x, pedidos.filter((p) => p.estado === x).length]));
  res.json({
    data: filtro.estado ? pedidos.filter((p) => p.estado === filtro.estado) : pedidos,
    conteo, nuevos: conteo['Pagado'], actualizado: ahora.toISOString(),
  });
});

// Un pedido web muestra solo el paso que sigue según su entrega (retiro o despacho).
// Ficha del pedido para el personal. Un pedido web muestra solo el paso que sigue según su entrega; si se pagó con
// Webpay, "Cancelar" se reemplaza por "Anular y reembolsar" (HU-80, solo el Administrador).
async function fichaPedido(id, user) {
  const p = await detallePedido(pool, id);
  const pago = await pagoWebpay(pool, id);
  let acciones = accionesWeb(p);
  if (pago) acciones = acciones.filter((a) => a !== 'cancelar');
  if (pago && esAdministrador(user) && !revisarAnulacion(p, pago)) acciones = [...acciones, 'anular-reembolso'];
  return { ...p, acciones, reembolsos: await reembolsosDelPedido(pool, id) };
}

r.get('/:id', async (req, res) => res.json(await fichaPedido(uuid.parse(req.params.id), req.user)));

// Historial de estados (HU-76): quién cambió el pedido y cuándo. Sin usuario = la tienda o un proceso automático.
r.get('/:id/historial', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { rows } = await pool.query(
    `SELECT h.id, h.fecha, ea.nombre AS estado_anterior, en.nombre AS estado, u.nombre AS usuario, r.nombre AS rol
       FROM pedido_estado_historial h
       JOIN estado_pedido en ON en.id = h.estado_nuevo_id
       LEFT JOIN estado_pedido ea ON ea.id = h.estado_anterior_id
       LEFT JOIN usuario u ON u.id = h.usuario_id
       LEFT JOIN rol r ON r.id = u.rol_id
      WHERE h.pedido_id = $1
      ORDER BY h.fecha, h.id`, [id]);
  res.json(rows);
});

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
  const { pagos, efectivo_recibido: recibido } = pagosSchema.parse(req.body);
  await withTx(req.usuarioId, (db) => registrarPagos(db, req.params.id, pagos, recibido));
  res.json(await detallePedido(pool, req.params.id));
});

r.post('/:id/estado', async (req, res) => {
  const { estado } = estadoSchema.parse(req.body);
  await withTx(req.usuarioId, async (db) => {
    // Pedido web (HU-76): el paso tiene que seguir el camino de su entrega.
    const p = await bloquearPedido(db, req.params.id);
    const { rows } = await db.query('SELECT tipo_entrega FROM pedido WHERE id = $1', [p.id]);
    const error = revisarCambioWeb({ ...p, tipo_entrega: rows[0].tipo_entrega }, estado);
    if (error) throw new HttpError(409, error);
    await cambiarEstado(db, req.params.id, estado);
  });
  res.json(await fichaPedido(req.params.id, req.user));
});

r.post('/:id/cancelar', async (req, res) => {
  await withTx(req.usuarioId, async (db) => {
    // Un pago con Webpay no se anula solo en el sistema: el dinero se devuelve con "Anular y reembolsar" (HU-80).
    if (await pagoWebpay(db, req.params.id)) throw new HttpError(409, 'Este pedido se pagó con Webpay: use "Anular y reembolsar" para devolver el dinero.');
    await cancelarPedido(db, req.params.id);
  });
  res.json(await fichaPedido(req.params.id, req.user));
});

// Entrega de un retiro en farmacia (HU-77): el vendedor escribe el número de pedido y el RUT que muestra el cliente.
// Si no calzan, el pedido no cambia y el intento queda en el log.
r.post('/:id/entregar', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { codigo, rut } = z.object({ codigo: z.string().trim().max(20).default(''), rut: z.string().trim().max(15).default('') }).parse(req.body ?? {});
  await withTx(req.usuarioId, async (db) => {
    const p = await bloquearPedido(db, id);
    const { rows } = await db.query(
      'SELECT p.tipo_entrega, c.rut AS rut_cliente FROM pedido p LEFT JOIN cliente c ON c.usuario_id = p.cliente_id WHERE p.id = $1', [id]);
    const error = revisarEntregaRetiro({ ...p, ...rows[0] }, { codigo, rut, usuario: req.user, normalizarRut });
    if (error) {
      if (error.path) console.warn(`Entrega rechazada de ${codigoPedido(p.numero)} por ${req.user.correo}: ${error.path} no corresponde.`);
      throw new HttpError(error.status, error.error, error.path && [{ path: error.path, message: error.error }]);
    }
    await cambiarEstado(db, id, 'Entregado');
  });
  res.json(await fichaPedido(id, req.user));
});

// Anula un pedido web pagado y reembolsa por Webpay todo lo pagado (HU-80). Solo el Administrador.
r.post('/:id/anular-reembolso', async (req, res) => {
  if (!esAdministrador(req.user)) throw new HttpError(403, 'Solo el Administrador anula y reembolsa pedidos web.');
  const { motivo } = z.object({ motivo: z.string().trim().min(5, 'Escriba el motivo (al menos 5 caracteres).').max(300) }).parse(req.body ?? {});
  const id = uuid.parse(req.params.id);
  const reembolso = await withTx(req.usuarioId, (db) => anularYReembolsar(db, id, { motivo, usuarioId: req.usuarioId }));
  res.json({ ...(await fichaPedido(id, req.user)), reembolso });
});

// Envía el comprobante por correo (PDF adjunto) a la dirección indicada.
r.post('/:id/enviar', async (req, res) => {
  const { correo } = correoSchema.parse(req.body);
  res.json(await enviarComprobantePedido(pool, uuid.parse(req.params.id), correo));
});

r.get('/:id/pdf', async (req, res) => {
  uuid.parse(req.params.id);
  res.json(await comprobantePedido(pool, req.params.id));
});

export default r;
