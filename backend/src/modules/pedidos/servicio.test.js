import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoSchema, pagosSchema, pedidoSchema } from './esquemas.js';
import { accionesDisponibles, codigoPedido, ESTADO } from './servicio.js';

const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const base = { sucursal_id: id(1), nombre_cliente: 'Ana Pérez', items: [{ producto_id: id(2), cantidad: 2 }] };

test('codigoPedido da formato PED-000123', () => {
  assert.equal(codigoPedido(7), 'PED-000007');
});

test('acciones por estado', () => {
  assert.deepEqual(accionesDisponibles({ estado: ESTADO.PENDIENTE, reservado: false }), ['editar', 'reservar', 'pagar', 'cancelar']);
  assert.deepEqual(accionesDisponibles({ estado: ESTADO.PENDIENTE, reservado: true }), ['editar', 'pagar', 'cancelar']);
  assert.deepEqual(accionesDisponibles({ estado: ESTADO.PAGADO, reservado: true }), ['cancelar', 'estado:En preparación']);
  assert.deepEqual(accionesDisponibles({ estado: ESTADO.PREPARACION, reservado: true }), ['cancelar', 'estado:Listo para retiro', 'estado:En despacho']);
  assert.deepEqual(accionesDisponibles({ estado: ESTADO.DESPACHO, reservado: true }), ['estado:Entregado']);
  assert.deepEqual(accionesDisponibles({ estado: ESTADO.ENTREGADO, reservado: true }), []);
  assert.deepEqual(accionesDisponibles({ estado: ESTADO.CANCELADO, reservado: false }), []);
  assert.deepEqual(accionesDisponibles({ estado: ESTADO.EXPIRADO, reservado: false }), []);
});

test('pedidoSchema valida cliente y líneas', () => {
  const ok = pedidoSchema.parse(base);
  assert.equal(ok.reservar, false);
  assert.equal(ok.telefono, null);
  assert.equal(pedidoSchema.safeParse({ ...base, nombre_cliente: ' ' }).success, false);
  assert.equal(pedidoSchema.safeParse({ ...base, items: [] }).success, false);
  assert.equal(pedidoSchema.safeParse({ ...base, items: [{ producto_id: id(2), cantidad: 0 }] }).success, false);
  assert.equal(pedidoSchema.safeParse({ ...base, items: [{ producto_id: id(2), cantidad: 1 }, { producto_id: id(2), cantidad: 1 }] }).success, false);
});

test('pagosSchema exige al menos un pago con monto positivo', () => {
  assert.equal(pagosSchema.safeParse({ pagos: [] }).success, false);
  assert.equal(pagosSchema.safeParse({ pagos: [{ medio_pago_id: id(3), monto: 0 }] }).success, false);
  assert.equal(pagosSchema.safeParse({ pagos: [{ medio_pago_id: id(3), monto: 1500 }, { medio_pago_id: id(4), monto: 500 }] }).success, true);
  assert.equal(estadoSchema.safeParse({ estado: '' }).success, false);
});

// ---- Cobro con redondeo del efectivo (Ley 20.956) ----
import { validarCobro } from './servicio.js';

const EF = 'ef';
const TJ = 'tj';
const cobro = (total, pagos) => validarCobro({ total, pagos, efectivoId: EF });

test('cobro solo en efectivo: se cobra el total redondeado y el ajuste queda registrado', () => {
  assert.equal(cobro(3094, [{ medio_pago_id: EF, monto: 3090 }]), -4);
  assert.equal(cobro(1547, [{ medio_pago_id: EF, monto: 1550 }]), 3);
  assert.equal(cobro(3090, [{ medio_pago_id: EF, monto: 3090 }]), 0);
});

test('el efectivo informado debe ser exactamente el redondeado', () => {
  assert.throws(() => cobro(3094, [{ medio_pago_id: EF, monto: 3094 }]), /efectivo a cobrar es \$3\.090/);
  assert.throws(() => cobro(3094, [{ medio_pago_id: EF, monto: 3100 }]), /efectivo a cobrar es \$3\.090/);
});

test('con tarjeta no hay redondeo y debe calzar exacto', () => {
  assert.equal(cobro(3094, [{ medio_pago_id: TJ, monto: 3094 }]), 0);
  assert.throws(() => cobro(3094, [{ medio_pago_id: TJ, monto: 3090 }]), /suman \$3\.090 y el pedido es de \$3\.094/);
});

test('pago mixto: el redondeo se aplica solo a lo que se paga en efectivo', () => {
  // 3.094 = 1.000 con tarjeta + 2.094 en efectivo -> 2.090
  assert.equal(cobro(3094, [{ medio_pago_id: TJ, monto: 1000 }, { medio_pago_id: EF, monto: 2090 }]), -4);
  assert.equal(cobro(3095, [{ medio_pago_id: TJ, monto: 1000 }, { medio_pago_id: EF, monto: 2100 }]), 5);
  assert.throws(() => cobro(3094, [{ medio_pago_id: TJ, monto: 1000 }, { medio_pago_id: EF, monto: 2094 }]), /efectivo a cobrar es \$2\.090/);
});

test('un saldo en efectivo que se redondea a cero, o ya cubierto por otros medios, se rechaza', () => {
  assert.throws(() => cobro(3094, [{ medio_pago_id: TJ, monto: 3091 }, { medio_pago_id: EF, monto: 3 }]), /se redondea a \$0/);
  assert.throws(() => cobro(3094, [{ medio_pago_id: TJ, monto: 3094 }, { medio_pago_id: EF, monto: 10 }]), /ya cubren/);
});

test('varias líneas en efectivo se redondean juntas', () => {
  assert.equal(cobro(3094, [{ medio_pago_id: EF, monto: 1000 }, { medio_pago_id: EF, monto: 2090 }]), -4);
});

// ---- Efectivo recibido y vuelto (HU-91) ----
import { validarEfectivoRecibido } from './servicio.js';

const recibe = (total, pagos, recibido) => validarEfectivoRecibido({ total, pagos, efectivoId: EF, recibido });

test('solo efectivo: registra lo recibido y el vuelto, aunque el vuelto sea grande', () => {
  assert.deepEqual(recibe(3094, [{ medio_pago_id: EF, monto: 3090 }], 5000), { recibido: 5000, vuelto: 1910 });
  assert.deepEqual(recibe(3094, [{ medio_pago_id: EF, monto: 3090 }], 3090), { recibido: 3090, vuelto: 0 });
  assert.deepEqual(recibe(2000, [{ medio_pago_id: EF, monto: 2000 }], 10000), { recibido: 10000, vuelto: 8000 });
});

test('sin efectivo recibido no se registra nada', () => {
  assert.equal(recibe(3094, [{ medio_pago_id: EF, monto: 3090 }], null), null);
});

test('lo recibido no puede ser menos que el efectivo a cobrar', () => {
  assert.throws(() => recibe(3094, [{ medio_pago_id: EF, monto: 3090 }], 3000), /no alcanza para el efectivo a cobrar \(\$3\.090\)/);
});

test('sin pago en efectivo no se informa efectivo recibido', () => {
  assert.throws(() => recibe(3094, [{ medio_pago_id: TJ, monto: 3094 }], 5000), /Solo se informa el efectivo recibido/);
});

test('pago mixto: si lo recibido cubre el total, se cobra todo en efectivo', () => {
  // 10.000 = 6.000 con tarjeta + 4.000 en efectivo, y el cliente entrega 10.000
  assert.throws(() => recibe(10000, [{ medio_pago_id: TJ, monto: 6000 }, { medio_pago_id: EF, monto: 4000 }], 10000), /cubre el total de \$10\.000/);
  // Total 3.094: el efectivo redondeado sería 3.090 y el cliente entrega justo eso
  assert.throws(() => recibe(3094, [{ medio_pago_id: TJ, monto: 1004 }, { medio_pago_id: EF, monto: 2090 }], 3090), /cubre el total/);
});

test('pago mixto: un vuelto igual o mayor que el efectivo a cobrar obliga a reajustar', () => {
  assert.throws(() => recibe(10000, [{ medio_pago_id: TJ, monto: 7000 }, { medio_pago_id: EF, monto: 3000 }], 6000), /vuelto \(\$3\.000\) es igual o mayor que el efectivo a cobrar \(\$3\.000\)/);
  assert.throws(() => recibe(10000, [{ medio_pago_id: TJ, monto: 8000 }, { medio_pago_id: EF, monto: 2000 }], 5000), /reajuste/);
});

test('pago mixto coherente: se acepta con su vuelto', () => {
  assert.deepEqual(recibe(10000, [{ medio_pago_id: TJ, monto: 6000 }, { medio_pago_id: EF, monto: 4000 }], 5000), { recibido: 5000, vuelto: 1000 });
  assert.deepEqual(recibe(3094, [{ medio_pago_id: TJ, monto: 1000 }, { medio_pago_id: EF, monto: 2090 }], 2100), { recibido: 2100, vuelto: 10 });
});
