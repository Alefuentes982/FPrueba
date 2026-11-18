import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import BotonesDocumento from '../../components/BotonesDocumento.jsx';
import { Slot } from '../../extensiones.jsx';
import { fechaHora, money } from '../../format.js';
import { textoAjuste } from '../../redondeo.js';
import PanelPago from '../../components/PanelPago.jsx';
import EnviarCorreo from '../../components/EnviarCorreo.jsx';
import { ErrorAlert, Ficha, PageHeader, Seccion, Spinner, useAsync } from '../../components/ui.jsx';
import { estadoPedidoClase } from './estados.js';

export default function PedidoDetalle() {
  const { id } = useParams();
  const location = useLocation();
  const { data: p, error, loading, reload } = useAsync(() => api.get(`/pedidos/${id}`), [id]);
  const catalogos = useAsync(() => api.get('/catalogos'), []);
  const historial = useAsync(() => api.get(`/pedidos/${id}/historial`), [id]);
  const [aviso, setAviso] = useState(location.state?.aviso ?? null);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const ejecutar = async (fn, mensaje) => {
    setActionError(null);
    setAviso(null);
    setBusy(true);
    try {
      await fn();
      setAviso(mensaje);
      setCobrando(false);
      reload();
      historial.reload();
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

  const confirmarPago = (pagos, { recibido }) => ejecutar(
    () => api.post(`/pedidos/${id}/pagos`, { pagos, efectivo_recibido: recibido }),
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
        <BotonesDocumento path={`/pedidos/${id}/pdf`} nombre={`${p.codigo}.pdf`} onError={setActionError} etiquetaVer="Ver comprobante" />
        {tiene('cancelar') && (
          <button className="btn btn-outline-danger" disabled={busy}
            onClick={() => window.confirm('¿Cancelar el pedido? Se devuelve el stock y se anulan los pagos registrados (la devolución del dinero es aparte).')
              && ejecutar(() => api.post(`/pedidos/${id}/cancelar`), `Pedido ${p.codigo} cancelado.`)}>
            Cancelar pedido
          </button>
        )}
        {tiene('anular-reembolso') && (
          <button className="btn btn-outline-danger" disabled={busy} onClick={() => { setMotivo(''); setAnulando(true); }}>
            <i className="bi bi-arrow-counterclockwise me-1" />Anular y reembolsar
          </button>
        )}
        <Link to="/pedidos" className="btn btn-outline-secondary">Volver</Link>
      </PageHeader>

      {anulando && (
        <Seccion titulo="Anular y reembolsar por Webpay" icono="bi-arrow-counterclockwise" className="border-danger">
          <p className="mb-2">
            Se devuelven <strong>{money(p.total_a_pagar ?? p.total)}</strong> a la tarjeta del cliente por Webpay, el pedido queda
            «Cancelado» y sus productos vuelven al inventario. No se puede deshacer.
          </p>
          <label htmlFor="motivo-anulacion" className="form-label">Motivo (lo verá quien revise el pedido)</label>
          <textarea id="motivo-anulacion" className="form-control mb-2" rows="2" maxLength={300} value={motivo}
            placeholder="Por ejemplo: sin stock del producto en la farmacia" onChange={(e) => setMotivo(e.target.value)} />
          <div className="d-flex gap-2">
            <button className="btn btn-danger" disabled={busy || motivo.trim().length < 5}
              onClick={() => ejecutar(async () => { await api.post(`/pedidos/${id}/anular-reembolso`, { motivo }); setAnulando(false); },
                `Pedido ${p.codigo} anulado y reembolsado por Webpay.`)}>
              {busy ? 'Reembolsando…' : 'Anular y reembolsar'}
            </button>
            <button className="btn btn-outline-secondary" disabled={busy} onClick={() => setAnulando(false)}>Volver</button>
          </div>
        </Seccion>
      )}

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

      <div className="row g-3">
        <div className="col-lg-7">
          <Seccion titulo="Datos del pedido" icono="bi-info-circle">
            <Ficha filas={[
              ['Estado', <span className={`badge text-bg-${estadoPedidoClase[p.estado] ?? 'light'}`}>{p.estado}</span>],
              ['Cliente', <>{p.nombre_cliente}{p.telefono && <span className="text-muted"> · {p.telefono}</span>}</>],
              ['Entrega', p.tipo_entrega === 'retiro' ? `Retiro en ${p.sucursal}`
                : [p.tipo_entrega === 'despacho' && 'Despacho a', [p.direccion_pedido, p.comuna].filter(Boolean).join(', ')].filter(Boolean).join(' ') || '—'],
              ['Sucursal', p.sucursal ?? '—'],
              ['Canal', p.canal],
              ['Creado', `${fechaHora(p.fecha)}${p.vendedor ? ` por ${p.vendedor}` : ''}`],
            ]} />
          </Seccion>
        </div>
        <div className="col-lg-5">
          <Seccion titulo="Totales" icono="bi-receipt">
            <div className="fc-total-bloque">
              <div>Subtotal: <strong>{money(p.subtotal_bruto)}</strong></div>
              {p.descuento_total > 0 && <div className="text-success">Descuentos: <strong>-{money(p.descuento_total)}</strong></div>}
              <div className="text-muted small">Neto {money(p.subtotal_neto)} · IVA {money(p.iva)}</div>
              <div className="fc-total-importe">{money(p.total)}</div>
              {Number(p.costo_despacho) > 0 && (
                <div className="small">Despacho: <strong>{money(p.costo_despacho)}</strong> · Total pagado <strong>{money(p.total_a_pagar)}</strong></div>
              )}
              {Number(p.redondeo) !== 0 && (
                <div className="small">Redondeo del efectivo (Ley 20.956): <strong>{textoAjuste(Number(p.redondeo), money)}</strong>
                  <br />Total cobrado <strong>{money(Number(p.total) + Number(p.redondeo))}</strong></div>
              )}
            </div>
          </Seccion>
        </div>
      </div>

      <Seccion titulo="Productos" icono="bi-box-seam" plano>
        <div className="table-responsive">
          <table className="table align-middle">
            <thead><tr><th>SKU</th><th>Producto</th><th className="text-end">Cant.</th><th className="text-end">Precio unit.</th><th className="text-end">Descuento</th><th className="text-end">Subtotal</th></tr></thead>
            <tbody>
              {p.lineas.map((l) => (
                <tr key={l.id}>
                  <td className="text-nowrap">{l.sku}</td><td>{l.nombre_producto}{l.regla && <span className="badge text-bg-success ms-2">{l.regla}</span>}</td>
                  <td className="text-end">{l.cantidad}</td><td className="text-end">{money(l.precio_unitario)}</td>
                  <td className="text-end">{Number(l.descuento_monto) ? `-${money(l.descuento_monto)}` : '—'}</td>
                  <td className="text-end">{money(l.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      {cobrando && (
        <PanelPago total={Number(p.total)} medios={medios} busy={busy} onConfirmar={confirmarPago} onCancelar={() => setCobrando(false)}
          ayuda="Si el pedido aún no tiene stock reservado, se reserva al confirmar el pago." />
      )}

      <Seccion titulo="Pagos" icono="bi-cash-coin" plano={p.pagos.length > 0}>
        {p.pagos.length === 0 ? <span className="text-muted">Sin pagos registrados.</span> : (
          <div className="table-responsive">
            <table className="table table-sm">
              <thead><tr><th>Fecha</th><th>Medio</th><th>Autorización</th><th>Estado</th><th className="text-end">Monto</th></tr></thead>
              <tbody>
                {p.pagos.map((x) => (
                  <tr key={x.id}>
                    <td>{fechaHora(x.fecha_transaccion)}</td>
                    <td>{x.medio_pago}{x.monto_recibido != null && <small className="text-muted d-block">Recibido {money(x.monto_recibido)} · vuelto {money(x.vuelto)}</small>}</td>
                    <td>{x.codigo_autorizacion ?? '—'}</td>
                    <td><span className={`badge text-bg-${x.estado === 'Aprobado' ? 'success' : x.estado === 'Reembolsado' ? 'warning' : 'secondary'}`}>{x.estado}</span></td>
                    <td className="text-end">{money(x.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {p.reembolsos?.length > 0 && (
        <Seccion titulo="Reembolsos por Webpay" icono="bi-arrow-counterclockwise" plano>
          <div className="table-responsive">
            <table className="table table-sm mb-0">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Autorización</th><th>Motivo</th><th>Quién</th><th className="text-end">Monto</th></tr></thead>
              <tbody>
                {p.reembolsos.map((x) => (
                  <tr key={x.id}>
                    <td className="text-nowrap">{fechaHora(x.fecha)}</td>
                    <td>{x.tipo === 'REVERSED' ? 'Reversa' : 'Anulación'}</td>
                    <td>{x.codigo_autorizacion ?? '—'}</td>
                    <td>{x.motivo}</td>
                    <td>{x.usuario}</td>
                    <td className="text-end">{money(x.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      <Seccion titulo="Historial de estados" icono="bi-clock-history" plano={(historial.data?.length ?? 0) > 0}>
        {historial.error ? <ErrorAlert error={historial.error} /> : !historial.data ? <Spinner /> : historial.data.length === 0
          ? <span className="text-muted">Sin cambios registrados.</span> : (
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead><tr><th>Fecha</th><th>Cambio</th><th>Quién</th></tr></thead>
                <tbody>
                  {historial.data.map((h) => (
                    <tr key={h.id}>
                      <td className="text-nowrap">{fechaHora(h.fecha)}</td>
                      <td>{h.estado_anterior ? <>{h.estado_anterior} <i className="bi bi-arrow-right mx-1" /></> : 'Creado en '}
                        <span className={`badge text-bg-${estadoPedidoClase[h.estado] ?? 'light'}`}>{h.estado}</span></td>
                      <td>{h.usuario ? <>{h.usuario}{h.rol && <span className="text-muted small"> · {h.rol}</span>}</> : <span className="text-muted">Automático</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Seccion>

      {['Pagado', 'En preparación', 'Listo para retiro', 'En despacho', 'Entregado'].includes(p.estado) && (
        <Seccion titulo="Enviar comprobante por correo" icono="bi-envelope">
          <EnviarCorreo ruta={`/pedidos/${id}/enviar`} />
        </Seccion>
      )}

      {/* Otros módulos (p. ej. devoluciones) agregan aquí sus secciones. */}
      <Slot nombre="pedido.detalle" pedido={p} />
    </>
  );
}
