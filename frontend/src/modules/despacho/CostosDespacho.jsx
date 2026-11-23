import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../AuthContext.jsx';
import { fechaHora, money } from '../../format.js';
import { ErrorAlert, errorCampo, PageHeader, Seccion, Spinner, useAsync } from '../../components/ui.jsx';

// Costo de despacho a domicilio por comuna (HU-78). La tienda lo suma al pedido y a lo que se paga en Webpay.
// Una comuna sin costo o desactivada no tiene despacho: la tienda solo ofrece retiro en farmacia.
export default function CostosDespacho() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'Administrador';
  const { data, error, loading, reload } = useAsync(() => api.get('/despacho'), []);
  const [regionId, setRegionId] = useState('');
  const [cambios, setCambios] = useState({}); // comuna_id -> { costo: texto, activo }
  const [paraTodas, setParaTodas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [errorGuardar, setErrorGuardar] = useState(null);

  const regiones = data ?? [];
  const region = useMemo(() => regiones.find((r) => r.id === regionId) ?? regiones.find((r) => r.con_despacho > 0) ?? regiones[0],
    [regiones, regionId]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorAlert error={error} />;

  const valor = (c) => cambios[c.id] ?? { costo: c.costo == null ? '' : String(c.costo), activo: c.activo };
  const cambiar = (c, x) => setCambios((m) => ({ ...m, [c.id]: { ...valor(c), ...x } }));
  const pendientes = Object.entries(cambios);
  const aplicarATodas = () => {
    if (paraTodas === '') return;
    const nuevos = {};
    region.comunas.forEach((c) => { nuevos[c.id] = { costo: paraTodas, activo: true }; });
    setCambios((m) => ({ ...m, ...nuevos }));
  };

  const guardar = async () => {
    setGuardando(true); setErrorGuardar(null); setAviso(null);
    const comunas = pendientes.map(([comuna_id, x]) => ({ comuna_id, costo: x.costo === '' ? 0 : Number(x.costo), activo: x.costo === '' ? false : x.activo }));
    try {
      const r = await api.put('/despacho', { comunas });
      setAviso(`${r.guardadas} ${r.guardadas === 1 ? 'comuna guardada' : 'comunas guardadas'}.`);
      setCambios({});
      reload();
    } catch (e) {
      e.indices = pendientes.map(([id]) => id); // se conserva el error tal cual: su mensaje no se copia con { ...e }
      setErrorGuardar(e);
    } finally {
      setGuardando(false);
    }
  };
  // Error de la API para una comuna (comunas.N.campo).
  const errorDe = (c, campo) => {
    const i = errorGuardar?.indices?.indexOf(c.id) ?? -1;
    return i >= 0 ? errorCampo(errorGuardar, `comunas.${i}.${campo}`) : null;
  };

  return (
    <>
      <PageHeader title="Costos de despacho">
        {esAdmin && (
          <button className="btn btn-primary" disabled={guardando || pendientes.length === 0} onClick={guardar}>
            {guardando ? 'Guardando…' : `Guardar cambios${pendientes.length ? ` (${pendientes.length})` : ''}`}
          </button>
        )}
      </PageHeader>
      <p className="text-muted">
        Lo que cuesta despachar a cada comuna, con IVA incluido. La tienda lo muestra al elegir la comuna y lo suma al total del
        pedido. Una comuna sin costo o desactivada no tiene despacho: el cliente puede retirar en la farmacia.
        {!esAdmin && ' Solo el Administrador puede cambiar los costos.'}
      </p>
      {aviso && <div className="alert alert-success py-2" role="status">{aviso}</div>}
      <ErrorAlert error={errorGuardar} onClose={() => setErrorGuardar(null)} />

      <VidaUtilWeb esAdmin={esAdmin} />

      <Seccion titulo="Comunas" icono="bi-geo-alt" plano
        acciones={(
          <select className="form-select form-select-sm" style={{ maxWidth: 380 }} aria-label="Región" value={region?.id ?? ''}
            onChange={(e) => setRegionId(e.target.value)}>
            {regiones.map((r) => <option key={r.id} value={r.id}>{r.nombre}{r.con_despacho ? ` (${r.con_despacho} con despacho)` : ''}</option>)}
          </select>
        )}>
        {esAdmin && region && (
          <div className="d-flex flex-wrap align-items-center gap-2 p-3 border-bottom">
            <label htmlFor="costo-todas" className="mb-0">Mismo costo para todas las comunas de {region.nombre}:</label>
            <div className="input-group input-group-sm" style={{ width: 160 }}>
              <span className="input-group-text">$</span>
              <input id="costo-todas" type="number" min="0" max="100000" step="10" className="form-control" value={paraTodas} onChange={(e) => setParaTodas(e.target.value)} />
            </div>
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={aplicarATodas} disabled={paraTodas === ''}>Aplicar</button>
            <span className="small text-muted">Después ajusta las que cuesten distinto y guarda.</span>
          </div>
        )}
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead><tr><th>Comuna</th><th style={{ width: 180 }}>Costo</th><th>Despacho</th><th>Última modificación</th></tr></thead>
            <tbody>
              {region?.comunas.map((c) => {
                const v = valor(c);
                const err = errorDe(c, 'costo');
                return (
                  <tr key={c.id} className={cambios[c.id] ? 'table-warning' : ''}>
                    <td>{c.nombre}</td>
                    <td>
                      {esAdmin ? (
                        <>
                          <div className="input-group input-group-sm">
                            <span className="input-group-text">$</span>
                            <input type="number" min="0" max="100000" step="10" aria-label={`Costo de despacho a ${c.nombre}`}
                              className={`form-control${err ? ' is-invalid' : ''}`} value={v.costo} placeholder="Sin despacho"
                              onChange={(e) => cambiar(c, { costo: e.target.value, activo: e.target.value === '' ? false : (c.costo == null ? true : v.activo) })} />
                          </div>
                          {err && <div className="text-danger small">{err}</div>}
                        </>
                      ) : (c.costo == null ? '—' : money(c.costo))}
                    </td>
                    <td>
                      {esAdmin ? (
                        <div className="form-check form-switch mb-0">
                          <input className="form-check-input" type="checkbox" role="switch" id={`activo-${c.id}`} checked={v.activo}
                            disabled={v.costo === ''} onChange={(e) => cambiar(c, { activo: e.target.checked })} />
                          <label className="form-check-label" htmlFor={`activo-${c.id}`}>{v.activo ? 'Sí' : 'No'}</label>
                        </div>
                      ) : (c.activo ? <span className="badge text-bg-success">Sí</span> : <span className="badge text-bg-secondary">No</span>)}
                    </td>
                    <td className="small text-muted">{c.actualizado_en ? `${fechaHora(c.actualizado_en)}${c.actualizado_por ? ` · ${c.actualizado_por}` : ''}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Seccion>
    </>
  );
}

// Vida útil mínima para vender en la tienda (HU-93): la tienda no ofrece ni reserva lotes que vencen antes de hoy + N
// días. La venta en mostrador no cambia.
function VidaUtilWeb({ esAdmin }) {
  const { data, error, reload } = useAsync(() => api.get('/despacho/vida-util'), []);
  const [editando, setEditando] = useState(false);
  const [dias, setDias] = useState('');
  const [errorGuardar, setErrorGuardar] = useState(null);
  if (error) return <ErrorAlert error={error} />;
  if (!data) return null;
  const guardar = async (e) => {
    e.preventDefault();
    setErrorGuardar(null);
    try {
      await api.put('/despacho/vida-util', { dias: Number(dias) });
      setEditando(false);
      reload();
    } catch (err) {
      setErrorGuardar(err);
    }
  };
  return (
    <div className="alert alert-light border d-flex flex-wrap align-items-center gap-2 py-2" role="status" id="vida-util-web">
      <i className="bi bi-calendar-check text-primary" />
      <span>La tienda solo vende lotes con al menos <strong>{data.dias} {data.dias === 1 ? 'día' : 'días'}</strong> de vida. La venta en mostrador no cambia.</span>
      {data.actualizado_por && <span className="small text-muted">Cambiado por {data.actualizado_por}.</span>}
      {esAdmin && !editando && (
        <button className="btn btn-sm btn-outline-primary ms-auto" onClick={() => { setDias(String(data.dias)); setEditando(true); }}>Cambiar</button>
      )}
      {editando && (
        <form className="d-flex align-items-center gap-2 ms-auto" onSubmit={guardar}>
          <label htmlFor="dias-web" className="mb-0 small">Días</label>
          <input id="dias-web" type="number" min="0" max="365" required className={`form-control form-control-sm${errorCampo(errorGuardar, 'dias') ? ' is-invalid' : ''}`}
            style={{ width: 90 }} value={dias} onChange={(e) => setDias(e.target.value)} />
          <button className="btn btn-sm btn-primary">Guardar</button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditando(false)}>Cancelar</button>
        </form>
      )}
      {errorGuardar && <div className="w-100 text-danger small">{errorCampo(errorGuardar, 'dias') ?? errorGuardar.message}</div>}
    </div>
  );
}
