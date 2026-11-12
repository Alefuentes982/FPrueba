import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluarConfirmacion, MINUTOS_MINIMOS_PAGO, ordenDeCompra } from './reglasPago.js';
import { configWebpay } from './webpay.js';

test('orden de compra: número del pedido más el intento, hasta 26 caracteres', () => {
  assert.equal(ordenDeCompra('PED-000123', 1), 'PED-000123-1');
  assert.equal(ordenDeCompra('PED-000123', 12), 'PED-000123-12');
  assert.throws(() => ordenDeCompra('PED-0000000000000000000123', 1), /26 caracteres/);
});

test('aprobado solo con AUTHORIZED, código 0, mismo monto y misma orden', () => {
  const ok = { status: 'AUTHORIZED', response_code: 0, amount: 8782, buy_order: 'PED-000001-1', authorization_code: '1213' };
  const esperado = { monto: '8782.00', buyOrder: 'PED-000001-1' };
  assert.equal(evaluarConfirmacion(ok, esperado), 'aprobado');
  assert.equal(evaluarConfirmacion({ ...ok, status: 'FAILED', response_code: -1 }, esperado), 'rechazado');
  assert.equal(evaluarConfirmacion({ ...ok, response_code: -3 }, esperado), 'rechazado');
  assert.equal(evaluarConfirmacion({ ...ok, amount: 8783 }, esperado), 'no_coincide');
  assert.equal(evaluarConfirmacion({ ...ok, buy_order: 'PED-000001-2' }, esperado), 'no_coincide');
  assert.equal(evaluarConfirmacion(null, esperado), 'rechazado');
});

test('para empezar a pagar deben quedar al menos 5 minutos de reserva', () => {
  assert.equal(MINUTOS_MINIMOS_PAGO, 5);
});

test('Webpay: integración usa las credenciales públicas de prueba; producción exige las propias', () => {
  const i = configWebpay({});
  assert.equal(i.ambiente, 'integracion');
  assert.equal(i.codigo, '597055555532');
  assert.equal(i.base, 'https://webpay3gint.transbank.cl');
  assert.throws(() => configWebpay({ WEBPAY_AMBIENTE: 'produccion' }), /WEBPAY_CODIGO_COMERCIO/);
  const p = configWebpay({ WEBPAY_AMBIENTE: 'produccion', WEBPAY_CODIGO_COMERCIO: '5970XXXX', WEBPAY_LLAVE_SECRETA: 'llave' });
  assert.equal(p.base, 'https://webpay3g.transbank.cl');
  assert.equal(configWebpay({ WEBPAY_URL: 'http://localhost:3200/' }).base, 'http://localhost:3200');
});
