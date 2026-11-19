import test from 'node:test';
import assert from 'node:assert/strict';
import { costoSchema, costosSchema } from './esquemas.js';

test('HU-78: el costo de despacho va en pesos enteros, entre 0 y 100.000', () => {
  assert.deepEqual(costoSchema.parse({ costo: 2990 }), { costo: 2990, activo: true });
  assert.equal(costoSchema.safeParse({ costo: -1 }).success, false);
  assert.equal(costoSchema.safeParse({ costo: 29.9 }).success, false);
  assert.equal(costoSchema.safeParse({ costo: 100001 }).success, false);
  assert.equal(costoSchema.parse({ costo: 0, activo: false }).activo, false);
});

test('HU-78: una lista de cambios necesita al menos una comuna válida', () => {
  assert.equal(costosSchema.safeParse({ comunas: [] }).success, false);
  const r = costosSchema.safeParse({ comunas: [{ comuna_id: 'x', costo: 1000 }] });
  assert.equal(r.error.issues[0].path.join('.'), 'comunas.0.comuna_id');
});

import { vidaUtilWebSchema } from './esquemas.js';

test('HU-93: la vida útil mínima de la tienda va en días enteros, entre 0 y 365', () => {
  assert.equal(vidaUtilWebSchema.parse({ dias: 30 }).dias, 30);
  assert.throws(() => vidaUtilWebSchema.parse({ dias: 400 }), /Máximo 365/);
  assert.throws(() => vidaUtilWebSchema.parse({ dias: 1.5 }), /enteros/);
});
