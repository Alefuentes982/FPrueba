import { useEffect, useId, useState } from 'react';
import { tiendaApi } from '../apiTienda.js';

// Piezas de los formularios de la cuenta y del checkout (HU-68 y HU-71).

// Errores de validación que devuelve la API ({ details: [{ path, message }] }) agrupados por campo.
export function erroresPorCampo(error) {
  const porCampo = {};
  for (const d of error?.details ?? []) if (!porCampo[d.path]) porCampo[d.path] = d.message;
  return porCampo;
}

// Campo con etiqueta, ayuda y mensaje de error asociado (para lectores de pantalla).
export function Campo({ etiqueta, error, ayuda, children, className = '' }) {
  const id = useId();
  const hijo = typeof children === 'function'
    ? children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined })
    : children;
  return (
    <div className={`fct-campo${error ? ' fct-campo-error' : ''} ${className}`}>
      <label htmlFor={id}>{etiqueta}</label>
      {hijo}
      {error ? <small id={`${id}-error`} className="fct-campo-mensaje">{error}</small>
        : ayuda && <small id={`${id}-ayuda`} className="fct-campo-ayuda">{ayuda}</small>}
    </div>
  );
}

// Contraseña con botón para mostrarla u ocultarla.
export function CampoClave({ value, onChange, autoComplete = 'current-password', ...props }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="fct-clave">
      <input type={ver ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} maxLength={72} {...props} />
      <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
        <i className={`bi ${ver ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
      </button>
    </div>
  );
}

// Regiones y comunas desde la API (se piden una vez por visita).
let cacheComunas = null;
export function useComunas() {
  const [regiones, setRegiones] = useState(cacheComunas ?? []);
  useEffect(() => {
    if (cacheComunas) return;
    tiendaApi.comunas().then((r) => { cacheComunas = r; setRegiones(r); }).catch(() => setRegiones([]));
  }, []);
  return regiones;
}

// Región y comuna en dos listas: al cambiar la región se limpia la comuna.
export function SelectorComuna({ comunaId, onCambiar, error }) {
  const regiones = useComunas();
  const regionDeComuna = regiones.find((r) => r.comunas.some((c) => c.id === comunaId))?.id ?? '';
  const [region, setRegion] = useState(regionDeComuna);
  useEffect(() => { if (regionDeComuna) setRegion(regionDeComuna); }, [regionDeComuna]);
  useEffect(() => { if (!region && regiones.length === 1) setRegion(regiones[0].id); }, [regiones, region]);
  const comunas = regiones.find((r) => r.id === region)?.comunas ?? [];
  return (
    <>
      <Campo etiqueta="Región">
        {(a) => (
          <select {...a} value={region} onChange={(e) => { setRegion(e.target.value); onCambiar(''); }}>
            <option value="">Elige tu región</option>
            {regiones.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        )}
      </Campo>
      <Campo etiqueta="Comuna" error={error}>
        {(a) => (
          <select {...a} value={comunaId} onChange={(e) => onCambiar(e.target.value)} disabled={!region}>
            <option value="">{region ? 'Elige tu comuna' : 'Primero elige la región'}</option>
            {comunas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
      </Campo>
    </>
  );
}
