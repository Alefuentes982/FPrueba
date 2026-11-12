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
