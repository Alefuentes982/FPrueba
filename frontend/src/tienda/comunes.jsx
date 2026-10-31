import { useState } from 'react';
import { Link } from 'react-router-dom';
import { money } from '../format.js';
import Envase from './Envase.jsx';

// Foto del producto o, si no tiene (o no carga), la ilustración de su categoría.
export function ImagenProducto({ producto, className = '' }) {
  const [fallo, setFallo] = useState(false);
  const foto = producto.imagen_url && !fallo;
  return (
    <div className={`fct-imagen ${className}`}>
      {foto
        ? <img src={producto.imagen_url} alt={producto.nombre} loading="lazy" onError={() => setFallo(true)} />
        : <div className="fct-imagen-dibujo"><Envase categoria={producto.categoria} semillaId={producto.id ?? producto.producto_id} /></div>}
    </div>
  );
}

// Porcentaje de descuento que se muestra en la esquina de la foto ("-20%") o la regla por cantidad ("Lleva 3").
export function EtiquetaDescuento({ descuento }) {
  if (!descuento) return null;
  return descuento.precio_con_descuento != null
    ? <span className="fct-etiqueta fct-etiqueta-dcto">-{descuento.porcentaje}%</span>
    : <span className="fct-etiqueta fct-etiqueta-cantidad">Lleva {descuento.desde}: -{descuento.porcentaje}%</span>;
}

// Precio con IVA: si hay oferta desde 1 unidad, el normal tachado arriba y el rebajado grande.
export function Precio({ producto, grande = false }) {
  const d = producto.descuento;
  const rebajado = d?.precio_con_descuento != null;
  return (
    <div className={`fct-precio${grande ? ' fct-precio-grande' : ''}`}>
      <div className={`fct-precio-normal${rebajado ? '' : ' fct-oculto'}`}>Normal {money(producto.precio)}</div>
      <div className="fct-precio-final">
        {money(rebajado ? d.precio_con_descuento : producto.precio)}
        {rebajado && <small>Oferta</small>}
      </div>
    </div>
  );
}

// Ruta de navegación. pasos = [{ texto, a }]; el último va sin enlace.
export function Migas({ pasos }) {
  return (
    <nav aria-label="Ruta" className="fct-migas">
      <Link to="/tienda">Inicio</Link>
      {pasos.map((p, i) => (
        <span key={`${p.texto}-${i}`}>
          <i className="bi bi-chevron-right" aria-hidden="true" />
          {p.a && i < pasos.length - 1 ? <Link to={p.a}>{p.texto}</Link> : <b>{p.texto}</b>}
        </span>
      ))}
    </nav>
  );
}

export function Cargando() {
  return <div className="fct-cargando"><div className="spinner-border" role="status"><span className="visually-hidden">Cargando…</span></div></div>;
}

export function Aviso({ error, children }) {
  return (
    <div className="fct-aviso" role={error ? 'alert' : 'status'}>
      <i className={`bi ${error ? 'bi-exclamation-triangle' : 'bi-info-circle'}`} aria-hidden="true" />
      <div>{error ? (error.status === 429 ? 'Hay muchas visitas en este momento. Intenta de nuevo en un minuto.' : error.message) : children}</div>
    </div>
  );
}
