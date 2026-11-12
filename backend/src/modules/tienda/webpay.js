// Cliente de Webpay Plus (Transbank), API REST v1.2. Sin SDK: tres llamadas HTTPS con fetch (HU-72).
// Configuración (backend/.env):
//   WEBPAY_AMBIENTE        integracion (por defecto) o produccion
//   WEBPAY_CODIGO_COMERCIO y WEBPAY_LLAVE_SECRETA  en integración, si faltan, se usan las credenciales públicas de prueba
//                          de Transbank; en producción son obligatorias y SOLO van en el .env de la VM.
//   WEBPAY_URL             (opcional) otra dirección base, por ejemplo un simulador local para pruebas.
import { HttpError } from '../../core/errors.js';

const PRUEBA = { codigo: '597055555532', llave: '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C' };
const BASES = { integracion: 'https://webpay3gint.transbank.cl', produccion: 'https://webpay3g.transbank.cl' };
const RUTA = '/rswebpaytransaction/api/webpay/v1.2/transactions';

export function configWebpay(env = process.env) {
  const ambiente = env.WEBPAY_AMBIENTE === 'produccion' ? 'produccion' : 'integracion';
  const codigo = env.WEBPAY_CODIGO_COMERCIO || (ambiente === 'integracion' ? PRUEBA.codigo : '');
  const llave = env.WEBPAY_LLAVE_SECRETA || (ambiente === 'integracion' ? PRUEBA.llave : '');
  if (!codigo || !llave) throw new HttpError(500, 'Falta configurar WEBPAY_CODIGO_COMERCIO y WEBPAY_LLAVE_SECRETA para producción.');
  return { ambiente, codigo, llave, base: (env.WEBPAY_URL || BASES[ambiente]).replace(/\/+$/, '') };
}

async function llamar(metodo, ruta, cuerpo) {
  const c = configWebpay();
  let res;
  try {
    res = await fetch(`${c.base}${RUTA}${ruta}`, {
      method: metodo,
      headers: { 'Tbk-Api-Key-Id': c.codigo, 'Tbk-Api-Key-Secret': c.llave, 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    console.error(`Webpay ${metodo} ${ruta}: sin respuesta (${err.message})`);
    throw new HttpError(502, 'No pudimos comunicarnos con Webpay. Intenta de nuevo en unos minutos.');
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new HttpError(502, 'Webpay rechazó la operación. Intenta de nuevo en unos minutos.');
    err.webpay = { status: res.status, mensaje: datos.error_message };
    console.error(`Webpay ${metodo} ${ruta}: ${res.status} ${datos.error_message ?? ''}`);
    throw err;
  }
  return datos;
}

// Crea la transacción: devuelve { token, url }. El navegador se envía a url con token_ws por POST.
export const crearTransaccion = ({ buyOrder, sessionId, monto, urlRetorno }) =>
  llamar('POST', '', { buy_order: buyOrder, session_id: sessionId, amount: monto, return_url: urlRetorno });

// Confirma (commit) la transacción al volver de Webpay. Sin commit, Transbank no hace el cargo.
export const confirmarTransaccion = (token) => llamar('PUT', `/${encodeURIComponent(token)}`);

// Estado de una transacción (sirve si el commit no respondió).
export const estadoTransaccion = (token) => llamar('GET', `/${encodeURIComponent(token)}`);
