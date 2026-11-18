import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { money } from '../format.js';
import { SelectorComuna, useComunas } from './cuenta/Campos.jsx';
import { useCuenta } from './CuentaContext.jsx';
import Modal from './ui/Modal.jsx';

// Comuna para calcular el despacho (HU-78). Se elige en la barra superior y se recuerda en este navegador; con sesión,
// parte con la comuna de la cuenta. El costo real lo vuelve a calcular el servidor al crear el pedido.
const CLAVE = 'farmaclick.tienda.comuna';
const leer = () => { try { return localStorage.getItem(CLAVE) || ''; } catch { return ''; } };
const guardar = (id) => { try { if (id) localStorage.setItem(CLAVE, id); else localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ } };

const ComunaContext = createContext({ comuna: null, costo: null, elegir: () => {}, abrirSelector: () => {} });

export function ComunaDespachoProvider({ children }) {
  const regiones = useComunas();
  const { cliente } = useCuenta();
  const [comunaId, setComunaId] = useState(leer);
  const [selector, setSelector] = useState(false);
  useEffect(() => { if (!comunaId && cliente?.comuna_id) setComunaId(cliente.comuna_id); }, [cliente, comunaId]);

  const comuna = useMemo(() => regiones.flatMap((r) => r.comunas).find((c) => c.id === comunaId) ?? null, [regiones, comunaId]);
  const valor = useMemo(() => ({
    comuna,
    costo: comuna?.costo_despacho ?? null,
    elegir: (id) => { setComunaId(id); guardar(id); },
    abrirSelector: () => setSelector(true),
  }), [comuna]);

  return (
    <ComunaContext.Provider value={valor}>
      {children}
      <SelectorDespacho abierto={selector} onCerrar={() => setSelector(false)} comunaId={comunaId}
        onElegir={(id) => { valor.elegir(id); setSelector(false); }} />
    </ComunaContext.Provider>
  );
}

export const useComunaDespacho = () => useContext(ComunaContext);

// Texto corto del costo: "$2.990", "Sin despacho" o null si aún no se eligió comuna.
export const textoCosto = (comuna) => (!comuna ? null : comuna.costo_despacho == null ? 'Sin despacho' : money(comuna.costo_despacho));

function SelectorDespacho({ abierto, onCerrar, comunaId, onElegir }) {
  const [elegida, setElegida] = useState(comunaId);
  useEffect(() => { if (abierto) setElegida(comunaId); }, [abierto, comunaId]);
  const regiones = useComunas();
  const comuna = regiones.flatMap((r) => r.comunas).find((c) => c.id === elegida);
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="¿Dónde recibes tu pedido?" tamano="md">
      <p className="fct-suave">Elige tu comuna para ver cuánto cuesta el despacho. El retiro en farmacia no tiene costo.</p>
      <div className="fct-form fct-form-2">
        <SelectorComuna comunaId={elegida} onCambiar={setElegida} />
      </div>
      {comuna && (
        <p className={comuna.costo_despacho == null ? 'fct-no' : 'fct-ok'} role="status">
          {comuna.costo_despacho == null
            ? `Todavía no despachamos a ${comuna.nombre}. Puedes retirar en la farmacia.`
            : `Despacho a ${comuna.nombre}: ${money(comuna.costo_despacho)}`}
        </p>
      )}
      <div className="fct-modal-acciones">
        <button type="button" className="fct-btn-borde" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="fct-btn-primario" disabled={!elegida} onClick={() => onElegir(elegida)}>Usar esta comuna</button>
      </div>
    </Modal>
  );
}
