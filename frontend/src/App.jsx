import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { Spinner } from './components/ui.jsx';
import modulos from './modules/index.js';
import Login from './modules/auth/Login.jsx';

const entradas = modulos
  .flatMap((m) => m.nav.map((n) => ({ ...n, modulo: m.modulo })))
  .sort((a, b) => a.orden - b.orden);

function Layout() {
  const { user, logout, can } = useAuth();
  return (
    <>
      <nav className="navbar navbar-expand-md navbar-dark bg-primary mb-4">
        <div className="container">
          <span className="navbar-brand fw-bold"><i className="bi bi-heart-pulse me-2" />FarmaClick</span>
          <div className="navbar-nav flex-row flex-wrap gap-1 me-auto">
            {entradas.filter((e) => can(e.modulo)).map((e) => (
              <NavLink key={e.to} to={e.to} className="nav-link text-nowrap px-2"><i className={`bi ${e.icon} me-1`} />{e.label}</NavLink>
            ))}
          </div>
          <div className="d-flex align-items-center gap-3 text-white text-nowrap">
            <span className="small"><i className="bi bi-person-circle me-1" />{user.nombre} · {user.rol}</span>
            <button className="btn btn-sm btn-outline-light" onClick={logout}>Salir</button>
          </div>
        </div>
      </nav>
      <main className="container pb-5">
        <Routes>
          <Route path="/" element={<Inicio />} />
          {modulos.flatMap((m) => m.rutas.map((r) => (
            <Route key={r.path} path={r.path} element={<Guard modulo={m.modulo}>{r.element}</Guard>} />
          )))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

// Redirige al primer módulo al que el usuario tiene acceso.
function Inicio() {
  const { can } = useAuth();
  const primera = entradas.find((e) => can(e.modulo));
  return primera ? <Navigate to={primera.to} replace /> : <div className="alert alert-warning">Su rol no tiene módulos habilitados.</div>;
}

// El permiso real lo exige el backend; esto solo evita mostrar pantallas que fallarían.
function Guard({ modulo, children }) {
  const { can } = useAuth();
  return can(modulo) ? children : <div className="alert alert-warning">No tiene permiso para acceder a este módulo.</div>;
}

export default function App() {
  const { user, cargando } = useAuth();
  const location = useLocation();
  if (cargando) return <Spinner />;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Layout />} />
    </Routes>
  );
}
