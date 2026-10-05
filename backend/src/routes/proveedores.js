import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { notFound } from '../errors.js';
import { buildUpdate, likeParam, listResponse, optionalText, paging } from '../utils/sql.js';
import { normalizarRut } from '../utils/rut.js';

const r = Router();

const campos = {
  nombre: z.string().trim().min(1).max(150),
  rut: z.string().trim().refine((v) => normalizarRut(v) !== null, 'RUT inválido.').transform(normalizarRut),
  contacto: optionalText(150),
};
const crear = z.object(campos);
const actualizar = z.object(campos).partial();

const getProveedor = async (id) => {
  const { rows } = await pool.query('SELECT id, nombre, rut, contacto FROM proveedor WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Proveedor');
  return rows[0];
};

// proveedor no tiene baja lógica ni DELETE para el backend: solo alta, edición y consulta.
r.get('/', async (req, res) => {
  const { limit, page, offset } = paging(req.query);
  const { rows } = await pool.query(
    `SELECT COUNT(*) OVER() AS total, id, nombre, rut, contacto FROM proveedor
      WHERE ($1::text IS NULL OR nombre ILIKE $1 OR rut ILIKE $1)
      ORDER BY nombre LIMIT $2 OFFSET $3`,
    [likeParam(req.query.q), limit, offset]);
  res.json(listResponse(rows, { page, limit }));
});

r.get('/:id', async (req, res) => res.json(await getProveedor(req.params.id)));

// Productos que ofrece el proveedor, con su costo referencial (para armar órdenes de compra).
r.get('/:id/productos', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id AS producto_id, p.sku, p.nombre, p.activo, pp.costo_referencial, pp.es_principal
       FROM producto_proveedor pp JOIN producto p ON p.id = pp.producto_id
      WHERE pp.proveedor_id = $1 ORDER BY p.nombre`, [req.params.id]);
  res.json(rows);
});

r.post('/', async (req, res) => {
  const d = crear.parse(req.body);
  const { rows } = await pool.query(
    'INSERT INTO proveedor (nombre, rut, contacto) VALUES ($1,$2,$3) RETURNING id, nombre, rut, contacto',
    [d.nombre, d.rut, d.contacto]);
  res.status(201).json(rows[0]);
});

r.put('/:id', async (req, res) => {
  const upd = buildUpdate('proveedor', actualizar.parse(req.body), req.params.id);
  if (upd) {
    const { rowCount } = await pool.query(upd.text, upd.values);
    if (!rowCount) throw notFound('Proveedor');
  }
  res.json(await getProveedor(req.params.id));
});

export default r;
