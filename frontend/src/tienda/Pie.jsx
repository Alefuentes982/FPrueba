import { Link } from 'react-router-dom';
import logo from '../assets/farmaclick-logo.svg';
import { FARMACIA, FUNCIONES, LEGALES } from './contenido.js';
import { enlaceCategoria, useDatosTienda } from './DatosTienda.jsx';

// Pie de la tienda: enlaces, datos de la farmacia y medios de pago. Los datos que faltan en contenido.js no se
// muestran.
export default function Pie() {
  const { categorias, sucursales } = useDatosTienda();
  const matriz = sucursales[0];
  const direccion = matriz ? [matriz.direccion, matriz.comuna].filter(Boolean).join(', ') : null;
  const datosLegales = [
    `Farmacia ${matriz?.nombre ?? 'FarmaClick'}${direccion ? ` · ${direccion}` : ''}`,
    FARMACIA.quimicoResponsable && `Químico farmacéutico responsable: ${FARMACIA.quimicoResponsable}`,
    FARMACIA.autorizacionSanitaria && `Autorización sanitaria N° ${FARMACIA.autorizacionSanitaria}`,
  ].filter(Boolean);

  return (
    <footer className="fct-pie">
      <div className="fct-wrap">
        <div className="fct-pie-columnas">
          <div>
            <div className="fct-pie-logo"><img src={logo} alt="FarmaClick" /></div>
            <p>Farmacia con venta en línea de productos de venta directa. Arma tu pedido y retíralo en la farmacia.</p>
            <p className="fct-pie-horario"><i className="bi bi-clock" aria-hidden="true" />{FARMACIA.horario}</p>
          </div>
          <div>
            <h2>Comprar</h2>
            <Link to="/tienda/productos?ofertas=1">Ofertas</Link>
            {categorias.slice(0, 6).map((c) => <Link key={c.id} to={enlaceCategoria(c)}>{c.nombre}</Link>)}
          </div>
          <div>
            <h2>Servicio al cliente</h2>
            <Link to="/tienda/informacion#como-comprar">Cómo comprar</Link>
            <Link to="/tienda/informacion#retiro">Retiro en farmacia</Link>
            <Link to="/tienda/informacion#receta">Medicamentos con receta</Link>
            <Link to="/tienda/informacion#farmacia">Horario y ubicación</Link>
            {FUNCIONES.seguimiento && <Link to="/tienda/pedido">Sigue tu pedido</Link>}
          </div>
          <div>
            <h2>Información</h2>
            {LEGALES.terminos && <a href={LEGALES.terminos}>Términos y condiciones</a>}
            {LEGALES.privacidad && <a href={LEGALES.privacidad}>Política de privacidad</a>}
            {FUNCIONES.checkout && <Link to="/tienda/informacion#pago">Medios de pago</Link>}
            <Link to="/login">Acceso del personal</Link>
          </div>
        </div>
        <div className="fct-pie-base">
          <span>{datosLegales.join(' · ')}</span>
          {FUNCIONES.checkout && <span className="fct-pie-pagos">Pagas con <b>Webpay</b> débito y crédito</span>}
        </div>
        <div className="fct-pie-copy">© {new Date().getFullYear()} FarmaClick. Precios con IVA incluido, válidos para la venta en línea.</div>
      </div>
    </footer>
  );
}
