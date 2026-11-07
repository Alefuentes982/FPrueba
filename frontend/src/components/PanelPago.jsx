import { useState } from 'react';
import { money } from '../format.js';
import { redondearEfectivo, textoAjuste } from '../redondeo.js';

// Cobro en uno o más medios de pago (pedidos y caja), con el redondeo del efectivo (Ley 20.956) y el vuelto (HU-91).
//   - Las tarjetas y transferencias se escriben; el efectivo NO se escribe: es lo que falta para el total, redondeado
//     al múltiplo de $10. Puede haber una sola línea de efectivo.
//   - Con efectivo se pide cuánto entregó el cliente y se muestra el vuelto.
//   - En un pago mixto: si lo entregado cubre todo el total, se ofrece cobrar todo en efectivo; si el vuelto es igual o
//     mayor que el efectivo a cobrar, se ofrece reajustar el reparto. En los dos casos no se puede confirmar.
// El backend repite las mismas reglas (validarCobro y validarEfectivoRecibido).
//   onConfirmar(pagos, { vuelto, redondeo, recibido })  pagos = [{ medio_pago_id, monto, codigo_autorizacion }]
export default function PanelPago({ total, medios, busy, onConfirmar, onCancelar, ayuda }) {
  const efectivo = medios.find((m) => m.nombre === 'Efectivo');
  const [pagos, setPagos] = useState([{ medio_pago_id: efectivo?.id ?? medios[0]?.id ?? '', monto: String(total), codigo_autorizacion: '' }]);
  const [recibido, setRecibido] = useState('');

  const esEfectivo = (x) => x.medio_pago_id === efectivo?.id;
  const conEfectivo = pagos.some(esEfectivo);
  const otros = pagos.filter((x) => !esEfectivo(x)).reduce((s, x) => s + Number(x.monto || 0), 0);
  const mixto = conEfectivo && pagos.length > 1;
  const valorEfectivo = conEfectivo ? Math.round((total - otros) * 100) / 100 : 0; // lo que falta, antes de redondear
  const cobrarEfectivo = valorEfectivo > 0 ? redondearEfectivo(valorEfectivo) : 0;  // lo que realmente se recibe
  const redondeo = valorEfectivo > 0 ? Math.round((cobrarEfectivo - valorEfectivo) * 100) / 100 : 0;
  const diferencia = conEfectivo ? 0 : Math.round((total - otros) * 100) / 100;

  const recibidoN = recibido === '' ? null : Number(recibido);
  const vuelto = recibidoN != null && recibidoN >= cobrarEfectivo ? recibidoN - cobrarEfectivo : null;
  const totalEfectivo = redondearEfectivo(total);

  // Problemas que impiden confirmar, en el orden en que conviene resolverlos.
  let problema = null;
  if (conEfectivo && valorEfectivo <= 0) problema = { texto: `Los otros medios ya cubren ${money(otros)} de ${money(total)}: quita el efectivo o baja los montos.` };
  else if (conEfectivo && cobrarEfectivo === 0) problema = { texto: `El saldo de ${money(valorEfectivo)} se redondea a $0 en efectivo: págalo con otro medio.` };
  else if (conEfectivo && recibidoN == null) problema = { aviso: true, texto: 'Escribe cuánto entregó el cliente para calcular el vuelto.' };
  else if (conEfectivo && recibidoN < cobrarEfectivo) problema = { texto: `Faltan ${money(cobrarEfectivo - recibidoN)}: lo entregado no alcanza para el efectivo a cobrar.` };
  else if (mixto && recibidoN >= totalEfectivo) problema = { texto: `Lo entregado (${money(recibidoN)}) cubre todo el total.`, accion: 'todoEfectivo' };
  else if (mixto && vuelto >= cobrarEfectivo) problema = { texto: `El vuelto (${money(vuelto)}) es igual o mayor que el efectivo a cobrar (${money(cobrarEfectivo)}). Conviene cobrar más en efectivo y menos con el otro medio.`, accion: 'reajustar' };
  else if (!conEfectivo && diferencia !== 0) problema = { aviso: true, texto: diferencia > 0 ? `Faltan ${money(diferencia)} para el total.` : `Sobran ${money(-diferencia)}.` };

  const setPago = (i, cambios) => setPagos((l) => l.map((x, j) => (j === i ? { ...x, ...cambios } : x)));
  const soloEfectivo = () => setPagos([{ medio_pago_id: efectivo.id, monto: String(total), codigo_autorizacion: '' }]);
  // Reajustar: el efectivo pasa a ser lo entregado (bajado a múltiplo de $10, así el vuelto queda bajo $10) y el otro
  // medio paga el resto. Si el otro medio queda en cero, se cobra todo en efectivo.
  const reajustar = () => {
    const nuevoEfectivo = Math.min(Math.floor(recibidoN / 10) * 10, totalEfectivo);
    const resto = Math.round((total - nuevoEfectivo) * 100) / 100;
    if (resto <= 0) { soloEfectivo(); return; }
    const otro = pagos.find((x) => !esEfectivo(x));
    setPagos([{ ...otro, monto: String(resto) }, { medio_pago_id: efectivo.id, monto: '', codigo_autorizacion: '' }]);
  };

  const confirmar = () => onConfirmar(
    pagos.map((x) => ({
      medio_pago_id: x.medio_pago_id,
      monto: esEfectivo(x) ? cobrarEfectivo : Number(x.monto),
      codigo_autorizacion: x.codigo_autorizacion || null,
    })),
    { vuelto: conEfectivo ? vuelto : null, redondeo, recibido: conEfectivo ? recibidoN : null });

  const agregarMedio = () => {
    const otroMedio = medios.find((m) => m.id !== efectivo?.id);
    setPagos((l) => [...l, { medio_pago_id: otroMedio?.id ?? '', monto: '', codigo_autorizacion: '' }]);
  };

  return (
    <div className="card mb-4">
      <div className="card-body">
        <h3 className="h5">Cobrar {money(total)}</h3>
        {pagos.map((x, i) => (
          <div className="row g-2 align-items-center mb-2" key={i}>
            <div className="col-md-3">
              <select className="form-select" aria-label="Medio de pago" value={x.medio_pago_id} onChange={(e) => setPago(i, { medio_pago_id: e.target.value })}>
                {medios.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.id === efectivo?.id && conEfectivo && !esEfectivo(x)}>{m.nombre}</option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              {esEfectivo(x)
                ? <input className="form-control bg-light" aria-label="Efectivo a cobrar" readOnly tabIndex={-1} value={cobrarEfectivo > 0 ? cobrarEfectivo : '—'} title="Se calcula: total menos los otros medios, redondeado" />
                : <input type="number" min="1" step="1" className="form-control" aria-label="Monto" value={x.monto} onChange={(e) => setPago(i, { monto: e.target.value })} />}
            </div>
            <div className="col-md-4">
              {!esEfectivo(x) && <input className="form-control" maxLength={50} placeholder="Código de autorización (opcional)" value={x.codigo_autorizacion} onChange={(e) => setPago(i, { codigo_autorizacion: e.target.value })} />}
            </div>
            <div className="col-md-2 text-end">
              <button type="button" className="btn btn-outline-danger btn-sm" aria-label="Quitar medio de pago" disabled={pagos.length === 1} onClick={() => setPagos((l) => l.filter((_, j) => j !== i))}><i className="bi bi-trash" /></button>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-outline-secondary btn-sm mb-3" onClick={agregarMedio}>
          <i className="bi bi-plus" /> Agregar medio de pago
        </button>

        {conEfectivo && cobrarEfectivo > 0 && (
          <div className="alert alert-light border py-2 mb-2">
            Efectivo a cobrar: <strong className="fs-5">{money(cobrarEfectivo)}</strong>
            {mixto && <span className="text-muted ms-2">({money(total)} − {money(otros)} con otros medios)</span>}
            {redondeo !== 0 && <span className="text-muted ms-2">Redondeado desde {money(valorEfectivo)}, Ley 20.956: {textoAjuste(redondeo, money)}</span>}
          </div>
        )}
        {conEfectivo && (
          <div className="row g-2 align-items-center mb-3">
            <div className="col-md-3"><label className="col-form-label" htmlFor="pp-recibido">Efectivo recibido</label></div>
            <div className="col-md-3"><input id="pp-recibido" type="number" min="0" step="10" className="form-control" value={recibido} onChange={(e) => setRecibido(e.target.value)} /></div>
            <div className="col-md-6">{vuelto != null && <span className="fs-5">Vuelto: <strong>{money(vuelto)}</strong></span>}</div>
          </div>
        )}

        {problema && (
          <div className={`alert ${problema.aviso ? 'alert-light border' : 'alert-warning'} py-2 d-flex flex-wrap align-items-center gap-2`} role={problema.aviso ? 'status' : 'alert'}>
            <span>{problema.texto}</span>
            {problema.accion === 'todoEfectivo' && <button type="button" className="btn btn-sm btn-warning ms-auto" onClick={soloEfectivo}>Cobrar todo en efectivo</button>}
            {problema.accion === 'reajustar' && <button type="button" className="btn btn-sm btn-warning ms-auto" onClick={reajustar}>Reajustar</button>}
          </div>
        )}

        <div className="d-flex flex-wrap gap-3 align-items-center">
          <span>Total: <strong>{money(total)}</strong></span>
          {conEfectivo && redondeo !== 0 && <span>Se cobra: <strong>{money(otros + cobrarEfectivo)}</strong></span>}
          {!problema && <span className="text-success">Calza con el total</span>}
          <div className="ms-auto d-flex gap-2">
            <button className="btn btn-success" disabled={busy || Boolean(problema) || pagos.some((x) => !x.medio_pago_id)} onClick={confirmar}>
              {busy ? 'Registrando…' : 'Confirmar pago'}
            </button>
            <button className="btn btn-outline-secondary" disabled={busy} onClick={onCancelar}>Cancelar</button>
          </div>
        </div>
        {ayuda && <div className="form-text">{ayuda}</div>}
      </div>
    </div>
  );
}
