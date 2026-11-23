import test from 'node:test';
import assert from 'node:assert/strict';
import { leerRespuestaReembolso, revisarAnulacion } from './reembolso.js';

const pago = { saldo: 9654 };
test('HU-80: se anula un pedido web pagado que aún no sale de la farmacia', () => {
  for (const estado of ['Pagado', 'En preparación', 'Listo para retiro']) assert.equal(revisarAnulacion({ canal: 'Online', estado }, pago), null);
  assert.match(revisarAnulacion({ canal: 'Online', estado: 'En despacho' }, pago), /Devoluciones/);
  assert.match(revisarAnulacion({ canal: 'Online', estado: 'Entregado' }, pago), /Devoluciones/);
  assert.match(revisarAnulacion({ canal: 'Online', estado: 'Pago pendiente' }, pago), /no tiene un pago/);
  assert.match(revisarAnulacion({ canal: 'Presencial', estado: 'Pagado' }, pago), /tienda en línea/);
  assert.match(revisarAnulacion({ canal: 'Online', estado: 'Pagado' }, null), /Webpay/);
  assert.match(revisarAnulacion({ canal: 'Online', estado: 'Pagado' }, { saldo: 0 }), /ya se reembolsó/);
});

test('HU-80: la respuesta de Transbank se lee como REVERSED o NULLIFIED', () => {
  assert.deepEqual(leerRespuestaReembolso({ type: 'REVERSED' }), { tipo: 'REVERSED', codigo_autorizacion: null });
  assert.deepEqual(leerRespuestaReembolso({ type: 'NULLIFIED', authorization_code: '123456', response_code: 0 }), { tipo: 'NULLIFIED', codigo_autorizacion: '123456' });
  assert.throws(() => leerRespuestaReembolso({ type: 'NULLIFIED', response_code: -1 }), /no aprobó/);
  assert.throws(() => leerRespuestaReembolso({}), /inesperada/);
});
