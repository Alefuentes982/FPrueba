import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../AuthContext.jsx';
import { fechaCorta, money, soloFecha } from '../../format.js';
import BotonesDocumento from '../../components/BotonesDocumento.jsx';
import { estadoOcClase } from './estados.js';
import { ErrorAlert, errorCampo, Ficha, PageHeader, Seccion, Spinner, useAsync } from '../../components/ui.jsx';

// Recepción con vida útil mínima (HU-87): el vencimiento no puede ser anterior a la fecha mínima. El Administrador o el
// Jefe de local pueden aceptar un lote bajo el mínimo escribiendo el motivo. Los errores de la API marcan su fila (HU-88).
const PUEDEN_EXCEPTUAR = ['Administrador', 'Jefe de local'];

export default function OrdenCompraDetalle() {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const { data: o, error, loading, reload } = useAsync(() => api.get(`/ordenes-compra/${id}`), [id]);
  const vida = useAsync(() => api.get('/ordenes-compra/parametros/vida-util'), []);
  const [enviados, setEnviados] = useState([]); // detalle_id en el orden en que se enviaron (para ubicar los errores)
  const [aviso, setAviso] = useState(location.state?.aviso ?? null);
  const [actionError, setActionError] = useState(null);
  const [recibiendo, setRecibiendo] = useState(false);
  const [rec, setRec] = useState({}); // detalle_id -> { cantidad, numero_lote, fecha_vencimiento }
  const [busy, setBusy] = useState(false);

  const ejecutar = async (fn, mensaje) => {
    setActionError(null);
    setAviso(null);
    setBusy(true);
    try {
      await fn();
      if (mensaje) setAviso(mensaje);
      setRecibiendo(false);
      setRec({});
      reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !o) return <Spinner />;
  if (error) return <ErrorAlert error={error} />;
  if (!o) return <Spinner />;

  const sinRecepciones = o.items.every((i) => i.cantidad_recibida === 0);
  const esBorrador = o.estado === 'Borrador';
  const cancelable = (esBorrador || o.estado === 'Pendiente') && sinRecepciones;
  const recibible = o.estado === 'Pendiente' || o.estado === 'Recibida parcial';

  const setLinea = (detId, cambios) => setRec((r) => ({ ...r, [detId]: { ...r[detId], ...cambios } }));
  const preparar = () => {
    const inicial = {};
    o.items.forEach((i) => { inicial[i.id] = { cantidad: String(i.cantidad_solicitada - i.cantidad_recibida), numero_lote: '', fecha_vencimiento: '' }; });
    setRec(inicial);
    setRecibiendo(true);
  };

  const minima = vida.data?.fecha_minima ?? null;
  const puedeExceptuar = PUEDEN_EXCEPTUAR.includes(user?.rol);
  const bajoMinimo = (detId) => Boolean(minima && rec[detId]?.fecha_vencimiento && rec[detId].fecha_vencimiento < minima);
  // Error de la API para el campo de una línea de la tabla.
  const errorLinea = (detId, campo) => {
    const i = enviados.indexOf(detId);
    return i >= 0 ? errorCampo(actionError, `items.${i}.${campo}`) : null;
  };

  const confirmarRecepcion = () => ejecutar(() => {
    const items = o.items
      .filter((i) => Number(rec[i.id]?.cantidad) > 0)
      .map((i) => ({
        detalle_id: i.id,
        cantidad: Number(rec[i.id].cantidad),
        numero_lote: rec[i.id].numero_lote || null,
        fecha_vencimiento: rec[i.id].fecha_vencimiento || null,
        excepcion_motivo: bajoMinimo(i.id) ? (rec[i.id].excepcion_motivo || null) : null,
      }));
    setEnviados(items.map((x) => x.detalle_id));
    return api.post(`/ordenes-compra/${id}/recibir`, { items });
  }, 'Recepción registrada.');

  return (
    <>
      <PageHeader title={`Orden de compra ${o.codigo}`}>
        {esBorrador && <Link to={`/ordenes-compra/${id}/editar`} className="btn btn-outline-primary"><i className="bi bi-pencil me-1" />Editar</Link>}
        {esBorrador && (
          <button className="btn btn-primary" disabled={busy}
            onClick={() => window.confirm('Al emitir la orden ya no podrá modificarse. ¿Desea continuar?')
              && ejecutar(() => api.post(`/ordenes-compra/${id}/emitir`), `Orden ${o.codigo} emitida.`)}>
            <i className="bi bi-send me-1" />Emitir
          </button>
        )}
        <BotonesDocumento path={`/ordenes-compra/${id}/pdf`} nombre={`${o.codigo}.pdf`} onError={setActionError} etiquetaVer="Ver PDF" />
        {cancelable && (
          <button className="btn btn-outline-danger" disabled={busy}
            onClick={() => window.confirm('¿Cancelar esta orden de compra?')
              && ejecutar(() => api.post(`/ordenes-compra/${id}/cancelar`), `Orden ${o.codigo} cancelada.`)}>
            Cancelar orden
          </button>
        )}
        {recibible && !recibiendo && <button className="btn btn-success" onClick={preparar}><i className="bi bi-box-seam me-1" />Registrar recepción</button>}
        <Link to="/ordenes-compra" className="btn btn-outline-secondary">Volver</Link>
      </PageHeader>

      {aviso && (
        <div className="alert alert-success d-flex justify-content-between" role="status">
          <span>{aviso}</span>
          <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setAviso(null)} />
        </div>
      )}
      <ErrorAlert error={actionError} onClose={() => setActionError(null)} />
      {esBorrador && (
        <div className="alert alert-secondary py-2">
          Esta orden es un <strong>borrador</strong>: aún no se envía al proveedor y no se puede recibir. Emítala cuando esté lista.
        </div>
      )}

      <div className="row g-3">
        <div className="col-lg-7">
          <Seccion titulo="Datos de la orden" icono="bi-info-circle">
            <Ficha filas={[
              ['Estado', <span className={`badge text-bg-${estadoOcClase[o.estado] ?? 'light'}`}>{o.estado}</span>],
              ['Proveedor', <>{o.proveedor} <span className="text-muted">({o.proveedor_rut})</span></>],
              ['Sucursal', o.sucursal],
              ['Creada', `${fechaCorta(o.fecha)} por ${o.usuario}`],
              ['Entrega esperada', soloFecha(o.fecha_esperada)],
            ]} />
          </Seccion>
        </div>
        <div className="col-lg-5">
          <Seccion titulo="Totales" icono="bi-receipt">
            <div className="fc-total-bloque">
              <div>Neto: <strong>{money(o.subtotal_neto)}</strong></div>
              <div>IVA: <strong>{money(o.iva)}</strong></div>
              <div className="fc-total-importe">{money(o.total)}</div>
            </div>
          </Seccion>
        </div>
      </div>

      <Seccion titulo="Productos de la orden" icono="bi-box-seam" plano>
      <div className="table-responsive">
        <table className="table align-middle">
          <thead>
            <tr>
              <th>SKU</th><th>Producto</th><th className="text-end">Solicitado</th><th className="text-end">Recibido</th>
              <th className="text-end">Costo unit.</th><th className="text-end">Subtotal</th>
              {recibiendo && <><th style={{ width: 110 }}>Recibir ahora</th><th style={{ width: 150 }}>N° lote</th><th style={{ width: 220 }}>Vencimiento</th></>}
            </tr>
          </thead>
          <tbody>
            {o.items.map((i) => {
              const pendiente = i.cantidad_solicitada - i.cantidad_recibida;
              return (
                <tr key={i.id}>
                  <td className="text-nowrap">{i.sku}</td><td>{i.producto}</td>
                  <td className="text-end">{i.cantidad_solicitada}</td>
                  <td className="text-end">{i.cantidad_recibida}</td>
                  <td className="text-end">{money(i.costo_unitario)}</td>
                  <td className="text-end">{money(i.cantidad_solicitada * i.costo_unitario)}</td>
                  {recibiendo && (pendiente > 0 ? (
                    <>
                      <td>
                        <input type="number" min="0" max={pendiente} aria-label={`Recibir ahora de ${i.producto}`}
                          className={`form-control form-control-sm${errorLinea(i.id, 'cantidad') ? ' is-invalid' : ''}`}
                          value={rec[i.id]?.cantidad ?? ''} onChange={(e) => setLinea(i.id, { cantidad: e.target.value })} />
                        {errorLinea(i.id, 'cantidad') && <div className="invalid-feedback">{errorLinea(i.id, 'cantidad')}</div>}
                      </td>
                      <td>
                        <input maxLength={50} aria-label={`Número de lote de ${i.producto}`}
                          className={`form-control form-control-sm${errorLinea(i.id, 'numero_lote') ? ' is-invalid' : ''}`}
                          required={i.requiere_lote && Number(rec[i.id]?.cantidad) > 0} placeholder={i.requiere_lote ? 'Obligatorio' : 'Opcional'}
                          value={rec[i.id]?.numero_lote ?? ''} onChange={(e) => setLinea(i.id, { numero_lote: e.target.value })} />
                        {errorLinea(i.id, 'numero_lote') && <div className="invalid-feedback">{errorLinea(i.id, 'numero_lote')}</div>}
                      </td>
                      <td>
                        <input type="date" min={puedeExceptuar ? undefined : minima ?? undefined} aria-label={`Vencimiento de ${i.producto}`}
                          className={`form-control form-control-sm${errorLinea(i.id, 'fecha_vencimiento') ? ' is-invalid' : bajoMinimo(i.id) ? ' border-warning' : ''}`}
                          required={i.requiere_vencimiento && Number(rec[i.id]?.cantidad) > 0}
                          value={rec[i.id]?.fecha_vencimiento ?? ''} onChange={(e) => setLinea(i.id, { fecha_vencimiento: e.target.value })} />
                        {errorLinea(i.id, 'fecha_vencimiento') && <div className="invalid-feedback">{errorLinea(i.id, 'fecha_vencimiento')}</div>}
                        {!errorLinea(i.id, 'fecha_vencimiento') && bajoMinimo(i.id) && (
                          <div className="small text-warning-emphasis mt-1">Vence antes del mínimo ({soloFecha(minima)}).</div>
                        )}
                        {bajoMinimo(i.id) && puedeExceptuar && (
                          <>
                            <input maxLength={300} aria-label={`Motivo para aceptar el lote de ${i.producto}`} placeholder="Motivo para aceptarlo igual"
                              className={`form-control form-control-sm mt-1${errorLinea(i.id, 'excepcion_vida_util') || errorLinea(i.id, 'excepcion_motivo') ? ' is-invalid' : ''}`}
                              value={rec[i.id]?.excepcion_motivo ?? ''} onChange={(e) => setLinea(i.id, { excepcion_motivo: e.target.value })} />
                            {(errorLinea(i.id, 'excepcion_vida_util') || errorLinea(i.id, 'excepcion_motivo')) && (
                              <div className="invalid-feedback">{errorLinea(i.id, 'excepcion_vida_util') || errorLinea(i.id, 'excepcion_motivo')}</div>
                            )}
                          </>
                        )}
                      </td>
                    </>
                  ) : <td colSpan="3" className="text-muted small">Completa</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </Seccion>

      {recibiendo && (
        <div className="d-flex gap-2">
          <button className="btn btn-success" disabled={busy} onClick={confirmarRecepcion}>{busy ? 'Registrando…' : 'Confirmar recepción'}</button>
          <button className="btn btn-outline-secondary" disabled={busy} onClick={() => setRecibiendo(false)}>Cancelar</button>
          <span className="text-muted small align-self-center">
            Suma stock al kardex y recalcula el costo del producto (PMP).
            {vida.data && <> Vida útil mínima: {vida.data.meses} {Number(vida.data.meses) === 1 ? 'mes' : 'meses'} (vencimiento desde el {soloFecha(minima)}).</>}
          </span>
        </div>
      )}
    </>
  );
}
