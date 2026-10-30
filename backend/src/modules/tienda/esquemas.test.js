import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrosCatalogo } from './esquemas.js';

test('filtros del catálogo con valores por defecto', () => {
  const d = filtrosCatalogo.parse({});
  assert.equal(d.orden, 'relevancia');
  assert.equal(d.con_descuento, false);
  assert.equal(d.precio_min, undefined);
  assert.equal(d.page, 1);
  assert.equal(d.limit, 12);
  assert.equal(d.q, undefined);
  const f = filtrosCatalogo.parse({ q: '  gel ', categoria_id: '', page: '2', limit: '24', orden: 'precio_asc' });
  assert.equal(f.q, 'gel');
  assert.equal(f.categoria_id, undefined);
  assert.equal(f.orden, 'precio_asc');
  assert.equal(f.page, 2);
  assert.equal(f.limit, 24);
});

test('filtros de oferta y rango de precio', () => {
  assert.equal(filtrosCatalogo.parse({ con_descuento: '1' }).con_descuento, true);
  assert.equal(filtrosCatalogo.parse({ con_descuento: 'true' }).con_descuento, true);
  assert.equal(filtrosCatalogo.parse({ con_descuento: 'si' }).con_descuento, false);
  const f = filtrosCatalogo.parse({ precio_min: '2000', precio_max: '15000', orden: 'descuento' });
  assert.equal(f.precio_min, 2000);
  assert.equal(f.precio_max, 15000);
  assert.equal(f.orden, 'descuento');
  assert.equal(filtrosCatalogo.parse({ precio_min: '', precio_max: '' }).precio_max, undefined);
});

test('filtros del catálogo rechazan valores fuera de rango', () => {
  assert.equal(filtrosCatalogo.safeParse({ precio_min: '5000', precio_max: '1000' }).success, false);
  assert.equal(filtrosCatalogo.safeParse({ precio_min: '-1' }).success, false);
  assert.equal(filtrosCatalogo.safeParse({ limit: '500' }).success, false);
  assert.equal(filtrosCatalogo.safeParse({ page: '0' }).success, false);
  assert.equal(filtrosCatalogo.safeParse({ orden: 'costo' }).success, false);
  assert.equal(filtrosCatalogo.safeParse({ categoria_id: 'abc' }).success, false);
});
