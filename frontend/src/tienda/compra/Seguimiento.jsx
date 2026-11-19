// Avance del pedido para el cliente (HU-75): pagado → preparando → listo / en camino → entregado.
const PASOS = {
  retiro: ['Pagado', 'En preparación', 'Listo para retiro', 'Entregado'],
  despacho: ['Pagado', 'En preparación', 'En despacho', 'Entregado'],
};
const NOMBRE = { Pagado: 'Pagado', 'En preparación': 'Preparando', 'Listo para retiro': 'Listo para retirar', 'En despacho': 'En camino', Entregado: 'Entregado' };

export default function Seguimiento({ estado, entrega, compacto = false }) {
  const pasos = PASOS[entrega] ?? PASOS.retiro;
  const actual = pasos.indexOf(estado);
  if (actual < 0) return null; // pendiente, anulado o expirado: no hay avance que mostrar
  return (
    <ol className={`fct-seguimiento${compacto ? ' fct-seguimiento-compacto' : ''}`} aria-label="Avance del pedido">
      {pasos.map((x, i) => (
        <li key={x} className={i < actual ? 'hecho' : i === actual ? 'actual' : ''} aria-current={i === actual ? 'step' : undefined}>
          <span className="fct-seguimiento-punto" aria-hidden="true">{i < actual || (i === actual && x === 'Entregado') ? <i className="bi bi-check-lg" /> : i + 1}</span>
          <span>{NOMBRE[x]}</span>
        </li>
      ))}
    </ol>
  );
}
