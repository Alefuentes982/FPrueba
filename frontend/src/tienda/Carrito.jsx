import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { money } from '../format.js';
import { tiendaApi } from './apiTienda.js';
import { useCarrito } from './CarritoContext.jsx';
import { Aviso, Cargando, ImagenProducto, SelectorCantidad } from './comunes.jsx';
import { MAX_CANTIDAD } from './carrito.js';
import { useCuenta } from './CuentaContext.jsx';
import { FUNCIONES } from './contenido.js';
import { useDatosTienda } from './DatosTienda.jsx';

const MENSAJE = {
  no_disponible: 'Este producto ya no está disponible en la tienda.',
  agotado: 'Se agotó mientras lo tenías en el carro.',
};

// Carro: el navegador guarda producto y cantidad; precios, descuentos, stock y totales los calcula el servidor en
// cada cambio. Solo se puede continuar si todas las líneas se pueden vender. Para continuar hay que ingresar (HU-71).
export default function Carrito() {
  const navigate = useNavigate();
  const { cliente } = useCuenta();
  const { items, cambiar, quitar, vaciar } = useCarrito();
  const { sucursales } = useDatosTienda();
  const [cotizacion, setCotizacion] = useState(null);
  const [error, setError] = useState(null);
  const [actualizando, setActualizando] = useState(false);

  useEffect(() => {
    if (items.length === 0) { setCotizacion(null); return undefined; }
    let vigente = true;
    setActualizando(true);
    const t = setTimeout(() => {
      tiendaApi.cotizar(items)
        .then((c) => vigente && (setCotizacion(c), setError(null)))
        .catch((e) => vigente && setError(e))
        .finally(() => vigente && setActualizando(false));
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="fct-wrap fct-pagina">
        <div className="fct-vacio">
          <i className="bi bi-cart3" aria-hidden="true" />
          <h1>Tu carro está vacío</h1>
          <p>Agrega productos desde la tienda y aquí verás el total con descuentos.</p>
          <Link to="/tienda/productos" className="fct-btn-primario">Ver productos</Link>
        </div>
      </div>
    );
  }
  if (error && !cotizacion) return <div className="fct-wrap fct-pagina"><Aviso error={error} /></div>;
  if (!cotizacion) return <Cargando />;

  const matriz = sucursales[0];
  const lineas = cotizacion.lineas.length;

  return (
    <div className="fct-wrap fct-pagina">
      <ol className="fct-pasos" aria-label="Pasos de la compra">
        <li className="activo" aria-current="step"><span>1</span>Carro</li>
        <li><span>2</span>Datos y entrega</li>
        <li><span>3</span>Pago</li>
      </ol>
      <div className="fct-carro-titulo">
        <h1>Tu carro <small>({lineas} {lineas === 1 ? 'producto' : 'productos'})</small></h1>
        <button type="button" className="fct-enlace" onClick={vaciar}>Vaciar carro</button>
      </div>

      <div className="fct-carro-cuerpo">
        <div>
          <div className="fct-entrega">
            <div className="activo">
              <i className="bi bi-shop" aria-hidden="true" />
              <div><b>Retiro en {matriz ? matriz.nombre : 'la farmacia'}</b><span>Sin costo{matriz?.comuna ? ` · ${matriz.comuna}` : ''}</span></div>
            </div>
            {FUNCIONES.despacho && (
              <div>
                <i className="bi bi-truck" aria-hidden="true" />
                <div><b>Despacho a domicilio</b><span>Lo eliges en el paso siguiente</span></div>
              </div>
            )}
          </div>

          {error && <Aviso error={error} />}
          <div className={`fct-lineas${actualizando ? ' fct-actualizando' : ''}`}>
            {cotizacion.lineas.map((l) => (
              <div className={`fct-linea${l.estado !== 'ok' ? ' fct-linea-problema' : ''}`} key={l.producto_id}>
                <ImagenProducto producto={{ ...l, id: l.producto_id, nombre: l.nombre ?? 'Producto' }} className="fct-linea-foto" />
                <div className="fct-linea-datos">
                  {l.categoria && <small>{l.categoria}</small>}
                  {l.nombre ? <Link to={`/tienda/producto/${l.producto_id}`}>{l.nombre}</Link> : <b>Producto no disponible</b>}
                  {l.presentacion && <small>{l.presentacion}</small>}
                  {l.estado === 'ok' && <span className="fct-ok"><i className="bi bi-shop" aria-hidden="true" />Disponible para retiro</span>}
                  {MENSAJE[l.estado] && <span className="fct-no">{MENSAJE[l.estado]}</span>}
                  {l.estado === 'stock_insuficiente' && (
                    <span className="fct-alerta">
                      <i className="bi bi-exclamation-circle" aria-hidden="true" />Quedan {l.disponible}.{' '}
                      <button type="button" className="fct-enlace" onClick={() => cambiar(l.producto_id, l.disponible, l.disponible)}>Dejar {l.disponible}</button>
                    </span>
                  )}
                  {l.regla && l.descuento > 0 && <span className="fct-oferta"><i className="bi bi-tag" aria-hidden="true" />{l.regla}</span>}
                  <button type="button" className="fct-enlace fct-quitar" onClick={() => quitar(l.producto_id)}>Quitar</button>
                </div>
                {(l.estado === 'ok' || l.estado === 'stock_insuficiente') ? (
                  <SelectorCantidad compacto valor={l.cantidad} max={Math.min(Math.max(l.disponible, l.cantidad), MAX_CANTIDAD)}
                    onCambiar={(n) => cambiar(l.producto_id, n, Math.max(l.disponible, 1))} etiqueta={`Cantidad de ${l.nombre ?? 'producto'}`} />
                ) : <span />}
                <div className="fct-linea-precio">
                  {l.estado === 'ok' && l.descuento > 0 && <s>{money(l.cantidad * l.precio_unitario)}</s>}
                  <b>{l.estado === 'ok' ? money(l.subtotal) : '—'}</b>
                  {l.estado === 'ok' && l.cantidad > 1 && <small>{money(l.precio_unitario)} c/u</small>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="fct-resumen">
          <h2>Resumen</h2>
          <div className="fct-fila"><span>Productos ({cotizacion.unidades})</span><b>{money(cotizacion.subtotal_bruto)}</b></div>
          {cotizacion.descuento_total > 0 && <div className="fct-fila fct-fila-descuento"><span>Descuentos</span><b>-{money(cotizacion.descuento_total)}</b></div>}
          <div className="fct-fila"><span>Retiro en farmacia</span><b>Gratis</b></div>
          <div className="fct-total"><span>Total</span><b>{money(cotizacion.total)}</b></div>
          <p className="fct-nota">IVA incluido ({money(cotizacion.iva)}).</p>
          <button type="button" className="fct-btn-primario" disabled={!FUNCIONES.checkout || !cotizacion.puede_continuar}
            onClick={() => navigate(cliente ? '/tienda/checkout' : '/tienda/cuenta?volver=/tienda/checkout')}>Continuar compra</button>
          <p className="fct-nota">
            {!cotizacion.puede_continuar
              ? 'Revisa los productos marcados antes de continuar.'
              : !FUNCIONES.checkout ? 'El pago en línea se habilita pronto. Mientras tanto, puedes armar tu carro y revisar el total.'
                : !cliente && 'Te pediremos ingresar o crear tu cuenta para continuar.'}
          </p>
          <Link to="/tienda/productos" className="fct-seguir">Seguir comprando</Link>
        </aside>
      </div>
    </div>
  );
}
