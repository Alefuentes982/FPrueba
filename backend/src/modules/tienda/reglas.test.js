import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descuentoVisible, ordenSql } from './reglas.js';

test('ordenSql solo acepta las claves conocidas', () => {
  assert.equal(ordenSql('precio_asc'), 'pf.precio_final ASC, c.nombre ASC');
  assert.equal(ordenSql('nombre'), 'c.nombre ASC');
  assert.equal(ordenSql('descuento'), 'COALESCE(d.porcentaje_descuento, 0) DESC, c.nombre ASC');
  assert.equal(ordenSql('c.costo; DROP TABLE producto'), 'COALESCE(v.unidades, 0) DESC, c.nombre ASC');
  assert.equal(ordenSql(undefined), 'COALESCE(v.unidades, 0) DESC, c.nombre ASC');
});

test('descuentoVisible muestra el precio rebajado solo si el descuento rige desde 1 unidad', () => {
  assert.equal(descuentoVisible(null, 1000), null);
  assert.equal(descuentoVisible({ nombre: 'X', porcentaje_descuento: '0', cantidad_minima: 1 }, 1000), null);
  assert.deepEqual(descuentoVisible({ nombre: 'Oferta', porcentaje_descuento: '15.00', cantidad_minima: 1 }, 2071),
    { nombre: 'Oferta', porcentaje: 15, desde: 1, precio_con_descuento: 1760 });
  assert.deepEqual(descuentoVisible({ nombre: 'Lleva 3', porcentaje_descuento: '10', cantidad_minima: 3 }, 1000),
    { nombre: 'Lleva 3', porcentaje: 10, desde: 3, precio_con_descuento: null });
});
