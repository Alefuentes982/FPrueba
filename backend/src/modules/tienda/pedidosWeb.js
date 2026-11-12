// Checkout de la tienda (HU-71): crea el pedido del canal Online en "Pago pendiente" y reserva el stock por FEFO con
// el núcleo de pedidos (pedidos/servicio.js). Los precios y totales los calcula la base, nunca el navegador.
// Los movimientos del kardex quedan a nombre del usuario técnico Sistema y el pedido a nombre del cliente.
import { HttpError, notFound } from '../../core/errors.js';
import {
  cancelarPedido, codigoPedido, crearPedido, detallePedido, ESTADO, estadoPedidoId, liberarReserva, stockReservado,
} from '../pedidos/servicio.js';
import { perfilCliente } from './sesionCliente.js';
import { disponibilidadPorSucursal, minutosRestantes, RESERVA_MINUTOS, sucursalDespacho, venceEn } from './reglasPedido.js';
import { unirLineas } from './reglas.js';
import { cotizarCarrito, sucursalesWeb } from './servicio.js';

export const CORREO_SISTEMA = 'sistema@farmaclick.cl';

export async function usuarioSistema(db) {
  const { rows } = await db.query('SELECT id FROM usuario WHERE correo = $1', [CORREO_SISTEMA]);
  if (!rows[0]) throw new HttpError(500, `Falta el usuario técnico ${CORREO_SISTEMA}.`);
  return rows[0].id;
}

// Stock disponible (sin lotes vencidos) de los productos del carro en las sucursales que venden en línea.
async function disponibilidad(db, items) {
  const sucursales = await sucursalesWeb(db);
  const { rows } = await db.query(
    `SELECT sucursal_id, producto_id, disponible FROM vw_stock_disponible
      WHERE producto_id = ANY($1::uuid[]) AND sucursal_id = ANY($2::uuid[])`,
    [items.map((x) => x.producto_id), sucursales.map((s) => s.id)]);
  return disponibilidadPorSucursal(sucursales, rows, items);
}

// Lo que necesita la pantalla del checkout: totales, farmacias para retirar, si se puede despachar y los datos del cliente.
export async function opcionesCheckout(db, clienteId, itemsPedidos) {
  const items = unirLineas(itemsPedidos);
  const [cotizacion, sucursales, cliente] = await Promise.all([
    cotizarCarrito(db, items), disponibilidad(db, items), perfilCliente(db, clienteId),
  ]);
  const despacho = sucursalDespacho(sucursales);
  return {
    cotizacion,
    retiro: sucursales.map(({ faltan, ...s }) => ({ ...s, faltan: faltan.length })),
    despacho: { disponible: Boolean(despacho), sucursal: despacho?.nombre ?? null, costo: 0 },
    cliente,
    reserva_minutos: RESERVA_MINUTOS,
  };
}

// Crea el pedido y reserva el stock en una sola transacción (withTx con el usuario Sistema): si algo falla, no queda
// nada a medias. Un cliente tiene a lo más un pedido web sin pagar: el anterior se anula y devuelve su stock.
export async function crearPedidoWeb(db, cliente, d) {
  const items = unirLineas(d.items);
  const cotizacion = await cotizarCarrito(db, items);
  if (!cotizacion.puede_continuar) {
    throw new HttpError(409, 'Tu carro cambió: hay productos que se agotaron o ya no están en la tienda. Revísalo antes de seguir.');
  }
  const sucursales = await disponibilidad(db, items);
  let sucursal;
  if (d.entrega === 'retiro') {
    sucursal = sucursales.find((s) => s.id === d.sucursal_id);
    if (!sucursal) throw new HttpError(400, 'Esa farmacia no vende en línea. Elige otra.');
    if (!sucursal.alcanza) throw new HttpError(409, `${sucursal.nombre} ya no tiene todo tu pedido. Elige otra farmacia o ajusta el carro.`);
  } else {
    sucursal = sucursalDespacho(sucursales);
    if (!sucursal) throw new HttpError(409, 'Ninguna farmacia tiene todo tu pedido para despacharlo junto. Ajusta las cantidades del carro.');
  }

  const anteriores = await db.query(
    `SELECT p.id FROM pedido p
       JOIN estado_pedido e ON e.id = p.estado_pedido_id
       JOIN canal_venta cv ON cv.id = p.canal_venta_id
      WHERE p.cliente_id = $1 AND e.nombre = $2 AND cv.nombre = 'Online'
      ORDER BY p.id`, [cliente.id, ESTADO.PENDIENTE]);
  for (const { id } of anteriores.rows) await cancelarPedido(db, id);

  const id = await crearPedido(db, {
    sucursal_id: sucursal.id,
    nombre_cliente: cliente.nombre,
    telefono: d.telefono,
    direccion_pedido: d.entrega === 'despacho' ? d.direccion : null,
    comuna_id: d.entrega === 'despacho' ? d.comuna_id : null,
    tipo_entrega: d.entrega,
    items,
    reservar: true,
  }, { canal: 'Online', usuarioId: await usuarioSistema(db), clienteId: cliente.id, vendedorId: null });

  const { rows } = await db.query('SELECT numero, total, fecha FROM pedido WHERE id = $1', [id]);
  return { id, codigo: codigoPedido(rows[0].numero), total: Number(rows[0].total), vence: venceEn(rows[0].fecha), anulados: anteriores.rowCount };
}

// Pedido web visto por su dueño. Otro cliente recibe 404, igual que si no existiera.
export async function pedidoDelCliente(db, clienteId, id) {
  const { rows } = await db.query('SELECT cliente_id FROM pedido WHERE id = $1', [id]);
  if (!rows[0] || rows[0].cliente_id !== clienteId) throw notFound('Pedido');
  const p = await detallePedido(db, id);
  const pendiente = p.estado === ESTADO.PENDIENTE;
  const restantes = pendiente ? minutosRestantes(p.fecha) : 0;
  return {
    id: p.id,
    codigo: p.codigo,
    estado: p.estado,
    fecha: p.fecha,
    entrega: p.tipo_entrega,
    sucursal: { nombre: p.sucursal, direccion: p.sucursal_direccion, telefono: p.sucursal_telefono },
    direccion: p.direccion_pedido,
    comuna: p.comuna,
    telefono: p.telefono,
    nombre: p.nombre_cliente,
    lineas: p.lineas.map((l) => ({
      producto_id: l.producto_id, nombre: l.nombre_producto, cantidad: l.cantidad, precio_unitario: Number(l.precio_unitario),
      descuento: Number(l.descuento_monto), subtotal: Number(l.subtotal), regla: l.regla,
    })),
    subtotal_bruto: Number(p.subtotal_bruto),
    descuento_total: Number(p.descuento_total),
    total: Number(p.total),
    iva: Number(p.iva),
    pagos: p.pagos.map((x) => ({ fecha: x.fecha_transaccion, medio: x.medio_pago, estado: x.estado, monto: Number(x.monto), codigo_autorizacion: x.codigo_autorizacion })),
    reservado: p.stock_reservado,
    vence: pendiente ? venceEn(p.fecha) : null,
    minutos_restantes: Math.floor(restantes),
    puede_cancelar: pendiente,
  };
}

export async function cancelarPedidoWeb(db, clienteId, id) {
  const { rows } = await db.query('SELECT cliente_id FROM pedido WHERE id = $1', [id]);
  if (!rows[0] || rows[0].cliente_id !== clienteId) throw notFound('Pedido');
  const { rows: e } = await db.query('SELECT e.nombre FROM pedido p JOIN estado_pedido e ON e.id = p.estado_pedido_id WHERE p.id = $1', [id]);
  if (e[0].nombre !== ESTADO.PENDIENTE) throw new HttpError(409, 'Este pedido ya no se puede anular desde la tienda.');
  await cancelarPedido(db, id);
}

// Pedidos web sin pagar después del plazo: pasan a "Expirado" y devuelven su stock. Solo el canal Online: los pedidos
// del personal siguen su propio manejo. Salta los que otra transacción está procesando (un pago en curso).
export async function expirarPedidosWeb(db) {
  const { rows } = await db.query(
    `SELECT p.id FROM pedido p
       JOIN estado_pedido e ON e.id = p.estado_pedido_id
       JOIN canal_venta cv ON cv.id = p.canal_venta_id
      WHERE e.nombre = $1 AND cv.nombre = 'Online' AND p.fecha < NOW() - make_interval(mins => $2::int)
      ORDER BY p.id FOR UPDATE OF p SKIP LOCKED`, [ESTADO.PENDIENTE, RESERVA_MINUTOS]);
  if (!rows.length) return 0;
  const expirado = await estadoPedidoId(db, ESTADO.EXPIRADO);
  for (const { id } of rows) {
    if (await stockReservado(db, id)) await liberarReserva(db, id);
    await db.query('UPDATE pedido SET estado_pedido_id = $1 WHERE id = $2', [expirado, id]);
  }
  return rows.length;
}
