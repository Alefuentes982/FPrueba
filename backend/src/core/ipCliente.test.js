import test from 'node:test';
import assert from 'node:assert/strict';
import { ipDelWorker, ipDesdeWorker, secretoValido } from './ipCliente.js';

const S = 'un-secreto-largo-de-prueba';

test('con el secreto correcto se usa la IP que informa el Worker', () => {
  assert.equal(ipDelWorker({ 'x-farmaclick-ip': '190.20.30.40', 'x-farmaclick-secreto': S }, S), '190.20.30.40');
  assert.equal(ipDelWorker({ 'x-farmaclick-ip': '2800:150:1::7', 'x-farmaclick-secreto': S }, S), '2800:150:1::7');
});

test('sin secreto, con uno distinto o sin WORKER_SECRETO configurado, la cabecera se ignora', () => {
  assert.equal(ipDelWorker({ 'x-farmaclick-ip': '190.20.30.40' }, S), null);
  assert.equal(ipDelWorker({ 'x-farmaclick-ip': '190.20.30.40', 'x-farmaclick-secreto': 'otro' }, S), null);
  assert.equal(ipDelWorker({ 'x-farmaclick-ip': '190.20.30.40', 'x-farmaclick-secreto': S }, undefined), null);
});

test('una IP mal escrita se ignora aunque el secreto calce', () => {
  assert.equal(ipDelWorker({ 'x-farmaclick-ip': '1.2.3.4, 5.6.7.8', 'x-farmaclick-secreto': S }, S), null);
  assert.equal(ipDelWorker({ 'x-farmaclick-ip': '<script>', 'x-farmaclick-secreto': S }, S), null);
});

test('secretoValido compara sin filtrar el largo', () => {
  assert.equal(secretoValido(S, S), true);
  assert.equal(secretoValido(`${S}x`, S), false);
  assert.equal(secretoValido('', S), false);
});

test('el middleware reemplaza req.ip solo cuando corresponde', () => {
  process.env.WORKER_SECRETO = S;
  const req = Object.create({ get ip() { return '10.0.0.5'; } });
  req.headers = { 'x-farmaclick-ip': '190.20.30.40', 'x-farmaclick-secreto': S };
  ipDesdeWorker(req, null, () => {});
  assert.equal(req.ip, '190.20.30.40');
  const otro = Object.create({ get ip() { return '10.0.0.5'; } });
  otro.headers = { 'x-farmaclick-ip': '190.20.30.40', 'x-farmaclick-secreto': 'falso' };
  ipDesdeWorker(otro, null, () => {});
  assert.equal(otro.ip, '10.0.0.5');
  delete process.env.WORKER_SECRETO;
});
