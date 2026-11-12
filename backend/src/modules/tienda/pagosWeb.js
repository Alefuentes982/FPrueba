// Pago de los pedidos web con Webpay Plus (HU-72) y pagos rechazados, anulados o abandonados (HU-73). Cada intento queda en transaccion_pago con su orden de compra
// (buy_order), el token de Webpay, el monto y su estado: Pendiente al ir a Webpay; Aprobado o Rechazado al volver.
// El pedido pasa a "Pagado" solo si Transbank autorizó el cargo y el monto y la orden coinciden. Si no, el intento
// queda Rechazado, Anulado o Abortado y el pedido sigue en "Pago pendiente" (se puede reintentar) o vence a los 20 min.
// La confirmación es idempotente: si el navegador vuelve dos veces (recarga, doble clic), el segundo regreso solo
// informa el resultado guardado, sin volver a confirmar ni duplicar el pago.
import { HttpError, notFound } from '../../core/errors.js';
import { urlPublica } from '../../core/urls.js';
import { bloquearPedido, codigoPedido, ESTADO, estadoPedidoId, stockReservado } from '../pedidos/servicio.js';
import { minutosRestantes } from './reglasPedido.js';
import { evaluarConfirmacion, MINUTOS_MINIMOS_PAGO, ordenDeCompra, SIN_COMMIT, tipoRetorno } from './reglasPago.js';
import { confirmarTransaccion, crearTransaccion, estadoTransaccion } from './webpay.js';

const RETORNO = '/api/tienda/pagos/webpay/retorno';

async function idDe(db, tabla, nombre) {
  const { rows } = await db.query(`SELECT id FROM ${tabla} WHERE nombre = $1`, [nombre]);
  if (!rows[0]) throw new HttpError(500, `Falta "${nombre}" en ${tabla}.`);
  return rows[0].id;
}
const estadoTx = (db, nombre) => idDe(db, 'estado_transaccion', nombre);

// Empieza un intento de pago. Devuelve { url, token } para enviar el navegador a Webpay.
export async function iniciarPago(db, clienteId, pedidoId) {
  const p = await bloquearPedido(db, pedidoId);
  const { rows: dueno } = await db.query('SELECT cliente_id, fecha FROM pedido WHERE id = $1', [pedidoId]);
  if (dueno[0].cliente_id !== clienteId || p.canal !== 'Online') throw notFound('Pedido');
  if (p.estado !== ESTADO.PENDIENTE) throw new HttpError(409, `Este pedido está "${p.estado}": ya no se puede pagar.`);
  if (!(await stockReservado(db, pedidoId))) throw new HttpError(409, 'El pedido ya no tiene productos reservados. Vuelve a comprar desde el carro.');
  if (minutosRestantes(dueno[0].fecha) < MINUTOS_MINIMOS_PAGO) {
    throw new HttpError(409, `Quedan menos de ${MINUTOS_MINIMOS_PAGO} minutos de reserva, no alcanza para pagar. Anula el pedido y vuelve a comprar desde el carro.`);
  }

  // Un intento anterior que quedó a medio camino (el cliente volvió atrás sin terminar) se da por abandonado.
  const pendiente = await estadoTx(db, 'Pendiente');
  await db.query(
    'UPDATE transaccion_pago SET estado_transaccion_id = $1 WHERE pedido_id = $2 AND estado_transaccion_id = $3 AND pasarela_id IS NOT NULL',
    [await estadoTx(db, 'Abortado'), pedidoId, pendiente]);
  const { rows: n } = await db.query('SELECT COUNT(*)::int AS n FROM transaccion_pago WHERE pedido_id = $1 AND pasarela_id IS NOT NULL', [pedidoId]);
  const buyOrder = ordenDeCompra(codigoPedido(p.numero), n[0].n + 1);
  const monto = Math.round(Number(p.total));

  const { token, url } = await crearTransaccion({ buyOrder, sessionId: pedidoId, monto, urlRetorno: urlPublica(RETORNO) });
  await db.query(
    `INSERT INTO transaccion_pago (pedido_id, pasarela_id, medio_pago_id, buy_order, token_inicio, estado_transaccion_id, monto)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [pedidoId, await idDe(db, 'pasarela', 'Transbank Webpay Plus'), await idDe(db, 'medio_pago', 'Webpay Plus'), buyOrder, token, pendiente, monto]);
  return { url, token };
}

// Intento de pago por su token, con el pedido bloqueado primero (mismo orden que el resto del sistema).
async function bloquearIntento(db, condicion, valor) {
  const { rows } = await db.query(`SELECT pedido_id FROM transaccion_pago WHERE ${condicion} = $1 AND pasarela_id IS NOT NULL`, [valor]);
  if (!rows[0]) return null;
  await bloquearPedido(db, rows[0].pedido_id);
  const { rows: tx } = await db.query(
    `SELECT t.id, t.pedido_id, t.buy_order, t.token_inicio, t.monto, e.nombre AS estado
       FROM transaccion_pago t JOIN estado_transaccion e ON e.id = t.estado_transaccion_id
      WHERE t.${condicion} = $1 FOR UPDATE OF t`, [valor]);
  return tx[0];
}

const RESULTADO_GUARDADO = { Aprobado: 'aprobado', Rechazado: 'rechazado', Anulado: 'anulado', Abortado: 'abortado' };

// Confirma con Transbank el regreso normal (token_ws). Devuelve el resultado para la página del pedido.
async function confirmar(db, tx) {
  const { rows } = await db.query(
    'SELECT e.nombre AS estado FROM pedido p JOIN estado_pedido e ON e.id = p.estado_pedido_id WHERE p.id = $1', [tx.pedido_id]);
  // El pedido venció o se anuló mientras el cliente estaba en Webpay: no se confirma y Transbank no hace el cargo.
  if (rows[0].estado !== ESTADO.PENDIENTE) {
    await db.query('UPDATE transaccion_pago SET estado_transaccion_id = $1 WHERE id = $2', [await estadoTx(db, 'Anulado'), tx.id]);
    return 'vencido';
  }
  let respuesta;
  try {
    respuesta = await confirmarTransaccion(tx.token_inicio);
  } catch (err) {
    // Si el commit no respondió, se consulta el estado: puede que sí haya quedado confirmado.
    respuesta = await estadoTransaccion(tx.token_inicio).catch(() => null);
    if (!respuesta || !['AUTHORIZED', 'FAILED'].includes(respuesta.status)) return 'error';
  }
  const resultado = evaluarConfirmacion(respuesta, { monto: tx.monto, buyOrder: tx.buy_order });
  if (resultado === 'aprobado') {
    await db.query('UPDATE transaccion_pago SET estado_transaccion_id = $1, codigo_autorizacion = $2 WHERE id = $3',
      [await estadoTx(db, 'Aprobado'), String(respuesta.authorization_code ?? '').slice(0, 50) || null, tx.id]);
    await db.query('UPDATE pedido SET estado_pedido_id = $1 WHERE id = $2', [await estadoPedidoId(db, ESTADO.PAGADO), tx.pedido_id]);
    return 'aprobado';
  }
  if (resultado === 'no_coincide') {
    // No debería pasar nunca: el monto lo fija el servidor. Se deja sin efecto y se avisa en el log para revisarlo.
    console.error(`Webpay: la orden ${tx.buy_order} volvió autorizada por ${respuesta.amount} y se esperaba ${tx.monto}. Revisar y reembolsar.`);
    await db.query('UPDATE transaccion_pago SET estado_transaccion_id = $1 WHERE id = $2', [await estadoTx(db, 'Anulado'), tx.id]);
    return 'error';
  }
  await db.query('UPDATE transaccion_pago SET estado_transaccion_id = $1 WHERE id = $2', [await estadoTx(db, 'Rechazado'), tx.id]);
  return 'rechazado';
}

const RESULTADO_TIEMPO = 'tiempo';

// Regreso desde Webpay (llega del navegador, sin sesión). Devuelve { pedidoId, resultado }.
export async function procesarRetorno(db, datos) {
  const r = tipoRetorno(datos);
  if (r.tipo === 'desconocido') return { pedidoId: null, resultado: 'error' };
  const tx = r.tipo === 'tiempo' ? await bloquearIntento(db, 'buy_order', r.orden) : await bloquearIntento(db, 'token_inicio', r.token);
  if (!tx) return { pedidoId: null, resultado: 'error' };
  if (tx.estado !== 'Pendiente') {
    const guardado = RESULTADO_GUARDADO[tx.estado] ?? 'error';
    return { pedidoId: tx.pedido_id, resultado: r.tipo === 'tiempo' && guardado === 'abortado' ? RESULTADO_TIEMPO : guardado };
  }
  if (r.tipo === 'normal') return { pedidoId: tx.pedido_id, resultado: await confirmar(db, tx) };

  // Sin commit: Transbank no hace el cargo. Se registra cómo terminó el intento.
  const { estado, resultado } = SIN_COMMIT[r.tipo];
  await db.query('UPDATE transaccion_pago SET estado_transaccion_id = $1 WHERE id = $2', [await estadoTx(db, estado), tx.id]);
  const { rows } = await db.query(
    'SELECT e.nombre AS estado FROM pedido p JOIN estado_pedido e ON e.id = p.estado_pedido_id WHERE p.id = $1', [tx.pedido_id]);
  return { pedidoId: tx.pedido_id, resultado: rows[0].estado === ESTADO.PENDIENTE ? resultado : 'vencido' };
}

export const urlResultado = ({ pedidoId, resultado }) =>
  urlPublica(pedidoId ? `/tienda/pedido/${pedidoId}?pago=${resultado}` : `/tienda/carrito?pago=${resultado}`);
