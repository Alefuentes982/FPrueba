import { useCarrito } from './CarritoContext.jsx';
import { MAX_CANTIDAD } from './carrito.js';
import { useAgregarAlCarro } from './useAgregarAlCarro.jsx';

// Botón de la tarjeta: "Agregar al carro" y, cuando el producto ya está en el carro, − cantidad +.
// El tope es lo disponible que informó la API; la cotización del carro vuelve a revisar el stock.
// El primer "Agregar al carro" muestra el aviso flotante; los + siguientes solo mueven el contador (HU-95).
export default function BotonAgregar({ producto }) {
  const { agregar, cambiar, cantidadDe } = useCarrito();
  const agregarConAviso = useAgregarAlCarro();
  const enCarro = cantidadDe(producto.id);
  const tope = Math.min(producto.disponible, MAX_CANTIDAD);

  if (enCarro === 0) {
    return (
      <button type="button" className="fct-btn-agregar" disabled={tope <= 0} onClick={() => agregarConAviso(producto, 1)}>
        {tope <= 0 ? 'Agotado' : 'Agregar al carro'}
      </button>
    );
  }
  return (
    <div className="fct-paso fct-aparecer" role="group" aria-label={`${producto.nombre} en el carro`}>
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
