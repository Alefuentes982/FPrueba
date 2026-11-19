import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { ErrorAlert, errorCampo } from '../../components/ui.jsx';

// Entrega de un retiro en farmacia (HU-77). El vendedor pide al cliente su número de pedido y su RUT (cédula) y los
// escribe; el servidor los compara con el pedido. No se muestra el RUT del cliente: se verifica lo que él presenta.
export default function EntregaRetiro({ pedido, onCerrar, onEntregado }) {
  const [codigo, setCodigo] = useState('');
  const [rut, setRut] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const primero = useRef(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  useEffect(() => {
    primero.current?.focus();
    const tecla = (e) => e.key === 'Escape' && cerrar.current();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  const entregar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      const p = await api.post(`/pedidos/${pedido.id}/entregar`, { codigo, rut });
      onEntregado(p);
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };
  const errCodigo = errorCampo(error, 'codigo');
  const errRut = errorCampo(error, 'rut');

  return (
    <>
      <div className="modal d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="titulo-entrega">
        <div className="modal-dialog modal-dialog-centered">
          <form className="modal-content" onSubmit={entregar}>
            <div className="modal-header">
              <h2 className="modal-title fs-5" id="titulo-entrega"><i className="bi bi-person-check me-2" />Entregar {pedido.codigo}</h2>
              <button type="button" className="btn-close" aria-label="Cerrar" onClick={onCerrar} />
            </div>
            <div className="modal-body">
              <p className="small text-muted">
                Pida al cliente el número de pedido (lo tiene en su correo o en Mis pedidos) y su cédula. Escríbalos tal como
                los muestra: el sistema revisa que correspondan a {pedido.nombre_cliente}.
              </p>
              {error && !errCodigo && !errRut && <ErrorAlert error={error} />}
              <div className="mb-3">
                <label htmlFor="entrega-codigo" className="form-label">Número de pedido</label>
                <input ref={primero} id="entrega-codigo" className={`form-control${errCodigo ? ' is-invalid' : ''}`} placeholder="PED-000123"
                  autoComplete="off" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
                {errCodigo && <div className="invalid-feedback">{errCodigo}</div>}
              </div>
              <div>
                <label htmlFor="entrega-rut" className="form-label">RUT del cliente</label>
                <input id="entrega-rut" className={`form-control${errRut ? ' is-invalid' : ''}`} placeholder="12.345.678-5"
                  autoComplete="off" value={rut} onChange={(e) => setRut(e.target.value)} />
                {errRut && <div className="invalid-feedback">{errRut}</div>}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onCerrar}>Cancelar</button>
              <button type="submit" className="btn btn-success" disabled={enviando || !codigo.trim() || !rut.trim()}>
                {enviando ? 'Verificando…' : 'Verificar y entregar'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </>
  );
}
