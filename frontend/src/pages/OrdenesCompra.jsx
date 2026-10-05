import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { estadoOcClase, fechaCorta, money, soloFecha } from '../format.js';
import { ErrorAlert, PageHeader, Pager, Spinner, useAsync } from '../components/ui.jsx';

const LIMIT = 15;

export default function OrdenesCompra() {
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [page, setPage] = useState(1);

  const catalogos = useAsync(() => api.get('/catalogos'), []);
  const { data, error, loading } = useAsync(
    () => api.get(`/ordenes-compra${qs({ q: busqueda, estado_id: estado, page, limit: LIMIT })}`),
    [busqueda, estado, page]);

  return (
    <>
      <PageHeader title="Órdenes de compra">
        <Link to="/ordenes-compra/nueva" className="btn btn-primary"><i className="bi bi-plus-lg me-1" />Nueva orden</Link>
      </PageHeader>
      <form className="row g-2 mb-3" onSubmit={(e) => { e.preventDefault(); setPage(1); setBusqueda(q); }}>
        <div className="col-md-6"><input className="form-control" placeholder="Buscar por proveedor o N° de orden" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="col-md-3">
          <select className="form-select" value={estado} onChange={(e) => { setPage(1); setEstado(e.target.value); }}>
            <option value="">Todos los estados</option>
            {catalogos.data?.estados_orden_compra.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className="col-md-3"><button className="btn btn-outline-secondary w-100">Buscar</button></div>
      </form>
      <ErrorAlert error={error} />
      {loading ? <Spinner /> : (
        <>
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead>
                <tr><th>N°</th><th>Fecha</th><th>Proveedor</th><th>Sucursal</th><th>Esperada</th><th>Estado</th><th className="text-end">Total</th><th /></tr>
              </thead>
              <tbody>
                {data?.data.length === 0 && <tr><td colSpan="8" className="text-center text-muted py-4">Sin resultados</td></tr>}
                {data?.data.map((o) => (
                  <tr key={o.id}>
                    <td className="font-monospace">{o.id.slice(0, 8)}</td>
                    <td>{fechaCorta(o.fecha)}</td>
                    <td>{o.proveedor}</td>
                    <td>{o.sucursal}</td>
                    <td>{soloFecha(o.fecha_esperada)}</td>
                    <td><span className={`badge text-bg-${estadoOcClase[o.estado] ?? 'light'}`}>{o.estado}</span></td>
                    <td className="text-end">{money(o.total)}</td>
                    <td className="text-end"><Link to={`/ordenes-compra/${o.id}`} className="btn btn-sm btn-outline-primary"><i className="bi bi-eye" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} limit={LIMIT} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </>
  );
}
