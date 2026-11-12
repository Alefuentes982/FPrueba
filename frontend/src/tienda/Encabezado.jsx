import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import logo from '../assets/farmaclick-logo.svg';
import { useCarrito } from './CarritoContext.jsx';
import { primerNombre, useCuenta } from './CuentaContext.jsx';
import { FARMACIA, FUNCIONES } from './contenido.js';
import { enlaceCategoria, useDatosTienda } from './DatosTienda.jsx';
import PanelLateral from './ui/PanelLateral.jsx';

// Barra superior, cabecera con buscador y carro, y menú de categorías (diseño aprobado, versión clara).
// El botón Categorías abre un panel lateral y el contador del carro da un pequeño salto al sumar unidades (HU-95).
export default function Encabezado() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { categorias, sucursales } = useDatosTienda();
  const { unidades } = useCarrito();
  const { cliente } = useCuenta();
  const [texto, setTexto] = useState(params.get('q') ?? '');
  const [panel, setPanel] = useState(false);

  // Al navegar (por ejemplo, Atrás), el buscador muestra lo que dice la URL y el panel de categorías se cierra.
  useEffect(() => { setTexto(params.get('q') ?? ''); }, [params]);
  useEffect(() => { setPanel(false); window.scrollTo(0, 0); }, [location.pathname, location.search]);

  // Cada vez que suben las unidades, el contador cambia de key: React lo vuelve a crear y la animación se repite.
  const previas = useRef(unidades);
  const [salto, setSalto] = useState(0);
  useEffect(() => {
    if (unidades > previas.current) setSalto((n) => n + 1);
    previas.current = unidades;
  }, [unidades]);

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
            aria-haspopup="dialog" onClick={() => setPanel(true)}>
            <i className="bi bi-list" aria-hidden="true" /><span>Categorías</span>
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
            <Link to="/tienda/cuenta" className={`fct-cuenta${cliente ? ' fct-cuenta-con-sesion' : ''}`}
              aria-label={cliente ? `Mi cuenta, ${cliente.nombre}` : 'Inicia sesión o crea tu cuenta'}>
              <i className={`bi ${cliente ? 'bi-person-check' : 'bi-person'}`} aria-hidden="true" />
              <span><small>Hola{cliente ? `, ${primerNombre(cliente)}` : ','}</small>{cliente ? 'Mi cuenta' : 'Inicia sesión'}</span>
            </Link>
          )}
          <Link to="/tienda/carrito" className="fct-carro" aria-label={`Mi carro, ${unidades} unidades`}>
            <i className="bi bi-cart3" aria-hidden="true" />
            {unidades > 0 && <b key={salto} className={salto ? 'fct-salto' : ''}>{unidades > 99 ? '99+' : unidades}</b>}
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

      <PanelLateral abierto={panel} onCerrar={() => setPanel(false)} titulo="Categorías" id="fct-panel-categorias">
        {/* Un clic en cualquier enlace cierra el panel, aunque lleve a la página en la que ya estás. */}
        <div onClick={(e) => { if (e.target.closest('a')) setPanel(false); }}>
          <nav className="fct-panel-lista" aria-label="Categorías de la tienda">
            <Link to="/tienda/productos?ofertas=1" className="fct-panel-ofertas">
              <i className="bi bi-tag" aria-hidden="true" /><span>Ofertas</span><i className="bi bi-chevron-right" aria-hidden="true" />
            </Link>
            {categorias.map((c) => (
              <Link key={c.id} to={enlaceCategoria(c)}>
                <span>{c.nombre}<small>{c.productos} {c.productos === 1 ? 'producto' : 'productos'}</small></span>
                <i className="bi bi-chevron-right" aria-hidden="true" />
              </Link>
            ))}
            <Link to="/tienda/productos"><span>Todos los productos</span><i className="bi bi-chevron-right" aria-hidden="true" /></Link>
          </nav>
          <div className="fct-panel-ayuda">
            <Link to="/tienda/informacion"><i className="bi bi-question-circle" aria-hidden="true" />Ayuda e información</Link>
            <span><i className="bi bi-clock" aria-hidden="true" />{FARMACIA.horarioCorto}</span>
            {matriz && <span><i className="bi bi-shop" aria-hidden="true" />Retiro sin costo en {matriz.nombre}</span>}
          </div>
        </div>
      </PanelLateral>
    </>
  );
}
