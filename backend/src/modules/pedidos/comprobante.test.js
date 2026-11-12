import test from 'node:test';
import assert from 'node:assert/strict';
import { notaPagos } from './comprobante.js';

test('el comprobante imprime el efectivo recibido y el vuelto (HU-91)', () => {
  const nota = notaPagos([
    { medio_pago: 'Débito', monto: '6000.00', monto_recibido: null, vuelto: null },
    { medio_pago: 'Efectivo', monto: '4000.00', monto_recibido: '5000.00', vuelto: '1000.00' },
  ]);
  assert.match(nota, /Pagado con: Débito \$ 6\.000, Efectivo \$ 4\.000\./);
  assert.match(nota, /Efectivo recibido \$ 5\.000, vuelto \$ 1\.000\./);
});

test('sin efectivo recibido el comprobante queda como antes', () => {
  assert.equal(notaPagos([{ medio_pago: 'Crédito', monto: 1500, monto_recibido: null }]), 'Pagado con: Crédito $ 1.500. Documento no tributario.');
  assert.equal(notaPagos([]), 'Documento no tributario.');
});
