import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { useAuth } from '../../AuthContext.jsx';
import { descargarArchivo } from '../../archivos.js';
import { fechaHora, money } from '../../format.js';
import FiltroFechas from '../../components/FiltroFechas.jsx';
import { ErrorAlert, PageHeader, Pager, Spinner, useAsync } from '../../components/ui.jsx';

const LIMIT = 15;
const ESTADO_CLASE = { Abierto: 'info', 'Cerrado sin revisar': 'warning', 'Revisado conforme': 'success', 'Revisado con observaciones': 'secondary' };
const ESTADOS = [['', 'Todos los turnos'], ['abierto', 'Abiertos'], ['cerrado', 'Cerrados'], ['sin_revisar', 'Cerrados sin revisar'], ['con_diferencia', 'Con diferencia de caja']];

const Dif = ({ v }) => (v == null ? <span className="text-muted">—</span>
  : <span className={v === 0 ? 'text-success' : 'text-danger fw-semibold'}>{v === 0 ? 'Cuadra' : `${v > 0 ? '+' : '-'}${money(Math.abs(v))}`}</span>);

function Indicador({ titulo, valor, clase = '', onClick, sub }) {
  return (
    <div className="col-6 col-lg-2">
      <div className={`card h-100 ${onClick ? 'border-warning' : ''}`} role={onClick ? 'button' : undefined} onClick={onClick}>
        <div className="card-body py-2">
          <div className="small text-muted">{titulo}</div>
          <div className={`fs-5 fw-bold ${clase}`}>{valor}</div>
          {sub && <div className="small text-muted">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export default function Cuadratura() {
  const { can } = useAuth();
  const supervisor = can('usuarios');
  const [estado, setEstado] = useState('');
  const [sucursal, setSucursal] = useState('');
  const [cajero, setCajero] = useState('');
  const [fechas, setFechas] = useState({ desde: '', hasta: '' });
  const [page, setPage] = useState(1);
  const [detalle, setDetalle] = useState(false);
  const [actionError, setActionError] = useState(null);

  const catalogos = useAsync(() => api.get('/catalogos'), []);
  const usuarios = useAsync(() => (supervisor ? api.get('/usuarios?limit=500') : Promise.resolve(null)), [supervisor]);
  const rangoInvalido = fechas.desde && fechas.hasta && fechas.desde > fechas.hasta;
  const filtros = { sucursal_id: sucursal, usuario_id: cajero, ...fechas };
  const resumen = useAsync(() => (rangoInvalido ? Promise.resolve(null) : api.get(`/cuadratura/resumen${qs(filtros)}`)), [sucursal, cajero, fechas.desde, fechas.hasta]);
  const lista = useAsync(
    () => (rangoInvalido ? Promise.resolve(null) : api.get(`/cuadratura/turnos${qs({ ...filtros, estado, page, limit: LIMIT })}`)),
    [estado, sucursal, cajero, fechas.desde, fechas.hasta, page]);
  const s = resumen.data;
  const cambiar = (fn) => (v) => { setPage(1); fn(v); };

  return (
    <>
      <PageHeader title="Cuadratura de caja" />
      {!supervisor && <p className="text-muted">Aquí ve el historial de sus turnos. El efectivo esperado de un turno abierto no se muestra: se informa al cerrarlo.</p>}

      <div className="row g-2 mb-2">
        <div className="col-md-3">
          <select className="form-select" value={estado} onChange={(e) => cambiar(setEstado)(e.target.value)}>
            {ESTADOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <select className="form-select" value={sucursal} onChange={(e) => cambiar(setSucursal)(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {catalogos.data?.sucursales.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </div>
        {supervisor && (
          <div className="col-md-3">
            <select className="form-select" value={cajero} onChange={(e) => cambiar(setCajero)(e.target.value)}>
              <option value="">Todos los cajeros</option>
              {usuarios.data?.data.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="mb-3 d-flex align-items-center gap-2">
        <span className="small text-muted">Apertura del turno:</span>
        <FiltroFechas desde={fechas.desde} hasta={fechas.hasta} onChange={(f) => { setPage(1); setFechas(f); }} />
      </div>
      {rangoInvalido && <div className="alert alert-warning py-2">La fecha "desde" no puede ser posterior a "hasta".</div>}
      <ErrorAlert error={resumen.error || lista.error || actionError} onClose={actionError ? () => setActionError(null) : undefined} />

      {s && (
        <>
          <div className="row g-2 mb-2">
            <Indicador titulo="Turnos" valor={s.turnos} sub={`${s.abiertos} abierto(s)`} />
            <Indicador titulo="Ventas netas" valor={money(s.ventas_netas)} sub={`${s.ventas} ventas · ${s.devoluciones} devol.`} />
            <Indicador titulo="Diferencia neta" valor={Number(s.diferencia_neta) === 0 ? 'Cuadra' : `${Number(s.diferencia_neta) < 0 ? '-' : '+'}${money(Math.abs(Number(s.diferencia_neta)))}`} clase={Number(s.diferencia_neta) === 0 ? 'text-success' : 'text-danger'} sub={`${s.con_diferencia} turno(s) con diferencia`} />
            <Indicador titulo="Faltantes" valor={money(s.faltantes)} clase={Number(s.faltantes) > 0 ? 'text-danger' : ''} />
            <Indicador titulo="Sobrantes" valor={money(s.sobrantes)} clase={Number(s.sobrantes) > 0 ? 'text-warning' : ''} />
            <Indicador titulo="Sin revisar" valor={s.sin_revisar} onClick={s.sin_revisar ? () => cambiar(setEstado)('sin_revisar') : undefined} sub={s.sin_revisar ? 'ver pendientes' : 'al día'} />
          </div>
          <button className="btn btn-link btn-sm p-0 mb-2" onClick={() => setDetalle((d) => !d)}>
            {detalle ? 'Ocultar' : 'Ver'} desglose por medio de pago y por cajero
          </button>
          {detalle && (
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <table className="table table-sm">
                  <thead><tr><th>Medio de pago</th><th className="text-end">Ventas</th><th className="text-end">Devoluciones</th><th className="text-end">Neto</th></tr></thead>
                  <tbody>
                    {s.por_medio.length === 0 && <tr><td colSpan="4" className="text-muted text-center">Sin movimientos</td></tr>}
                    {s.por_medio.map((m) => (
                      <tr key={m.medio_pago}><td>{m.medio_pago}</td><td className="text-end">{money(m.ventas)}</td>
                        <td className="text-end">{Number(m.devoluciones) ? `-${money(m.devoluciones)}` : '—'}</td><td className="text-end">{money(Number(m.ventas) - Number(m.devoluciones))}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="col-md-6">
                <table className="table table-sm">
                  <thead><tr><th>Cajero</th><th className="text-end">Turnos</th><th className="text-end">Ventas</th><th className="text-end">Faltantes</th><th className="text-end">Sobrantes</th></tr></thead>
                  <tbody>
                    {s.por_cajero.map((c) => (
                      <tr key={c.cajero}><td>{c.cajero}</td><td className="text-end">{c.turnos}</td><td className="text-end">{money(c.total_ventas)}</td>
                        <td className={`text-end ${Number(c.faltantes) ? 'text-danger' : ''}`}>{Number(c.faltantes) ? money(c.faltantes) : '—'}</td>
                        <td className="text-end">{Number(c.sobrantes) ? money(c.sobrantes) : '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {lista.loading && !lista.data ? <Spinner /> : (
        <>
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead>
                <tr><th>Apertura</th><th>Caja</th><th>Cajero</th><th>Estado</th><th className="text-end">Ventas</th><th className="text-end">Devol.</th>
                  <th className="text-end">Esperado</th><th className="text-end">Contado</th><th className="text-end">Diferencia</th><th /></tr>
              </thead>
              <tbody>
                {(lista.data?.data.length ?? 0) === 0 && <tr><td colSpan="10" className="text-center text-muted py-4">Sin turnos con esos filtros</td></tr>}
                {lista.data?.data.map((t) => (
                  <tr key={t.id}>
                    <td className="text-nowrap"><Link to={`/cuadratura/${t.id}`} className="text-decoration-none">{fechaHora(t.fecha_apertura)}</Link></td>
                    <td>{t.sucursal} · Caja {t.caja_numero}</td>
                    <td>{t.cajero}</td>
                    <td><span className={`badge text-bg-${ESTADO_CLASE[t.estado]}`}>{t.estado}</span></td>
                    <td className="text-end">{money(t.total_ventas)}<div className="small text-muted">{t.ventas} venta(s)</div></td>
                    <td className="text-end">{t.devoluciones ? `-${money(t.total_devoluciones)}` : '—'}</td>
                    <td className="text-end">{t.esperado == null ? '—' : money(t.esperado)}</td>
                    <td className="text-end">{t.contado == null ? '—' : money(t.contado)}</td>
                    <td className="text-end"><Dif v={t.diferencia} /></td>
                    <td className="text-nowrap text-end">
                      <Link to={`/cuadratura/${t.id}`} className="btn btn-sm btn-outline-primary me-1" title="Ver"><i className="bi bi-eye" /></Link>
                      {(t.fecha_cierre || supervisor) && (
                        <button className="btn btn-sm btn-outline-secondary" title={t.fecha_cierre ? 'Descargar Cierre Z' : 'Descargar reporte X'}
                          onClick={() => descargarArchivo(`/cuadratura/turnos/${t.id}/pdf`).catch(setActionError)}><i className="bi bi-file-earmark-pdf" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} limit={LIMIT} total={lista.data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </>
  );
}
