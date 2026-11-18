import routes from './routes.js';

// Costos de despacho por comuna (HU-78). Lo ven quienes tienen el módulo Pedidos; solo el Administrador los cambia.
export default {
  nombre: 'despacho',
  modulo: 'pedidos',
  rutas: [{ ruta: '/api/despacho', router: routes }],
};
