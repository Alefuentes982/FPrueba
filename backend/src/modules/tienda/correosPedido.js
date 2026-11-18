// Correos al cliente por su pedido web (HU-74 y HU-79). La base deja cada aviso en la bandeja correo_pedido (trigger
// de la migración 019) y esta tarea los envía cada 30 segundos:
//   Pagado            → comprobante PDF adjunto (HU-74)
//   Listo para retiro → ya puede retirar, dónde y con qué
//   En despacho       → va en camino
//   Entregado         → gracias
// Sin datos sensibles: no lleva RUT, teléfono, tarjeta ni dirección completa. Si el envío falla, el pedido no cambia;
// el error queda en ultimo_error y se reintenta (5, 10, 20 y 40 minutos después; 5 intentos en total).
import { pool } from '../../core/db.js';
import { correoConfigurado, enviarCorreo } from '../../core/correo.js';
import { clp } from '../../core/documentos.js';
import { urlPublica } from '../../core/urls.js';
import { comprobantePedido } from '../pedidos/comprobante.js';
import { detallePedido, ESTADO } from '../pedidos/servicio.js';

export const MAX_INTENTOS = 5;
const LOTE = 20;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const primerNombre = (n) => String(n ?? '').trim().split(/\s+/)[0] || '';

// Asunto y cuerpo de cada correo. p: { codigo, nombre, entrega, sucursal, sucursal_direccion, comuna, total_a_pagar, url }
export function plantillaCorreo(estado, p) {
  const empresa = process.env.EMPRESA_NOMBRE || 'FarmaClick';
  const hola = primerNombre(p.nombre) ? `Hola ${primerNombre(p.nombre)},` : 'Hola,';
  let asunto;
  let parrafos;
  switch (estado) {
    case ESTADO.PAGADO:
      asunto = `Recibimos tu pago · pedido ${p.codigo}`;
      parrafos = [
        `Recibimos el pago de tu pedido ${p.codigo} por ${clp(p.total_a_pagar)}. Adjuntamos el comprobante.`,
        p.entrega === 'despacho'
          ? `Te avisaremos cuando salga a ${p.comuna}.`
          : `Te avisaremos cuando esté listo para retirar en ${p.sucursal}.`,
      ];
      break;
    case ESTADO.RETIRO:
      asunto = `Tu pedido ${p.codigo} está listo para retirar`;
      parrafos = [
        `Tu pedido ${p.codigo} ya está listo en ${p.sucursal}${p.sucursal_direccion ? `, ${p.sucursal_direccion}` : ''}.`,
        'Para retirarlo muestra tu número de pedido y tu cédula de identidad.',
      ];
      break;
    case ESTADO.DESPACHO:
      asunto = `Tu pedido ${p.codigo} va en camino`;
      parrafos = [`Tu pedido ${p.codigo} salió de ${p.sucursal} y va en camino a ${p.comuna}.`];
      break;
    case ESTADO.ENTREGADO:
      asunto = `Entregamos tu pedido ${p.codigo}`;
      parrafos = [`Tu pedido ${p.codigo} fue entregado. ¡Gracias por comprar en ${empresa}!`];
      break;
    default:
      throw new Error(`Sin plantilla de correo para el estado "${estado}".`);
  }
  const texto = [hola, '', ...parrafos, '', `Sigue tu pedido: ${p.url}`, '', empresa].join('\n');
  const html = `<p>${esc(hola)}</p>${parrafos.map((x) => `<p>${esc(x)}</p>`).join('')}`
    + `<p><a href="${esc(p.url)}">Ver mi pedido</a></p><p><strong>${esc(empresa)}</strong></p>`
    + '<p style="color:#6c757d;font-size:12px">Este correo es automático. Nunca te pediremos tu clave ni los datos de tu tarjeta.</p>';
  return { asunto, texto, html };
}

// Espera antes del intento n+1 (en minutos): 5, 10, 20, 40.
export const esperaReintento = (intentos) => 5 * 2 ** Math.max(0, intentos - 1);

// Toma los correos pendientes: les suma un intento y les fija el próximo antes de enviar, así otra instancia de la
// API no manda el mismo correo dos veces.
async function tomarPendientes() {
  const { rows } = await pool.query(
    `UPDATE correo_pedido c
        SET intentos = c.intentos + 1,
            siguiente_intento = NOW() + make_interval(mins => 5 * (2 ^ c.intentos)::int)
      WHERE c.id IN (SELECT id FROM correo_pedido
                      WHERE enviado_en IS NULL AND intentos < $1 AND siguiente_intento <= NOW()
                      ORDER BY creado_en LIMIT $2 FOR UPDATE SKIP LOCKED)
      RETURNING c.id, c.pedido_id, c.intentos, c.creado_en, (SELECT nombre FROM estado_pedido e WHERE e.id = c.estado_pedido_id) AS estado`,
    [MAX_INTENTOS, LOTE]);
  return rows.sort((x, y) => x.creado_en - y.creado_en); // RETURNING no respeta el orden de la subconsulta
}

async function enviarUno(c) {
  const p = await detallePedido(pool, c.pedido_id);
  if ([ESTADO.CANCELADO, ESTADO.EXPIRADO].includes(p.estado)) {
    await pool.query("UPDATE correo_pedido SET enviado_en = NOW(), ultimo_error = 'No se envió: el pedido se anuló.' WHERE id = $1", [c.id]);
    return false;
  }
  const { rows } = await pool.query('SELECT correo FROM usuario WHERE id = $1', [p.cliente_id]);
  const { asunto, texto, html } = plantillaCorreo(c.estado, {
    codigo: p.codigo, nombre: p.nombre_cliente, entrega: p.tipo_entrega, sucursal: p.sucursal, sucursal_direccion: p.sucursal_direccion,
    comuna: p.comuna, total_a_pagar: p.total_a_pagar ?? p.total, url: urlPublica(`/tienda/pedido/${p.id}`),
  });
  const adjuntos = [];
  if (c.estado === ESTADO.PAGADO) {
    const { archivo, base64 } = await comprobantePedido(pool, p.id);
    adjuntos.push({ filename: archivo, content: Buffer.from(base64, 'base64'), contentType: 'application/pdf' });
  }
  await enviarCorreo({ para: rows[0].correo, asunto, texto, html, adjuntos });
  await pool.query('UPDATE correo_pedido SET enviado_en = NOW(), ultimo_error = NULL WHERE id = $1', [c.id]);
  return true;
}

let avisado = false;
// Envía los correos pendientes. Devuelve { enviados, fallidos }.
export async function enviarCorreosPedido() {
  if (!correoConfigurado()) {
    if (!avisado) console.warn('Correos de pedidos: SMTP_HOST no está configurado; los avisos quedan en la bandeja correo_pedido.');
    avisado = true;
    return { enviados: 0, fallidos: 0 };
  }
  let enviados = 0;
  let fallidos = 0;
  for (const c of await tomarPendientes()) {
    try {
      if (await enviarUno(c)) enviados += 1;
    } catch (err) {
      fallidos += 1;
      const msg = String(err.message ?? err).slice(0, 300);
      console.error(`Correo del pedido ${c.pedido_id} (${c.estado}), intento ${c.intentos} de ${MAX_INTENTOS}: ${msg}`);
      await pool.query('UPDATE correo_pedido SET ultimo_error = $2 WHERE id = $1', [c.id, msg]).catch(() => {});
    }
  }
  return { enviados, fallidos };
}
