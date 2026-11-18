import test from 'node:test';
import assert from 'node:assert/strict';
import { accionesWeb, minutosDesde, revisarCambioWeb, siguienteWeb } from './cola.js';

test('HU-76: el retiro pasa por "Listo para retiro" y el despacho por "En despacho"', () => {
  assert.equal(siguienteWeb('Pagado', 'retiro'), 'En preparación');
  assert.equal(siguienteWeb('En preparación', 'retiro'), 'Listo para retiro');
  assert.equal(siguienteWeb('Listo para retiro', 'retiro'), 'Entregado');
  assert.equal(siguienteWeb('En preparación', 'despacho'), 'En despacho');
  assert.equal(siguienteWeb('En despacho', 'despacho'), 'Entregado');
  assert.equal(siguienteWeb('Entregado', 'despacho'), null);
  assert.equal(siguienteWeb('En preparación', null), null);
});

test('HU-76: la ficha de un pedido web muestra solo el paso de su entrega', () => {
  const p = { canal: 'Online', tipo_entrega: 'despacho', estado: 'En preparación', acciones: ['cancelar', 'estado:Listo para retiro', 'estado:En despacho'] };
  assert.deepEqual(accionesWeb(p), ['cancelar', 'estado:En despacho']);
  const caja = { canal: 'Presencial', tipo_entrega: null, estado: 'En preparación', acciones: ['estado:Listo para retiro', 'estado:En despacho'] };
  assert.deepEqual(accionesWeb(caja), caja.acciones);
});

test('HU-76: un cambio que no sigue el camino de la entrega se rechaza con el paso correcto', () => {
  const p = { canal: 'Online', tipo_entrega: 'retiro', estado: 'En preparación' };
  assert.equal(revisarCambioWeb(p, 'Listo para retiro'), null);
  assert.match(revisarCambioWeb(p, 'En despacho'), /retiro en farmacia.*"Listo para retiro"/);
  assert.match(revisarCambioWeb({ ...p, estado: 'Entregado' }, 'En despacho'), /ya no cambia/);
  assert.equal(revisarCambioWeb({ canal: 'Telefónico', estado: 'En preparación' }, 'En despacho'), null);
});

test('minutosDesde', () => {
  assert.equal(minutosDesde('2026-11-12T10:00:00Z', new Date('2026-11-12T10:12:59Z')), 12);
  assert.equal(minutosDesde('2026-11-12T10:00:00Z', new Date('2026-11-12T09:00:00Z')), 0);
});
