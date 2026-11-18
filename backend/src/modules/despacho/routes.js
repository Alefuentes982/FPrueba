// Costos de despacho por comuna (HU-78). La tienda los usa al elegir despacho y el servidor los fija en el pedido.
import { Router } from 'express';
import { pool, withTx } from '../../core/db.js';
import { HttpError } from '../../core/errors.js';
import { esAdministrador } from '../../core/roles.js';
import { costosSchema } from './esquemas.js';

const r = Router();

// Todas las regiones con sus comunas y el costo de cada una (null = sin despacho configurado).
r.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.nombre,
            json_agg(json_build_object('id', c.id, 'nombre', c.nombre, 'costo', cd.costo, 'activo', COALESCE(cd.activo, FALSE),
                                       'actualizado_en', cd.actualizado_en, 'actualizado_por', u.nombre) ORDER BY c.nombre) AS comunas
       FROM region r
       JOIN comuna c ON c.region_id = r.id
       LEFT JOIN costo_despacho cd ON cd.comuna_id = c.id
       LEFT JOIN usuario u ON u.id = cd.actualizado_por
      GROUP BY r.id, r.nombre
      ORDER BY r.nombre`);
  res.json(rows.map((x) => ({
    ...x,
    comunas: x.comunas.map((c) => ({ ...c, costo: c.costo == null ? null : Number(c.costo) })),
    con_despacho: x.comunas.filter((c) => c.activo).length,
  })));
});

// Guarda los cambios de una o varias comunas. Una comuna inactiva conserva su costo, pero no tiene despacho.
r.put('/', async (req, res) => {
  if (!esAdministrador(req.user)) throw new HttpError(403, 'Solo el Administrador cambia los costos de despacho.');
  const { comunas } = costosSchema.parse(req.body);
  await withTx(req.usuarioId, async (db) => {
    for (const c of comunas) {
      await db.query(
        `INSERT INTO costo_despacho (comuna_id, costo, activo, actualizado_en, actualizado_por)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (comuna_id) DO UPDATE SET costo = EXCLUDED.costo, activo = EXCLUDED.activo,
                                               actualizado_en = NOW(), actualizado_por = EXCLUDED.actualizado_por`,
        [c.comuna_id, c.costo, c.activo, req.usuarioId]);
    }
  });
  res.json({ guardadas: comunas.length });
});

export default r;
