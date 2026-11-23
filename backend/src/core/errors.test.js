import test from 'node:test';
import assert from 'node:assert/strict';
import { enLinea, errorHandler, HttpError, RESTRICCIONES, traducirRestriccion } from './errors.js';

// Respuesta mínima de Express para probar el manejador.
function respuesta() {
  const r = { codigo: null, cuerpo: null };
  r.status = (c) => { r.codigo = c; return r; };
  r.json = (b) => { r.cuerpo = b; return r; };
  return r;
}

test('HU-88: una restricción con nombre se traduce al campo de su línea', async () => {
  const err = Object.assign(new Error('new row violates check constraint'), { code: '23514', constraint: 'ck_lote_vencimiento_posterior_ingreso' });
  await assert.rejects(enLinea('items.2.', async () => { throw err; }));
  const t = traducirRestriccion(err);
  assert.equal(t.status, 400);
  assert.deepEqual(t.details, [{ path: 'items.2.fecha_vencimiento', message: RESTRICCIONES.ck_lote_vencimiento_posterior_ingreso.mensaje }]);
});

test('HU-88: el texto del trigger se conserva cuando la restricción no trae mensaje propio', () => {
  const err = Object.assign(new Error('El lote L1 vence el 01-12-2026 y la fecha mínima es el 12-02-2027.'), { code: '23514', constraint: 'ck_lote_vida_util_minima', prefijo: 'items.0.' });
  const r = respuesta();
  errorHandler(err, {}, r);
  assert.equal(r.codigo, 400);
  assert.equal(r.cuerpo.error, err.message);
  assert.equal(r.cuerpo.details[0].path, 'items.0.fecha_vencimiento');
});

test('HU-88: una restricción sin traducción da el texto genérico y queda en el log', () => {
  const avisos = [];
  const original = console.warn;
  console.warn = (m) => avisos.push(m);
  try {
    const r = respuesta();
    errorHandler(Object.assign(new Error('x'), { code: '23514', constraint: 'pedido_check1' }), {}, r);
    assert.equal(r.codigo, 400);
    assert.equal(r.cuerpo.error, 'Los datos no cumplen una regla de la base de datos.');
    assert.match(avisos[0], /pedido_check1/);
  } finally {
    console.warn = original;
  }
});

test('HttpError puede llevar el detalle por campo', () => {
  const r = respuesta();
  errorHandler(new HttpError(400, 'Revise las fechas.', [{ path: 'items.1.fecha_vencimiento', message: 'Vence antes del mínimo.' }]), {}, r);
  assert.equal(r.codigo, 400);
  assert.equal(r.cuerpo.details.length, 1);
});

test('HU-96: un cuerpo demasiado grande da 413 con un mensaje claro', () => {
  const r = respuesta();
  errorHandler(Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 }), {}, r);
  assert.equal(r.codigo, 413);
  assert.match(r.cuerpo.error, /demasiado grandes/);
});
