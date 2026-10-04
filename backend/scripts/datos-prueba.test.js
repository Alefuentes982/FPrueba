import test from 'node:test';
import assert from 'node:assert/strict';
import { generarSql, leerCsv, parsearCsv, validar } from './datos-prueba.js';

const base = () => ({
  categorias: parsearCsv('nombre;margen_pesimista;margen_probable;margen_optimista\nMedicamentos;0.2;0.3;0.4\n'),
  proveedores: parsearCsv('nombre;rut;contacto\nLab Uno;76201345-2;\n'),
  productos: parsearCsv('sku;nombre;categoria;condicion_venta;costo;margen;stock;stock_minimo;vence_meses;proveedor_rut;proveedor_alt_rut\nA-1;Paracetamol;Medicamentos;Venta directa;450;;10;5;24;76201345-2;\n'),
});

test('parsearCsv: separador ; o ",", comillas, BOM y líneas vacías', () => {
  assert.deepEqual(parsearCsv('﻿a;b\r\n1;2\r\n\r\n3;4\r\n').map(({ _linea, ...f }) => f), [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  assert.deepEqual(parsearCsv('a,b\n"x, y","di ""hola"""\n').map(({ _linea, ...f }) => f), [{ a: 'x, y', b: 'di "hola"' }]);
  assert.equal(parsearCsv('a;b\n1;2')[0]._linea, 2);
});

test('validar acepta datos correctos y normaliza el RUT', () => {
  const d = validar(base());
  assert.equal(d.proveedores[0].rut, '76201345-2');
  assert.equal(d.productos[0].prov, '76201345-2');
});

test('validar reúne los problemas con archivo y línea', () => {
  const d = base();
  d.proveedores = parsearCsv('nombre;rut;contacto\nMalo;12345678-0;\n');
  d.productos = parsearCsv('sku;nombre;categoria;condicion_venta;costo;margen;stock;stock_minimo;vence_meses;proveedor_rut;proveedor_alt_rut\nA-1;X;Inexistente;Venta directa;abc;;1;1;;76201345-2;\nA-1;Y;Medicamentos;Venta directa;10;;1;1;;76201345-2;\n');
  assert.throws(() => validar(d), (e) => /proveedores\.csv \(línea 2\): RUT inválido/.test(e.message)
    && /productos\.csv \(línea 2\): la categoría "Inexistente"/.test(e.message)
    && /SKU repetido/.test(e.message));
});

test('el SQL es idempotente y no embebe texto sin escapar', () => {
  const d = base();
  d.productos = parsearCsv("sku;nombre;categoria;condicion_venta;costo;margen;stock;stock_minimo;vence_meses;proveedor_rut;proveedor_alt_rut\nA-1;Crema O'Higgins;Medicamentos;Venta directa;450;;10;5;24;76201345-2;\n");
  const sql = generarSql(d);
  assert.match(sql, /'Crema O''Higgins'/);
  for (const clave of ['ON CONFLICT (sku) DO NOTHING', 'ON CONFLICT (rut) DO NOTHING', 'ON CONFLICT (nombre) DO NOTHING', 'NOT EXISTS (SELECT 1 FROM movimiento_inventario']) {
    assert.ok(sql.includes(clave), clave);
  }
});

test('los CSV incluidos en el repositorio son válidos y están al día con el SQL generado', () => {
  const datos = { categorias: leerCsv('categorias.csv'), proveedores: leerCsv('proveedores.csv'), productos: leerCsv('productos.csv') };
  const d = validar(datos);
  assert.ok(d.productos.length >= 50 && d.proveedores.length >= 3);
  assert.ok(d.productos.some((p) => p.condicion === 'Receta médica simple'));
  assert.ok(generarSql(datos).includes(`${d.productos.length} productos`));
});
