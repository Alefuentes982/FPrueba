import { useCallback } from 'react';
import { useCarrito } from './CarritoContext.jsx';
import { ImagenProducto } from './comunes.jsx';
import { useNotificar } from './ui/Notificaciones.jsx';

// Agrega al carro y muestra el aviso flotante "Agregado al carro" con acceso al carro (HU-95).
// Devuelve cuántas unidades se agregaron (0 si ya estaban todas las disponibles).
export function useAgregarAlCarro() {
  const { agregar } = useCarrito();
  const notificar = useNotificar();
  return useCallback((producto, cantidad = 1) => {
    const n = agregar(producto, cantidad);
    if (n > 0) {
      notificar({
        titulo: 'Agregado al carro',
        texto: `${n === 1 ? '1 unidad' : `${n} unidades`} · ${producto.nombre}`,
        imagen: <ImagenProducto producto={producto} className="fct-aviso-foto" />,
        accion: { texto: 'Ver carro', a: '/tienda/carrito' },
      });
    }
    return n;
  }, [agregar, notificar]);
}
