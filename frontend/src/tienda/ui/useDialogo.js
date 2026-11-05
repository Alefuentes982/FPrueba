import { useEffect, useRef } from 'react';

// Comportamiento común del panel lateral y del modal (HU-95):
//   - al abrir, el foco entra al diálogo; al cerrar, vuelve al botón que lo abrió
//   - Tab y Mayús+Tab recorren solo lo que está dentro del diálogo
//   - Escape cierra
//   - la página de fondo no se desplaza mientras el diálogo está abierto
const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let bloqueos = 0;
function bloquearDesplazamiento() {
  bloqueos += 1;
  if (bloqueos > 1) return;
  const ancho = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = 'hidden';
  if (ancho > 0) document.body.style.paddingRight = `${ancho}px`;
}
function liberarDesplazamiento() {
  bloqueos = Math.max(bloqueos - 1, 0);
  if (bloqueos > 0) return;
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
}

export function useDialogo(activo, onCerrar) {
  const ref = useRef(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  useEffect(() => {
    if (!activo) return undefined;
    const anterior = document.activeElement;
    bloquearDesplazamiento();

    const nodo = ref.current;
    const primero = nodo?.querySelector('[data-autofoco]') ?? nodo?.querySelector(ENFOCABLES) ?? nodo;
    primero?.focus({ preventScroll: true });

    const alTeclear = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar.current(); return; }
      if (e.key !== 'Tab' || !nodo) return;
      const lista = [...nodo.querySelectorAll(ENFOCABLES)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (lista.length === 0) { e.preventDefault(); return; }
      const inicio = lista[0];
      const fin = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === inicio) { e.preventDefault(); fin.focus(); }
      else if (!e.shiftKey && document.activeElement === fin) { e.preventDefault(); inicio.focus(); }
    };
    nodo?.addEventListener('keydown', alTeclear);

    return () => {
      nodo?.removeEventListener('keydown', alTeclear);
      liberarDesplazamiento();
      if (anterior instanceof HTMLElement && document.contains(anterior)) anterior.focus({ preventScroll: true });
    };
  }, [activo]);

  return ref;
}
