import test from 'node:test';
import assert from 'node:assert/strict';
import { almacen, nombreArchivo, tipoImagen, validarImagen } from './fotos.js';

const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(10)]);

test('HU-96: el tipo de imagen se reconoce por sus bytes', () => {
  assert.equal(tipoImagen(jpg).ext, 'jpg');
  assert.equal(tipoImagen(png).ext, 'png');
  assert.equal(tipoImagen(webp).ext, 'webp');
  assert.equal(tipoImagen(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
});

test('HU-96: se rechaza lo que no es imagen o pesa más de 1 MB', () => {
  assert.throws(() => validarImagen(Buffer.from('%PDF-1.7 ............')), /no es una imagen/);
  assert.throws(() => validarImagen(Buffer.concat([jpg, Buffer.alloc(1024 * 1024)])), /más de 1 MB/);
  assert.throws(() => validarImagen(Buffer.alloc(0)), /No llegó/);
});

test('HU-96: el archivo se llama como el SKU y el almacén depende del entorno', () => {
  assert.equal(nombreArchivo('MED-001', 'jpg'), 'med-001.jpg');
  assert.equal(nombreArchivo('A B/../C', 'png'), 'a-b----c.png');
  assert.equal(almacen({ SUPABASE_URL: 'https://x.supabase.co' }), 'supabase');
  assert.equal(almacen({ SUPABASE_URL: 'https://x.supabase.co', AUTH_MODE: 'local' }), 'local');
  assert.equal(almacen({ FOTOS_ALMACEN: 'supabase', AUTH_MODE: 'local' }), 'supabase');
});
