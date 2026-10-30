import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../../core/db.js';
import { listarCategorias, sucursalesWeb } from './servicio.js';

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

export default r;
