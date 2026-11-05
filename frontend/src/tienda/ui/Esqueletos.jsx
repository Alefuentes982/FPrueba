// Tarjetas de carga (placeholders de Bootstrap 5.3 con brillo). Ocupan el mismo espacio que el contenido real, así
// la página no salta cuando llegan los datos. Son decorativas: el lector de pantalla solo escucha "Cargando".

export function TarjetaEsqueleto() {
  return (
    <div className="fct-card fct-esqueleto placeholder-glow" aria-hidden="true">
      <div className="fct-card-foto placeholder" />
      <span className="placeholder col-5 placeholder-sm" />
      <span className="placeholder col-11" />
      <span className="placeholder col-8" />
      <span className="placeholder col-6 placeholder-lg fct-esqueleto-precio" />
      <span className="placeholder col-12 fct-esqueleto-boton" />
    </div>
  );
}

// cantidad tarjetas en la misma grilla que el listado. clase permite usar .fct-grilla, .fct-carrusel-pista, etc.
export function GrillaEsqueleto({ cantidad = 8, clase = 'fct-grilla' }) {
  return (
    <div className={clase} role="status">
      <span className="visually-hidden">Cargando productos…</span>
      {Array.from({ length: cantidad }, (_, i) => <TarjetaEsqueleto key={i} />)}
    </div>
  );
}

export function FichaEsqueleto() {
  return (
    <div className="fct-wrap" role="status">
      <span className="visually-hidden">Cargando producto…</span>
      <div className="fct-ficha placeholder-glow" aria-hidden="true">
        <div className="fct-ficha-foto placeholder" />
        <div className="fct-ficha-info fct-esqueleto-info">
          <span className="placeholder col-3 placeholder-sm" />
          <span className="placeholder col-10 placeholder-lg" />
          <span className="placeholder col-6 placeholder-sm" />
          <span className="placeholder col-12 fct-esqueleto-bloque" />
          <span className="placeholder col-12 fct-esqueleto-boton" />
          <span className="placeholder col-12 fct-esqueleto-caja" />
        </div>
      </div>
    </div>
  );
}

// Texto de varias líneas (por ejemplo, la descripción dentro de la vista rápida).
export function LineasEsqueleto({ lineas = 3 }) {
  return (
    <p className="placeholder-glow mb-0" aria-hidden="true">
      {Array.from({ length: lineas }, (_, i) => <span key={i} className={`placeholder col-${i === lineas - 1 ? 7 : 12}`} />)}
    </p>
  );
}
