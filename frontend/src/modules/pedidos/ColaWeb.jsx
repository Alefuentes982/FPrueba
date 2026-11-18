import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { useAuth } from '../../AuthContext.jsx';
import { money } from '../../format.js';
import { ErrorAlert, PageHeader, Spinner, useAsync } from '../../components/ui.jsx';
import { estadoPedidoClase } from './estados.js';

// Cola de pedidos web (HU-76): lo que compró la tienda en línea y espera al personal. Se actualiza sola cada 30 s.
const ESTADOS = ['Pagado', 'En preparación', 'Listo para retiro', 'En despacho'];
const SIGUIENTE = {
  retiro: { Pagado: 'En preparación', 'En preparación': 'Listo para retiro' },
  despacho: { Pagado: 'En preparación', 'En preparación': 'En despacho', 'En despacho': 'Entregado' },
};
const BOTON = { 'En preparación': 'Preparar', 'Listo para retiro': 'Listo para retiro', 'En despacho': 'Enviar a despacho', Entregado: 'Entregado' };
const CADA = 30000;

const espera = (min) => (min == null ? '—' : min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${Math.floor(min / 1440)} d`);

export default function ColaWeb() {
  const { user } = useAuth();
  const [estado, setEstado] = useState('');
  const [sucursal, setSucursal] = useState(user?.sucursal_id ?? '');
  const [entrega, setEntrega] = useState('');
  const [aviso, setAviso] = useState(null);
  const [errorAccion, setErrorAccion] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const catalogos = useAsync(() => api.get('/catalogos'), []);
  const { data, error, loading, reload } = useAsync(
    () => api.get(`/pedidos/web${qs({ estado, sucursal_id: sucursal, entrega })}`), [estado, sucursal, entrega]);

  // Actualización automática y aviso de pedidos nuevos desde la última vez.
  const nuevosAntes = useRef(null);
  const [llegaron, setLlegaron] = useState(0);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, CADA);
    return () => clearInterval(t);
  }, [reload]);
  useEffect(() => {
    if (data?.nuevos == null) return;
    const llegados = nuevosAntes.current == null ? 0 : data.nuevos - nuevosAntes.current;
    if (llegados > 0) setLlegaron((n) => n + llegados);
    nuevosAntes.current = data.nuevos;
  }, [data?.nuevos]);

  const avanzar = async (p, siguiente) => {
    setOcupado(p.id); setErrorAccion(null); setAviso(null);
    try {
      await api.post(`/pedidos/${p.id}/estado`, { estado: siguiente });
      setAviso(`${p.codigo} pasó a "${siguiente}".`);
      reload();
    } catch (e) {
      setErrorAccion(e);
      reload();
    } finally {
      setOcupado(null);
    }
  };

  const conteo = data?.conteo ?? {};
  const total = ESTADOS.reduce((s, x) => s + (conteo[x] ?? 0), 0);
  return (
    <>
      <PageHeader title={<>Pedidos web {data?.nuevos > 0 && <span className="badge text-bg-danger align-middle fs-6" title="Pagados sin preparar">{data.nuevos} {data.nuevos === 1 ? 'nuevo' : 'nuevos'}</span>}</>}>
        <button className="btn btn-outline-secondary" onClick={() => { setLlegaron(0); reload(); }} disabled={loading}>
          <i className="bi bi-arrow-clockwise me-1" />Actualizar
        </button>
        <Link to="/pedidos" className="btn btn-outline-secondary">Todos los pedidos</Link>
      </PageHeader>
      <p className="text-muted small mb-2">
        Compras de la tienda en línea que esperan al personal, las más antiguas primero. Se actualiza sola cada 30 segundos.
      </p>
      {llegaron > 0 && (
        <div className="alert alert-info d-flex justify-content-between align-items-center py-2" role="status">
          <span><i className="bi bi-bell me-1" />{llegaron === 1 ? 'Llegó 1 pedido nuevo.' : `Llegaron ${llegaron} pedidos nuevos.`}</span>
          <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setLlegaron(0)} />
        </div>
      )}

      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div className="btn-group flex-wrap" role="group" aria-label="Estado">
          <button type="button" className={`btn btn-sm ${estado === '' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setEstado('')}>
            Todos <span className="badge text-bg-light ms-1">{total}</span>
          </button>
          {ESTADOS.map((x) => (
            <button key={x} type="button" className={`btn btn-sm ${estado === x ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setEstado(x)}>
              {x} <span className="badge text-bg-light ms-1">{conteo[x] ?? 0}</span>
            </button>
          ))}
        </div>
        <select className="form-select form-select-sm w-auto" aria-label="Sucursal" value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
          <option value="">Todas las sucursales</option>
          {catalogos.data?.sucursales_venta_web?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select className="form-select form-select-sm w-auto" aria-label="Entrega" value={entrega} onChange={(e) => setEntrega(e.target.value)}>
          <option value="">Retiro y despacho</option>
          <option value="retiro">Retiro en farmacia</option>
          <option value="despacho">Despacho a domicilio</option>
        </select>
      </div>

      {aviso && <div className="alert alert-success py-2" role="status">{aviso}</div>}
      <ErrorAlert error={error || errorAccion} onClose={errorAccion ? () => setErrorAccion(null) : undefined} />
      {loading && !data ? <Spinner /> : (
        <div className="table-responsive">
          <table className="table table-hover align-middle fc-cola-web">
            <thead>
              <tr><th>N°</th><th>Pagado hace</th><th>Cliente</th><th>Entrega</th><th className="text-end">Unid.</th><th className="text-end">Total</th><th>Estado</th><th /></tr>
            </thead>
            <tbody>
              {(data?.data.length ?? 0) === 0 && <tr><td colSpan="8" className="text-center text-muted py-4">No hay pedidos web esperando con esos filtros.</td></tr>}
              {data?.data.map((p) => {
                const siguiente = SIGUIENTE[p.tipo_entrega]?.[p.estado];
                return (
                  <tr key={p.id} className={p.estado === 'Pagado' ? 'table-warning' : ''}>
                    <td className="font-monospace fw-semibold text-nowrap">
                      <Link to={`/pedidos/${p.id}`} className="text-decoration-none">{p.codigo}</Link>
                      {p.estado === 'Pagado' && <span className="badge text-bg-danger ms-2">Nuevo</span>}
                    </td>
                    <td className="text-nowrap" title={`En "${p.estado}" hace ${espera(p.minutos_estado)}`}>{espera(p.minutos_pagado)}</td>
                    <td>{p.nombre_cliente}{p.telefono && <div className="small text-muted">{p.telefono}</div>}</td>
                    <td>
                      {p.tipo_entrega === 'retiro'
                        ? <><i className="bi bi-shop me-1" />Retiro en {p.sucursal}</>
                        : <><i className="bi bi-truck me-1" />Despacho a {p.comuna}<div className="small text-muted">{p.direccion_pedido} · sale de {p.sucursal}</div></>}
                    </td>
                    <td className="text-end">{p.unidades}</td>
                    <td className="text-end">{money(p.total)}</td>
                    <td><span className={`badge text-bg-${estadoPedidoClase[p.estado] ?? 'light'}`}>{p.estado}</span></td>
                    <td className="text-end text-nowrap">
                      {siguiente ? (
                        <button className="btn btn-sm btn-primary" disabled={ocupado === p.id} onClick={() => avanzar(p, siguiente)}>
                          {BOTON[siguiente]}<i className="bi bi-chevron-right ms-1" />
                        </button>
                      ) : p.estado === 'Listo para retiro' && <span className="small text-muted">Espera al cliente</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
