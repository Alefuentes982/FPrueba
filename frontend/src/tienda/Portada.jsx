import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BANNER_PRINCIPAL, BANNERS_LATERALES, BENEFICIOS, BLOQUES_CATEGORIA, FARMACIA, SALUD } from './contenido.js';
import { enlaceCategoria, useDatosTienda } from './DatosTienda.jsx';
import Envase from './Envase.jsx';
import { tiendaApi } from './apiTienda.js';
import TarjetaProducto from './TarjetaProducto.jsx';
import { TarjetaEsqueleto } from './ui/Esqueletos.jsx';
import { prefiereMenosMovimiento, usePrefiereMenosMovimiento } from './ui/movimiento.js';

// Portada de la tienda (diseño aprobado el 27-10-2026, versión clara). Las secciones siguen el orden de las
// referencias: banners, accesos rápidos, ofertas, retiro en el día, categorías, bloques por categoría, información de
// salud y beneficios.
export default function Portada() {
  const { categorias, categoriaPorNombre } = useDatosTienda();
  return (
    <>
      <Banners categoriaPorNombre={categoriaPorNombre} />
      <AccesosRapidos />
      <OfertasDestacadas />
      <AvisoRetiro />
      {categorias.length > 0 && (
        <section className="fct-seccion">
          <div className="fct-wrap">
            <div className="fct-titulo-seccion"><h2>Compra por categoría</h2></div>
            <div className="fct-categorias">
              {categorias.map((c) => (
                <Link key={c.id} to={enlaceCategoria(c)} className="fct-categoria">
                  <div className="fct-categoria-dibujo"><Envase categoria={c.nombre} semillaId={c.id} /></div>
                  {c.nombre}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
      <BloquesCategoria categoriaPorNombre={categoriaPorNombre} />
      <Salud />
      <Beneficios />
    </>
  );
}

// Carrusel principal y dos banners laterales (HU-95). Los tres mensajes están siempre en la página, uno encima de
// otro, y el activo aparece con un fundido. Avanza solo cada 6 segundos y se detiene mientras el puntero o el foco
// están encima, si la pestaña no está visible o si la persona pidió reducir el movimiento. En celular se desliza
// con el dedo.
const INTERVALO = 6000;

function Banners({ categoriaPorNombre }) {
  const [actual, setActual] = useState(0);
  const [pausa, setPausa] = useState(false);
  const reducir = usePrefiereMenosMovimiento();
  const toque = useRef(null);
  const total = BANNER_PRINCIPAL.length;
  const ir = (n) => setActual((n + total) % total);

  useEffect(() => {
    if (reducir || pausa) return undefined;
    const t = setInterval(() => { if (!document.hidden) setActual((n) => (n + 1) % total); }, INTERVALO);
    return () => clearInterval(t);
  }, [total, actual, pausa, reducir]);

  const destino = (b) => (b.categoria ? enlaceCategoria(categoriaPorNombre(b.categoria)) : b.a);
  const alSoltar = (e) => {
    if (toque.current == null) return;
    const dx = e.changedTouches[0].clientX - toque.current;
    toque.current = null;
    if (Math.abs(dx) > 40) ir(actual + (dx < 0 ? 1 : -1));
  };

  return (
    <section className="fct-hero">
      <div className="fct-wrap">
        <div className="fct-slider" aria-roledescription="carrusel" aria-label="Novedades de la farmacia"
          onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}
          onFocus={() => setPausa(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPausa(false); }}
          onTouchStart={(e) => { toque.current = e.touches[0].clientX; }} onTouchEnd={alSoltar}>
          <div className="fct-slides">
            {BANNER_PRINCIPAL.map((s, i) => (
              <div key={s.titulo} className={`fct-slide fct-tono-${s.tono}${i === actual ? ' activo' : ''}`}
                role="group" aria-roledescription="diapositiva" aria-label={`${i + 1} de ${total}`}
                aria-hidden={i !== actual} inert={i !== actual ? true : undefined}>
                <div className="fct-slide-texto">
                  <span className="fct-slide-etiqueta">{s.etiqueta}</span>
                  {i === 0 ? <h1>{s.titulo}</h1> : <h2 className="fct-slide-titulo">{s.titulo}</h2>}
                  <p>{s.texto}</p>
                  <div className="fct-slide-acciones">
                    <Link to={destino(s.boton)} className="fct-btn-verde">{s.boton.texto}</Link>
                    {s.secundario && <Link to={s.secundario.a} className="fct-slide-secundario">{s.secundario.texto}</Link>}
                  </div>
                </div>
                <div className="fct-bodegon" aria-hidden="true">
                  <div className="fct-bodegon-disco" />
                  {s.ilustraciones.map((cat, j) => (
                    <div key={`${i}-${j}`} className={`fct-bodegon-${j + 1}`}><Envase categoria={cat} semillaId={`${i}-${j}-${cat}`} /></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="fct-puntos">
            {BANNER_PRINCIPAL.map((b, i) => (
              <button key={b.titulo} type="button" className={i === actual ? 'activo' : ''} aria-label={`Ver banner ${i + 1}`}
                aria-current={i === actual ? 'true' : undefined} onClick={() => ir(i)} />
            ))}
          </div>
          <button type="button" className="fct-flecha fct-flecha-izq" aria-label="Banner anterior" onClick={() => ir(actual - 1)}><i className="bi bi-chevron-left" /></button>
          <button type="button" className="fct-flecha fct-flecha-der" aria-label="Banner siguiente" onClick={() => ir(actual + 1)}><i className="bi bi-chevron-right" /></button>
        </div>
        <div className="fct-laterales">
          {BANNERS_LATERALES.map((b) => (
            <Link key={b.titulo} to={enlaceCategoria(categoriaPorNombre(b.categoria))} className={`fct-lateral fct-tono-${b.tono}`}>
              <h2>{b.titulo}</h2>
              <p>{b.texto}</p>
              <span>{b.enlace}</span>
              <div className="fct-lateral-dibujo" aria-hidden="true"><Envase categoria={b.categoria} semillaId={b.titulo} /></div>
            </Link>
          ))}
        </div>
      </div>
      <div className="fct-wrap fct-atajos">
        <Link to="/tienda/informacion#retiro"><i className="bi bi-shop" aria-hidden="true" />Revisa cómo funciona el retiro en farmacia</Link>
        <Link to="/tienda/productos?ofertas=1"><i className="bi bi-tag" aria-hidden="true" />Revisa todas las ofertas aquí</Link>
      </div>
    </section>
  );
}

function AccesosRapidos() {
  const accesos = [
    { icono: 'bi-shop', titulo: 'Stock en farmacia', texto: 'Solo ves lo que hay hoy', a: '/tienda/productos' },
    { icono: 'bi-clock', titulo: 'Horario y ubicación', texto: FARMACIA.horarioCorto, a: '/tienda/informacion#farmacia' },
    { icono: 'bi-file-earmark-medical', titulo: 'Medicamentos con receta', texto: 'Cómo comprarlos', a: '/tienda/informacion#receta' },
    { icono: 'bi-bag-check', titulo: 'Retiro sin costo', texto: `Compra antes de las ${FARMACIA.horaCorteRetiro}`, a: '/tienda/informacion#retiro' },
    { icono: 'bi-question-circle', titulo: 'Cómo comprar', texto: 'Paso a paso', a: '/tienda/informacion#como-comprar' },
  ];
  return (
    <section className="fct-seccion fct-seccion-corta">
      <div className="fct-wrap">
        <div className="fct-rapidos">
          {accesos.map((x) => (
            <Link key={x.titulo} to={x.a} className="fct-rapido">
              <span className="fct-rapido-icono"><i className={`bi ${x.icono}`} aria-hidden="true" /></span>
              <span><b>{x.titulo}</b><small>{x.texto}</small></span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function AvisoRetiro() {
  const { sucursales } = useDatosTienda();
  const matriz = sucursales[0];
  return (
    <section className="fct-seccion fct-seccion-corta">
      <div className="fct-wrap">
        <div className="fct-retiro">
          <span className="fct-retiro-icono"><i className="bi bi-shop" aria-hidden="true" /></span>
          <div>
            <b>Compra hasta las {FARMACIA.horaCorteRetiro} y retira hoy mismo</b>
            <p>Retiras sin costo en {matriz ? `${matriz.nombre}${matriz.comuna ? `, ${matriz.comuna}` : ''}` : 'la farmacia'}, con tu número de pedido y tu RUT.</p>
          </div>
          <Link to="/tienda/informacion#retiro">Saber más</Link>
        </div>
      </div>
    </section>
  );
}

function Salud() {
  return (
    <section className="fct-seccion fct-salud">
      <div className="fct-wrap">
        <div className="fct-titulo-seccion"><h2>Infórmate y cuida tu salud</h2></div>
        <div className="fct-info">
          {SALUD.map((x) => (
            <div key={x.titulo} className="fct-info-tarjeta">
              <i className={`bi ${x.icono}`} aria-hidden="true" />
              <b>{x.titulo}</b>
              {x.numero && <a className="fct-info-numero" href={`tel:${x.numero.replace(/\s/g, '')}`}>{x.numero}</a>}
              <p>{x.texto}</p>
              {x.a && <Link to={x.a}>Leer más</Link>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Beneficios() {
  return (
    <section className="fct-seccion">
      <div className="fct-wrap">
        <div className="fct-titulo-seccion"><h2>¿Por qué comprar en FarmaClick?</h2></div>
        <div className="fct-beneficios">
          {BENEFICIOS.map((x) => (
            <div key={x.titulo} className="fct-beneficio">
              <span><i className={`bi ${x.icono}`} aria-hidden="true" /></span>
              <b>{x.titulo}</b>
              <p>{x.texto}</p>
            </div>
          ))}
        </div>
        <p className="fct-texto-pie">
          <b>FarmaClick</b> es una farmacia con venta en línea de medicamentos de venta directa, dermocosmética, vitaminas y
          productos para el bebé. Los precios publicados incluyen IVA y corresponden a la venta en línea.
        </p>
      </div>
    </section>
  );
}

// ---- Secciones con productos (HU-66) ----

// Carrusel de productos con descuento, de mayor a menor porcentaje. Sin ofertas vigentes, la sección no aparece.
// Como la sección puede no existir (sin ofertas vigentes), no muestra tarjetas de carga: aparece cuando llegan.
function OfertasDestacadas() {
  const [productos, setProductos] = useState(null);
  const pista = useRef(null);
  useEffect(() => {
    tiendaApi.productos({ con_descuento: 1, orden: 'descuento', limit: 10 }).then((r) => setProductos(r.data)).catch(() => setProductos([]));
  }, []);
  if (!productos || productos.length === 0) return null;
  const mover = (dir) => pista.current?.scrollBy({ left: dir * pista.current.clientWidth * 0.8, behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth' });
  return (
    <section className="fct-seccion">
      <div className="fct-wrap">
        <div className="fct-titulo-seccion"><h2>Ofertas destacadas</h2><Link to="/tienda/productos?ofertas=1">Ver todas las ofertas</Link></div>
        <div className="fct-carrusel">
          <div className="fct-carrusel-pista fct-aparecer" ref={pista}>
            {productos.map((p) => <TarjetaProducto key={p.id} producto={p} />)}
          </div>
          <button type="button" className="fct-flecha fct-flecha-izq" aria-label="Ver anteriores" onClick={() => mover(-1)}><i className="bi bi-chevron-left" /></button>
          <button type="button" className="fct-flecha fct-flecha-der" aria-label="Ver siguientes" onClick={() => mover(1)}><i className="bi bi-chevron-right" /></button>
        </div>
      </div>
    </section>
  );
}

// Un bloque por categoría de contenido.js: banner de la categoría y sus 4 productos más vendidos.
function BloquesCategoria({ categoriaPorNombre }) {
  return BLOQUES_CATEGORIA.map((b) => {
    const categoria = categoriaPorNombre(b.categoria);
    return categoria ? <BloqueCategoria key={b.categoria} bloque={b} categoria={categoria} /> : null;
  });
}

function BloqueCategoria({ bloque, categoria }) {
  const [productos, setProductos] = useState(null);
  useEffect(() => {
    tiendaApi.productos({ categoria_id: categoria.id, limit: 4 }).then((r) => setProductos(r.data)).catch(() => setProductos([]));
  }, [categoria.id]);
  if (productos?.length === 0) return null;
  return (
    <section className="fct-seccion">
      <div className="fct-wrap">
        <div className="fct-titulo-seccion"><h2>{categoria.nombre}</h2><Link to={enlaceCategoria(categoria)}>Ver todos los productos</Link></div>
        <div className="fct-bloque">
          <Link to={enlaceCategoria(categoria)} className={`fct-bloque-portada fct-tono-${bloque.tono}`}>
            <div><h3>{bloque.titulo}</h3><p>{bloque.texto}</p></div>
            <div className="fct-bloque-dibujo" aria-hidden="true"><Envase categoria={categoria.nombre} semillaId={bloque.titulo} /></div>
            <span>Ir a la categoría</span>
          </Link>
          {productos
            ? productos.map((p) => <TarjetaProducto key={p.id} producto={p} />)
            : Array.from({ length: 4 }, (_, i) => <TarjetaEsqueleto key={i} />)}
        </div>
      </div>
    </section>
  );
}
