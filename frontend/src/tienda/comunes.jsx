import { Link } from 'react-router-dom';

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
