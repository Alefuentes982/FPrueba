// Reglas del pago con Webpay Plus (HU-72 y HU-73) que no dependen de la base ni de Transbank (se prueban con node --test).

// Para empezar a pagar deben quedar al menos estos minutos de reserva: el formulario de Webpay dura hasta 4 minutos en
// producción y el pedido no debe vencer mientras el cliente escribe los datos de su tarjeta.
export const MINUTOS_MINIMOS_PAGO = 5;

// Orden de compra para Webpay: el número del pedido y el intento (PED-000123-2). Cada intento lleva la suya porque
// buy_order es única. Máximo 26 caracteres.
export function ordenDeCompra(codigoPedido, intento) {
  const orden = `${codigoPedido}-${intento}`;
  if (orden.length > 26) throw new Error(`La orden ${orden} supera los 26 caracteres que acepta Webpay.`);
  return orden;
}

// Aprobado solo si Transbank autorizó (status AUTHORIZED y response_code 0) y el monto y la orden son los del intento.
export function evaluarConfirmacion(respuesta, { monto, buyOrder }) {
  const autorizada = respuesta?.status === 'AUTHORIZED' && Number(respuesta?.response_code) === 0;
  if (!autorizada) return 'rechazado';
  if (Number(respuesta.amount) !== Number(monto) || respuesta.buy_order !== buyOrder) return 'no_coincide';
  return 'aprobado';
}

// Qué pasó en Webpay según los datos con que vuelve el navegador (HU-73):
//   normal            token_ws                          el cliente terminó el formulario: hay que confirmar (commit)
//   anulado           TBK_TOKEN (+ orden y sesión)      el cliente apretó "Anular compra" en Webpay
//   error_formulario  token_ws y TBK_TOKEN              hubo un error en el formulario y el cliente volvió al sitio
//   tiempo            solo TBK_ORDEN_COMPRA y sesión    se acabó el tiempo del formulario
export function tipoRetorno(datos = {}) {
  const tokenWs = datos.token_ws ? String(datos.token_ws) : null;
  const tbkToken = datos.TBK_TOKEN ? String(datos.TBK_TOKEN) : null;
  const orden = datos.TBK_ORDEN_COMPRA ? String(datos.TBK_ORDEN_COMPRA) : null;
  if (tokenWs && tbkToken) return { tipo: 'error_formulario', token: tbkToken };
  if (tbkToken) return { tipo: 'anulado', token: tbkToken };
  if (tokenWs) return { tipo: 'normal', token: tokenWs };
  if (orden) return { tipo: 'tiempo', orden };
  return { tipo: 'desconocido' };
}

// Estado del intento y resultado que ve el cliente cuando no hubo commit.
export const SIN_COMMIT = {
  anulado: { estado: 'Anulado', resultado: 'anulado' },
  error_formulario: { estado: 'Abortado', resultado: 'abortado' },
  tiempo: { estado: 'Abortado', resultado: 'tiempo' },
};
