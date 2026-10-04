import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { descargarArchivo, verArchivo } from '../../archivos.js';
import { fechaHora, money } from '../../format.js';
import { ErrorAlert, PageHeader, Spinner, useAsync } from '../../components/ui.jsx';

export default function DevolucionDetalle() {
  const { id } = useParams();
  const location = useLocation();
  const { data: d, error, loading } = useAsync(() => api.get(`/devoluciones/${id}`), [id]);
  const [aviso, setAviso] = useState(location.state?.aviso ?? null);
  const [actionError, setActionError] = useState(null);

  if (loading) return <Spinner />;
  if (error) return <ErrorAlert error={error} />;

  return (
    <>
      <PageHeader title={`Devolución ${d.codigo}`}>
        <button className="btn btn-outline-secondary" onClick={() => verArchivo(`/devoluciones/${id}/pdf`).catch(setActionError)}><i className="bi bi-eye me-1" />Ver PDF</button>
        <button className="btn btn-outline-secondary" onClick={() => descargarArchivo(`/devoluciones/${id}/pdf`, `${d.codigo}.pdf`).catch(setActionError)}><i className="bi bi-file-earmark-pdf me-1" />Descargar PDF</button>
        <Link to="/devoluciones" className="btn btn-outline-secondary">Volver</Link>
      </PageHeader>
      {aviso && (
        <div className="alert alert-success d-flex justify-content-between">
          <span>{aviso}</span>
          <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setAviso(null)} />
        </div>
      )}
      <ErrorAlert error={actionError} onClose={() => setActionError(null)} />

      <div className="row mb-3">
        <div className="col-md-7">
          <dl className="row mb-0">
            <dt className="col-sm-4">Pedido</dt><dd className="col-sm-8"><Link to={`/pedidos/${d.pedido_id}`}>{d.pedido_codigo}</Link></dd>
            <dt className="col-sm-4">Cliente</dt><dd className="col-sm-8">{d.nombre_cliente}</dd>
            <dt className="col-sm-4">Sucursal</dt><dd className="col-sm-8">{d.sucursal ?? '—'}</dd>
            <dt className="col-sm-4">Fecha</dt><dd className="col-sm-8">{fechaHora(d.fecha)} · {d.usuario}</dd>
            <dt className="col-sm-4">Motivo</dt><dd className="col-sm-8">{d.motivo}</dd>
          </dl>
        </div>
        <div className="col-md-5 text-md-end"><div className="fs-4">Total devuelto: <strong>{money(d.total_reembolso)}</strong></div></div>
      </div>

      <table className="table align-middle">
        <thead><tr><th>SKU</th><th>Producto</th><th className="text-end">Cant.</th><th>Stock</th><th className="text-end">Reembolso</th></tr></thead>
        <tbody>
          {d.lineas.map((l) => (
            <tr key={l.id}>
              <td>{l.sku}</td><td>{l.nombre_producto}</td><td className="text-end">{l.cantidad}</td>
              <td>{l.reingresa_stock ? <span className="badge text-bg-success">Reingresado</span> : <span className="badge text-bg-secondary">No reingresado</span>}</td>
              <td className="text-end">{money(l.monto_reembolso)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="h5">Dinero devuelto</h3>
      <table className="table table-sm" style={{ maxWidth: 520 }}>
        <thead><tr><th>Medio</th><th>Referencia</th><th className="text-end">Monto</th></tr></thead>
        <tbody>
          {d.pagos.map((x) => <tr key={x.id}><td>{x.medio_pago}</td><td>{x.referencia ?? '—'}</td><td className="text-end">{money(x.monto)}</td></tr>)}
        </tbody>
      </table>
    </>
  );
}
