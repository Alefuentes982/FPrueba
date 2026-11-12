// Dirección pública del sistema, la misma que escribe la gente en el navegador (por ejemplo https://farmaclick.cl o la
// del Worker de Cloudflare). Se usa en enlaces que salen del sistema: correos de confirmación y de nueva contraseña de
// Supabase Auth y el regreso desde Webpay. En local, la web de Vite (que reenvía /api a la API).
export function urlPublica(ruta = '') {
  const base = (process.env.PUBLICO_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}${ruta}`;
}
