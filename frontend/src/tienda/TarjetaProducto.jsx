import { useState } from 'react';
import { Link } from 'react-router-dom';
import BotonAgregar from './BotonAgregar.jsx';
import { FUNCIONES } from './contenido.js';
import { EtiquetaDescuento, ImagenProducto, Precio } from './comunes.jsx';
import VistaRapida from './VistaRapida.jsx';

// Tarjeta del listado: foto, categoría, nombre, precio (normal tachado si hay oferta), modalidades y botón del carro.
// Al pasar el mouse la tarjeta se eleva, la foto se acerca y aparece "Vista rápida" (HU-95). La foto y el nombre
// llevan a la ficha; la vista rápida es un botón aparte, porque un botón no puede ir dentro de un enlace.
export default function TarjetaProducto({ producto }) {
  const [rapida, setRapida] = useState(false);
  const ficha = `/tienda/producto/${producto.id}`;
  return (
    <article className="fct-card">
      <div className="fct-card-foto">
        <EtiquetaDescuento descuento={producto.descuento} />
        <Link to={ficha} className="fct-card-foto-enlace" tabIndex={-1} aria-hidden="true">
          <ImagenProducto producto={producto} />
        </Link>
        <button type="button" className="fct-card-rapida" aria-haspopup="dialog" onClick={() => setRapida(true)}>
          <i className="bi bi-eye" aria-hidden="true" /><span>Vista rápida</span>
          <span className="visually-hidden"> de {producto.nombre}</span>
        </button>
      </div>
      <Link to={ficha} className="fct-card-enlace">
        <div className="fct-card-categoria">{producto.categoria}</div>
        <h3>{producto.nombre}</h3>
        {producto.presentacion && <div className="fct-card-presentacion">{producto.presentacion}</div>}
      </Link>
      <Precio producto={producto} />
      <div className="fct-modos">
        <span><i className="bi bi-shop" aria-hidden="true" />Retiro en farmacia</span>
        {FUNCIONES.despacho && <span><i className="bi bi-truck" aria-hidden="true" />Despacho</span>}
      </div>
      <BotonAgregar producto={producto} />
      <VistaRapida producto={producto} abierto={rapida} onCerrar={() => setRapida(false)} />
    </article>
  );
}
