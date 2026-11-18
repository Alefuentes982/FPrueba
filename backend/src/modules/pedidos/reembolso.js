// Anulación y reembolso por Webpay Plus (HU-80). El Administrador anula un pedido web pagado que no se puede
// entregar: Transbank devuelve el dinero, el pedido queda "Cancelado" y su stock vuelve al inventario con su
// movimiento en el kardex. Las devoluciones de un pedido pagado con Webpay usan el mismo reembolso, por el monto
// devuelto (devoluciones/servicio.js).
import { HttpError } from '../../core/errors.js';
import { reembolsarTransaccion } from '../tienda/webpay.js';
import { bloquearPedido, cancelarPedido, ESTADO } from './servicio.js';

// Estados en que un pedido web pagado aún se puede anular: todavía no salió de la farmacia.
export const ANULABLES_WEB = [ESTADO.PAGADO, ESTADO.PREPARACION, ESTADO.RETIRO];
export const MEDIO_WEBPAY = 'Webpay Plus';

// Revisa si el pedido se puede anular con reembolso. Devuelve el motivo por el que no, o null.
export function revisarAnulacion(p, pago) {
  if (p.canal !== 'Online') return 'Solo se anulan con reembolso los pedidos de la tienda en línea.';
  if (!ANULABLES_WEB.includes(p.estado)) {
    return p.estado === ESTADO.DESPACHO || p.estado === ESTADO.ENTREGADO
      ? `El pedido está "${p.estado}": ya salió de la farmacia. Si el cliente lo devuelve, regístrelo en Devoluciones.`
      : `Un pedido "${p.estado}" no tiene un pago que reembolsar.`;
  }
  if (!pago) return 'El pedido no tiene un pago aprobado con Webpay.';
  if (pago.saldo <= 0) return 'El pago de este pedido ya se reembolsó completo.';
  return null;
}

// Lo que Transbank respondió, en lo que guardamos. REVERSED no trae código de autorización.
export function leerRespuestaReembolso(r) {
  if (!['REVERSED', 'NULLIFIED'].includes(r?.type)) throw new HttpError(502, 'Webpay respondió el reembolso de una forma inesperada. Revise la transacción en el portal de Transbank.');
  if (r.type === 'NULLIFIED' && r.response_code != null && r.response_code !== 0) {
    throw new HttpError(502, `Webpay no aprobó el reembolso (código ${r.response_code}).`);
  }
  return { tipo: r.type, codigo_autorizacion: r.authorization_code ?? null };
}

// Pago Webpay aprobado del pedido, con lo que ya se reembolsó y el saldo.
export async function pagoWebpay(db, pedidoId) {
  const { rows } = await db.query(
    `SELECT t.id, t.token_inicio AS token, t.monto, t.buy_order,
            COALESCE((SELECT SUM(r.monto) FROM transaccion_reembolso r WHERE r.transaccion_pago_id = t.id), 0) AS reembolsado
       FROM transaccion_pago t
       JOIN medio_pago mp ON mp.id = t.medio_pago_id AND mp.nombre = $2
       JOIN estado_transaccion e ON e.id = t.estado_transaccion_id AND e.nombre = 'Aprobado'
      WHERE t.pedido_id = $1
      ORDER BY t.fecha_transaccion DESC LIMIT 1`, [pedidoId, MEDIO_WEBPAY]);
  if (!rows[0]) return null;
  const x = rows[0];
  return { ...x, monto: Number(x.monto), reembolsado: Number(x.reembolsado), saldo: Number(x.monto) - Number(x.reembolsado) };
}

// Pide el reembolso a Transbank y lo registra. Se llama dentro de la transacción de la base, al final: si Webpay
// falla, nada queda guardado; si Webpay aprobó y algo falla después, queda en el log para revisarlo a mano.
export async function reembolsarWebpay(db, pago, { monto, motivo, usuarioId, devolucionId = null }) {
  if (monto > pago.saldo) throw new HttpError(409, `Del pago Webpay quedan $${pago.saldo} por reembolsar.`);
  const r = leerRespuestaReembolso(await reembolsarTransaccion(pago.token, Math.round(monto)));
  try {
    await db.query(
      `INSERT INTO transaccion_reembolso (transaccion_pago_id, monto, tipo, codigo_autorizacion, motivo, devolucion_id, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [pago.id, monto, r.tipo, r.codigo_autorizacion, motivo, devolucionId, usuarioId]);
    if (monto >= pago.saldo) {
      await db.query(
        "UPDATE transaccion_pago SET estado_transaccion_id = (SELECT id FROM estado_transaccion WHERE nombre = 'Reembolsado') WHERE id = $1", [pago.id]);
    }
  } catch (err) {
    console.error(`Webpay: se reembolsaron $${monto} de la orden ${pago.buy_order} (${r.tipo}) pero no se pudo registrar. Registrar a mano.`, err.message);
    throw err;
  }
  return { ...r, monto };
}

// Anula el pedido web y devuelve todo lo pagado por Webpay.
export async function anularYReembolsar(db, pedidoId, { motivo, usuarioId }) {
  const p = await bloquearPedido(db, pedidoId);
  const pago = await pagoWebpay(db, pedidoId);
  const error = revisarAnulacion(p, pago);
  if (error) throw new HttpError(409, error);
  await cancelarPedido(db, pedidoId); // libera la reserva (movimiento en el kardex) y deja el pedido "Cancelado"
  return reembolsarWebpay(db, pago, { monto: pago.saldo, motivo, usuarioId });
}

// Reembolsos registrados de un pedido (para la ficha).
export async function reembolsosDelPedido(db, pedidoId) {
  const { rows } = await db.query(
    `SELECT r.id, r.fecha, r.monto, r.tipo, r.codigo_autorizacion, r.motivo, u.nombre AS usuario, r.devolucion_id
       FROM transaccion_reembolso r
       JOIN transaccion_pago t ON t.id = r.transaccion_pago_id
       JOIN usuario u ON u.id = r.usuario_id
      WHERE t.pedido_id = $1 ORDER BY r.fecha`, [pedidoId]);
  return rows.map((x) => ({ ...x, monto: Number(x.monto) }));
}
