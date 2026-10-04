import { useState } from 'react';
import { api } from '../../api.js';
import { money } from '../../format.js';
import { ErrorAlert } from '../../components/ui.jsx';

// Cierre ciego: la cajera cuenta el efectivo y lo informa sin ver cuánto debería haber. Recién al cerrar se muestra
// el esperado y la diferencia.
export default function CerrarTurno({ turno, onCerrado, onCancelar }) {
  const [contado, setContado] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const cerrar = async () => {
    if (!window.confirm('¿Cerrar el turno? Después no podrá registrar más ventas en él.')) return;
    setError(null);
    setBusy(true);
    try {
      onCerrado(await api.post(`/pos/turnos/${turno.id}/cerrar`, { monto_contado: Number(contado) }));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="card border-warning mb-4">
      <div className="card-body">
        <h3 className="h5">Cerrar turno · Caja {turno.caja_numero}</h3>
        <p className="text-muted mb-2">
          Cuente todo el efectivo de la caja (incluido el efectivo inicial de {money(turno.monto_apertura_efectivo)}) e ingrese el total.
        </p>
        <ErrorAlert error={error} onClose={() => setError(null)} />
        <div className="row g-2 align-items-center">
          <div className="col-md-4">
            <input type="number" min="0" step="1" className="form-control" placeholder="Efectivo contado" autoFocus value={contado} onChange={(e) => setContado(e.target.value)} />
          </div>
          <div className="col-auto d-flex gap-2">
            <button className="btn btn-warning" disabled={busy || contado === ''} onClick={cerrar}>{busy ? 'Cerrando…' : 'Cerrar turno'}</button>
            <button className="btn btn-outline-secondary" disabled={busy} onClick={onCancelar}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
