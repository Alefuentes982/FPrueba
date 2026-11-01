import routes from './routes.js';

// Tienda en línea (pública): catálogo, ficha y cotización del carrito. No exige sesión ni permisos y no expone
// costos ni márgenes. Los módulos del personal siguen protegidos por autenticar y exigeModulo.
export default { nombre: 'tienda', publico: true, rutas: [{ ruta: '/api/tienda', router: routes }] };
