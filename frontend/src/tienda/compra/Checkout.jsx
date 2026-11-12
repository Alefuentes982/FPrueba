import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { money } from '../../format.js';
import { pedidosApi } from '../apiTienda.js';
import { useCarrito } from '../CarritoContext.jsx';
import { Aviso, Cargando, ImagenProducto } from '../comunes.jsx';
import { FARMACIA } from '../contenido.js';
import { useCuenta } from '../CuentaContext.jsx';
import { Campo, erroresPorCampo, SelectorComuna } from '../cuenta/Campos.jsx';
import PanelLateral from '../ui/PanelLateral.jsx';
import { useNotificar } from '../ui/Notificaciones.jsx';
import { Pasos } from './Pasos.jsx';
import '../cuenta/cuenta.css';
import './compra.css';

export const hora = (iso) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Santiago' });

// Checkout (HU-71): forma de entrega y datos de contacto. Al confirmar se crea el pedido en "Pago pendiente" y se
// reservan los productos por 20 minutos mientras el cliente paga. Precios, stock y totales los calcula el servidor.
export default function Checkout() {
  const { cliente, cargando } = useCuenta();
  const { items } = useCarrito();
  if (cargando) return <Cargando />;
  if (!cliente) return <Navigate to="/tienda/cuenta?volver=/tienda/checkout" replace />;
  if (items.length === 0) return <Navigate to="/tienda/carrito" replace />;
  return <FormularioCheckout items={items} />;
}

function FormularioCheckout({ items }) {
  const navigate = useNavigate();
  const notificar = useNotificar();
  const [opciones, setOpciones] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const [entrega, setEntrega] = useState('retiro');
  const [sucursalId, setSucursalId] = useState('');
  const [direccion, setDireccion] = useState('');
  const [comunaId, setComunaId] = useState('');
  const [telefono, setTelefono] = useState('');
  const [verProductos, setVerProductos] = useState(false);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const clave = useMemo(() => JSON.stringify(items), [items]);
  useEffect(() => {
    let vigente = true;
    pedidosApi.opciones(items)
      .then((o) => {
        if (!vigente) return;
        setOpciones(o);
        setTelefono((t) => t || (o.cliente?.telefono ?? '').replace(/^\+56/, ''));
        setDireccion((d) => d || o.cliente?.direccion || '');
        setComunaId((c) => c || o.cliente?.comuna_id || '');
        setSucursalId((s) => s || o.retiro.find((x) => x.alcanza)?.id || '');
      })
      .catch((e) => vigente && setErrorCarga(e));
    return () => { vigente = false; };
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  if (errorCarga) return <div className="fct-wrap fct-pagina"><Aviso error={errorCarga} /></div>;
  if (!opciones) return <Cargando />;

  const c = opciones.cotizacion;
  const ningunaRetiro = !opciones.retiro.some((s) => s.alcanza);
  const campos = erroresPorCampo(error);

  const confirmar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError(null);
    const datos = entrega === 'retiro'
      ? { entrega, items, sucursal_id: sucursalId, telefono }
      : { entrega, items, direccion, comuna_id: comunaId, telefono };
    try {
      const pedido = await pedidosApi.crear(datos);
      notificar({ titulo: `Pedido ${pedido.codigo} reservado`, texto: `Tienes hasta las ${hora(pedido.vence)} para pagar.`, icono: 'bi-bag-check-fill' });
      navigate(`/tienda/pedido/${pedido.id}`);
    } catch (err) {
      setError(err);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fct-wrap fct-pagina">
      <Pasos actual={2} />
      <h1 className="fct-h1">Datos y entrega</h1>
      {!c.puede_continuar && (
        <Aviso error={{ message: 'Tu carro cambió: hay productos agotados o con menos stock. Revísalo antes de seguir.' }} />
      )}
      {error && !error.details && <Aviso error={error} />}
      <form className="fct-checkout" onSubmit={confirmar} noValidate>
        <div className="fct-checkout-cuerpo">
          <section className="fct-bloque-form" aria-labelledby="titulo-entrega">
            <h2 id="titulo-entrega">¿Cómo recibes tu pedido?</h2>
            <div className="fct-opciones-entrega" role="radiogroup" aria-label="Forma de entrega">
              <label className={entrega === 'retiro' ? 'activo' : ''}>
                <input type="radio" name="entrega" value="retiro" checked={entrega === 'retiro'} onChange={() => setEntrega('retiro')} />
                <i className="bi bi-shop" aria-hidden="true" />
                <span><b>Retiro en farmacia</b><small>Sin costo{FARMACIA.horaCorteRetiro ? ` · el mismo día si pagas antes de las ${FARMACIA.horaCorteRetiro}` : ''}</small></span>
              </label>
              <label className={`${entrega === 'despacho' ? 'activo' : ''}${opciones.despacho.disponible ? '' : ' deshabilitado'}`}>
                <input type="radio" name="entrega" value="despacho" checked={entrega === 'despacho'} disabled={!opciones.despacho.disponible} onChange={() => setEntrega('despacho')} />
                <i className="bi bi-truck" aria-hidden="true" />
                <span><b>Despacho a domicilio</b><small>{opciones.despacho.disponible ? 'Sin costo por ahora' : 'Ninguna farmacia tiene todo tu pedido junto'}</small></span>
              </label>
            </div>

            {entrega === 'retiro' ? (
              <div className="fct-sucursales" role="radiogroup" aria-label="Farmacia donde retiras">
                {ningunaRetiro && <Aviso error={{ message: 'Ninguna farmacia tiene todo tu pedido. Ajusta las cantidades del carro.' }} />}
                {opciones.retiro.map((s) => (
                  <label key={s.id} className={`${sucursalId === s.id ? 'activo' : ''}${s.alcanza ? '' : ' deshabilitado'}`}>
                    <input type="radio" name="sucursal" value={s.id} checked={sucursalId === s.id} disabled={!s.alcanza} onChange={() => setSucursalId(s.id)} />
                    <span>
                      <b>{s.nombre}</b>
                      <small>{[s.direccion, s.comuna].filter(Boolean).join(', ')}</small>
                      {s.alcanza
                        ? <small className="fct-ok"><i className="bi bi-check-circle" aria-hidden="true" />Tiene todo tu pedido</small>
                        : <small className="fct-no">Le {s.faltan === 1 ? 'falta 1 producto' : `faltan ${s.faltan} productos`}</small>}
                    </span>
                  </label>
                ))}
                {campos.sucursal_id && <small className="fct-campo-mensaje">{campos.sucursal_id}</small>}
              </div>
            ) : (
              <div className="fct-form fct-form-2">
                <Campo etiqueta="Dirección de despacho" error={campos.direccion} className="fct-ancho" ayuda={`Despacha ${opciones.despacho.sucursal}.`}>
                  {(a) => <input {...a} autoComplete="street-address" value={direccion} onChange={(e) => setDireccion(e.target.value)} maxLength={200} />}
                </Campo>
                <SelectorComuna comunaId={comunaId} onCambiar={setComunaId} error={campos.comuna_id} />
              </div>
            )}
          </section>

          <section className="fct-bloque-form" aria-labelledby="titulo-contacto">
            <h2 id="titulo-contacto">Contacto</h2>
            <div className="fct-form fct-form-2">
              <Campo etiqueta="Nombre">{(a) => <input {...a} value={opciones.cliente?.nombre ?? ''} readOnly />}</Campo>
              <Campo etiqueta="Teléfono" error={campos.telefono} ayuda="Te llamamos solo si hay un problema con el pedido">
                {(a) => <input {...a} type="tel" autoComplete="tel-national" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={16} />}
              </Campo>
            </div>
          </section>
        </div>

        <aside className="fct-resumen">
          <h2>Resumen</h2>
          <button type="button" className="fct-ver-productos" onClick={() => setVerProductos(true)} aria-haspopup="dialog">
            <span>{c.unidades === 1 ? '1 unidad' : `${c.unidades} unidades`}</span>
            <span>Ver productos<i className="bi bi-chevron-right" aria-hidden="true" /></span>
          </button>
          <div className="fct-fila"><span>Productos</span><b>{money(c.subtotal_bruto)}</b></div>
          {c.descuento_total > 0 && <div className="fct-fila fct-fila-descuento"><span>Descuentos</span><b>-{money(c.descuento_total)}</b></div>}
          <div className="fct-fila"><span>{entrega === 'retiro' ? 'Retiro en farmacia' : 'Despacho'}</span><b>Gratis</b></div>
          <div className="fct-total"><span>Total</span><b>{money(c.total)}</b></div>
          <p className="fct-nota">IVA incluido ({money(c.iva)}). Reservamos tus productos por {opciones.reserva_minutos} minutos mientras pagas.</p>
          <button type="submit" className="fct-btn-primario" disabled={enviando || !c.puede_continuar || (entrega === 'retiro' && !sucursalId)}>
            {enviando ? 'Reservando…' : 'Reservar y continuar al pago'}
          </button>
          <Link to="/tienda/carrito" className="fct-seguir">Volver al carro</Link>
        </aside>
      </form>

      <PanelLateral abierto={verProductos} onCerrar={() => setVerProductos(false)} titulo="Tu pedido" lado="end" id="fct-panel-productos">
        <ul className="fct-panel-productos">
          {c.lineas.map((l) => (
            <li key={l.producto_id}>
              <ImagenProducto producto={{ ...l, id: l.producto_id }} className="fct-linea-foto" />
              <span><b>{l.nombre}</b><small>{l.cantidad} × {money(l.precio_unitario)}{l.descuento > 0 ? ` · ${l.regla}` : ''}</small></span>
              <b>{money(l.subtotal)}</b>
            </li>
          ))}
        </ul>
      </PanelLateral>
    </div>
  );
}
