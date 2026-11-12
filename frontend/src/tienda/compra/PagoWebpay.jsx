import { useState } from 'react';
import { money } from '../../format.js';
import { pagosApi } from '../apiTienda.js';

// Botón "Pagar con Webpay" (HU-72). Pide el token a la API y envía el navegador a Webpay con un formulario POST
// (token_ws), como indica Transbank. Al terminar, Webpay devuelve al cliente a la página del pedido.
export function irAWebpay({ url, token }) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  const campo = document.createElement('input');
  campo.type = 'hidden';
  campo.name = 'token_ws';
  campo.value = token;
  form.appendChild(campo);
  document.body.appendChild(form);
  form.submit();
}

export default function PagoWebpay({ pedido, onError, texto = 'Pagar con Webpay' }) {
  const [yendo, setYendo] = useState(false);
  const pagar = async () => {
    setYendo(true); onError(null);
    try {
      irAWebpay(await pagosApi.iniciarWebpay(pedido.id));
    } catch (err) {
      onError(err);
      setYendo(false);
    }
  };
  return (
    <div className="fct-webpay">
      <div className="fct-webpay-marca" aria-hidden="true"><b>webpay</b><small>plus</small></div>
      <div className="fct-webpay-texto">
        <b>Débito, crédito o prepago</b>
        <small>Te llevamos a Webpay de Transbank. FarmaClick no recibe ni guarda los datos de tu tarjeta.</small>
      </div>
      <button type="button" className="fct-btn-primario" onClick={pagar} disabled={yendo}>
        {yendo ? 'Abriendo Webpay…' : `${texto} ${money(pedido.total)}`}
      </button>
    </div>
  );
}
