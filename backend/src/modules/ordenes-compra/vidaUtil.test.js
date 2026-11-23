import test from 'node:test';
import assert from 'node:assert/strict';
import { revisarVidaUtil, sumarMeses } from './vidaUtil.js';

test('sumarMeses se comporta como fecha + interval de PostgreSQL', () => {
  assert.equal(sumarMeses('2026-11-12', 3), '2027-02-12');
  assert.equal(sumarMeses('2026-11-30', 3), '2027-02-28');
  assert.equal(sumarMeses('2027-11-30', 3), '2028-02-29');
  assert.equal(sumarMeses('2026-10-31', 1), '2026-11-30');
  assert.equal(sumarMeses('2026-01-15', 0), '2026-01-15');
  assert.equal(sumarMeses('2026-12-01', 13), '2028-01-01');
});

const detalles = new Map([['d1', { producto: 'Paracetamol 500 mg' }], ['d2', { producto: 'Ibuprofeno 400 mg' }]]);
const base = { detalles, minima: '2027-02-12', meses: 3 };

test('HU-87: una línea que vence antes del mínimo se rechaza nombrando producto, lote y fecha mínima', () => {
  const errores = revisarVidaUtil([
    { detalle_id: 'd1', numero_lote: 'L-77', fecha_vencimiento: '2027-01-31' },
    { detalle_id: 'd2', numero_lote: 'L-80', fecha_vencimiento: '2027-02-12' },
  ], { ...base, puedeExceptuar: false });
  assert.equal(errores.length, 1);
  assert.equal(errores[0].path, 'items.0.fecha_vencimiento');
  assert.match(errores[0].message, /Paracetamol 500 mg.*lote L-77.*31-01-2027.*12-02-2027.*3 meses/);
});

test('HU-87: sin vencimiento o con el mínimo justo no hay error', () => {
  assert.deepEqual(revisarVidaUtil([{ detalle_id: 'd1', fecha_vencimiento: null }, { detalle_id: 'd2', fecha_vencimiento: '2027-02-12' }],
    { ...base, puedeExceptuar: false }), []);
});

test('HU-87: la excepción con motivo solo la acepta el Administrador o el Jefe de local', () => {
  const linea = [{ detalle_id: 'd1', numero_lote: 'L-1', fecha_vencimiento: '2026-12-31', excepcion_motivo: 'Producto escaso, se vende en la semana' }];
  assert.deepEqual(revisarVidaUtil(linea, { ...base, puedeExceptuar: true }), []);
  const errores = revisarVidaUtil(linea, { ...base, puedeExceptuar: false });
  assert.equal(errores[0].path, 'items.0.excepcion_motivo');
});
