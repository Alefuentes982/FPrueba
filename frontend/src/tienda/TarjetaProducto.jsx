import { Link } from 'react-router-dom';
import BotonAgregar from './BotonAgregar.jsx';
import { FUNCIONES } from './contenido.js';
import { EtiquetaDescuento, ImagenProducto, Precio } from './comunes.jsx';

// Tarjeta del listado: foto, categoría, nombre, precio (normal tachado si hay oferta), modalidades y botón del carro.
export default function TarjetaProducto({ producto }) {
  return (
    <article className="fct-card">
      <Link to={`/tienda/producto/${producto.id}`} className="fct-card-enlace">
        <div className="fct-card-foto">
          <EtiquetaDescuento descuento={producto.descuento} />
          <ImagenProducto producto={producto} />
        </div>
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
    </article>
  );
}
