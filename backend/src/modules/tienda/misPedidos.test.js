import test from 'node:test';
import assert from 'node:assert/strict';
import { mensajeEstado, PAGADOS } from './misPedidos.js';

test('HU-75: cada estado tiene un mensaje para el cliente', () => {
  assert.match(mensajeEstado('Listo para retiro', 'retiro'), /número de pedido y tu RUT/);
  assert.match(mensajeEstado('En despacho', 'despacho'), /camino/);
  assert.match(mensajeEstado('Entregado', 'despacho'), /dirección/);
  assert.match(mensajeEstado('Entregado', 'retiro'), /retiraste/);
  assert.match(mensajeEstado('Expirado', 'retiro'), /ningún cargo/);
});

test('HU-75: hay comprobante desde que el pedido está pagado', () => {
  assert.ok(PAGADOS.includes('Pagado') && PAGADOS.includes('Entregado'));
  assert.ok(!PAGADOS.includes('Pago pendiente') && !PAGADOS.includes('Expirado') && !PAGADOS.includes('Cancelado'));
});
