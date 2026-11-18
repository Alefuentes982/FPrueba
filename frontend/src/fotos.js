// Reduce una foto en el navegador antes de subirla (HU-96): lado mayor de 800 px, JPEG. Una foto de celular de 3 MB
// queda en unos 80 KB: así las 76 fotos del catálogo ocupan pocos MB en Supabase y la tienda carga rápido, dentro del
// plan gratuito.
export const LADO_MAX = 800;
export const PESO_OBJETIVO = 150 * 1024;

const cargar = (archivo) => new Promise((ok, mal) => {
  const url = URL.createObjectURL(archivo);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); ok(img); };
  img.onerror = () => { URL.revokeObjectURL(url); mal(new Error(`«${archivo.name}» no es una imagen que el navegador pueda abrir.`)); };
  img.src = url;
});

const aJpeg = (canvas, calidad) => new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', calidad));

export async function reducirFoto(archivo) {
  const img = await cargar(archivo);
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let calidad = 0.82;
  let blob = await aJpeg(canvas, calidad);
  while (blob.size > PESO_OBJETIVO && calidad > 0.5) {
    calidad -= 0.1;
    blob = await aJpeg(canvas, calidad);
  }
  return blob;
}

// "MED-001.jpg", "med-001 (1).JPG" -> "MED-001"
export const skuDeArchivo = (nombre) => nombre.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, '').trim().toUpperCase();

export const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;
