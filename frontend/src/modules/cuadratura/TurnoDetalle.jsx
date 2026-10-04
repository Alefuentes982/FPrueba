import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { descargarArchivo, verArchivo } from '../../archivos.js';
import { useAuth } from '../../AuthContext.jsx';
import { fechaHora, money } from '../../format.js';
import { ErrorAlert, PageHeader, Spinner, useAsync } from '../../components/ui.jsx';

export default function TurnoDetalle() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: t, error, loading, reload } = useAsync(() => api.get(`/cuadratura/turnos/${id}`), [id]);
  const [actionError, setActionError] = useState(null);
  const [conformeElegido, setConforme] = useState(null); // null = según haya o no diferencia
  const [observacion, setObservacion] = useState('');
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState(null);

  if (loading && !t) return <Spinner />;
  if (error) return <ErrorAlert error={error} />;

  const e = t.efectivo;
  const dif = e?.diferencia;
  const conforme = conformeElegido ?? dif === 0; // con diferencia, la revisión parte como "con observaciones"
  const puedeVerPdf = !t.abierto || can('usuarios');

  const revisar = async (ev) => {
    ev.preventDefault();
    setActionError(null);
    setBusy(true);
    try {
      await api.post(`/cuadratura/turnos/${id}/revision`, { conforme, observacion: observacion || null });
      setAviso('Revisión registrada.');
      reload();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={`Turno · Caja ${t.caja_numero} · ${t.sucursal}`}>
        {puedeVerPdf && (
          <>
            <button className="btn btn-outline-secondary" onClick={() => verArchivo(`/cuadratura/turnos/${id}/pdf`).catch(setActionError)}><i className="bi bi-eye me-1" />Ver {t.abierto ? 'reporte X' : 'Cierre Z'}</button>
            <button className="btn btn-outline-secondary" onClick={() => descargarArchivo(`/cuadratura/turnos/${id}/pdf`).catch(setActionError)}><i className="bi bi-file-earmark-pdf me-1" />Descargar PDF</button>
          </>
        )}
        <Link to="/cuadratura" className="btn btn-outline-secondary">Volver</Link>
      </PageHeader>
      {aviso && <div className="alert alert-success py-2">{aviso}</div>}
      <ErrorAlert error={actionError} onClose={() => setActionError(null)} />

      <div className="row mb-3">
        <div className="col-md-6">
          <dl className="row mb-0">
            <dt className="col-sm-4">Cajero</dt><dd className="col-sm-8">{t.cajero}</dd>
            <dt className="col-sm-4">Apertura</dt><dd className="col-sm-8">{fechaHora(t.fecha_apertura)}</dd>
            <dt className="col-sm-4">Cierre</dt><dd className="col-sm-8">{t.fecha_cierre ? fechaHora(t.fecha_cierre) : <span className="badge text-bg-info">Turno abierto</span>}</dd>
            <dt className="col-sm-4">Ventas</dt><dd className="col-sm-8">{t.resumen.ventas} por {money(t.resumen.total_ventas)}</dd>
            <dt className="col-sm-4">Devoluciones</dt><dd className="col-sm-8">{t.resumen.devoluciones} por {money(t.resumen.total_devoluciones)}</dd>
          </dl>
        </div>
        <div className="col-md-6">
          {e ? (
            <table className="table table-sm mb-0">
              <tbody>
                <tr><td>Efectivo inicial</td><td className="text-end">{money(e.apertura)}</td></tr>
                <tr><td>+ Ventas en efectivo</td><td className="text-end">{money(e.ventas)}</td></tr>
                <tr><td>- Devoluciones en efectivo</td><td className="text-end">{e.devoluciones ? `-${money(e.devoluciones)}` : money(0)}</td></tr>
                <tr className="fw-semibold"><td>Efectivo esperado</td><td className="text-end">{money(e.esperado)}</td></tr>
                {!t.abierto && <tr><td>Efectivo contado</td><td className="text-end">{money(e.contado)}</td></tr>}
                {!t.abierto && (
                  <tr className={dif === 0 ? 'table-success' : 'table-warning'}>
                    <td className="fw-bold">Diferencia</td>
                    <td className="text-end fw-bold">{dif === 0 ? 'Cuadrada' : dif > 0 ? `Sobran ${money(dif)}` : `Faltan ${money(-dif)}`}</td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : <div className="alert alert-secondary mb-0">El efectivo esperado se muestra al cerrar el turno.</div>}
        </div>
      </div>

      {t.revision ? (
        <div className={`alert ${t.revision.conforme ? 'alert-success' : 'alert-warning'}`}>
          <strong>{t.revision.conforme ? 'Revisado conforme' : 'Revisado con observaciones'}</strong> por {t.revision.revisor} el {fechaHora(t.revision.fecha)}.
          {t.revision.observacion && <div className="mt-1">{t.revision.observacion}</div>}
        </div>
      ) : t.puede_revisar ? (
        <form className="card mb-4" onSubmit={revisar}>
          <div className="card-body">
            <h3 className="h5">Revisar cuadratura</h3>
            <div className="d-flex gap-4 mb-2">
              <div className="form-check"><input id="c1" type="radio" className="form-check-input" checked={conforme} onChange={() => setConforme(true)} /><label htmlFor="c1" className="form-check-label">Conforme</label></div>
              <div className="form-check"><input id="c2" type="radio" className="form-check-input" checked={!conforme} onChange={() => setConforme(false)} /><label htmlFor="c2" className="form-check-label">Con observaciones</label></div>
            </div>
            <textarea className="form-control mb-2" rows="2" maxLength={500} placeholder={dif ? 'Explique el origen de la diferencia (obligatorio)' : 'Observación (opcional)'}
              required={!conforme || Boolean(dif)} value={observacion} onChange={(ev) => setObservacion(ev.target.value)} />
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Registrar revisión'}</button>
            <span className="form-text ms-3">La revisión no se puede modificar después.</span>
          </div>
        </form>
      ) : !t.abierto && (
        <p className="text-muted">Pendiente de revisión por un administrador{t.es_propio ? ' (nadie revisa su propio turno)' : ''}.</p>
      )}

      {t.por_medio && (
        <>
          <h3 className="h5">Por medio de pago</h3>
          <table className="table table-sm mb-4" style={{ maxWidth: 560 }}>
            <thead><tr><th>Medio</th><th className="text-end">Ventas</th><th className="text-end">Devoluciones</th><th className="text-end">Neto</th></tr></thead>
            <tbody>
              {t.por_medio.map((m) => (
                <tr key={m.medio_pago}><td>{m.medio_pago}</td><td className="text-end">{money(m.ventas)}</td>
                  <td className="text-end">{m.devoluciones ? `-${money(m.devoluciones)}` : '—'}</td><td className="text-end">{money(m.ventas - m.devoluciones)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="row g-4">
        <div className="col-lg-6">
          <h3 className="h5">Ventas del turno</h3>
          <table className="table table-sm">
            <thead><tr><th>N°</th><th>Hora</th><th>Cliente</th><th>Estado</th><th className="text-end">Total</th></tr></thead>
            <tbody>
              {t.ventas.length === 0 && <tr><td colSpan="5" className="text-muted text-center">Sin ventas</td></tr>}
              {t.ventas.map((v) => (
                <tr key={v.id}>
                  <td className="font-monospace">{can('pedidos') ? <Link to={`/pedidos/${v.id}`}>{v.codigo}</Link> : v.codigo}</td>
                  <td>{fechaHora(v.fecha)}</td><td>{v.nombre_cliente}</td><td>{v.estado}</td><td className="text-end">{money(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="col-lg-6">
          <h3 className="h5">Devoluciones del turno</h3>
          <table className="table table-sm">
            <thead><tr><th>N°</th><th>Pedido</th><th>Motivo</th><th className="text-end">Devuelto</th></tr></thead>
            <tbody>
              {t.devoluciones.length === 0 && <tr><td colSpan="4" className="text-muted text-center">Sin devoluciones</td></tr>}
              {t.devoluciones.map((d) => (
                <tr key={d.id}>
                  <td className="font-monospace">{can('devoluciones') ? <Link to={`/devoluciones/${d.id}`}>{d.codigo}</Link> : d.codigo}</td>
                  <td className="font-monospace">{d.pedido_codigo}</td><td>{d.motivo}</td><td className="text-end">{money(d.total_reembolso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
