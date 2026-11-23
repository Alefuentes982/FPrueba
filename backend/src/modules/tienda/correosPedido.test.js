import test from 'node:test';
import assert from 'node:assert/strict';
import { esperaReintento, plantillaCorreo } from './correosPedido.js';

const p = { codigo: 'PED-000123', nombre: 'Ana Rojas Pérez', entrega: 'retiro', sucursal: 'Casa Matriz', sucursal_direccion: 'Av. Central 50', comuna: null, total_a_pagar: 9654, url: 'https://x/tienda/pedido/1' };

test('HU-74: el correo de pago trae el total y avisa qué sigue', () => {
  const c = plantillaCorreo('Pagado', p);
  assert.match(c.asunto, /Recibimos tu pago.*PED-000123/);
  assert.match(c.texto, /Hola Ana,/);
  assert.match(c.texto, /9\.654/);
  assert.match(c.texto, /listo para retirar en Casa Matriz/);
});

test('HU-79: un correo por cada estado que le importa al cliente', () => {
  assert.match(plantillaCorreo('Listo para retiro', p).texto, /Casa Matriz, Av\. Central 50.*\n.*cédula/s);
  const d = { ...p, entrega: 'despacho', comuna: 'San Bernardo' };
  assert.match(plantillaCorreo('En despacho', d).asunto, /va en camino/);
  assert.match(plantillaCorreo('En despacho', d).texto, /San Bernardo/);
  assert.match(plantillaCorreo('Entregado', p).asunto, /Entregamos/);
  assert.throws(() => plantillaCorreo('En preparación', p), /Sin plantilla/);
});

test('HU-79: sin datos sensibles y con el texto escapado en HTML', () => {
  const c = plantillaCorreo('Listo para retiro', { ...p, nombre: '<b>Ana</b>' });
  assert.doesNotMatch(c.texto + c.html, /\d{7,8}-[\dkK]|\+569|tarjeta \d/);
  assert.doesNotMatch(c.html, /<b>Ana/);
});

test('esperaReintento: 5, 10, 20 y 40 minutos', () => {
  assert.deepEqual([1, 2, 3, 4].map(esperaReintento), [5, 10, 20, 40]);
});
