import CostosDespacho from './CostosDespacho.jsx';

// Costos de despacho por comuna (HU-78). Usa el permiso de Pedidos; solo el Administrador guarda cambios.
export default {
  nombre: 'despacho',
  modulo: 'pedidos',
  nav: [{ to: '/despacho', label: 'Despacho', icon: 'bi-truck', orden: 41 }],
  rutas: [{ path: '/despacho', element: <CostosDespacho /> }],
};
