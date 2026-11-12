import { Link } from 'react-router-dom';

// Pasos de la compra (carro, datos y entrega, pago). Los pasos ya hechos llevan un visto; el carro siempre se puede volver a abrir.
export function Pasos({ actual }) {
  const pasos = ['Carro', 'Datos y entrega', 'Pago'];
  return (
    <ol className="fct-pasos" aria-label="Pasos de la compra">
      {pasos.map((texto, i) => {
        const n = i + 1;
        const hecho = n < actual;
        const marca = <span>{hecho ? <i className="bi bi-check-lg" aria-hidden="true" /> : n}</span>;
        return (
          <li key={texto} className={n === actual ? 'activo' : hecho ? 'hecho' : ''} aria-current={n === actual ? 'step' : undefined}>
            {n === 1 && hecho ? <Link to="/tienda/carrito">{marca}{texto}</Link> : <>{marca}{texto}</>}
          </li>
        );
      })}
    </ol>
  );
}
