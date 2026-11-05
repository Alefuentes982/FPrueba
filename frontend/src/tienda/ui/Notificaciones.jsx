import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTransicion } from './movimiento.js';

// Avisos flotantes (toast de Bootstrap 5.3 controlado por React). Se usan para confirmar acciones, por ejemplo
// "Agregado al carro". Se muestra uno a la vez: uno nuevo reemplaza al anterior. Se cierran solos a los 4 segundos,
// salvo que el puntero o el foco estén encima.
//   <NotificacionesProvider> envuelve la tienda, <ZonaNotificaciones /> va dentro de .fct y useNotificar() avisa.
const Contexto = createContext({ notificar: () => {}, aviso: null, cerrar: () => {} });
const DURACION = 4000;

export function NotificacionesProvider({ children }) {
  const [aviso, setAviso] = useState(null);
  const contador = useRef(0);
  // aviso = { titulo, texto, icono, imagen (elemento opcional), accion: { texto, a } }
  const notificar = useCallback((nuevo) => { contador.current += 1; setAviso({ ...nuevo, clave: contador.current }); }, []);
  const cerrar = useCallback(() => setAviso(null), []);
  const valor = useMemo(() => ({ notificar, aviso, cerrar }), [notificar, aviso, cerrar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useNotificar = () => useContext(Contexto).notificar;

export function ZonaNotificaciones() {
  const { aviso, cerrar } = useContext(Contexto);
  return (
    <div className="toast-container position-fixed bottom-0 end-0 p-3 fct-avisos" aria-live="polite" aria-atomic="true">
      <Notificacion aviso={aviso} onCerrar={cerrar} />
    </div>
  );
}

function Notificacion({ aviso, onCerrar }) {
  // Se guarda el último aviso para que siga visible mientras se desvanece.
  const [mostrado, setMostrado] = useState(aviso);
  const [pausa, setPausa] = useState(false);
  const fase = useTransicion(Boolean(aviso), 200);
  useEffect(() => { if (aviso) { setMostrado(aviso); setPausa(false); } }, [aviso]);

  useEffect(() => {
    if (!aviso || pausa) return undefined;
    const t = setTimeout(onCerrar, DURACION);
    return () => clearTimeout(t);
  }, [aviso, pausa, onCerrar]);

  const actual = aviso ?? mostrado;
  if (fase === 'cerrado' || !actual) return null;
  return (
    <div key={actual.clave} className={`toast fade show fct-aviso-flotante${fase === 'abierto' ? '' : ' showing'}`} role="status"
      onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}
      onFocus={() => setPausa(true)} onBlur={() => setPausa(false)}>
      <div className="fct-aviso-flotante-cuerpo">
        {actual.imagen ?? <i className={`bi ${actual.icono ?? 'bi-check-circle-fill'}`} aria-hidden="true" />}
        <div className="fct-aviso-flotante-texto">
          <b>{actual.titulo}</b>
          {actual.texto && <span>{actual.texto}</span>}
          {actual.accion && <Link to={actual.accion.a} onClick={onCerrar}>{actual.accion.texto}</Link>}
        </div>
        <button type="button" className="btn-close" aria-label="Cerrar aviso" onClick={onCerrar} />
      </div>
    </div>
  );
}
