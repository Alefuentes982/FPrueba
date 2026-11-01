import { useCarrito } from './CarritoContext.jsx';
import { MAX_CANTIDAD } from './carrito.js';

// Botón de la tarjeta: "Agregar al carro" y, cuando el producto ya está en el carro, − cantidad +.
// El tope es lo disponible que informó la API; la cotización del carro vuelve a revisar el stock.
export default function BotonAgregar({ producto }) {
  const { agregar, cambiar, cantidadDe } = useCarrito();
  const enCarro = cantidadDe(producto.id);
  const tope = Math.min(producto.disponible, MAX_CANTIDAD);

  if (enCarro === 0) {
    return (
      <button type="button" className="fct-btn-agregar" disabled={tope <= 0} onClick={() => agregar(producto, 1)}>
        Agregar al carro
      </button>
    );
  }
  return (
    <div className="fct-paso" role="group" aria-label={`${producto.nombre} en el carro`}>
      <button type="button" aria-label="Quitar uno" onClick={() => cambiar(producto.id, enCarro - 1, producto.disponible)}>
        <i className={`bi ${enCarro === 1 ? 'bi-trash3' : 'bi-dash-lg'}`} />
      </button>
      <b aria-live="polite">{enCarro}</b>
      <button type="button" aria-label="Agregar uno" disabled={enCarro >= tope} onClick={() => agregar(producto, 1)}>
        <i className="bi bi-plus-lg" />
      </button>
    </div>
  );
}
