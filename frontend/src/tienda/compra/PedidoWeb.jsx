import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { money } from '../../format.js';
import { pedidosApi } from '../apiTienda.js';
import { useCarrito } from '../CarritoContext.jsx';
import { Aviso, Cargando } from '../comunes.jsx';
import { FUNCIONES } from '../contenido.js';
import { useCuenta } from '../CuentaContext.jsx';
import Modal from '../ui/Modal.jsx';
import { useNotificar } from '../ui/Notificaciones.jsx';
import { hora } from './Checkout.jsx';
import PagoWebpay from './PagoWebpay.jsx';
import { Pasos } from './Pasos.jsx';
import './compra.css';

// Pedido web del cliente (HU-71): estado, tiempo que queda para pagar, entrega y productos. Desde aquí se anula y se
// paga con Webpay (HU-72); Webpay devuelve aquí al cliente con ?pago=<resultado>.
export default function PedidoWeb() {
  const { id } = useParams();
  const { cliente, cargando } = useCuenta();
  if (cargando) return <Cargando />;
  if (!cliente) return <Navigate to={`/tienda/cuenta?volver=${encodeURIComponent(`/tienda/pedido/${id}`)}`} replace />;
  return <DetallePedido id={id} />;
}

// Segundos que faltan hasta `vence`, actualizados cada segundo.
export function useCuentaRegresiva(vence) {
  const calcular = useCallback(() => (vence ? Math.max(0, Math.floor((new Date(vence) - Date.now()) / 1000)) : 0), [vence]);
  const [segundos, setSegundos] = useState(calcular);
  useEffect(() => {
    setSegundos(calcular());
    if (!vence) return undefined;
    const t = setInterval(() => setSegundos(calcular()), 1000);
    return () => clearInterval(t);
  }, [vence, calcular]);
  return segundos;
}

const reloj = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function usePedido(id) {
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState(null);
  const recargar = useCallback(() => pedidosApi.ver(id).then((p) => { setPedido(p); setError(null); return p; }).catch(setError), [id]);
  useEffect(() => { recargar(); }, [recargar]);
  return { pedido, setPedido, error, recargar };
}

function DetallePedido({ id }) {
  const navigate = useNavigate();
  const notificar = useNotificar();
  const { search } = useLocation();
  const { vaciar } = useCarrito();
  const [resultadoPago] = useState(() => new URLSearchParams(search).get('pago'));
  const { pedido: p, setPedido, error, recargar } = usePedido(id);
  const segundos = useCuentaRegresiva(p?.vence);
  const [confirmarAnular, setConfirmarAnular] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);

  // Al volver de Webpay: se quita ?pago= de la dirección (al recargar no se repite el mensaje) y, si el pedido quedó
  // pagado, se vacía el carro.
  useEffect(() => { if (resultadoPago) window.history.replaceState(null, '', window.location.pathname); }, [resultadoPago]);
  const pagado = p && !['Pago pendiente', 'Cancelado', 'Expirado'].includes(p.estado);
  useEffect(() => { if (pagado && resultadoPago === 'aprobado') vaciar(); }, [pagado, resultadoPago, vaciar]);

  // Al llegar a cero se vuelve a consultar: la API marca el pedido como expirado (puede tardar hasta un minuto).
  const pendiente = p?.estado === 'Pago pendiente';
  useEffect(() => {
    if (!pendiente || segundos > 0) return undefined;
    const t = setInterval(recargar, 15000);
    return () => clearInterval(t);
  }, [pendiente, segundos, recargar]);

  if (error) return <div className="fct-wrap fct-pagina"><Aviso error={error} /><Link to="/tienda" className="fct-btn-borde">Ir a la tienda</Link></div>;
  if (!p) return <Cargando />;

  const anular = async () => {
    setAnulando(true); setErrorAccion(null);
    try {
      setPedido(await pedidosApi.cancelar(p.id));
      setConfirmarAnular(false);
      notificar({ titulo: 'Pedido anulado', texto: 'Liberamos los productos. Tu carro sigue guardado.', icono: 'bi-x-circle-fill' });
    } catch (err) {
      setErrorAccion(err);
    } finally {
      setAnulando(false);
    }
  };

  return (
    <div className="fct-wrap fct-pagina">
      {pendiente && <Pasos actual={3} />}
      <div className="fct-pedido-titulo">
        <h1>Pedido {p.codigo}</h1>
        <span className={`fct-estado fct-estado-${p.estado.toLowerCase().replace(/\s+/g, '-')}`}>{p.estado}</span>
      </div>

      {resultadoPago && <ResultadoPago resultado={resultadoPago} pedido={p} />}
      <EstadoPedido pedido={p} segundos={segundos} />
      {errorAccion && <Aviso error={errorAccion} />}

      <div className="fct-checkout">
        <div className="fct-checkout-cuerpo">
          {pendiente && (
            <section className="fct-bloque-form fct-zona-pago" aria-labelledby="titulo-pago">
              <h2 id="titulo-pago">Pago</h2>
              {FUNCIONES.pago && segundos > 0
                ? <PagoWebpay pedido={p} onError={setErrorAccion} texto={resultadoPago && resultadoPago !== 'aprobado' ? 'Intentar de nuevo' : 'Pagar con Webpay'} />
                : <p className="fct-suave">El pago en línea estará disponible muy pronto. Mientras tanto, tu pedido queda reservado hasta las {hora(p.vence)}.</p>}
            </section>
          )}

          <section className="fct-bloque-form" aria-labelledby="titulo-entrega">
            <h2 id="titulo-entrega">{p.entrega === 'despacho' ? 'Despacho a domicilio' : 'Retiro en farmacia'}</h2>
            <dl className="fct-datos">
              {p.entrega === 'despacho' ? (
                <>
                  <div><dt>Dirección</dt><dd>{[p.direccion, p.comuna].filter(Boolean).join(', ')}</dd></div>
                  <div><dt>Despacha</dt><dd>{p.sucursal.nombre}</dd></div>
                </>
              ) : (
                <>
                  <div><dt>Farmacia</dt><dd>{p.sucursal.nombre}</dd></div>
                  <div><dt>Dirección</dt><dd>{p.sucursal.direccion || '—'}</dd></div>
                </>
              )}
              <div><dt>Nombre</dt><dd>{p.nombre}</dd></div>
              <div><dt>Teléfono</dt><dd>{p.telefono}</dd></div>
            </dl>
            {p.entrega !== 'despacho' && <p className="fct-nota">Para retirar te pediremos el número de pedido y tu RUT.</p>}
          </section>

          <section className="fct-bloque-form" aria-labelledby="titulo-productos">
            <h2 id="titulo-productos">Productos</h2>
            <ul className="fct-panel-productos">
              {p.lineas.map((l) => (
                <li key={l.producto_id}>
                  <span><b>{l.nombre}</b><small>{l.cantidad} × {money(l.precio_unitario)}{l.descuento > 0 && l.regla ? ` · ${l.regla}` : ''}</small></span>
                  <b>{money(l.subtotal)}</b>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="fct-resumen">
          <h2>Total</h2>
          <div className="fct-fila"><span>Productos</span><b>{money(p.subtotal_bruto)}</b></div>
          {p.descuento_total > 0 && <div className="fct-fila fct-fila-descuento"><span>Descuentos</span><b>-{money(p.descuento_total)}</b></div>}
          <div className="fct-fila"><span>{p.entrega === 'despacho' ? 'Despacho' : 'Retiro'}</span><b>Gratis</b></div>
          <div className="fct-total"><span>Total</span><b>{money(p.total)}</b></div>
          <p className="fct-nota">IVA incluido ({money(p.iva)}).</p>
          {p.puede_cancelar && (
            <button type="button" className="fct-btn-borde fct-ancho-completo" onClick={() => setConfirmarAnular(true)}>Anular pedido</button>
          )}
          {!pendiente && <button type="button" className="fct-btn-borde fct-ancho-completo" onClick={() => navigate('/tienda/productos')}>Seguir comprando</button>}
        </aside>
      </div>

      <Modal abierto={confirmarAnular} onCerrar={() => setConfirmarAnular(false)} titulo="¿Anular el pedido?" tamano="sm">
        <p>Liberamos los productos reservados y el pedido {p.codigo} queda anulado. Tu carro sigue guardado por si quieres volver a intentarlo.</p>
        <div className="fct-modal-acciones">
          <button type="button" className="fct-btn-borde" onClick={() => setConfirmarAnular(false)}>Volver</button>
          <button type="button" className="fct-btn-primario fct-btn-peligro" disabled={anulando} onClick={anular}>{anulando ? 'Anulando…' : 'Sí, anular'}</button>
        </div>
      </Modal>
    </div>
  );
}

// Mensaje principal según el estado del pedido.
export function EstadoPedido({ pedido: p, segundos }) {
  if (p.estado === 'Pago pendiente') {
    return segundos > 0 ? (
      <div className={`fct-reloj${segundos < 300 ? ' fct-reloj-urgente' : ''}`} role="timer" aria-live="off">
        <i className="bi bi-hourglass-split" aria-hidden="true" />
        <span>Reservamos tus productos hasta las <b>{hora(p.vence)}</b>. Quedan <b>{reloj(segundos)}</b> para pagar.</span>
      </div>
    ) : (
      <Aviso error={{ message: 'Se acabó el tiempo para pagar. Estamos liberando los productos reservados.' }} />
    );
  }
  if (p.estado === 'Expirado') {
    return (
      <div className="fct-estado-caja">
        <Aviso error={{ message: 'El tiempo para pagar terminó y liberamos los productos. No se hizo ningún cargo.' }} />
        <Link to="/tienda/carrito" className="fct-btn-primario">Volver al carro</Link>
      </div>
    );
  }
  if (p.estado === 'Cancelado') {
    return (
      <div className="fct-estado-caja">
        <Aviso>Este pedido fue anulado y sus productos quedaron libres.</Aviso>
        <Link to="/tienda/carrito" className="fct-btn-primario">Volver al carro</Link>
      </div>
    );
  }
  return (
    <div className="fct-exito" role="status">
      <i className="bi bi-check-circle-fill" aria-hidden="true" />
      <span>Tu pedido está pagado. {p.entrega === 'despacho' ? 'Te avisaremos cuando salga a despacho.' : `Te avisaremos cuando esté listo para retirar en ${p.sucursal.nombre}.`}</span>
    </div>
  );
}

// Mensaje al volver de Webpay (?pago=...). El estado real lo da el pedido: este aviso solo explica qué pasó.
function ResultadoPago({ resultado, pedido }) {
  if (resultado === 'aprobado' && pedido.estado !== 'Pago pendiente') {
    const pago = pedido.pagos.find((x) => x.estado === 'Aprobado');
    return (
      <div className="fct-pago-ok" role="status">
        <i className="bi bi-check-circle-fill" aria-hidden="true" />
        <div>
          <b>¡Pago aprobado!</b>
          <span>Pagaste {money(pedido.total)} con Webpay{pago?.codigo_autorizacion ? ` (autorización ${pago.codigo_autorizacion})` : ''}. Guarda el número de pedido {pedido.codigo}.</span>
        </div>
      </div>
    );
  }
  if (resultado === 'aprobado') return null;
  return <Aviso error={{ message: 'El pago no se completó y no se hizo ningún cargo. Puedes intentarlo de nuevo mientras tu pedido esté reservado.' }} />;
}
