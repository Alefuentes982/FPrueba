// Costos de despacho por comuna (HU-78). La tienda los usa al elegir despacho y el servidor los fija en el pedido.
import { Router } from 'express';
import { pool, withTx } from '../../core/db.js';
import { HttpError } from '../../core/errors.js';
import { esAdministrador } from '../../core/roles.js';
import { costosSchema, vidaUtilWebSchema } from './esquemas.js';

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

// Vida útil mínima para vender en la tienda (HU-93): días que le deben quedar a un lote para reservarlo a distancia.
const PARAMETRO_WEB = 'vida_util_web_dias';
r.get('/vida-util', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.valor AS dias, p.minimo, p.maximo, p.actualizado_en, u.nombre AS actualizado_por
       FROM parametro p LEFT JOIN usuario u ON u.id = p.actualizado_por WHERE p.clave = $1`, [PARAMETRO_WEB]);
  if (!rows[0]) throw new HttpError(500, 'Falta el parámetro de vida útil de la tienda. Ejecute db/migraciones/020_vida_util_reserva_web.sql.');
  res.json(rows[0]);
});
r.put('/vida-util', async (req, res) => {
  if (!esAdministrador(req.user)) throw new HttpError(403, 'Solo el Administrador cambia la vida útil mínima de la tienda.');
  const { dias } = vidaUtilWebSchema.parse(req.body);
  await withTx(req.usuarioId, (db) => db.query(
    'UPDATE parametro SET valor = $1, actualizado_en = NOW(), actualizado_por = $2 WHERE clave = $3', [dias, req.usuarioId, PARAMETRO_WEB]));
  res.json({ dias });
});

export default r;
