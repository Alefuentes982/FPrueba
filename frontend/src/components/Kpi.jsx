import { Link } from 'react-router-dom';

// Tarjeta de indicador (una columna de la grilla). Con `to` es un enlace al detalle.
export default function Kpi({ titulo, valor, sub, clase = '', to, col = 'col-6 col-lg' }) {
  const cuerpo = (
    <div className="card-body py-2">
      <div className="small text-muted">{titulo}</div>
      <div className={`fs-4 fw-bold ${clase}`}>{valor}</div>
      {sub && <div className="small text-muted">{sub}</div>}
    </div>
  );
  return (
    <div className={col}>
      {to ? <Link to={to} className="card h-100 text-decoration-none text-reset border-warning">{cuerpo}</Link> : <div className="card h-100">{cuerpo}</div>}
    </div>
  );
}
