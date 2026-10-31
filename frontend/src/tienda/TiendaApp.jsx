import { Link, Route, Routes } from 'react-router-dom';
import { DatosTiendaProvider } from './DatosTienda.jsx';
import Encabezado from './Encabezado.jsx';
import Informacion from './Informacion.jsx';
import Pie from './Pie.jsx';
import Portada from './Portada.jsx';
import './tienda.css';

// Tienda en línea: rutas públicas /tienda/*, sin sesión y con diseño propio (aprobado el 27-10-2026, versión clara).
// Comparte la API y la base con el sistema del personal, pero solo usa los endpoints públicos /api/tienda.
export default function TiendaApp() {
  return (
    <DatosTiendaProvider>
      <div className="fct">
        <Encabezado />
        <main className="fct-contenido">
          <Routes>
            <Route index element={<Portada />} />
            <Route path="informacion" element={<Informacion />} />
            <Route path="*" element={<NoEncontrada />} />
          </Routes>
        </main>
        <Pie />
      </div>
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
