// Cola de pedidos web del personal (HU-76). Reglas sin base de datos (cola.test.js).
// Un pedido web avanza según cómo lo recibe el cliente:
//   retiro:   Pagado → En preparación → Listo para retiro → Entregado
//   despacho: Pagado → En preparación → En despacho       → Entregado
import { ESTADO } from './servicio.js';

// Estados que esperan una acción del personal, en el orden de la cola.
export const ESTADOS_COLA = [ESTADO.PAGADO, ESTADO.PREPARACION, ESTADO.RETIRO, ESTADO.DESPACHO];

const CAMINO = {
  retiro: { [ESTADO.PAGADO]: ESTADO.PREPARACION, [ESTADO.PREPARACION]: ESTADO.RETIRO, [ESTADO.RETIRO]: ESTADO.ENTREGADO },
  despacho: { [ESTADO.PAGADO]: ESTADO.PREPARACION, [ESTADO.PREPARACION]: ESTADO.DESPACHO, [ESTADO.DESPACHO]: ESTADO.ENTREGADO },
};

// Siguiente estado de un pedido web, o null si ya no avanza (o el pedido no es web).
export function siguienteWeb(estado, tipoEntrega) {
  return CAMINO[tipoEntrega]?.[estado] ?? null;
}

export const esPedidoWeb = (p) => p.canal === 'Online' && Boolean(p.tipo_entrega);

// En un pedido web, deja en las acciones solo el paso que corresponde a su entrega (la ficha mostraba "Listo para
// retiro" y "En despacho" a la vez).
export function accionesWeb(p) {
  if (!esPedidoWeb(p)) return p.acciones;
  const siguiente = siguienteWeb(p.estado, p.tipo_entrega);
  return p.acciones.filter((a) => !a.startsWith('estado:') || a === `estado:${siguiente}`);
}

// Revisa un cambio de estado pedido a mano. Devuelve el mensaje de error o null si se puede.
export function revisarCambioWeb(p, nuevo) {
  if (!esPedidoWeb(p)) return null;
  const siguiente = siguienteWeb(p.estado, p.tipo_entrega);
  if (siguiente === nuevo) return null;
  const entrega = p.tipo_entrega === 'retiro' ? 'retiro en farmacia' : 'despacho a domicilio';
  return siguiente
    ? `Este pedido es de ${entrega}: después de "${p.estado}" sigue "${siguiente}".`
    : `Un pedido "${p.estado}" ya no cambia de estado desde la cola.`;
}

// Minutos desde una fecha (para "pagado hace 12 min").
export const minutosDesde = (fecha, ahora = new Date()) => Math.max(0, Math.floor((ahora - new Date(fecha)) / 60000));
