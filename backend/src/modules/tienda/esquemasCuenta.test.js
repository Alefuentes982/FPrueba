import test from 'node:test';
import assert from 'node:assert/strict';
import { contrasena, ingresoSchema, normalizarTelefono, nuevaClaveSchema, registroSchema } from './esquemasCuenta.js';

const comuna = '00000000-0000-4000-8000-000000000001';
const base = {
  nombre: 'Ana Pérez', rut: '12.345.678-5', correo: ' Ana@Correo.CL ', telefono: '9 1234 5678',
  direccion: 'Av. Siempre Viva 742', comuna_id: comuna, password: 'clave1234',
};
const errores = (r) => r.error.issues.map((i) => i.path.join('.'));

test('registro: normaliza RUT, correo y teléfono', () => {
  const d = registroSchema.parse(base);
  assert.equal(d.rut, '12345678-5');
  assert.equal(d.correo, 'ana@correo.cl');
  assert.equal(d.telefono, '+56912345678');
});

test('registro: rechaza RUT con dígito verificador incorrecto', () => {
  const r = registroSchema.safeParse({ ...base, rut: '12.345.678-9' });
  assert.equal(r.success, false);
  assert.deepEqual(errores(r), ['rut']);
});

test('registro: exige teléfono de 9 dígitos, dirección y comuna válidas', () => {
  assert.deepEqual(errores(registroSchema.safeParse({ ...base, telefono: '1234' })), ['telefono']);
  assert.deepEqual(errores(registroSchema.safeParse({ ...base, direccion: 'x' })), ['direccion']);
  assert.deepEqual(errores(registroSchema.safeParse({ ...base, comuna_id: 'San Bernardo' })), ['comuna_id']);
});

test('teléfono: acepta con o sin +56 y con espacios', () => {
  assert.equal(normalizarTelefono('+56 9 8765 4321'), '+56987654321');
  assert.equal(normalizarTelefono('22 345 6789'), '+56223456789');
  assert.equal(normalizarTelefono('912345'), null);
});

test('contraseña: 8 caracteres con al menos una letra y un número', () => {
  assert.equal(contrasena.safeParse('clave1234').success, true);
  assert.equal(contrasena.safeParse('corta1').success, false);
  assert.equal(contrasena.safeParse('solamenteletras').success, false);
  assert.equal(contrasena.safeParse('12345678').success, false);
});

test('ingreso y nueva contraseña', () => {
  assert.equal(ingresoSchema.safeParse({ correo: 'ana@correo.cl', password: '' }).success, false);
  assert.equal(nuevaClaveSchema.safeParse({ access_token: 'x', password: 'clave1234' }).success, false);
  assert.equal(nuevaClaveSchema.safeParse({ access_token: 'eyJ.token.firmado', password: 'clave1234' }).success, true);
});
