import { hoyIso, inicioMesIso } from '../format.js';

// Filtro por rango de días reutilizable (órdenes de compra, pedidos, ventas, reportes…).
// onChange({ desde, hasta }) con AAAA-MM-DD o ''. El backend lo recibe como ?desde=&hasta= (core/fechas.js).
export default function FiltroFechas({ desde, hasta, onChange }) {
  const invalido = desde && hasta && desde > hasta;
  const atajos = [
    ['Hoy', () => onChange({ desde: hoyIso(), hasta: hoyIso() })],
    ['7 días', () => onChange({ desde: hoyIso(-6), hasta: hoyIso() })],
    ['Este mes', () => onChange({ desde: inicioMesIso(), hasta: hoyIso() })],
  ];
  const clase = `form-control form-control-sm w-auto ${invalido ? 'is-invalid' : ''}`;
  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <label className="small text-muted mb-0">Desde</label>
      <input type="date" className={clase} value={desde} max={hasta || undefined}
        onChange={(e) => onChange({ desde: e.target.value, hasta })} />
      <label className="small text-muted mb-0">Hasta</label>
      <input type="date" className={clase} value={hasta} min={desde || undefined}
        onChange={(e) => onChange({ desde, hasta: e.target.value })} />
      {atajos.map(([etiqueta, fn]) => (
        <button key={etiqueta} type="button" className="btn btn-outline-secondary btn-sm" onClick={fn}>{etiqueta}</button>
      ))}
      {(desde || hasta) && (
        <button type="button" className="btn btn-link btn-sm" onClick={() => onChange({ desde: '', hasta: '' })}>Limpiar</button>
      )}
    </div>
  );
}
