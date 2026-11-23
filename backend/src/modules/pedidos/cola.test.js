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

import { revisarEntregaRetiro } from './cola.js';
import { normalizarRut } from '../proveedores/rut.js';

const listo = { estado: 'Listo para retiro', tipo_entrega: 'retiro', numero: 123, sucursal_id: 's1', rut_cliente: '11111111-1' };
const vendedor = { rol: 'Vendedor', sucursal_id: 's1' };
const entregar = (p, x) => revisarEntregaRetiro(p, { normalizarRut, usuario: vendedor, ...x });

test('HU-77: con número de pedido y RUT correctos se entrega', () => {
  assert.equal(entregar(listo, { codigo: 'PED-000123', rut: '11.111.111-1' }), null);
  assert.equal(entregar(listo, { codigo: '123', rut: '111111111' }), null);
});

test('HU-77: RUT de otra persona o número equivocado no se entrega', () => {
  assert.equal(entregar(listo, { codigo: 'PED-000123', rut: '22.222.222-2' }).path, 'rut');
  assert.match(entregar(listo, { codigo: 'PED-000123', rut: '22.222.222-2' }).error, /no corresponde/);
  assert.match(entregar(listo, { codigo: 'PED-000123', rut: '11.111.111-2' }).error, /no es válido/);
  assert.equal(entregar(listo, { codigo: 'PED-000124', rut: '11.111.111-1' }).path, 'codigo');
});

test('HU-77: solo un retiro "Listo para retiro" de la sucursal del vendedor', () => {
  assert.match(entregar({ ...listo, estado: 'En preparación' }, { codigo: '123', rut: '11111111-1' }).error, /Listo para retiro/);
  assert.equal(entregar({ ...listo, sucursal_id: 's2' }, { codigo: '123', rut: '11111111-1' }).status, 403);
  assert.equal(revisarEntregaRetiro({ ...listo, sucursal_id: 's2' }, { codigo: '123', rut: '11111111-1', normalizarRut, usuario: { rol: 'Administrador' } }), null);
  assert.equal(entregar({ ...listo, tipo_entrega: 'despacho' }, { codigo: '123', rut: '11111111-1' }).status, 409);
});

test('HU-77: el retiro listo ofrece "entregar" en vez de pasar a Entregado', () => {
  const p = { canal: 'Online', tipo_entrega: 'retiro', estado: 'Listo para retiro', acciones: ['cancelar', 'estado:Entregado'] };
  assert.deepEqual(accionesWeb(p), ['cancelar', 'entregar']);
  assert.match(revisarCambioWeb(p, 'Entregado'), /número de pedido y el RUT/);
});
