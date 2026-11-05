import { useId } from 'react';
import Capa from './Capa.jsx';
import { useTransicion } from './movimiento.js';
import { useDialogo } from './useDialogo.js';

// Panel que se desliza desde un costado (offcanvas de Bootstrap 5.3 controlado por React, sin bootstrap.bundle.js).
// Se usa para el menú de categorías y, en celular, para los filtros del listado.
//   lado: 'start' (izquierda) o 'end' (derecha)
//   pie: botones fijos abajo, opcional
export default function PanelLateral({ abierto, onCerrar, titulo, lado = 'start', id, pie, children }) {
  const fase = useTransicion(abierto, 300);
  const visible = fase !== 'cerrado';
  const ref = useDialogo(fase === 'abierto', onCerrar); // con .show ya se puede enfocar
  const idTitulo = useId();
  if (!visible) return null;

  const clases = fase === 'abierto' ? 'show' : fase === 'saliendo' ? 'show hiding' : '';
  return (
    <Capa>
      <div ref={ref} id={id} className={`offcanvas offcanvas-${lado} fct-panel ${clases}`} tabIndex={-1}
        role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
        <div className="offcanvas-header">
          <h2 className="offcanvas-title" id={idTitulo}>{titulo}</h2>
          <button type="button" className="btn-close" aria-label="Cerrar" onClick={onCerrar} />
        </div>
        <div className="offcanvas-body">{children}</div>
        {pie && <div className="fct-panel-pie">{pie}</div>}
      </div>
      <div className={`offcanvas-backdrop fade${fase === 'abierto' ? ' show' : ''}`} onClick={onCerrar} aria-hidden="true" />
    </Capa>
  );
}
