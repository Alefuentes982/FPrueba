import ColaWeb from './ColaWeb.jsx';
import PedidoDetalle from './PedidoDetalle.jsx';
import PedidoForm from './PedidoForm.jsx';
import Pedidos from './Pedidos.jsx';

export default {
  nombre: 'pedidos',
  modulo: 'pedidos',
  nav: [
    { to: '/pedidos', label: 'Pedidos', icon: 'bi-bag-check', orden: 40 },
    { to: '/pedidos-web', label: 'Pedidos web', icon: 'bi-globe2', orden: 40.5 },
  ],
  rutas: [
    { path: '/pedidos', element: <Pedidos /> },
    { path: '/pedidos-web', element: <ColaWeb /> },
    { path: '/pedidos/nuevo', element: <PedidoForm /> },
    { path: '/pedidos/:id', element: <PedidoDetalle /> },
    { path: '/pedidos/:id/editar', element: <PedidoForm /> },
  ],
};
