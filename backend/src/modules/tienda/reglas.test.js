import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CANTIDAD, descuentoVisible, estadoLinea, ordenSql, totalesCarrito, unirLineas } from './reglas.js';

test('ordenSql solo acepta las claves conocidas', () => {
  assert.equal(ordenSql('precio_asc'), 'pf.precio_final ASC, c.nombre ASC');
  assert.equal(ordenSql('nombre'), 'c.nombre ASC');
  assert.equal(ordenSql('descuento'), 'COALESCE(d.porcentaje_descuento, 0) DESC, c.nombre ASC');
  assert.equal(ordenSql('c.costo; DROP TABLE producto'), 'COALESCE(v.unidades, 0) DESC, c.nombre ASC');
  assert.equal(ordenSql(undefined), 'COALESCE(v.unidades, 0) DESC, c.nombre ASC');
});

test('unirLineas suma productos repetidos y respeta el máximo', () => {
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  assert.deepEqual(unirLineas([{ producto_id: a, cantidad: 2 }, { producto_id: b, cantidad: 1 }, { producto_id: a, cantidad: 3 }]),
    [{ producto_id: a, cantidad: 5 }, { producto_id: b, cantidad: 1 }]);
  assert.deepEqual(unirLineas([{ producto_id: a, cantidad: 90 }, { producto_id: a, cantidad: 50 }]),
    [{ producto_id: a, cantidad: MAX_CANTIDAD }]);
});

test('estadoLinea distingue producto fuera de la tienda, agotado y stock insuficiente', () => {
  assert.equal(estadoLinea({ enCatalogo: false, disponible: 10, cantidad: 1 }), 'no_disponible');
  assert.equal(estadoLinea({ enCatalogo: true, disponible: 0, cantidad: 1 }), 'agotado');
  assert.equal(estadoLinea({ enCatalogo: true, disponible: 2, cantidad: 3 }), 'stock_insuficiente');
  assert.equal(estadoLinea({ enCatalogo: true, disponible: 3, cantidad: 3 }), 'ok');
});

test('totalesCarrito suma solo las líneas vendibles y calcula neto e IVA', () => {
  const lineas = [
    { estado: 'ok', cantidad: 3, precio_unitario: 3665, subtotal: 10995 },
    { estado: 'ok', cantidad: 5, precio_unitario: 2071, subtotal: 10355 },
    { estado: 'agotado', cantidad: 1, precio_unitario: 8282, subtotal: 8282 },
  ];
  const t = totalesCarrito(lineas);
  assert.equal(t.total, 21350);
  assert.equal(t.subtotal_neto, 17941);
  assert.equal(t.iva, 3409);
  assert.equal(t.unidades, 8);
  assert.equal(t.puede_continuar, false);
  assert.equal(totalesCarrito(lineas.slice(0, 2)).puede_continuar, true);
  assert.equal(totalesCarrito([]).puede_continuar, false);
});

test('totalesCarrito informa el descuento como diferencia entre bruto y total', () => {
  const t = totalesCarrito([{ estado: 'ok', cantidad: 4, precio_unitario: 1000, subtotal: 3600 }]);
  assert.equal(t.subtotal_bruto, 4000);
  assert.equal(t.descuento_total, 400);
});

test('descuentoVisible muestra el precio rebajado solo si el descuento rige desde 1 unidad', () => {
  assert.equal(descuentoVisible(null, 1000), null);
  assert.equal(descuentoVisible({ nombre: 'X', porcentaje_descuento: '0', cantidad_minima: 1 }, 1000), null);
  assert.deepEqual(descuentoVisible({ nombre: 'Oferta', porcentaje_descuento: '15.00', cantidad_minima: 1 }, 2071),
    { nombre: 'Oferta', porcentaje: 15, desde: 1, precio_con_descuento: 1760 });
  assert.deepEqual(descuentoVisible({ nombre: 'Lleva 3', porcentaje_descuento: '10', cantidad_minima: 3 }, 1000),
    { nombre: 'Lleva 3', porcentaje: 10, desde: 3, precio_con_descuento: null });
});
