import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { descargarArchivo, verArchivo } from '../../archivos.js';
import { Slot } from '../../extensiones.jsx';
import { fechaHora, money } from '../../format.js';
import PanelPago from '../../components/PanelPago.jsx';
import { ErrorAlert, PageHeader, Spinner, useAsync } from '../../components/ui.jsx';
import { estadoPedidoClase } from './estados.js';

export default function PedidoDetalle() {
  const { id } = useParams();
  const location = useLocation();
  const { data: p, error, loading, reload } = useAsync(() => api.get(`/pedidos/${id}`), [id]);
  const catalogos = useAsync(() => api.get('/catalogos'), []);
  const [aviso, setAviso] = useState(location.state?.aviso ?? null);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cobrando, setCobrando] = useState(false);

  const ejecutar = async (fn, mensaje) => {
    setActionError(null);
    setAviso(null);
    setBusy(true);
    try {
      await fn();
      setAviso(mensaje);
      setCobrando(false);
      reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !p) return <Spinner />;
  if (error) return <ErrorAlert error={error} />;
  if (!p) return <Spinner />;

  const medios = catalogos.data?.medios_pago ?? [];
  const siguientes = p.acciones.filter((a) => a.startsWith('estado:')).map((a) => a.slice(7));
  const tiene = (a) => p.acciones.includes(a);

  const confirmarPago = (pagos) => ejecutar(
    () => api.post(`/pedidos/${id}/pagos`, { pagos }),
    `Pago registrado. El pedido ${p.codigo} quedó pagado.`);

  return (
    <>
      <PageHeader title={`Pedido ${p.codigo}`}>
        {tiene('editar') && <Link to={`/pedidos/${id}/editar`} className="btn btn-outline-primary"><i className="bi bi-pencil me-1" />Editar</Link>}
        {tiene('reservar') && (
          <button className="btn btn-outline-primary" disabled={busy}
            onClick={() => ejecutar(() => api.post(`/pedidos/${id}/reservar`), 'Stock reservado.')}>
            <i className="bi bi-box-seam me-1" />Reservar stock
          </button>
        )}
        {tiene('pagar') && !cobrando && (
          <button className="btn btn-success" disabled={busy || medios.length === 0} onClick={() => setCobrando(true)}>
            <i className="bi bi-cash-coin me-1" />Registrar pago
          </button>
        )}
        {siguientes.map((s) => (
          <button key={s} className="btn btn-primary" disabled={busy}
            onClick={() => ejecutar(() => api.post(`/pedidos/${id}/estado`, { estado: s }), `Pedido en estado "${s}".`)}>
            Pasar a «{s}»
          </button>
        ))}
        <button className="btn btn-outline-secondary" onClick={() => verArchivo(`/pedidos/${id}/pdf`).catch(setActionError)}><i className="bi bi-eye me-1" />Ver PDF</button>
        <button className="btn btn-outline-secondary" onClick={() => descargarArchivo(`/pedidos/${id}/pdf`, `${p.codigo}.pdf`).catch(setActionError)}><i className="bi bi-file-earmark-pdf me-1" />Descargar PDF</button>
        {tiene('cancelar') && (
          <button className="btn btn-outline-danger" disabled={busy}
            onClick={() => window.confirm('¿Cancelar el pedido? Se devuelve el stock y se anulan los pagos registrados (la devolución del dinero es aparte).')
              && ejecutar(() => api.post(`/pedidos/${id}/cancelar`), `Pedido ${p.codigo} cancelado.`)}>
            Cancelar pedido
          </button>
        )}
        <Link to="/pedidos" className="btn btn-outline-secondary">Volver</Link>
      </PageHeader>

      {aviso && (
        <div className="alert alert-success d-flex justify-content-between">
          <span>{aviso}</span>
          <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setAviso(null)} />
        </div>
      )}
      <ErrorAlert error={actionError} onClose={() => setActionError(null)} />
      {p.estado === 'Pago pendiente' && (
        <div className="alert alert-warning py-2">
          Pago pendiente{p.stock_reservado ? ' · stock reservado' : ' · sin stock reservado'}. Si no se paga dentro de 20 minutos desde su creación, el pedido expira y devuelve el stock.
        </div>
      )}

      <div className="row mb-3">
        <div className="col-md-7">
          <dl className="row mb-0">
            <dt className="col-sm-4">Estado</dt><dd className="col-sm-8"><span className={`badge text-bg-${estadoPedidoClase[p.estado] ?? 'light'}`}>{p.estado}</span></dd>
            <dt className="col-sm-4">Cliente</dt><dd className="col-sm-8">{p.nombre_cliente}{p.telefono && <span className="text-muted"> · {p.telefono}</span>}</dd>
            <dt className="col-sm-4">Entrega</dt><dd className="col-sm-8">{[p.direccion_pedido, p.comuna].filter(Boolean).join(', ') || '—'}</dd>
            <dt className="col-sm-4">Sucursal</dt><dd className="col-sm-8">{p.sucursal ?? '—'}</dd>
            <dt className="col-sm-4">Canal</dt><dd className="col-sm-8">{p.canal}</dd>
            <dt className="col-sm-4">Creado</dt><dd className="col-sm-8">{fechaHora(p.fecha)}{p.vendedor && ` por ${p.vendedor}`}</dd>
          </dl>
        </div>
        <div className="col-md-5 text-md-end">
          <div>Subtotal: <strong>{money(p.subtotal_bruto)}</strong></div>
          {p.descuento_total > 0 && <div className="text-success">Descuentos: <strong>-{money(p.descuento_total)}</strong></div>}
          <div className="text-muted small">Neto {money(p.subtotal_neto)} · IVA {money(p.iva)}</div>
          <div className="fs-4">Total: <strong>{money(p.total)}</strong></div>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table align-middle">
          <thead><tr><th>SKU</th><th>Producto</th><th className="text-end">Cant.</th><th className="text-end">Precio unit.</th><th className="text-end">Descuento</th><th className="text-end">Subtotal</th></tr></thead>
          <tbody>
            {p.lineas.map((l) => (
              <tr key={l.id}>
                <td>{l.sku}</td><td>{l.nombre_producto}{l.regla && <span className="badge text-bg-success ms-2">{l.regla}</span>}</td>
                <td className="text-end">{l.cantidad}</td><td className="text-end">{money(l.precio_unitario)}</td>
                <td className="text-end">{Number(l.descuento_monto) ? `-${money(l.descuento_monto)}` : '—'}</td>
                <td className="text-end">{money(l.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cobrando && (
        <PanelPago total={Number(p.total)} medios={medios} busy={busy} onConfirmar={confirmarPago} onCancelar={() => setCobrando(false)}
          ayuda="Si el pedido aún no tiene stock reservado, se reserva al confirmar el pago." />
      )}

      <h3 className="h5">Pagos</h3>
      {p.pagos.length === 0 ? <p className="text-muted">Sin pagos registrados.</p> : (
        <table className="table table-sm">
          <thead><tr><th>Fecha</th><th>Medio</th><th>Autorización</th><th>Estado</th><th className="text-end">Monto</th></tr></thead>
          <tbody>
            {p.pagos.map((x) => (
              <tr key={x.id}>
                <td>{fechaHora(x.fecha_transaccion)}</td><td>{x.medio_pago}</td><td>{x.codigo_autorizacion ?? '—'}</td>
                <td><span className={`badge text-bg-${x.estado === 'Aprobado' ? 'success' : 'secondary'}`}>{x.estado}</span></td>
                <td className="text-end">{money(x.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Otros módulos (p. ej. devoluciones) agregan aquí sus secciones. */}
      <Slot nombre="pedido.detalle" pedido={p} />
    </>
  );
}
