import { useId } from 'react';
import Capa from './Capa.jsx';
import { useTransicion } from './movimiento.js';
import { useDialogo } from './useDialogo.js';

// Ventana modal (modal de Bootstrap 5.3 controlado por React, sin bootstrap.bundle.js). Aparece con un fundido y el
// cuadro baja suavemente; se cierra con la X, con Escape o con un clic en el fondo.
export default function Modal({ abierto, onCerrar, titulo, tituloVisible = true, tamano = 'lg', children }) {
  const fase = useTransicion(abierto, 300);
  const visible = fase !== 'cerrado';
  const ref = useDialogo(fase === 'abierto', onCerrar); // con .show ya se puede enfocar
  const idTitulo = useId();
  if (!visible) return null;

  const show = fase === 'abierto' ? ' show' : '';
  return (
    <Capa>
      <div className={`modal fade d-block fct-modal${show}`} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={idTitulo}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
        <div ref={ref} className={`modal-dialog modal-dialog-centered modal-dialog-scrollable modal-${tamano}`} tabIndex={-1}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className={`modal-title${tituloVisible ? '' : ' visually-hidden'}`} id={idTitulo}>{titulo}</h2>
              <button type="button" className="btn-close" aria-label="Cerrar" onClick={onCerrar} />
            </div>
            <div className="modal-body">{children}</div>
          </div>
        </div>
      </div>
      <div className={`modal-backdrop fade${show}`} aria-hidden="true" />
    </Capa>
  );
}
