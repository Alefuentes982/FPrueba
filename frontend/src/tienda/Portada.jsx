import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BANNER_PRINCIPAL, BANNERS_LATERALES, BENEFICIOS, FARMACIA, SALUD } from './contenido.js';
import { enlaceCategoria, useDatosTienda } from './DatosTienda.jsx';
import Envase from './Envase.jsx';

// Portada de la tienda (diseño aprobado el 27-10-2026, versión clara). Las secciones siguen el orden de las
// referencias: banners, accesos rápidos, ofertas, retiro en el día, categorías, bloques por categoría, información de
// salud y beneficios.
export default function Portada() {
  const { categorias, categoriaPorNombre } = useDatosTienda();
  return (
    <>
      <Banners categoriaPorNombre={categoriaPorNombre} />
      <AccesosRapidos />
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
      <Salud />
      <Beneficios />
    </>
  );
}

// Carrusel principal y dos banners laterales. Avanza solo cada 7 segundos, salvo que el usuario pida menos movimiento.
function Banners({ categoriaPorNombre }) {
  const [actual, setActual] = useState(0);
  const total = BANNER_PRINCIPAL.length;
  const ir = (n) => setActual((n + total) % total);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setActual((n) => (n + 1) % total), 7000);
    return () => clearInterval(t);
  }, [total, actual]);

  const destino = (b) => (b.categoria ? enlaceCategoria(categoriaPorNombre(b.categoria)) : b.a);
  const s = BANNER_PRINCIPAL[actual];

  return (
    <section className="fct-hero">
      <div className="fct-wrap">
        <div className={`fct-slide fct-tono-${s.tono}`} aria-roledescription="carrusel" aria-label={`Banner ${actual + 1} de ${total}`}>
          <div className="fct-slide-texto">
            <span className="fct-slide-etiqueta">{s.etiqueta}</span>
            <h1>{s.titulo}</h1>
            <p>{s.texto}</p>
            <div className="fct-slide-acciones">
              <Link to={destino(s.boton)} className="fct-btn-verde">{s.boton.texto}</Link>
              {s.secundario && <Link to={s.secundario.a} className="fct-slide-secundario">{s.secundario.texto}</Link>}
            </div>
          </div>
          <div className="fct-bodegon" aria-hidden="true">
            <div className="fct-bodegon-disco" />
            {s.ilustraciones.map((cat, i) => (
              <div key={`${actual}-${i}`} className={`fct-bodegon-${i + 1}`}><Envase categoria={cat} semillaId={`${actual}-${i}-${cat}`} /></div>
            ))}
          </div>
          <div className="fct-puntos">
            {BANNER_PRINCIPAL.map((b, i) => (
              <button key={b.titulo} type="button" className={i === actual ? 'activo' : ''} aria-label={`Ver banner ${i + 1}`} onClick={() => ir(i)} />
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
