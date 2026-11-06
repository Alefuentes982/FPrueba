import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { cuentaApi } from './apiTienda.js';
import { borrarSesionCliente, CLAVE_SESION_CLIENTE, guardarSesionCliente, leerSesionCliente } from './sesionTienda.js';

// Cliente con sesión iniciada en la tienda (HU-68). cliente = null sin sesión; cargando = true mientras se revisa una
// sesión guardada al abrir la tienda. Se sincroniza entre pestañas.
const CuentaContext = createContext({ cliente: null, cargando: false });

export function CuentaProvider({ children }) {
  const [cliente, setCliente] = useState(() => leerSesionCliente()?.cliente ?? null);
  const [cargando, setCargando] = useState(() => Boolean(leerSesionCliente()));

  const revisar = useCallback(() => {
    if (!leerSesionCliente()) { setCliente(null); setCargando(false); return; }
    cuentaApi.yo()
      .then((c) => { setCliente(c); guardarSesionCliente({ ...leerSesionCliente(), cliente: c }); })
      .catch((e) => { if (e.status === 401 || e.status === 403) { borrarSesionCliente(); setCliente(null); } })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { revisar(); }, [revisar]);

  useEffect(() => {
    const otraPestana = (e) => { if (e.key === CLAVE_SESION_CLIENTE) setCliente(leerSesionCliente()?.cliente ?? null); };
    const aqui = () => setCliente(leerSesionCliente()?.cliente ?? null);
    window.addEventListener('storage', otraPestana);
    window.addEventListener('tienda:sesion', aqui);
    return () => { window.removeEventListener('storage', otraPestana); window.removeEventListener('tienda:sesion', aqui); };
  }, []);

  // respuesta = { access_token, refresh_token, cliente } (ingreso o registro sin confirmación de correo)
  const iniciar = useCallback((respuesta) => {
    const { cliente: c, ...tokens } = respuesta;
    guardarSesionCliente({ ...tokens, cliente: c });
    setCliente(c);
  }, []);

  const ingresar = useCallback(async (correo, password) => {
    const r = await cuentaApi.ingresar(correo, password);
    iniciar(r);
    return r.cliente;
  }, [iniciar]);

  const salir = useCallback(() => { borrarSesionCliente(); setCliente(null); }, []);

  const valor = useMemo(() => ({ cliente, cargando, ingresar, iniciar, salir }), [cliente, cargando, ingresar, iniciar, salir]);
  return <CuentaContext.Provider value={valor}>{children}</CuentaContext.Provider>;
}

export const useCuenta = () => useContext(CuentaContext);

// Primer nombre para el saludo de la cabecera.
export const primerNombre = (cliente) => String(cliente?.nombre ?? '').trim().split(/\s+/)[0] || 'cliente';
