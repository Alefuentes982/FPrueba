// Cuadratura de caja: historial de turnos, desglose del efectivo, diferencias y revisión.
// Visibilidad: quien supervisa la caja (permiso supervision_caja: Administrador y Jefe de local) ve todos los turnos y
// los montos esperados; el resto solo ve sus propios turnos y, mientras el turno está abierto, no se le muestra
// cuánto debería haber (cierre ciego).
import { condicionRango } from '../../core/fechas.js';
import { HttpError, notFound } from '../../core/errors.js';
import { codigoPedido } from '../pedidos/servicio.js';
import { codigoDevolucion } from '../devoluciones/servicio.js';
import { ESTADOS_TURNO } from './esquemas.js';

export const esSupervisor = (user) => user.permisos.includes('supervision_caja');
export const diferenciaTurno = (t) => (t.fecha_cierre ? Number(t.contado) - Number(t.esperado) : null);

const NO_ANULADAS = "e.nombre NOT IN ('Cancelado', 'Expirado')";

// Turnos que cumplen los filtros, como CTE reutilizable (listado y resumen usan el mismo criterio).
export function turnosFiltrados(user, f, desde, hasta) {
  const params = [];
  const cond = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  const usuario = esSupervisor(user) ? f.usuario_id : user.id;
  if (usuario) cond.push(`t.usuario_id = ${p(usuario)}`);
  if (f.sucursal_id) cond.push(`c.sucursal_id = ${p(f.sucursal_id)}`);
  if (f.caja_id) cond.push(`t.caja_id = ${p(f.caja_id)}`);
  const i = params.length + 1;
  params.push(desde, hasta);
  cond.push(condicionRango('t.fecha_apertura', i, i + 1));
  if (f.estado === 'abierto') cond.push('t.fecha_cierre IS NULL');
  if (f.estado === 'cerrado') cond.push('t.fecha_cierre IS NOT NULL');
  if (f.estado === 'sin_revisar') cond.push('t.fecha_cierre IS NOT NULL AND r.id IS NULL');
  if (f.estado === 'con_diferencia') cond.push('t.fecha_cierre IS NOT NULL AND t.monto_cierre_real_efectivo <> t.monto_cierre_esperado_efectivo');
  const cte = `tt AS (
    SELECT t.id, t.usuario_id, t.caja_id, t.fecha_apertura, t.fecha_cierre, t.monto_apertura_efectivo,
           t.monto_cierre_esperado_efectivo AS esperado, t.monto_cierre_real_efectivo AS contado,
           c.numero AS caja_numero, c.sucursal_id, r.id AS revision_id, r.conforme
      FROM turno_caja t JOIN caja c ON c.id = t.caja_id LEFT JOIN turno_revision r ON r.turno_caja_id = t.id
     WHERE ${cond.join(' AND ')})`;
  return { cte, params };
}

export async function listarTurnos(db, user, f, { desde, hasta, limit, offset }) {
  const { cte, params } = turnosFiltrados(user, f, desde, hasta);
  const n = params.length;
  const { rows } = await db.query(
    `WITH ${cte}
     SELECT COUNT(*) OVER() AS total_filas, tt.id, tt.fecha_apertura, tt.fecha_cierre, tt.monto_apertura_efectivo, tt.caja_numero,
            s.id AS sucursal_id, s.nombre AS sucursal, u.id AS usuario_id, u.nombre AS cajero,
            tt.esperado, tt.contado, (tt.revision_id IS NOT NULL) AS revisado, tt.conforme,
            v.ventas, v.total_ventas, d.devoluciones, d.total_devoluciones
       FROM tt
       JOIN sucursal s ON s.id = tt.sucursal_id
       JOIN usuario u ON u.id = tt.usuario_id
       LEFT JOIN LATERAL (SELECT COUNT(*)::int AS ventas, COALESCE(SUM(p.total), 0) AS total_ventas
                            FROM pedido p JOIN estado_pedido e ON e.id = p.estado_pedido_id
                           WHERE p.turno_caja_id = tt.id AND ${NO_ANULADAS}) v ON TRUE
       LEFT JOIN LATERAL (SELECT COUNT(*)::int AS devoluciones, COALESCE(SUM(total_reembolso), 0) AS total_devoluciones
                            FROM devolucion WHERE turno_caja_id = tt.id) d ON TRUE
      ORDER BY tt.fecha_apertura DESC LIMIT $${n + 1} OFFSET $${n + 2}`,
    [...params, limit, offset]);
  // Esperado y contado existen recién al cerrar (los congela fn_cerrar_turno); de un turno abierto no se muestran.
  return rows.map((t) => ({
    ...t,
    esperado: t.fecha_cierre ? t.esperado : null,
    contado: t.fecha_cierre ? t.contado : null,
    diferencia: t.fecha_cierre ? Number(t.contado) - Number(t.esperado) : null,
    estado: !t.fecha_cierre ? 'Abierto' : t.revisado ? (t.conforme ? 'Revisado conforme' : 'Revisado con observaciones') : 'Cerrado sin revisar',
  }));
}

// Totales del período: ventas, devoluciones, diferencias y desglose por medio de pago y por cajero.
export async function resumenPeriodo(db, user, f, { desde, hasta }) {
  const { cte, params } = turnosFiltrados(user, f, desde, hasta);
  const consulta = (sql) => db.query(`WITH ${cte} ${sql}`, params);
  const [turnos, ventas, medios, cajeros] = await Promise.all([
    consulta(`SELECT COUNT(*)::int AS turnos,
                     COUNT(*) FILTER (WHERE fecha_cierre IS NULL)::int AS abiertos,
                     COUNT(*) FILTER (WHERE fecha_cierre IS NOT NULL)::int AS cerrados,
                     COUNT(*) FILTER (WHERE fecha_cierre IS NOT NULL AND revision_id IS NULL)::int AS sin_revisar,
                     COUNT(*) FILTER (WHERE fecha_cierre IS NOT NULL AND contado <> esperado)::int AS con_diferencia,
                     COALESCE(SUM(contado - esperado) FILTER (WHERE fecha_cierre IS NOT NULL), 0) AS diferencia_neta,
                     COALESCE(SUM(contado - esperado) FILTER (WHERE fecha_cierre IS NOT NULL AND contado > esperado), 0) AS sobrantes,
                     COALESCE(-SUM(contado - esperado) FILTER (WHERE fecha_cierre IS NOT NULL AND contado < esperado), 0) AS faltantes
                FROM tt`),
    consulta(`SELECT COUNT(*)::int AS ventas, COALESCE(SUM(p.total), 0) AS total_ventas, COALESCE(SUM(p.redondeo), 0) AS redondeo_ventas,
                     (SELECT COUNT(*)::int FROM devolucion d WHERE d.turno_caja_id IN (SELECT id FROM tt)) AS devoluciones,
                     (SELECT COALESCE(SUM(d.total_reembolso), 0) FROM devolucion d WHERE d.turno_caja_id IN (SELECT id FROM tt)) AS total_devoluciones,
                     (SELECT COALESCE(SUM(d.redondeo), 0) FROM devolucion d WHERE d.turno_caja_id IN (SELECT id FROM tt)) AS redondeo_devoluciones
                FROM pedido p JOIN estado_pedido e ON e.id = p.estado_pedido_id
               WHERE p.turno_caja_id IN (SELECT id FROM tt) AND ${NO_ANULADAS}`),
    consulta(`SELECT mp.nombre AS medio_pago,
                     COALESCE((SELECT SUM(tp.monto) FROM transaccion_pago tp JOIN pedido p ON p.id = tp.pedido_id
                                 JOIN estado_transaccion et ON et.id = tp.estado_transaccion_id AND et.nombre = 'Aprobado'
                                WHERE tp.medio_pago_id = mp.id AND p.turno_caja_id IN (SELECT id FROM tt)), 0) AS ventas,
                     COALESCE((SELECT SUM(dp.monto) FROM devolucion_pago dp JOIN devolucion d ON d.id = dp.devolucion_id
                                WHERE dp.medio_pago_id = mp.id AND d.turno_caja_id IN (SELECT id FROM tt)), 0) AS devoluciones
                FROM medio_pago mp ORDER BY mp.nombre`),
    consulta(`SELECT u.nombre AS cajero, COUNT(*)::int AS turnos,
                     COALESCE(SUM(contado - esperado) FILTER (WHERE fecha_cierre IS NOT NULL), 0) AS diferencia_neta,
                     COALESCE(-SUM(contado - esperado) FILTER (WHERE fecha_cierre IS NOT NULL AND contado < esperado), 0) AS faltantes,
                     COALESCE(SUM(contado - esperado) FILTER (WHERE fecha_cierre IS NOT NULL AND contado > esperado), 0) AS sobrantes,
                     COUNT(*) FILTER (WHERE fecha_cierre IS NOT NULL AND contado <> esperado)::int AS con_diferencia,
                     COALESCE((SELECT SUM(p.total) FROM pedido p JOIN estado_pedido e ON e.id = p.estado_pedido_id
                                WHERE p.turno_caja_id IN (SELECT id FROM tt WHERE tt.usuario_id = u.id) AND ${NO_ANULADAS}), 0) AS total_ventas
                FROM tt JOIN usuario u ON u.id = tt.usuario_id GROUP BY u.id, u.nombre ORDER BY u.nombre`),
  ]);
  const v = ventas.rows[0];
  return {
    ...turnos.rows[0], ...v,
    ventas_netas: Number(v.total_ventas) - Number(v.total_devoluciones),
    // Ajuste del efectivo por la Ley 20.956: lo cobrado por medio de pago suma ventas netas + este redondeo.
    redondeo: Number(v.redondeo_ventas) - Number(v.redondeo_devoluciones),
    por_medio: medios.rows.filter((m) => Number(m.ventas) || Number(m.devoluciones)),
    por_cajero: cajeros.rows,
  };
}

// Ficha completa del turno: cifras, cuadre de efectivo, desglose por medio de pago, ventas, devoluciones y revisión.
export async function detalleTurno(db, id, user) {
  const { rows } = await db.query(
    `SELECT t.id, t.usuario_id, t.fecha_apertura, t.fecha_cierre, t.monto_apertura_efectivo,
            t.monto_cierre_esperado_efectivo AS esperado, t.monto_cierre_real_efectivo AS contado,
            c.numero AS caja_numero, s.nombre AS sucursal, s.direccion AS sucursal_direccion, u.nombre AS cajero,
            r.id AS revision_id, r.conforme, r.observacion AS revision_observacion, r.fecha AS revision_fecha, ur.nombre AS revisor
       FROM turno_caja t
       JOIN caja c ON c.id = t.caja_id JOIN sucursal s ON s.id = c.sucursal_id JOIN usuario u ON u.id = t.usuario_id
       LEFT JOIN turno_revision r ON r.turno_caja_id = t.id LEFT JOIN usuario ur ON ur.id = r.usuario_id
      WHERE t.id = $1`, [id]);
  const t = rows[0];
  if (!t || (!esSupervisor(user) && t.usuario_id !== user.id)) throw notFound('Turno');
  const cerrado = Boolean(t.fecha_cierre);
  const verCifras = cerrado || esSupervisor(user);

  const [medios, ventas, devoluciones] = await Promise.all([
    db.query(
      `SELECT mp.nombre AS medio_pago,
              COALESCE((SELECT SUM(tp.monto) FROM transaccion_pago tp JOIN pedido p ON p.id = tp.pedido_id
                          JOIN estado_transaccion et ON et.id = tp.estado_transaccion_id AND et.nombre = 'Aprobado'
                         WHERE tp.medio_pago_id = mp.id AND p.turno_caja_id = $1), 0) AS ventas,
              COALESCE((SELECT SUM(dp.monto) FROM devolucion_pago dp JOIN devolucion d ON d.id = dp.devolucion_id
                         WHERE dp.medio_pago_id = mp.id AND d.turno_caja_id = $1), 0) AS devoluciones
         FROM medio_pago mp ORDER BY mp.nombre`, [id]),
    db.query(
      `SELECT p.id, p.numero, p.fecha, p.nombre_cliente, p.total, p.redondeo, e.nombre AS estado
         FROM pedido p JOIN estado_pedido e ON e.id = p.estado_pedido_id WHERE p.turno_caja_id = $1 ORDER BY p.numero`, [id]),
    db.query(
      `SELECT d.id, d.numero, d.fecha, d.motivo, d.total_reembolso, d.redondeo, ped.numero AS pedido_numero
         FROM devolucion d JOIN pedido ped ON ped.id = d.pedido_id WHERE d.turno_caja_id = $1 ORDER BY d.numero`, [id]),
  ]);
  const porMedio = medios.rows.map((m) => ({ ...m, ventas: Number(m.ventas), devoluciones: Number(m.devoluciones) }))
    .filter((m) => m.ventas || m.devoluciones);
  const efectivo = porMedio.find((m) => m.medio_pago === 'Efectivo') ?? { ventas: 0, devoluciones: 0 };
  const apertura = Number(t.monto_apertura_efectivo);
  const esperado = cerrado ? Number(t.esperado) : Number(apertura + efectivo.ventas - efectivo.devoluciones);

  const ventasValidas = ventas.rows.filter((v) => !['Cancelado', 'Expirado'].includes(v.estado));
  return {
    id: t.id, caja_numero: t.caja_numero, sucursal: t.sucursal, sucursal_direccion: t.sucursal_direccion, cajero: t.cajero,
    fecha_apertura: t.fecha_apertura, fecha_cierre: t.fecha_cierre, abierto: !cerrado,
    es_propio: t.usuario_id === user.id,
    efectivo: verCifras ? {
      apertura, ventas: efectivo.ventas, devoluciones: efectivo.devoluciones, esperado,
      contado: cerrado ? Number(t.contado) : null, diferencia: cerrado ? Number(t.contado) - Number(t.esperado) : null,
    } : null,
    por_medio: verCifras ? porMedio : null,
    resumen: {
      ventas: ventasValidas.length, total_ventas: ventasValidas.reduce((s, v) => s + Number(v.total), 0),
      devoluciones: devoluciones.rows.length, total_devoluciones: devoluciones.rows.reduce((s, d) => s + Number(d.total_reembolso), 0),
      redondeo: ventasValidas.reduce((s, v) => s + Number(v.redondeo), 0) - devoluciones.rows.reduce((s, d) => s + Number(d.redondeo), 0),
    },
    ventas: ventas.rows.map((v) => ({ ...v, codigo: codigoPedido(v.numero) })),
    devoluciones: devoluciones.rows.map((d) => ({ ...d, codigo: codigoDevolucion(d.numero), pedido_codigo: codigoPedido(d.pedido_numero) })),
    revision: t.revision_id ? { conforme: t.conforme, observacion: t.revision_observacion, fecha: t.revision_fecha, revisor: t.revisor } : null,
    puede_revisar: esSupervisor(user) && cerrado && !t.revision_id && t.usuario_id !== user.id,
  };
}

export async function revisarTurno(db, id, user, { conforme, observacion }) {
  if (!esSupervisor(user)) throw new HttpError(403, 'Solo quien supervisa la caja (administrador o jefe de local) puede revisar turnos.');
  const { rows } = await db.query(
    `SELECT t.usuario_id, t.fecha_cierre, t.monto_cierre_real_efectivo AS contado, t.monto_cierre_esperado_efectivo AS esperado,
            EXISTS (SELECT 1 FROM turno_revision r WHERE r.turno_caja_id = t.id) AS revisado
       FROM turno_caja t WHERE t.id = $1`, [id]);
  const t = rows[0];
  if (!t) throw notFound('Turno');
  if (!t.fecha_cierre) throw new HttpError(409, 'Solo se revisa un turno cerrado.');
  if (t.usuario_id === user.id) throw new HttpError(409, 'No puede revisar su propio turno: debe hacerlo otra persona.');
  if (t.revisado) throw new HttpError(409, 'Este turno ya fue revisado.');
  if (Number(t.contado) !== Number(t.esperado) && (observacion ?? '').length < 3) {
    throw new HttpError(400, 'El turno tiene diferencia de caja: explique su origen en la observación.');
  }
  try {
    await db.query('INSERT INTO turno_revision (turno_caja_id, usuario_id, conforme, observacion) VALUES ($1,$2,$3,$4)',
      [id, user.id, conforme, observacion ?? null]);
  } catch (err) {
    // Dos revisiones simultáneas: la restricción única de la base deja pasar solo una.
    if (err.code === '23505') throw new HttpError(409, 'Este turno ya fue revisado.');
    throw err;
  }
}

export { ESTADOS_TURNO };
