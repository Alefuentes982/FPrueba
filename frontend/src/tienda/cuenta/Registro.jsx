import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { cuentaApi } from '../apiTienda.js';
import { Aviso } from '../comunes.jsx';
import { primerNombre, useCuenta } from '../CuentaContext.jsx';
import { useNotificar } from '../ui/Notificaciones.jsx';
import { Campo, CampoClave, erroresPorCampo, SelectorComuna } from './Campos.jsx';
import { destinoSeguro } from './Cuenta.jsx';
import './cuenta.css';

const VACIO = { nombre: '', rut: '', correo: '', telefono: '', direccion: '', comuna_id: '', password: '' };

// Crear cuenta (HU-68). Supabase envía un correo de confirmación; hasta confirmarlo no se puede ingresar.
export default function Registro() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { iniciar } = useCuenta();
  const notificar = useNotificar();
  const volver = destinoSeguro(params.get('volver'));
  const [d, setD] = useState(VACIO);
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [enviadoA, setEnviadoA] = useState(null);
  const cambiar = (campo) => (e) => setD((x) => ({ ...x, [campo]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    if (d.password !== repetir) { setError({ details: [{ path: 'repetir', message: 'Las contraseñas no coinciden.' }] }); return; }
    setEnviando(true); setError(null);
    try {
      const r = await cuentaApi.registrar(d);
      if (r.requiere_confirmacion) { setEnviadoA(r.correo); window.scrollTo(0, 0); return; }
      iniciar(r);
      notificar({ titulo: `Bienvenida/o, ${primerNombre(r.cliente)}`, texto: 'Tu cuenta quedó creada.', icono: 'bi-person-check-fill' });
      navigate(volver, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };

  if (enviadoA) {
    return (
      <div className="fct-wrap fct-pagina">
        <div className="fct-cuenta-caja fct-vacio">
          <i className="bi bi-envelope-check" aria-hidden="true" />
          <h1>Revisa tu correo</h1>
          <p>Te enviamos un enlace a <b>{enviadoA}</b> para confirmar tu cuenta. Ábrelo y luego ingresa con tu contraseña.</p>
          <p className="fct-nota">Si no llega en unos minutos, revisa la carpeta de spam.</p>
          <Link to={`/tienda/cuenta${volver !== '/tienda' ? `?volver=${encodeURIComponent(volver)}` : ''}`} className="fct-btn-primario">Ir a ingresar</Link>
        </div>
      </div>
    );
  }

  const campos = erroresPorCampo(error);
  return (
    <div className="fct-wrap fct-pagina">
      <div className="fct-cuenta-caja fct-cuenta-ancha">
        <h1>Crea tu cuenta</h1>
        <p className="fct-suave">Tus datos se usan para preparar y entregar tus pedidos. Al retirar en la farmacia te pediremos el RUT.</p>
        {error && !error.details && <Aviso error={error} />}
        {error?.details && <Aviso error={{ message: 'Revisa los campos marcados.' }} />}
        <form onSubmit={enviar} className="fct-form fct-form-2" noValidate>
          <Campo etiqueta="Nombre y apellido" error={campos.nombre} className="fct-ancho">
            {(a) => <input {...a} autoComplete="name" value={d.nombre} onChange={cambiar('nombre')} maxLength={150} />}
          </Campo>
          <Campo etiqueta="RUT" error={campos.rut} ayuda="Con guion, por ejemplo 12.345.678-5">
            {(a) => <input {...a} value={d.rut} onChange={cambiar('rut')} maxLength={12} inputMode="text" />}
          </Campo>
          <Campo etiqueta="Teléfono" error={campos.telefono} ayuda="9 dígitos, por ejemplo 9 1234 5678">
            {(a) => <input {...a} type="tel" autoComplete="tel-national" value={d.telefono} onChange={cambiar('telefono')} maxLength={16} />}
          </Campo>
          <Campo etiqueta="Correo" error={campos.correo} className="fct-ancho">
            {(a) => <input {...a} type="email" autoComplete="email" value={d.correo} onChange={cambiar('correo')} maxLength={150} />}
          </Campo>
          <Campo etiqueta="Dirección" error={campos.direccion} ayuda="Calle, número y depto. Se usa para el despacho." className="fct-ancho">
            {(a) => <input {...a} autoComplete="street-address" value={d.direccion} onChange={cambiar('direccion')} maxLength={200} />}
          </Campo>
          <SelectorComuna comunaId={d.comuna_id} onCambiar={(v) => setD((x) => ({ ...x, comuna_id: v }))} error={campos.comuna_id} />
          <Campo etiqueta="Contraseña" error={campos.password} ayuda="Al menos 8 caracteres, con letras y números">
            {(a) => <CampoClave {...a} autoComplete="new-password" value={d.password} onChange={cambiar('password')} />}
          </Campo>
          <Campo etiqueta="Repite la contraseña" error={campos.repetir}>
            {(a) => <CampoClave {...a} autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />}
          </Campo>
          <div className="fct-ancho fct-form-fin">
            <button type="submit" className="fct-btn-primario" disabled={enviando}>{enviando ? 'Creando cuenta…' : 'Crear cuenta'}</button>
            <span className="fct-suave">¿Ya tienes cuenta? <Link to={`/tienda/cuenta${volver !== '/tienda' ? `?volver=${encodeURIComponent(volver)}` : ''}`} className="fct-enlace">Ingresa aquí</Link></span>
          </div>
        </form>
      </div>
    </div>
  );
}
