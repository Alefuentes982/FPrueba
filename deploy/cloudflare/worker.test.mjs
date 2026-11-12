// Pruebas del Worker con Node 22 (tiene Request, Response y fetch). Cómo ejecutarlas con Docker:
// deploy/runbooks/acceso-cloudflare.md, sección "Pruebas automáticas del Worker".
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

const env = { ORIGEN: 'https://farmaclick.duckdns.org', SECRETO: 's3cr3t0' };
let ultima;
globalThis.fetch = async (url, init) => {
  ultima = { url: String(url), init };
  if (String(url).includes('/api/tienda/pagos/webpay/retorno')) {
    return new Response(null, { status: 303, headers: { location: 'https://farmaclick.duckdns.org/tienda/pedido/123?pago=aprobado' } });
  }
  return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
};

const visita = (ruta, init = {}) => worker.fetch(new Request(`https://farmaclick.ejemplo.workers.dev${ruta}`, init), env);

test('reenvía la ruta y la consulta a producción', async () => {
  const r = await visita('/tienda/productos?q=gel');
  assert.equal(r.status, 200);
  assert.equal(ultima.url, 'https://farmaclick.duckdns.org/tienda/productos?q=gel');
});

test('agrega la IP de Cloudflare y el secreto, y descarta los que mande el visitante', async () => {
  await visita('/api/health', { headers: { 'cf-connecting-ip': '190.20.30.40', 'x-farmaclick-ip': '1.1.1.1', 'x-farmaclick-secreto': 'falso' } });
  const h = ultima.init.headers;
  assert.equal(h.get('x-farmaclick-ip'), '190.20.30.40');
  assert.equal(h.get('x-farmaclick-secreto'), 's3cr3t0');
  assert.equal(h.get('x-forwarded-host'), 'farmaclick.ejemplo.workers.dev');
});

test('reenvía el cuerpo de un POST (por ejemplo, el login)', async () => {
  await visita('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"correo":"a@b.cl"}' });
  assert.equal(ultima.init.method, 'POST');
  assert.equal(await new Response(ultima.init.body).text(), '{"correo":"a@b.cl"}');
});

test('una redirección hacia producción sigue en el Worker (regreso de Webpay)', async () => {
  const r = await visita('/api/tienda/pagos/webpay/retorno?token_ws=abc');
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), 'https://farmaclick.ejemplo.workers.dev/tienda/pedido/123?pago=aprobado');
});

test('sin configurar responde 500 en vez de reenviar a ciegas', async () => {
  const r = await worker.fetch(new Request('https://x.workers.dev/'), {});
  assert.equal(r.status, 500);
});
