import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cuentaApi } from '../apiTienda.js';
import { Aviso } from '../comunes.jsx';
import { useNotificar } from '../ui/Notificaciones.jsx';
import { Campo, CampoClave, erroresPorCampo } from './Campos.jsx';
import './cuenta.css';

// "¿Olvidaste tu contraseña?" (HU-68): se pide el correo y Supabase envía un enlace. La respuesta es la misma exista o
// no la cuenta, para no revelar qué correos están registrados.
export function Recuperar() {
  const [correo, setCorreo] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError(null);
    try { await cuentaApi.recuperar(correo); setEnviado(true); } catch (err) { setError(err); } finally { setEnviando(false); }
  };

  return (
    <div className="fct-wrap fct-pagina">
      <div className="fct-cuenta-caja">
        <h1>Crea una nueva contraseña</h1>
        {enviado ? (
          <>
            <div className="fct-exito" role="status"><i className="bi bi-envelope-check" aria-hidden="true" />Si {correo} tiene una cuenta, te llegará un enlace en unos minutos.</div>
            <p className="fct-suave">Ábrelo desde este mismo computador o celular. Si no llega, revisa la carpeta de spam.</p>
            <Link to="/tienda/cuenta" className="fct-btn-borde">Volver a ingresar</Link>
          </>
        ) : (
          <>
            <p className="fct-suave">Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.</p>
            {error && !error.details && <Aviso error={error} />}
            <form onSubmit={enviar} className="fct-form" noValidate>
              <Campo etiqueta="Correo" error={erroresPorCampo(error).correo}>
                {(a) => <input {...a} type="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} maxLength={150} />}
              </Campo>
              <button type="submit" className="fct-btn-primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar enlace'}</button>
            </form>
            <Link to="/tienda/cuenta" className="fct-olvide">Volver a ingresar</Link>
          </>
        )}
      </div>
    </div>
  );
}

// Página a la que lleva el enlace del correo: /tienda/cuenta/nueva-clave#access_token=...&type=recovery
export function NuevaClave() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const notificar = useNotificar();
  const [token] = useState(() => new URLSearchParams(hash.replace(/^#/, '')).get('access_token'));
  const [clave, setClave] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  // El token no debe quedar en el historial del navegador.
  useEffect(() => { if (hash) window.history.replaceState(null, '', window.location.pathname); }, [hash]);

  const enviar = async (e) => {
    e.preventDefault();
    if (clave !== repetir) { setError({ details: [{ path: 'repetir', message: 'Las contraseñas no coinciden.' }] }); return; }
    setEnviando(true); setError(null);
    try {
      await cuentaApi.nuevaClave(token, clave);
      notificar({ titulo: 'Contraseña actualizada', texto: 'Ya puedes ingresar con tu nueva contraseña.', icono: 'bi-shield-check' });
      navigate('/tienda/cuenta', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };

  const campos = erroresPorCampo(error);
  return (
    <div className="fct-wrap fct-pagina">
      <div className="fct-cuenta-caja">
        <h1>Elige tu nueva contraseña</h1>
        {!token ? (
          <>
            <Aviso error={{ message: 'Este enlace está incompleto o ya se usó. Pide uno nuevo.' }} />
            <Link to="/tienda/cuenta/recuperar" className="fct-btn-borde">Pedir un enlace nuevo</Link>
          </>
        ) : (
          <>
            {error && !error.details && <Aviso error={error} />}
            {error?.status === 401 && <Link to="/tienda/cuenta/recuperar" className="fct-btn-borde">Pedir un enlace nuevo</Link>}
            <form onSubmit={enviar} className="fct-form" noValidate>
              <Campo etiqueta="Nueva contraseña" error={campos.password} ayuda="Al menos 8 caracteres, con letras y números">
                {(a) => <CampoClave {...a} autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />}
              </Campo>
              <Campo etiqueta="Repite la contraseña" error={campos.repetir}>
                {(a) => <CampoClave {...a} autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />}
              </Campo>
              <button type="submit" className="fct-btn-primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar contraseña'}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
