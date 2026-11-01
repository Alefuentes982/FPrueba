import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { tiendaApi } from './apiTienda.js';

// Datos que usan varias partes de la tienda a la vez (menú, portada, pie, filtros): las categorías con productos y
// las sucursales que venden en línea. Se piden una sola vez al entrar a la tienda.
const DatosContext = createContext({ categorias: [], sucursales: [], cargado: false, categoriaPorNombre: () => null });

export function DatosTiendaProvider({ children }) {
  const [categorias, setCategorias] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    // Si falla, la tienda igual funciona: el menú queda sin categorías y el pie sin dirección.
    Promise.allSettled([tiendaApi.categorias(), tiendaApi.sucursales()]).then(([c, s]) => {
      if (c.status === 'fulfilled') setCategorias(c.value);
      if (s.status === 'fulfilled') setSucursales(s.value);
      setCargado(true);
    });
  }, []);

  const valor = useMemo(() => ({
    categorias,
    sucursales,
    cargado,
    // Los banners nombran categorías por su nombre; los enlaces necesitan su id.
    categoriaPorNombre: (nombre) => categorias.find((c) => c.nombre === nombre) ?? null,
  }), [categorias, sucursales, cargado]);

  return <DatosContext.Provider value={valor}>{children}</DatosContext.Provider>;
}

export const useDatosTienda = () => useContext(DatosContext);

// Enlace al listado de una categoría (o a todos los productos si no existe).
export const enlaceCategoria = (categoria) => (categoria ? `/tienda/productos?categoria=${categoria.id}` : '/tienda/productos');
