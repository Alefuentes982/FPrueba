import test from 'node:test';
import assert from 'node:assert/strict';
import { disponibilidadPorSucursal, minutosRestantes, RESERVA_MINUTOS, sucursalDespacho, venceEn } from './reglasPedido.js';
import { checkoutSchema } from './esquemasPedido.js';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';
const sucursales = [{ id: B, nombre: 'Sucursal Centro' }, { id: A, nombre: 'Casa Matriz' }];
const stock = [
  { sucursal_id: A, producto_id: P1, disponible: 5 }, { sucursal_id: A, producto_id: P2, disponible: 1 },
  { sucursal_id: B, producto_id: P1, disponible: 9 }, { sucursal_id: B, producto_id: P2, disponible: 3 },
];

test('la reserva dura 20 minutos y los minutos restantes no bajan de cero', () => {
  assert.equal(RESERVA_MINUTOS, 20);
  const creado = new Date('2026-11-05T15:00:00Z');
  assert.equal(minutosRestantes(creado, new Date('2026-11-05T15:05:00Z')), 15);
  assert.equal(minutosRestantes(creado, new Date('2026-11-05T15:30:00Z')), 0);
  assert.equal(venceEn(creado), '2026-11-05T15:20:00.000Z');
});

test('cada farmacia informa si tiene todo el carro y cuántos productos le faltan', () => {
  const d = disponibilidadPorSucursal(sucursales, stock, [{ producto_id: P1, cantidad: 2 }, { producto_id: P2, cantidad: 2 }]);
  assert.deepEqual(d.map((s) => [s.nombre, s.alcanza, s.faltan.length]), [['Sucursal Centro', true, 0], ['Casa Matriz', false, 1]]);
});

test('un producto sin fila de stock en la sucursal cuenta como faltante', () => {
  const d = disponibilidadPorSucursal([{ id: A, nombre: 'Casa Matriz' }], [], [{ producto_id: P1, cantidad: 1 }]);
  assert.equal(d[0].alcanza, false);
});

test('despacha la primera farmacia por nombre que tiene todo; si ninguna, no hay despacho', () => {
  const todas = disponibilidadPorSucursal(sucursales, stock, [{ producto_id: P1, cantidad: 1 }]);
  assert.equal(sucursalDespacho(todas).nombre, 'Casa Matriz');
  const ninguna = disponibilidadPorSucursal(sucursales, stock, [{ producto_id: P1, cantidad: 50 }]);
  assert.equal(sucursalDespacho(ninguna), null);
});

test('checkout: retiro exige farmacia; despacho exige dirección y comuna; los dos, teléfono', () => {
  const items = [{ producto_id: P1, cantidad: 1 }];
  assert.equal(checkoutSchema.safeParse({ entrega: 'retiro', items, sucursal_id: A, telefono: '912345678' }).success, true);
  assert.equal(checkoutSchema.safeParse({ entrega: 'retiro', items, telefono: '912345678' }).success, false);
  const desp = checkoutSchema.safeParse({ entrega: 'despacho', items, telefono: '912345678', direccion: 'Los Aromos 123', comuna_id: B });
  assert.equal(desp.success, true);
  assert.equal(desp.data.telefono, '+56912345678');
  assert.equal(checkoutSchema.safeParse({ entrega: 'despacho', items, telefono: '912345678', direccion: '', comuna_id: B }).success, false);
  assert.equal(checkoutSchema.safeParse({ entrega: 'retiro', items, sucursal_id: A, telefono: '12' }).success, false);
  assert.equal(checkoutSchema.safeParse({ entrega: 'avion', items, sucursal_id: A, telefono: '912345678' }).success, false);
  assert.equal(checkoutSchema.safeParse({ entrega: 'retiro', items: [], sucursal_id: A, telefono: '912345678' }).success, false);
});
