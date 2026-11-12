import routes from './routes.js';
import cuenta from './cuenta.js';
import pedidos from './rutasPedidos.js';
import pagos from './rutasPagos.js';

// Tienda en línea (pública): catálogo, ficha y cotización del carrito, sin sesión ni permisos y sin costos ni márgenes.
// La cuenta de cliente (HU-68) tiene su propia sesión (sesionCliente.js): un cliente nunca entra a los módulos del
// personal, que siguen protegidos por autenticar y exigeModulo. El checkout (HU-71) exige esa sesión; el pago con
// Webpay (HU-72) también, salvo el regreso desde Webpay, que llega del navegador sin sesión.
export default {
  nombre: 'tienda',
  publico: true,
  rutas: [
    { ruta: '/api/tienda/cuenta', router: cuenta },
    { ruta: '/api/tienda/pedidos', router: pedidos },
    { ruta: '/api/tienda/pagos', router: pagos },
    { ruta: '/api/tienda', router: routes },
  ],
};
