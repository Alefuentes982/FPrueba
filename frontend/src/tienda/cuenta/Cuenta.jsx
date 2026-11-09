import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { cuentaApi } from '../apiTienda.js';
import { Aviso, Cargando } from '../comunes.jsx';
import { primerNombre, useCuenta } from '../CuentaContext.jsx';
import { useNotificar } from '../ui/Notificaciones.jsx';
import { Campo, CampoClave, erroresPorCampo } from './Campos.jsx';
import './cuenta.css';

// Solo se vuelve a páginas de la tienda (evita redirecciones a otros sitios).
export const destinoSeguro = (volver) => (typeof volver === 'string' && /^\/tienda(\/|$)/.test(volver) ? volver : '/tienda');

// /tienda/cuenta: sin sesión, el formulario de ingreso; con sesión, los datos de la cuenta (HU-68).
// ?volver=/tienda/... lleva de vuelta después de ingresar (por ejemplo, al checkout).
export default function Cuenta() {
  const { cliente, cargando } = useCuenta();
  if (cargando) return <Cargando />;
  return cliente ? <MiCuenta cliente={cliente} /> : <Ingreso />;
}

// Mensaje que deja Supabase en la dirección al volver del enlace del correo (#error_description=... o #access_token=...).
function mensajeDelEnlace(hash, confirmado) {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  if (p.get('error_code') === 'otp_expired' || /expired/i.test(p.get('error_description') ?? '')) {
    return { error: true, texto: 'El enlace del correo venció o ya se usó. Ingresa tu correo abajo y te enviamos uno nuevo.' };
  }
  if (p.get('error')) return { error: true, texto: 'No pudimos validar el enlace del correo. Pide uno nuevo.' };
  if (confirmado) return { error: false, texto: '¡Listo! Tu correo quedó confirmado. Ya puedes ingresar.' };
  return null;
}

function Ingreso() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [params] = useSearchParams();
  const { ingresar } = useCuenta();
  const notificar = useNotificar();
  const volver = destinoSeguro(params.get('volver'));
  const [mensaje] = useState(() => mensajeDelEnlace(hash, params.get('confirmado') === '1'));
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  // El enlace de Supabase deja tokens en la dirección: se borran para que no queden en el historial.
  useEffect(() => { if (hash) window.history.replaceState(null, '', window.location.pathname + window.location.search); }, [hash]);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError(null); setReenviado(false);
    try {
      const c = await ingresar(correo, clave);
      notificar({ titulo: `Hola, ${primerNombre(c)}`, texto: 'Ingresaste a tu cuenta.', icono: 'bi-person-check-fill' });
      navigate(volver, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };

  const reenviar = async () => {
    await cuentaApi.reenviarConfirmacion(correo).catch(() => {});
    setReenviado(true);
  };

  const campos = erroresPorCampo(error);
  return (
    <div className="fct-wrap fct-pagina">
      <div className="fct-cuenta-caja">
        <h1>Ingresa a tu cuenta</h1>
        <p className="fct-suave">{volver !== '/tienda' ? 'Para continuar con tu compra, ingresa o crea tu cuenta.' : 'Con tu cuenta compras más rápido y retiras con tu RUT.'}</p>
        {mensaje && (mensaje.error ? <Aviso error={{ message: mensaje.texto }} /> : <div className="fct-exito" role="status"><i className="bi bi-check-circle-fill" aria-hidden="true" />{mensaje.texto}</div>)}
        {error && !error.details && <Aviso error={error} />}
        {error?.codigo === 'correo_sin_confirmar' && (
          reenviado
            ? <p className="fct-suave">Si el correo está registrado, te llegará un enlace nuevo en unos minutos.</p>
            : <button type="button" className="fct-enlace" onClick={reenviar}>Enviarme otro enlace de confirmación</button>
        )}
        <form onSubmit={enviar} className="fct-form" noValidate>
          <Campo etiqueta="Correo" error={campos.correo}>
            {(a) => <input {...a} type="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required maxLength={150} />}
          </Campo>
          <Campo etiqueta="Contraseña" error={campos.password}>
            {(a) => <CampoClave {...a} value={clave} onChange={(e) => setClave(e.target.value)} required />}
          </Campo>
          <Link to="/tienda/cuenta/recuperar" className="fct-olvide">¿Olvidaste tu contraseña?</Link>
          <button type="submit" className="fct-btn-primario" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
        <div className="fct-cuenta-pie">
          <span>¿Primera vez en FarmaClick?</span>
          <Link to={`/tienda/cuenta/registro${volver !== '/tienda' ? `?volver=${encodeURIComponent(volver)}` : ''}`} className="fct-btn-borde">Crear cuenta</Link>
        </div>
      </div>
    </div>
  );
}

function MiCuenta({ cliente }) {
  const { salir } = useCuenta();
  const navigate = useNavigate();
  const datos = [
    ['Nombre', cliente.nombre],
    ['Correo', cliente.correo],
    ['RUT', cliente.rut],
    ['Teléfono', cliente.telefono],
    ['Dirección', [cliente.direccion, cliente.comuna, cliente.region].filter(Boolean).join(', ')],
  ];
  return (
    <div className="fct-wrap fct-pagina">
      <div className="fct-cuenta-caja fct-cuenta-ancha">
        <h1>Hola, {primerNombre(cliente)}</h1>
        <p className="fct-suave">Estos son los datos de tu cuenta. Usamos tu RUT para entregarte los pedidos que retires en la farmacia.</p>
        <dl className="fct-datos">
          {datos.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}
        </dl>
        <p className="fct-nota">Pronto podrás editar tus datos y ver tus pedidos desde aquí.</p>
        <div className="fct-cuenta-acciones">
          <Link to="/tienda/productos" className="fct-btn-primario">Seguir comprando</Link>
          <button type="button" className="fct-btn-borde" onClick={() => { salir(); navigate('/tienda'); }}>
            <i className="bi bi-box-arrow-right" aria-hidden="true" />&nbsp;Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
