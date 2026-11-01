import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import logo from '../assets/farmaclick-logo.svg';
import { useCarrito } from './CarritoContext.jsx';
import { FARMACIA, FUNCIONES } from './contenido.js';
import { enlaceCategoria, useDatosTienda } from './DatosTienda.jsx';

// Barra superior, cabecera con buscador y carro, y menú de categorías (diseño aprobado, versión clara).
export default function Encabezado() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { categorias, sucursales } = useDatosTienda();
  const { unidades } = useCarrito();
  const [texto, setTexto] = useState(params.get('q') ?? '');
  const [panel, setPanel] = useState(false);

  // Al navegar (por ejemplo, Atrás), el buscador muestra lo que dice la URL y el panel de categorías se cierra.
  useEffect(() => { setTexto(params.get('q') ?? ''); }, [params]);
  useEffect(() => { setPanel(false); window.scrollTo(0, 0); }, [location.pathname, location.search]);

  const buscar = (e) => {
    e.preventDefault();
    const q = texto.trim();
    navigate(q ? `/tienda/productos?q=${encodeURIComponent(q)}` : '/tienda/productos');
  };

  const enListado = location.pathname === '/tienda/productos';
  const categoriaActiva = enListado ? params.get('categoria') : null;
  const ofertasActiva = enListado && params.get('ofertas') === '1';
  const matriz = sucursales[0];

  return (
    <>
      <div className="fct-util">
        <div className="fct-wrap">
          <span className="fct-util-retiro">
            <i className="bi bi-shop" aria-hidden="true" />
            <span>
              Retiro sin costo en <b>{matriz ? matriz.nombre : 'la farmacia'}</b>
              {matriz?.comuna && <span className="fct-solo-escritorio">, {matriz.comuna}</span>}
            </span>
          </span>
          <nav aria-label="Ayuda">
            <span><i className="bi bi-clock" aria-hidden="true" />{FARMACIA.horarioCorto}</span>
            {FARMACIA.ventaTelefonica && <a href={`tel:${FARMACIA.ventaTelefonica.replace(/\s/g, '')}`}>Venta telefónica</a>}
            {FUNCIONES.seguimiento && <Link to="/tienda/pedido">Sigue tu pedido</Link>}
            <Link to="/tienda/informacion">Ayuda</Link>
          </nav>
        </div>
      </div>

      <header className="fct-cabecera">
        <div className="fct-wrap">
          <button type="button" className="fct-btn-categorias" aria-expanded={panel} aria-controls="fct-panel-categorias"
            onClick={() => setPanel((v) => !v)}>
            <i className={`bi ${panel ? 'bi-x-lg' : 'bi-list'}`} aria-hidden="true" /><span>Categorías</span>
          </button>
          <Link to="/tienda" className="fct-logo" aria-label="FarmaClick, ir al inicio de la tienda">
            <img src={logo} alt="FarmaClick" />
          </Link>
          <form className="fct-buscador" role="search" onSubmit={buscar}>
            <i className="bi bi-search" aria-hidden="true" />
            <input type="search" placeholder="Busca por producto o código" aria-label="Buscar productos"
              maxLength={100} value={texto} onChange={(e) => setTexto(e.target.value)} />
            <button type="submit">Buscar</button>
          </form>
          {FUNCIONES.cuenta && (
            <Link to="/tienda/cuenta" className="fct-cuenta">
              <i className="bi bi-person" aria-hidden="true" /><span><small>Hola,</small>Inicia sesión</span>
            </Link>
          )}
          <Link to="/tienda/carrito" className="fct-carro" aria-label={`Mi carro, ${unidades} unidades`}>
            <i className="bi bi-cart3" aria-hidden="true" />
            {unidades > 0 && <b>{unidades > 99 ? '99+' : unidades}</b>}
            <span><small>Mi carro</small>{unidades === 1 ? '1 unidad' : `${unidades} unidades`}</span>
          </Link>
        </div>
      </header>

      <nav className="fct-menu" aria-label="Categorías">
        <div className="fct-wrap">
          <Link to="/tienda/productos?ofertas=1" className={`fct-menu-ofertas${ofertasActiva ? ' activa' : ''}`}>
            <i className="bi bi-tag" aria-hidden="true" />Ofertas
          </Link>
          {categorias.map((c) => (
            <Link key={c.id} to={enlaceCategoria(c)} className={c.id === categoriaActiva ? 'activa' : ''}>{c.nombre}</Link>
          ))}
        </div>
      </nav>

      {panel && (
        <div className="fct-panel-categorias" id="fct-panel-categorias">
          <div className="fct-wrap">
            <div className="fct-panel-grilla">
              <Link to="/tienda/productos?ofertas=1"><i className="bi bi-tag" aria-hidden="true" />Ofertas</Link>
              {categorias.map((c) => (
                <Link key={c.id} to={enlaceCategoria(c)}>{c.nombre}<small>{c.productos} productos</small></Link>
              ))}
              <Link to="/tienda/productos">Todos los productos</Link>
              <Link to="/tienda/informacion">Ayuda e información</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
