import { createPortal } from 'react-dom';

// Dibuja su contenido en <div class="fct-capas"> (al final de TiendaApp), fuera de las tarjetas y secciones.
// Así un panel o un modal no queda atrapado dentro de un elemento con transform u overflow, y sigue heredando los
// colores y la fuente de .fct. Los paneles se abren después de que la tienda ya está en pantalla, así que el
// contenedor existe; si no, se usa <body>.
export default function Capa({ children }) {
  const destino = document.querySelector('.fct-capas') ?? document.body;
  return createPortal(children, destino);
}
