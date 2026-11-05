import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCarrito } from './CarritoContext.jsx';
import { SelectorCantidad } from './comunes.jsx';
import { MAX_CANTIDAD } from './carrito.js';
import { useAgregarAlCarro } from './useAgregarAlCarro.jsx';

// Cantidad y botón "Agregar al carro" de la ficha y de la vista rápida (HU-70 y HU-95).
// No deja pasar lo disponible menos lo que ya está en el carro.
export default function Comprar({ producto }) {
  const { cantidadDe } = useCarrito();
  const agregar = useAgregarAlCarro();
  const [cantidad, setCantidad] = useState(1);
  const [aviso, setAviso] = useState(null);
  const enCarro = cantidadDe(producto.id);
  const maximo = Math.max(Math.min(producto.disponible, MAX_CANTIDAD) - enCarro, 0);

  const alAgregar = () => {
    const n = agregar(producto, Math.min(cantidad, maximo));
    setAviso(n ? `${n === 1 ? 'Agregaste 1 unidad' : `Agregaste ${n} unidades`} al carro.` : 'Ya tienes en el carro todas las unidades disponibles.');
    setCantidad(1);
  };

  return (
    <>
      <div className="fct-comprar">
        <SelectorCantidad valor={Math.min(cantidad, Math.max(maximo, 1))} max={Math.max(maximo, 1)} onCambiar={setCantidad} disabled={maximo === 0} />
        <button type="button" className="fct-btn-agregar" disabled={maximo === 0} onClick={alAgregar}>Agregar al carro</button>
      </div>
      {(aviso || enCarro > 0) && (
        <div key={aviso ?? 'en-carro'} className="fct-confirmacion fct-aparecer" role="status">
          <i className="bi bi-check-circle" aria-hidden="true" />
          <span>{aviso ?? `Tienes ${enCarro} en el carro.`}</span>
          <Link to="/tienda/carrito">Ver carro</Link>
        </div>
      )}
    </>
  );
}
