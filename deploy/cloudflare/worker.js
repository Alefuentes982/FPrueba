// Worker de Cloudflare de FarmaClick (HU-92). Publica el sistema en <nombre>.workers.dev y reenvía cada visita a
// producción, para las redes (colegios, empresas, algunos operadores) que bloquean los dominios de DNS dinámico.
// Variables del Worker (Settings > Variables and Secrets):
//   ORIGEN   dirección de producción, por ejemplo https://farmaclick.duckdns.org (texto)
//   SECRETO  el mismo valor que WORKER_SECRETO en el .env de la VM de producción (secreto, tipo "Secret")
// La API confía en la IP de X-FarmaClick-IP solo si X-FarmaClick-Secreto calza (backend/src/core/ipCliente.js).
const QUITAR = ['host', 'x-farmaclick-ip', 'x-farmaclick-secreto', 'cf-connecting-ip', 'x-real-ip'];

export default {
  async fetch(request, env) {
    if (!env.ORIGEN || !env.SECRETO) return new Response('Worker sin configurar: faltan ORIGEN o SECRETO.', { status: 500 });
    const entrada = new URL(request.url);
    const origen = new URL(env.ORIGEN);
    const destino = new URL(entrada.pathname + entrada.search, origen);

    const cabeceras = new Headers(request.headers);
    QUITAR.forEach((h) => cabeceras.delete(h));
    const ip = request.headers.get('cf-connecting-ip');
    if (ip) cabeceras.set('x-farmaclick-ip', ip);
    cabeceras.set('x-farmaclick-secreto', env.SECRETO);
    cabeceras.set('x-forwarded-host', entrada.host);
    cabeceras.set('x-forwarded-proto', entrada.protocol.replace(':', ''));

    const conCuerpo = !['GET', 'HEAD'].includes(request.method);
    const respuesta = await fetch(destino, {
      method: request.method,
      headers: cabeceras,
      body: conCuerpo ? request.body : undefined,
      redirect: 'manual', // las redirecciones (por ejemplo, el regreso de Webpay) las sigue el navegador
      ...(conCuerpo && { duplex: 'half' }),
    });

    // Una redirección hacia producción se reescribe para que el navegador siga en el Worker.
    const salida = new Response(respuesta.body, respuesta);
    const ubicacion = salida.headers.get('location');
    if (ubicacion) {
      const u = new URL(ubicacion, destino);
      if (u.host === origen.host) {
        u.protocol = entrada.protocol;
        u.host = entrada.host;
        salida.headers.set('location', u.toString());
      }
    }
    return salida;
  },
};
