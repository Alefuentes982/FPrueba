// Fotos de los productos (HU-96). Dos almacenes, según el entorno:
//   supabase  Supabase Storage, bucket público "productos" (dev y producción). Plan gratuito: 1 GB de espacio y 5 GB
//             de descarga al mes; las fotos llegan ya reducidas (unos 80 KB) y con caché de un año, así que el uso
//             queda muy por debajo. Si FarmaClick crece, el primer límite es la descarga: ver el Manual Técnico.
//   local     Carpeta backend/uploads/productos, servida en /api/fotos (Docker de desarrollo, sin Supabase).
// Por defecto: supabase si hay SUPABASE_URL y no es AUTH_MODE=local. Se fuerza con FOTOS_ALMACEN=supabase|local.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './errors.js';

export const BUCKET = 'productos';
export const MAX_BYTES = 1024 * 1024; // la web envía unos 80 KB; 1 MB deja margen sin abrir la puerta a archivos grandes
export const DIR_LOCAL = process.env.FOTOS_DIR || path.resolve(process.cwd(), 'uploads');

export function almacen(env = process.env) {
  if (env.FOTOS_ALMACEN === 'supabase' || env.FOTOS_ALMACEN === 'local') return env.FOTOS_ALMACEN;
  return env.SUPABASE_URL && env.AUTH_MODE !== 'local' ? 'supabase' : 'local';
}

// Tipo de imagen por sus primeros bytes (no por el nombre ni por lo que diga el navegador).
export function tipoImagen(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

// Nombre del archivo: el SKU en minúsculas, solo letras, números y guiones (MED-001 -> med-001.jpg).
export const nombreArchivo = (sku, ext) => `${String(sku).toLowerCase().replace(/[^a-z0-9-]/g, '-')}.${ext}`;

export function validarImagen(buf) {
  if (!buf?.length) throw new HttpError(400, 'No llegó ninguna imagen.');
  if (buf.length > MAX_BYTES) throw new HttpError(413, 'La foto pesa más de 1 MB. Súbela desde el sistema, que la reduce sola.');
  const tipo = tipoImagen(buf);
  if (!tipo) throw new HttpError(415, 'El archivo no es una imagen JPG, PNG o WebP.');
  return tipo;
}

async function supabase(ruta, opciones) {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(500, 'Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env de la API para guardar fotos.');
  let res;
  try {
    res = await fetch(`${url}/storage/v1${ruta}`, {
      ...opciones, headers: { Authorization: `Bearer ${key}`, apikey: key, ...opciones.headers }, signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    console.error(`Supabase Storage ${ruta}: sin respuesta (${err.message})`);
    throw new HttpError(502, 'No se pudo guardar la foto en Supabase. Intenta de nuevo en un momento.');
  }
  return res;
}

// Crea el bucket público la primera vez (si ya existe, Supabase responde 400/409 y se sigue).
let bucketListo = false;
async function asegurarBucket() {
  if (bucketListo) return;
  const res = await supabase('/bucket', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: MAX_BYTES, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] }),
  });
  if (!res.ok && ![400, 409].includes(res.status)) {
    console.error(`Supabase Storage: no se pudo crear el bucket ${BUCKET} (${res.status} ${await res.text().catch(() => '')})`);
    throw new HttpError(502, 'No se pudo preparar el almacenamiento de fotos en Supabase.');
  }
  bucketListo = true;
}

// Guarda la foto con el nombre del SKU (reemplaza la anterior) y devuelve la dirección que va en producto.imagen_url.
// ?v= cambia en cada subida para que el navegador no muestre la foto vieja guardada en caché.
export async function guardarFoto(sku, buf) {
  const tipo = validarImagen(buf);
  const archivo = nombreArchivo(sku, tipo.ext);
  const v = Date.now().toString(36);
  if (almacen() === 'local') {
    await mkdir(path.join(DIR_LOCAL, BUCKET), { recursive: true });
    await writeFile(path.join(DIR_LOCAL, BUCKET, archivo), buf);
    return `/api/fotos/${BUCKET}/${archivo}?v=${v}`;
  }
  await asegurarBucket();
  const res = await supabase(`/object/${BUCKET}/${archivo}`, {
    method: 'POST', body: buf,
    headers: { 'Content-Type': tipo.mime, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
  });
  if (!res.ok) {
    console.error(`Supabase Storage: no se pudo subir ${archivo} (${res.status} ${await res.text().catch(() => '')})`);
    throw new HttpError(502, 'No se pudo guardar la foto en Supabase. Intenta de nuevo en un momento.');
  }
  return `${process.env.SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/${archivo}?v=${v}`;
}
