import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { fechaHora } from '../../format.js';
import { ErrorAlert, PageHeader, Spinner, useAsync } from '../../components/ui.jsx';

// Configuración de cajas (administración): una sucursal puede tener varias; cada una admite un turno abierto a la vez.
export default function Cajas() {
  const cajas = useAsync(() => api.get('/pos/cajas'), []);
  const catalogos = useAsync(() => api.get('/catalogos'), []);
  const [sucursal, setSucursal] = useState('');
  const [error, setError] = useState(null);

  const ejecutar = async (fn) => {
    setError(null);
    try { await fn(); cajas.reload(); } catch (e) { setError(e); }
  };

  return (
    <>
      <PageHeader title="Cajas">
        <Link to="/pos" className="btn btn-outline-secondary">Volver a la caja</Link>
      </PageHeader>
      <ErrorAlert error={cajas.error || error} onClose={() => setError(null)} />
      <div className="row g-2 mb-3" style={{ maxWidth: 560 }}>
        <div className="col">
          <select className="form-select" value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
            <option value="">Sucursal de la nueva caja…</option>
            {catalogos.data?.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className="col-auto">
          <button className="btn btn-primary" disabled={!sucursal} onClick={() => ejecutar(() => api.post('/pos/cajas', { sucursal_id: sucursal }))}>
            <i className="bi bi-plus-lg me-1" />Nueva caja
          </button>
        </div>
      </div>
      {cajas.loading && !cajas.data ? <Spinner /> : (
        <table className="table align-middle">
          <thead><tr><th>Sucursal</th><th>Caja</th><th>Estado</th><th>Turno abierto</th><th /></tr></thead>
          <tbody>
            {cajas.data?.length === 0 && <tr><td colSpan="5" className="text-center text-muted py-4">Sin cajas</td></tr>}
            {cajas.data?.map((c) => (
              <tr key={c.id}>
                <td>{c.sucursal}</td><td>Caja {c.numero}</td>
                <td><span className={`badge text-bg-${c.activa ? 'success' : 'secondary'}`}>{c.activa ? 'Activa' : 'Desactivada'}</span></td>
                <td>{c.turno_id ? `${c.usuario_turno} · desde ${fechaHora(c.fecha_apertura)}` : '—'}</td>
                <td className="text-end">
                  <button className="btn btn-sm btn-outline-secondary" disabled={Boolean(c.turno_id)}
                    onClick={() => ejecutar(() => api.patch(`/pos/cajas/${c.id}`, { activa: !c.activa }))}>
                    {c.activa ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
