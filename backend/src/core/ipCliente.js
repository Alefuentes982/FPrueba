// IP real del cliente cuando el sistema se usa a través del Worker de Cloudflare (HU-92).
// El Worker reenvía cada visita a producción con dos cabeceras: X-FarmaClick-IP (la IP de quien visita, según
// Cloudflare) y X-FarmaClick-Secreto (un secreto que solo conocen el Worker y la API, en WORKER_SECRETO).
// Si el secreto calza, req.ip pasa a ser la IP real y los límites de intentos (login, tienda) siguen siendo por
// persona. Si no calza o falta, la cabecera de IP se ignora: nadie puede hacerse pasar por otra IP escribiéndola.
import crypto from 'node:crypto';

const IP = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]{2,39})$/i;

export function secretoValido(recibido, esperado) {
  if (!recibido || !esperado) return false;
  const a = crypto.createHash('sha256').update(String(recibido)).digest();
  const b = crypto.createHash('sha256').update(String(esperado)).digest();
  return crypto.timingSafeEqual(a, b);
}

// IP que debe usar la API para esta solicitud, o null si no viene (bien firmada) del Worker.
export function ipDelWorker(headers, secreto = process.env.WORKER_SECRETO) {
  const ip = String(headers['x-farmaclick-ip'] ?? '').trim();
  if (!ip || !IP.test(ip)) return null;
  return secretoValido(headers['x-farmaclick-secreto'], secreto) ? ip : null;
}

export function ipDesdeWorker(req, _res, next) {
  const ip = ipDelWorker(req.headers);
  if (ip) Object.defineProperty(req, 'ip', { value: ip, configurable: true, enumerable: true });
  next();
}
