import { useState } from 'react';
import { money } from '../format.js';

// Cobro dividido en uno o más medios de pago (pedidos y caja). El total debe calzar exacto para confirmar.
// El efectivo calcula el vuelto; el monto que se informa es el aplicado a la venta, sin el vuelto.
//   onConfirmar(pagos, { vuelto })  pagos = [{ medio_pago_id, monto, codigo_autorizacion }]
export default function PanelPago({ total, medios, busy, onConfirmar, onCancelar, ayuda }) {
  const efectivo = medios.find((m) => m.nombre === 'Efectivo');
  const [pagos, setPagos] = useState([{ medio_pago_id: efectivo?.id ?? medios[0]?.id ?? '', monto: String(total), codigo_autorizacion: '' }]);
  const [recibido, setRecibido] = useState('');

  const suma = pagos.reduce((s, x) => s + Number(x.monto || 0), 0);
  const diferencia = Math.round((total - suma) * 100) / 100;
  const montoEfectivo = pagos.filter((x) => x.medio_pago_id === efectivo?.id).reduce((s, x) => s + Number(x.monto || 0), 0);
  const vuelto = recibido !== '' && Number(recibido) >= montoEfectivo ? Number(recibido) - montoEfectivo : null;
  const setPago = (i, cambios) => setPagos((l) => l.map((x, j) => (j === i ? { ...x, ...cambios } : x)));

  const confirmar = () => onConfirmar(
    pagos.map((x) => ({ medio_pago_id: x.medio_pago_id, monto: Number(x.monto), codigo_autorizacion: x.codigo_autorizacion || null })),
    { vuelto: montoEfectivo > 0 ? vuelto : null });

  return (
    <div className="card mb-4">
      <div className="card-body">
        <h3 className="h5">Cobrar {money(total)}</h3>
        {pagos.map((x, i) => (
          <div className="row g-2 align-items-center mb-2" key={i}>
            <div className="col-md-3">
              <select className="form-select" value={x.medio_pago_id} onChange={(e) => setPago(i, { medio_pago_id: e.target.value })}>
                {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
            <div className="col-md-3"><input type="number" min="1" step="1" className="form-control" value={x.monto} onChange={(e) => setPago(i, { monto: e.target.value })} /></div>
            <div className="col-md-4"><input className="form-control" maxLength={50} placeholder="Código de autorización (opcional)" value={x.codigo_autorizacion} onChange={(e) => setPago(i, { codigo_autorizacion: e.target.value })} /></div>
            <div className="col-md-2 text-end">
              <button type="button" className="btn btn-outline-danger btn-sm" disabled={pagos.length === 1} onClick={() => setPagos((l) => l.filter((_, j) => j !== i))}><i className="bi bi-trash" /></button>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-outline-secondary btn-sm mb-3"
          onClick={() => setPagos((l) => [...l, { medio_pago_id: medios[0]?.id ?? '', monto: diferencia > 0 ? String(diferencia) : '', codigo_autorizacion: '' }])}>
          <i className="bi bi-plus" /> Agregar medio de pago
        </button>

        {montoEfectivo > 0 && (
          <div className="row g-2 align-items-center mb-3">
            <div className="col-md-3"><label className="col-form-label">Efectivo recibido</label></div>
            <div className="col-md-3"><input type="number" min="0" step="1" className="form-control" value={recibido} onChange={(e) => setRecibido(e.target.value)} /></div>
            <div className="col-md-6">{vuelto != null && <span className="fs-5">Vuelto: <strong>{money(vuelto)}</strong></span>}</div>
          </div>
        )}

        <div className="d-flex flex-wrap gap-3 align-items-center">
          <span>Total: <strong>{money(total)}</strong></span>
          <span>Pagos: <strong>{money(suma)}</strong></span>
          <span className={diferencia === 0 ? 'text-success' : 'text-danger'}>
            {diferencia === 0 ? 'Calza con el total' : diferencia > 0 ? `Faltan ${money(diferencia)}` : `Sobran ${money(-diferencia)}`}
          </span>
          <div className="ms-auto d-flex gap-2">
            <button className="btn btn-success" disabled={busy || diferencia !== 0 || pagos.some((x) => !x.medio_pago_id)} onClick={confirmar}>
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
