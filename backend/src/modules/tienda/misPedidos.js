// Mis pedidos (HU-75): los pedidos de la tienda del cliente con su estado y su comprobante. Un cliente solo ve los
// suyos; el pedido de otro responde 404, igual que si no existiera.
import { notFound, HttpError } from '../../core/errors.js';
import { comprobantePedido } from '../pedidos/comprobante.js';
import { codigoPedido, ESTADO } from '../pedidos/servicio.js';

// Estados en que el pedido está pagado: tiene comprobante con el pago.
export const PAGADOS = [ESTADO.PAGADO, ESTADO.PREPARACION, ESTADO.RETIRO, ESTADO.DESPACHO, ESTADO.ENTREGADO];

// Lo que el cliente necesita saber de cada estado, en sus palabras.
export function mensajeEstado(estado, entrega) {
  switch (estado) {
    case ESTADO.PENDIENTE: return 'Esperando el pago.';
    case ESTADO.PAGADO: return 'Pago recibido. Pronto empezamos a preparar tu pedido.';
    case ESTADO.PREPARACION: return 'Estamos preparando tu pedido.';
    case ESTADO.RETIRO: return 'Listo. Ya puedes retirarlo con tu número de pedido y tu RUT.';
    case ESTADO.DESPACHO: return 'Va en camino a tu dirección.';
    case ESTADO.ENTREGADO: return entrega === 'despacho' ? 'Entregado en tu dirección.' : 'Lo retiraste en la farmacia.';
    case ESTADO.CANCELADO: return 'Anulado.';
    case ESTADO.EXPIRADO: return 'No se pagó a tiempo y se anuló. No se hizo ningún cargo.';
    default: return estado;
  }
}

export async function listarMisPedidos(db, clienteId, { limit, offset }) {
  const { rows } = await db.query(
    `SELECT COUNT(*) OVER() AS total_filas, p.id, p.numero, p.fecha, p.total, p.costo_despacho, p.tipo_entrega,
            e.nombre AS estado, s.nombre AS sucursal, c.nombre AS comuna,
            (SELECT SUM(d.cantidad)::int FROM detalle_pedido d WHERE d.pedido_id = p.id) AS unidades
       FROM pedido p
       JOIN estado_pedido e ON e.id = p.estado_pedido_id
       LEFT JOIN sucursal s ON s.id = p.sucursal_id
       LEFT JOIN comuna c ON c.id = p.comuna_id
      WHERE p.cliente_id = $1
      ORDER BY p.numero DESC
      LIMIT $2 OFFSET $3`, [clienteId, limit, offset]);
  return {
    total: Number(rows[0]?.total_filas ?? 0),
    data: rows.map((p) => ({
      id: p.id, codigo: codigoPedido(p.numero), fecha: p.fecha, estado: p.estado, entrega: p.tipo_entrega,
      lugar: p.tipo_entrega === 'despacho' ? p.comuna : p.sucursal, unidades: p.unidades,
      total_a_pagar: Number(p.total) + Number(p.costo_despacho), mensaje: mensajeEstado(p.estado, p.tipo_entrega),
      comprobante: PAGADOS.includes(p.estado),
    })),
  };
}

// Comprobante PDF del pedido propio. Solo de un pedido pagado: antes no hay nada que respaldar.
export async function comprobanteDelCliente(db, clienteId, id) {
  const { rows } = await db.query(
    'SELECT p.cliente_id, e.nombre AS estado FROM pedido p JOIN estado_pedido e ON e.id = p.estado_pedido_id WHERE p.id = $1', [id]);
  if (!rows[0] || rows[0].cliente_id !== clienteId) throw notFound('Pedido');
  if (!PAGADOS.includes(rows[0].estado)) throw new HttpError(409, 'El comprobante está disponible cuando el pedido está pagado.');
  return comprobantePedido(db, id);
}
