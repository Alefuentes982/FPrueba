import { useEffect, useState } from 'react';

// Movimiento de la interfaz de la tienda (HU-95). Las transiciones las dibuja el CSS de Bootstrap 5.3 y tienda.css;
// estos hooks solo deciden en qué momento se agregan o se quitan las clases.

const CONSULTA = '(prefers-reduced-motion: reduce)';

// true si la persona pidió "reducir movimiento" en su sistema operativo o navegador.
export function prefiereMenosMovimiento() {
  try { return window.matchMedia?.(CONSULTA).matches ?? false; } catch { return false; }
}

export function usePrefiereMenosMovimiento() {
  const [reducir, setReducir] = useState(prefiereMenosMovimiento);
  useEffect(() => {
    const mq = window.matchMedia?.(CONSULTA);
    if (!mq) return undefined;
    const alCambiar = () => setReducir(mq.matches);
    mq.addEventListener?.('change', alCambiar);
    return () => mq.removeEventListener?.('change', alCambiar);
  }, []);
  return reducir;
}

// Fases de un elemento que aparece y desaparece con transición:
//   'cerrado'  no está en la página
//   'entrando' ya está en la página, todavía sin la clase .show (así el navegador tiene un punto de partida)
//   'abierto'  con la clase .show: la transición de entrada corre
//   'saliendo' sin .show: la transición de salida corre y, al terminar, se quita de la página
// duracion es la de la transición más larga del elemento, en milisegundos.
export function useTransicion(abierto, duracion = 300) {
  const reducir = usePrefiereMenosMovimiento();
  const [fase, setFase] = useState(abierto ? 'abierto' : 'cerrado');

  useEffect(() => {
    if (abierto) {
      if (fase === 'abierto' || fase === 'entrando') return undefined;
      if (reducir) { setFase('abierto'); return undefined; }
      setFase('entrando');
      // Dos cuadros: el primero pinta el estado inicial y el segundo agrega .show.
      let segundo;
      const primero = requestAnimationFrame(() => { segundo = requestAnimationFrame(() => setFase('abierto')); });
      return () => { cancelAnimationFrame(primero); cancelAnimationFrame(segundo); };
    }
    if (fase === 'cerrado' || fase === 'saliendo') return undefined;
    if (reducir) { setFase('cerrado'); return undefined; }
    setFase('saliendo');
    const t = setTimeout(() => setFase('cerrado'), duracion);
    return () => clearTimeout(t);
  }, [abierto]); // Solo reacciona a abierto: la fase la maneja el propio efecto.

  return fase;
}
