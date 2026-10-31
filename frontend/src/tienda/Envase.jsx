// Ilustración del producto mientras no tenga foto: un envase genérico (sin marcas) con la cruz de farmacia.
// La forma y los colores dependen de la categoría y del id del producto, así que cada producto se ve siempre igual.

const MORADO = '#74109E';
const TURQUESA_OSC = '#1F7A79';
const VERDE = '#A3C940';
const VERDE_OSC = '#5E7F12';

// Por categoría: formas posibles y pares de colores [principal, detalle].
const ESTILOS = {
  'Medicamentos': { formas: ['caja'], colores: [[TURQUESA_OSC, VERDE], ['#D1453B', '#F4B3AE'], ['#3E7BD6', '#A9C8F5'], ['#5C6BC0', '#C5CAE9']] },
  'Dermocosmética': { formas: ['tubo', 'frasco', 'pote'], colores: [['#F2A33A', TURQUESA_OSC], ['#9BD3D2', MORADO], ['#E9D6F2', MORADO], ['#9ED36A', '#4E8A2B']] },
  'Vitaminas y suplementos': { formas: ['frasco', 'paquete', 'frasco'], colores: [['#F6C445', TURQUESA_OSC], [VERDE, VERDE_OSC], [MORADO, VERDE], ['#F28C28', '#FFD27A']] },
  'Bebé y maternidad': { formas: ['paquete', 'sobre', 'pote'], colores: [['#7CC4E8', '#FFFFFF'], ['#8FD0A8', TURQUESA_OSC], ['#F3D1E4', MORADO]] },
  'Cuidado personal': { formas: ['spray', 'frasco', 'tubo'], colores: [['#4BACAB', TURQUESA_OSC], ['#BFE3F0', TURQUESA_OSC], ['#F6B7A8', '#C4561A']] },
  'Primeros auxilios': { formas: ['caja', 'sobre'], colores: [['#5C6BC0', '#C5CAE9'], ['#F29E7A', MORADO], ['#D1453B', '#FFFFFF']] },
};
const GENERICO = { formas: ['caja', 'frasco'], colores: [[TURQUESA_OSC, VERDE], [MORADO, VERDE]] };

// Número estable a partir de un texto (el id del producto).
function semilla(texto = '') {
  let h = 0;
  for (let i = 0; i < texto.length; i += 1) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h;
}

function Cruz({ x, y, t, color }) {
  return (
    <g fill={color} opacity=".9">
      <rect x={x - t / 3} y={y - t} width={(t * 2) / 3} height={t * 2} rx="1.5" />
      <rect x={x - t} y={y - t / 3} width={t * 2} height={(t * 2) / 3} rx="1.5" />
    </g>
  );
}

function Forma({ tipo, c1, c2 }) {
  switch (tipo) {
    case 'frasco':
      return (<>
        <rect x="47" y="14" width="26" height="16" rx="3" fill={c2} />
        <rect x="38" y="28" width="44" height="98" rx="12" fill={c1} />
        <rect x="42" y="56" width="36" height="46" rx="4" fill="#fff" opacity=".93" />
        <Cruz x={60} y={79} t={8} color={c1} />
        <rect x="44" y="34" width="6" height="80" rx="3" fill="#fff" opacity=".25" />
      </>);
    case 'tubo':
      return (<>
        <path d="M40 22 H80 L74 112 H46 Z" fill={c1} />
        <rect x="50" y="110" width="20" height="16" rx="3" fill={c2} />
        <rect x="40" y="18" width="40" height="8" rx="2" fill={c2} />
        <path d="M45 44 H75 L72 82 H48Z" fill="#fff" opacity=".93" />
        <Cruz x={60} y={62} t={7} color={c1} />
      </>);
    case 'pote':
      return (<>
        <rect x="28" y="56" width="64" height="70" rx="10" fill={c1} />
        <rect x="26" y="44" width="68" height="18" rx="5" fill={c2} />
        <rect x="36" y="72" width="48" height="36" rx="4" fill="#fff" opacity=".93" />
        <Cruz x={60} y={90} t={8} color={c1} />
      </>);
    case 'spray':
      return (<>
        <rect x="52" y="10" width="16" height="10" rx="2" fill={c2} />
        <path d="M68 13h12" stroke={c2} strokeWidth="4" strokeLinecap="round" />
        <rect x="48" y="18" width="24" height="14" rx="3" fill={c2} />
        <rect x="42" y="30" width="36" height="96" rx="10" fill={c1} />
        <rect x="46" y="58" width="28" height="42" rx="4" fill="#fff" opacity=".93" />
        <Cruz x={60} y={79} t={7} color={c1} />
      </>);
    case 'sobre':
      return (<>
        <rect x="26" y="26" width="68" height="100" rx="6" fill={c1} />
        <path d="M26 34 h68 M26 118 h68" stroke="#fff" strokeWidth="2" strokeDasharray="3 3" opacity=".6" />
        <rect x="36" y="52" width="48" height="48" rx="24" fill="#fff" opacity=".93" />
        <Cruz x={60} y={76} t={9} color={c2 === '#FFFFFF' ? c1 : c2} />
      </>);
    case 'paquete':
      return (<>
        <rect x="18" y="36" width="84" height="90" rx="14" fill={c1} />
        <rect x="18" y="36" width="84" height="22" rx="11" fill={c2} />
        <rect x="34" y="70" width="52" height="40" rx="6" fill="#fff" opacity=".93" />
        <Cruz x={60} y={90} t={9} color={c1} />
      </>);
    default: // caja
      return (<>
        <path d="M30 30 L84 30 L96 22 L96 116 L84 126 L30 126 Z" fill={c1} />
        <path d="M84 30 L96 22 L96 116 L84 126Z" fill="#000" opacity=".12" />
        <rect x="30" y="30" width="54" height="96" fill="#fff" opacity=".95" />
        <rect x="30" y="30" width="54" height="30" fill={c1} />
        <rect x="30" y="104" width="54" height="22" fill={c2} />
        <Cruz x={57} y={82} t={9} color={c1} />
      </>);
  }
}

export default function Envase({ categoria, semillaId = '', sombra = true }) {
  const estilo = ESTILOS[categoria] ?? GENERICO;
  const n = semilla(semillaId);
  const tipo = estilo.formas[n % estilo.formas.length];
  const [c1, c2] = estilo.colores[Math.floor(n / 7) % estilo.colores.length];
  return (
    <svg viewBox="0 0 120 134" width="100%" height="100%" aria-hidden="true" focusable="false">
      {sombra && <ellipse cx="60" cy="128" rx="40" ry="5" fill="#000" opacity=".08" />}
      <Forma tipo={tipo} c1={c1} c2={c2} />
    </svg>
  );
}
