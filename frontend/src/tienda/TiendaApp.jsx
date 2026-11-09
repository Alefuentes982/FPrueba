import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { CarritoProvider } from './CarritoContext.jsx';
import Carrito from './Carrito.jsx';
import Catalogo from './Catalogo.jsx';
import Cuenta from './cuenta/Cuenta.jsx';
import { NuevaClave, Recuperar } from './cuenta/Recuperar.jsx';
import Registro from './cuenta/Registro.jsx';
import { CuentaProvider } from './CuentaContext.jsx';
import { DatosTiendaProvider } from './DatosTienda.jsx';
import Encabezado from './Encabezado.jsx';
import Ficha from './Ficha.jsx';
import Informacion from './Informacion.jsx';
import Pie from './Pie.jsx';
import Portada from './Portada.jsx';
import { NotificacionesProvider, ZonaNotificaciones } from './ui/Notificaciones.jsx';
import './tienda.css';

// Tienda en línea: rutas públicas /tienda/*, sin sesión y con diseño propio (aprobado el 27-10-2026, versión clara).
// Comparte la API y la base con el sistema del personal, pero solo usa los endpoints públicos /api/tienda.
// Cada página entra con un fundido corto (HU-95). Los paneles, modales y avisos se dibujan en .fct-capas.
// La cuenta de cliente (HU-68) tiene su propia sesión, separada de la del personal.
export default function TiendaApp() {
  const { pathname } = useLocation();
  return (
    <DatosTiendaProvider>
      <CuentaProvider>
        <CarritoProvider>
          <NotificacionesProvider>
            <div className="fct">
              <Encabezado />
              <main className="fct-contenido">
                <div key={pathname} className="fct-aparecer">
                  <Routes>
                    <Route index element={<Portada />} />
                    <Route path="productos" element={<Catalogo />} />
                    <Route path="producto/:id" element={<Ficha />} />
                    <Route path="carrito" element={<Carrito />} />
                    <Route path="informacion" element={<Informacion />} />
                    <Route path="cuenta" element={<Cuenta />} />
                    <Route path="cuenta/registro" element={<Registro />} />
                    <Route path="cuenta/recuperar" element={<Recuperar />} />
                    <Route path="cuenta/nueva-clave" element={<NuevaClave />} />
                    <Route path="*" element={<NoEncontrada />} />
                  </Routes>
                </div>
              </main>
              <Pie />
              <div className="fct-capas">
                <ZonaNotificaciones />
              </div>
            </div>
          </NotificacionesProvider>
        </CarritoProvider>
      </CuentaProvider>
    </DatosTiendaProvider>
  );
}

function NoEncontrada() {
  return (
    <div className="fct-wrap fct-pagina">
      <div className="fct-vacio">
        <i className="bi bi-signpost-split" aria-hidden="true" />
        <h1>No encontramos esta página</h1>
        <p>Puede que el enlace esté incompleto o que la página ya no exista.</p>
        <Link to="/tienda" className="fct-btn-primario">Ir al inicio de la tienda</Link>
      </div>
    </div>
  );
}
