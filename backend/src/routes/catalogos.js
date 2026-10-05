import { Router } from 'express';
import { pool } from '../db.js';

const r = Router();

r.get('/', async (_req, res) => {
  const [categorias, condiciones, estados, sucursales] = await Promise.all([
    pool.query('SELECT id, nombre, margen_pesimista, margen_probable, margen_optimista FROM categoria ORDER BY nombre'),
    pool.query('SELECT id, nombre, permite_venta_online FROM condicion_venta WHERE activa ORDER BY nombre'),
    pool.query('SELECT id, nombre FROM estado_orden_compra ORDER BY nombre'),
    pool.query('SELECT id, nombre FROM sucursal WHERE activa ORDER BY nombre'),
  ]);
  res.json({
    categorias: categorias.rows,
    condiciones_venta: condiciones.rows,
    estados_orden_compra: estados.rows,
    sucursales: sucursales.rows,
  });
});

export default r;
