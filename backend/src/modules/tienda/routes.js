import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../../core/db.js';
import { uuid } from '../../core/sql.js';
import { filtrosCatalogo } from './esquemas.js';
import { fichaProducto, listarCategorias, listarProductos, sucursalesWeb } from './servicio.js';

// API pública de la tienda: sin token, solo lectura y con límite de solicitudes por IP.
const r = Router();

r.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intente nuevamente en un minuto.' },
}));

r.get('/sucursales', async (_req, res) => {
  res.json(await sucursalesWeb(pool));
});

r.get('/categorias', async (_req, res) => {
  res.json(await listarCategorias(pool));
});

r.get('/productos', async (req, res) => {
  res.json(await listarProductos(pool, filtrosCatalogo.parse(req.query)));
});

r.get('/productos/:id', async (req, res) => {
  res.json(await fichaProducto(pool, uuid.parse(req.params.id)));
});

export default r;
