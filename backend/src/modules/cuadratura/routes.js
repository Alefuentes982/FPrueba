import { Router } from 'express';
import { pool, withTx } from '../../core/db.js';
import { rangoFechas } from '../../core/fechas.js';
import { listResponse, paging, uuid } from '../../core/sql.js';
import { informeTurno } from './informe.js';
import { ESTADOS_TURNO, revisionSchema } from './esquemas.js';
import { detalleTurno, esSupervisor, listarTurnos, resumenPeriodo, revisarTurno } from './servicio.js';

const r = Router();

// Filtros comunes del listado y del resumen (el rango de fechas es por fecha de apertura del turno).
const filtros = (q) => ({
  sucursal_id: q.sucursal_id ? uuid.parse(q.sucursal_id) : null,
  caja_id: q.caja_id ? uuid.parse(q.caja_id) : null,
  usuario_id: q.usuario_id ? uuid.parse(q.usuario_id) : null,
  estado: ESTADOS_TURNO.includes(q.estado) ? q.estado : null,
});

r.get('/turnos', async (req, res) => {
  const { limit, page, offset } = paging(req.query);
  const rows = await listarTurnos(pool, req.user, filtros(req.query), { ...rangoFechas(req.query), limit, offset });
  res.json(listResponse(rows, { page, limit }));
});

// Personas que han abierto turnos (para filtrar por cajero). Solo para quien supervisa la caja.
r.get('/cajeros', async (req, res) => {
  if (!esSupervisor(req.user)) return res.json([]);
  const { rows } = await pool.query(
    'SELECT DISTINCT u.id, u.nombre FROM usuario u JOIN turno_caja t ON t.usuario_id = u.id ORDER BY u.nombre');
  return res.json(rows);
});

r.get('/resumen', async (req, res) => {
  res.json(await resumenPeriodo(pool, req.user, filtros(req.query), rangoFechas(req.query)));
});

r.get('/turnos/:id', async (req, res) => res.json(await detalleTurno(pool, uuid.parse(req.params.id), req.user)));

r.post('/turnos/:id/revision', async (req, res) => {
  const d = revisionSchema.parse(req.body);
  await withTx(req.usuarioId, (db) => revisarTurno(db, uuid.parse(req.params.id), req.user, d));
  res.status(201).json(await detalleTurno(pool, req.params.id, req.user));
});

r.get('/turnos/:id/pdf', async (req, res) => res.json(await informeTurno(pool, uuid.parse(req.params.id), req.user)));

export default r;
