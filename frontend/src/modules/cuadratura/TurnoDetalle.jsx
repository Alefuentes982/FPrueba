import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { descargarArchivo } from '../../archivos.js';
import { useAuth } from '../../AuthContext.jsx';
import { fechaHora, money } from '../../format.js';
import { textoAjuste } from '../../redondeo.js';
import BotonesDocumento from '../../components/BotonesDocumento.jsx';
import { ErrorAlert, Ficha, PageHeader, Seccion, Spinner, useAsync } from '../../components/ui.jsx';

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
  const puedeVerPdf = !t.abierto || can('supervision_caja');

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
            <BotonesDocumento path={`/cuadratura/turnos/${id}/pdf`} nombre={`Caja${t.caja_numero}.pdf`} onError={setActionError}
              etiquetaVer={`Ver ${t.abierto ? 'reporte X' : 'Cierre Z'}`} />
            <button type="button" className="btn btn-success" onClick={() => descargarArchivo(`/cuadratura/turnos/${id}/excel`).catch(setActionError)}>
              <i className="bi bi-file-earmark-excel me-1" />Excel
            </button>
          </>
        )}
        <Link to="/cuadratura" className="btn btn-outline-secondary">Volver</Link>
      </PageHeader>
      {aviso && <div className="alert alert-success py-2">{aviso}</div>}
      <ErrorAlert error={actionError} onClose={() => setActionError(null)} />

      <div className="row g-3">
        <div className="col-lg-6">
          <Seccion titulo="Datos del turno" icono="bi-info-circle" className="h-100">
            <Ficha filas={[
              ['Cajero', t.cajero],
              ['Apertura', fechaHora(t.fecha_apertura)],
              ['Cierre', t.fecha_cierre ? fechaHora(t.fecha_cierre) : <span className="badge text-bg-info">Turno abierto</span>],
              ['Ventas', `${t.resumen.ventas} por ${money(t.resumen.total_ventas)}`],
              ['Devoluciones', `${t.resumen.devoluciones} por ${money(t.resumen.total_devoluciones)}`],
            ]} />
          </Seccion>
        </div>
        <div className="col-lg-6">
          <Seccion titulo="Cuadre del efectivo" icono="bi-calculator" plano={Boolean(e)} className="h-100">
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
            ) : <span className="text-muted">El efectivo esperado se muestra al cerrar el turno.</span>}
          </Seccion>
        </div>
      </div>

      {t.revision ? (
        <Seccion titulo="Revisión de la cuadratura" icono="bi-patch-check">
          <div className={`alert ${t.revision.conforme ? 'alert-success' : 'alert-warning'} mb-0`}>
            <strong>{t.revision.conforme ? 'Revisado conforme' : 'Revisado con observaciones'}</strong> por {t.revision.revisor} el {fechaHora(t.revision.fecha)}.
            {t.revision.observacion && <div className="mt-1">{t.revision.observacion}</div>}
          </div>
        </Seccion>
      ) : t.puede_revisar ? (
        <Seccion titulo="Revisar cuadratura" icono="bi-patch-check">
          <form onSubmit={revisar}>
            <div className="d-flex gap-4 mb-2">
              <div className="form-check"><input id="c1" type="radio" className="form-check-input" checked={conforme} onChange={() => setConforme(true)} /><label htmlFor="c1" className="form-check-label">Conforme</label></div>
              <div className="form-check"><input id="c2" type="radio" className="form-check-input" checked={!conforme} onChange={() => setConforme(false)} /><label htmlFor="c2" className="form-check-label">Con observaciones</label></div>
            </div>
            <textarea className="form-control mb-2" rows="2" maxLength={500} placeholder={dif ? 'Explique el origen de la diferencia (obligatorio)' : 'Observación (opcional)'}
              required={!conforme || Boolean(dif)} value={observacion} onChange={(ev) => setObservacion(ev.target.value)} />
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Registrar revisión'}</button>
            <span className="form-text ms-3">La revisión no se puede modificar después.</span>
          </form>
        </Seccion>
      ) : !t.abierto && (
        <Seccion titulo="Revisión de la cuadratura" icono="bi-patch-check">
          <span className="text-muted">Pendiente de revisión por un jefe de local o un administrador{t.es_propio ? ' (nadie revisa su propio turno)' : ''}.</span>
        </Seccion>
      )}

      {t.por_medio && (
        <Seccion titulo="Por medio de pago" icono="bi-credit-card" plano>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead><tr><th>Medio</th><th className="text-end">Ventas</th><th className="text-end">Devoluciones</th><th className="text-end">Neto</th></tr></thead>
              <tbody>
                {t.por_medio.map((m) => (
                  <tr key={m.medio_pago}><td>{m.medio_pago}</td><td className="text-end">{money(m.ventas)}</td>
                    <td className="text-end">{m.devoluciones ? `-${money(m.devoluciones)}` : '—'}</td><td className="text-end">{money(m.ventas - m.devoluciones)}</td></tr>
                ))}
                {Number(t.resumen.redondeo) !== 0 && (
                  <tr className="text-muted"><td colSpan="3">Ajuste por redondeo del efectivo (Ley 20.956)</td><td className="text-end">{textoAjuste(Number(t.resumen.redondeo), money)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      <div className="row g-3">
        <div className="col-lg-6">
          <Seccion titulo="Ventas del turno" icono="bi-bag-check" plano className="h-100">
            <div className="table-responsive">
              <table className="table table-sm">
                <thead><tr><th>N°</th><th>Hora</th><th>Cliente</th><th>Estado</th><th className="text-end">Total</th></tr></thead>
                <tbody>
                  {t.ventas.length === 0 && <tr><td colSpan="5" className="text-muted text-center py-3">Sin ventas</td></tr>}
                  {t.ventas.map((v) => (
                    <tr key={v.id}>
                      <td className="font-monospace text-nowrap">{can('pedidos') ? <Link to={`/pedidos/${v.id}`}>{v.codigo}</Link> : v.codigo}</td>
                      <td>{fechaHora(v.fecha)}</td><td>{v.nombre_cliente}</td><td>{v.estado}</td><td className="text-end">{money(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>
        </div>
        <div className="col-lg-6">
          <Seccion titulo="Devoluciones del turno" icono="bi-arrow-return-left" plano className="h-100">
            <div className="table-responsive">
              <table className="table table-sm">
                <thead><tr><th>N°</th><th>Pedido</th><th>Motivo</th><th className="text-end">Devuelto</th></tr></thead>
                <tbody>
                  {t.devoluciones.length === 0 && <tr><td colSpan="4" className="text-muted text-center py-3">Sin devoluciones</td></tr>}
                  {t.devoluciones.map((d) => (
                    <tr key={d.id}>
                      <td className="font-monospace text-nowrap">{can('devoluciones') ? <Link to={`/devoluciones/${d.id}`}>{d.codigo}</Link> : d.codigo}</td>
                      <td className="font-monospace text-nowrap">{d.pedido_codigo}</td><td>{d.motivo}</td><td className="text-end">{money(d.total_reembolso)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>
        </div>
      </div>
    </>
  );
}
