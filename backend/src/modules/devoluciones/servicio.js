// Devoluciones de clientes. Reglas:
//  - Solo se devuelve de un pedido "Entregado", dentro de DEVOLUCION_MAX_DIAS (30 por defecto) desde su fecha.
//  - El reembolso de cada línea es su subtotal (con descuento) prorrateado por cantidad; el redondeo es acumulado,
//    así devolver todo en varias partes suma exactamente lo cobrado.
//  - El dinero se devuelve por los mismos medios con que se pagó y sin exceder lo pagado por cada uno.
//  - El efectivo sale de la caja del turno abierto de quien atiende (y se descuenta en el cierre de ese turno).
//  - El stock vuelve al inventario solo si la línea lo indica, y siempre al lote de origen.
import { formatoNumero } from '../../core/documentos.js';
import { HttpError, notFound } from '../../core/errors.js';
import { bloquearProducto, insertarMovimiento } from '../inventario/movimientos.js';
import { bloquearPedido, codigoPedido, ESTADO } from '../pedidos/servicio.js';
import { turnoAbierto } from '../pos/turnos.js';

export const MAX_DIAS = Number(process.env.DEVOLUCION_MAX_DIAS ?? 30);
export const codigoDevolucion = (n) => formatoNumero('DEV', n);
const pesos = (n) => `$${Number(n).toLocaleString('es-CL')}`;

// Monto a reembolsar por `devolver` unidades de una línea que ya tiene `devuelto` devueltas.
export function montoReembolso({ subtotal, cantidad, devuelto, devolver }) {
  const acumulado = (n) => Math.round((subtotal * n) / cantidad);
  return acumulado(devuelto + devolver) - acumulado(devuelto);
}

// Reparte el total entre los medios con saldo, en el orden recibido (el de pago original).
export function distribuirReembolso(total, medios) {
  let restante = total;
  const out = [];
  for (const m of medios) {
    if (restante <= 0) break;
    const monto = Math.min(restante, m.disponible);
    if (monto > 0) { out.push({ medio_pago_id: m.medio_pago_id, monto }); restante -= monto; }
  }
  return out;
}

// Pedido con lo que ya se devolvió y lo que aún se puede devolver, por línea y por medio de pago.
export async function pedidoDevolvible(db, pedidoId) {
  const { rows } = await db.query(
    `SELECT p.id, p.numero, p.fecha, p.total, p.nombre_cliente, p.sucursal_id, s.nombre AS sucursal, e.nombre AS estado,
            ((NOW() AT TIME ZONE 'America/Santiago')::date - (p.fecha AT TIME ZONE 'America/Santiago')::date)::int AS dias
       FROM pedido p JOIN estado_pedido e ON e.id = p.estado_pedido_id LEFT JOIN sucursal s ON s.id = p.sucursal_id
      WHERE p.id = $1`, [pedidoId]);
  if (!rows[0]) throw notFound('Pedido');
  const p = rows[0];
  // Secuencial: `db` puede ser un cliente dentro de una transacción, que no admite consultas simultáneas.
  const lineas = await db.query(
      `SELECT d.id AS detalle_id, d.producto_id, pr.sku, d.nombre_producto, d.cantidad, d.precio_unitario, d.descuento_monto,
              (d.cantidad * d.precio_unitario - d.descuento_monto) AS subtotal,
              COALESCE((SELECT SUM(dd.cantidad) FROM devolucion_detalle dd WHERE dd.detalle_pedido_id = d.id), 0)::int AS devuelto
         FROM detalle_pedido d JOIN producto pr ON pr.id = d.producto_id
        WHERE d.pedido_id = $1 ORDER BY d.nombre_producto`, [pedidoId]);
  const pagado = await db.query(
      `SELECT mp.id AS medio_pago_id, mp.nombre AS medio_pago, SUM(tp.monto) AS pagado
         FROM transaccion_pago tp
         JOIN medio_pago mp ON mp.id = tp.medio_pago_id
         JOIN estado_transaccion et ON et.id = tp.estado_transaccion_id AND et.nombre = 'Aprobado'
        WHERE tp.pedido_id = $1 GROUP BY mp.id, mp.nombre ORDER BY MIN(tp.fecha_transaccion), mp.nombre`, [pedidoId]);
  const devuelto = await db.query(
      `SELECT dp.medio_pago_id, SUM(dp.monto) AS devuelto
         FROM devolucion_pago dp JOIN devolucion d ON d.id = dp.devolucion_id WHERE d.pedido_id = $1 GROUP BY dp.medio_pago_id`, [pedidoId]);
  const yaDevuelto = new Map(devuelto.rows.map((x) => [x.medio_pago_id, Number(x.devuelto)]));
  const medios = pagado.rows.map((m) => ({
    medio_pago_id: m.medio_pago_id, medio_pago: m.medio_pago, pagado: Number(m.pagado),
    devuelto: yaDevuelto.get(m.medio_pago_id) ?? 0, disponible: Number(m.pagado) - (yaDevuelto.get(m.medio_pago_id) ?? 0),
  }));
  const lineasOut = lineas.rows.map((l) => ({
    ...l, subtotal: Number(l.subtotal), cantidad: Number(l.cantidad), disponible: Number(l.cantidad) - l.devuelto,
  }));
  let motivoNo = null;
  if (p.estado !== ESTADO.ENTREGADO) motivoNo = `Solo se devuelven pedidos entregados; este está "${p.estado}".`;
  else if (MAX_DIAS > 0 && p.dias > MAX_DIAS) motivoNo = `Pasaron ${p.dias} días desde la venta; el plazo de devolución es de ${MAX_DIAS}.`;
  else if (lineasOut.every((l) => l.disponible === 0)) motivoNo = 'Ya se devolvió todo lo de este pedido.';
  return { ...p, codigo: codigoPedido(p.numero), lineas: lineasOut, medios, devolvible: !motivoNo, motivo_no_devolvible: motivoNo };
}

// Valida las cantidades y calcula el reembolso por línea, el total y una distribución sugerida por medio de pago.
export function cotizarDevolucion(pedido, items) {
  const lineas = items.map((it) => {
    const l = pedido.lineas.find((x) => x.detalle_id === it.detalle_id);
    if (!l) throw new HttpError(400, 'Una de las líneas no pertenece al pedido.');
    if (it.cantidad > l.disponible) {
      throw new HttpError(409, `De "${l.nombre_producto}" se vendieron ${l.cantidad}, ya se devolvieron ${l.devuelto}: solo quedan ${l.disponible} por devolver.`);
    }
    return {
      detalle_id: l.detalle_id, producto_id: l.producto_id, nombre_producto: l.nombre_producto, cantidad: it.cantidad,
      reingresa_stock: Boolean(it.reingresa_stock),
      monto_reembolso: montoReembolso({ subtotal: l.subtotal, cantidad: l.cantidad, devuelto: l.devuelto, devolver: it.cantidad }),
    };
  });
  const total = lineas.reduce((s, l) => s + l.monto_reembolso, 0);
  return { lineas, total, sugerencia: distribuirReembolso(total, pedido.medios) };
}

// Devuelve a inventario las unidades, al lote de origen: usa los movimientos de venta del propio pedido.
async function reingresarStock(db, { pedidoId, productoId, cantidad, usuarioId, observacion }) {
  await bloquearProducto(db, productoId); // orden de bloqueo: pedido -> producto -> lote
  const { rows } = await db.query(
    `SELECT m.lote_id, m.sucursal_id, SUM(m.cantidad * t.signo)::int AS neto
       FROM movimiento_inventario m
       JOIN motivo_movimiento mm ON mm.id = m.motivo_movimiento_id
       JOIN tipo_movimiento t ON t.id = mm.tipo_movimiento_id
      WHERE m.pedido_id = $1 AND m.producto_id = $2
      GROUP BY m.lote_id, m.sucursal_id HAVING SUM(m.cantidad * t.signo) < 0
      ORDER BY MIN(m.fecha), m.lote_id`, [pedidoId, productoId]);
  let restante = cantidad;
  for (const l of rows) {
    if (restante <= 0) break;
    const toma = Math.min(restante, -l.neto);
    await insertarMovimiento(db, {
      productoId, sucursalId: l.sucursal_id, cantidad: toma, motivo: 'Devolución de cliente', loteId: l.lote_id,
      usuarioId, observacion, pedidoId,
    });
    restante -= toma;
  }
  if (restante > 0) throw new HttpError(409, 'No hay en el kardex de dónde reingresar ese stock: desmarque "Reingresar a inventario".');
}

/**
 * Registra la devolución completa en una transacción (db con app.usuario_id fijado).
 * @param d   { pedido_id, items:[{detalle_id, cantidad, reingresa_stock}], motivo, reembolsos:[{medio_pago_id, monto, referencia}] }
 * @param ctx { usuarioId }
 */
export async function crearDevolucion(db, d, ctx) {
  await bloquearPedido(db, d.pedido_id); // serializa devoluciones del mismo pedido
  const pedido = await pedidoDevolvible(db, d.pedido_id);
  if (!pedido.devolvible) throw new HttpError(409, pedido.motivo_no_devolvible);
  const cot = cotizarDevolucion(pedido, d.items);

  const suma = d.reembolsos.reduce((s, x) => s + Math.round(x.monto * 100), 0);
  if (suma !== Math.round(cot.total * 100)) {
    throw new HttpError(409, `Los reembolsos suman ${pesos(suma / 100)} y lo que corresponde devolver es ${pesos(cot.total)}.`);
  }
  const porMedio = new Map();
  for (const x of d.reembolsos) porMedio.set(x.medio_pago_id, (porMedio.get(x.medio_pago_id) ?? 0) + x.monto);
  for (const [medioId, monto] of porMedio) {
    const m = pedido.medios.find((y) => y.medio_pago_id === medioId);
    if (!m) throw new HttpError(409, 'Solo se puede devolver por los medios con que se pagó el pedido.');
    if (monto > m.disponible) throw new HttpError(409, `No se puede devolver más de lo pagado con ${m.medio_pago}: quedan ${pesos(m.disponible)}.`);
  }
  const efectivo = pedido.medios.find((m) => m.medio_pago === 'Efectivo');
  const turno = await turnoAbierto(db, ctx.usuarioId);
  if (efectivo && (porMedio.get(efectivo.medio_pago_id) ?? 0) > 0 && !turno) {
    throw new HttpError(409, 'Para devolver en efectivo abra un turno de caja: el dinero sale de esa caja.');
  }

  const { rows } = await db.query(
    `INSERT INTO devolucion (pedido_id, usuario_id, turno_caja_id, motivo, total_reembolso) VALUES ($1,$2,$3,$4,$5) RETURNING id, numero`,
    [d.pedido_id, ctx.usuarioId, turno?.id ?? null, d.motivo, cot.total]);
  const { id, numero } = rows[0];
  for (const l of cot.lineas) {
    await db.query(
      `INSERT INTO devolucion_detalle (devolucion_id, detalle_pedido_id, cantidad, monto_reembolso, reingresa_stock) VALUES ($1,$2,$3,$4,$5)`,
      [id, l.detalle_id, l.cantidad, l.monto_reembolso, l.reingresa_stock]);
  }
  for (const x of d.reembolsos) {
    await db.query('INSERT INTO devolucion_pago (devolucion_id, medio_pago_id, monto, referencia) VALUES ($1,$2,$3,$4)',
      [id, x.medio_pago_id, x.monto, x.referencia ?? null]);
  }
  for (const l of cot.lineas.filter((x) => x.reingresa_stock)) {
    await reingresarStock(db, {
      pedidoId: d.pedido_id, productoId: l.producto_id, cantidad: l.cantidad, usuarioId: ctx.usuarioId,
      observacion: `Devolución ${codigoDevolucion(numero)}`,
    });
  }
  return id;
}

export async function detalleDevolucion(db, id) {
  const { rows } = await db.query(
    `SELECT d.id, d.numero, d.fecha, d.motivo, d.total_reembolso, d.pedido_id, p.numero AS pedido_numero, p.nombre_cliente,
            s.nombre AS sucursal, s.direccion AS sucursal_direccion, u.nombre AS usuario, d.turno_caja_id
       FROM devolucion d JOIN pedido p ON p.id = d.pedido_id LEFT JOIN sucursal s ON s.id = p.sucursal_id JOIN usuario u ON u.id = d.usuario_id
      WHERE d.id = $1`, [id]);
  if (!rows[0]) throw notFound('Devolución');
  const [lineas, pagos] = await Promise.all([
    db.query(
      `SELECT dd.id, pr.sku, dp.nombre_producto, dd.cantidad, dd.monto_reembolso, dd.reingresa_stock
         FROM devolucion_detalle dd JOIN detalle_pedido dp ON dp.id = dd.detalle_pedido_id JOIN producto pr ON pr.id = dp.producto_id
        WHERE dd.devolucion_id = $1 ORDER BY dp.nombre_producto`, [id]),
    db.query(
      `SELECT x.id, mp.nombre AS medio_pago, x.monto, x.referencia
         FROM devolucion_pago x JOIN medio_pago mp ON mp.id = x.medio_pago_id WHERE x.devolucion_id = $1 ORDER BY mp.nombre`, [id]),
  ]);
  return { ...rows[0], codigo: codigoDevolucion(rows[0].numero), pedido_codigo: codigoPedido(rows[0].pedido_numero), lineas: lineas.rows, pagos: pagos.rows };
}
