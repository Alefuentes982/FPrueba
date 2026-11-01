import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CLAVE, agregarItem, fijarCantidad, guardarCarrito, leerCarrito, unidades } from './carrito.js';

// Carrito de la tienda guardado en el navegador (se mantiene al recargar y se sincroniza entre pestañas).
const CarritoContext = createContext(null);
const almacen = () => { try { return window.localStorage; } catch { return null; } };

export function CarritoProvider({ children }) {
  const [items, setItems] = useState(() => leerCarrito(almacen()));

  useEffect(() => { guardarCarrito(almacen(), items); }, [items]);

  // Otra pestaña cambió el carrito.
  useEffect(() => {
    const alCambiar = (e) => { if (e.key === CLAVE) setItems(leerCarrito(almacen())); };
    window.addEventListener('storage', alCambiar);
    return () => window.removeEventListener('storage', alCambiar);
  }, []);

  // producto = { id, disponible } tal como lo entrega la API. Devuelve cuántas unidades se agregaron.
  const agregar = useCallback((producto, cantidad = 1) => {
    const r = agregarItem(items, producto, cantidad);
    if (r.agregadas) setItems(r.items);
    return r.agregadas;
  }, [items]);
  const cambiar = useCallback((productoId, cantidad, disponible) => setItems((l) => fijarCantidad(l, productoId, cantidad, disponible)), []);
  const quitar = useCallback((productoId) => setItems((l) => l.filter((x) => x.producto_id !== productoId)), []);
  const vaciar = useCallback(() => setItems([]), []);

  const valor = useMemo(() => ({
    items, agregar, cambiar, quitar, vaciar,
    unidades: unidades(items),
    cantidadDe: (id) => items.find((x) => x.producto_id === id)?.cantidad ?? 0,
  }), [items, agregar, cambiar, quitar, vaciar]);

  return <CarritoContext.Provider value={valor}>{children}</CarritoContext.Provider>;
}

export const useCarrito = () => useContext(CarritoContext);
