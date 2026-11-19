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
  const acciones = p.acciones.filter((a) => !a.startsWith('estado:') || a === `estado:${siguiente}`);
  // HU-77: el retiro listo se entrega con número de pedido y RUT.
  if (p.tipo_entrega === 'retiro' && p.estado === ESTADO.RETIRO) return [...acciones.filter((a) => a !== `estado:${ESTADO.ENTREGADO}`), 'entregar'];
  return acciones;
}

// Revisa un cambio de estado pedido a mano. Devuelve el mensaje de error o null si se puede.
export function revisarCambioWeb(p, nuevo) {
  if (!esPedidoWeb(p)) return null;
  const siguiente = siguienteWeb(p.estado, p.tipo_entrega);
  if (siguiente === nuevo) {
    // HU-77: un retiro se entrega verificando número de pedido y RUT, no con un cambio de estado.
    if (nuevo === ESTADO.ENTREGADO && p.tipo_entrega === 'retiro') return 'Un retiro se entrega con "Entregar al cliente", verificando el número de pedido y el RUT.';
    return null;
  }
  const entrega = p.tipo_entrega === 'retiro' ? 'retiro en farmacia' : 'despacho a domicilio';
  return siguiente
    ? `Este pedido es de ${entrega}: después de "${p.estado}" sigue "${siguiente}".`
    : `Un pedido "${p.estado}" ya no cambia de estado desde la cola.`;
}

// Minutos desde una fecha (para "pagado hace 12 min").
export const minutosDesde = (fecha, ahora = new Date()) => Math.max(0, Math.floor((ahora - new Date(fecha)) / 60000));

// Entrega de un retiro en farmacia (HU-77): el cliente muestra su número de pedido y su RUT. Devuelve el error para
// el vendedor o null si se puede entregar. p: { estado, tipo_entrega, numero, sucursal_id, rut_cliente }.
//   codigo: lo que escribió el vendedor ("PED-000123", "ped 123" o "123")   rut: el RUT que mostró el cliente
//   usuario: { rol, sucursal_id } de quien entrega
export function revisarEntregaRetiro(p, { codigo, rut, usuario, normalizarRut }) {
  if (p.tipo_entrega !== 'retiro') return { status: 409, error: 'Solo se entregan así los pedidos de retiro en farmacia.' };
  if (p.estado !== 'Listo para retiro') return { status: 409, error: `El pedido está "${p.estado}": solo se entrega uno "Listo para retiro".` };
  if (usuario.rol !== 'Administrador' && usuario.sucursal_id !== p.sucursal_id) {
    return { status: 403, error: 'Este pedido se retira en otra sucursal. Solo se entrega en la sucursal donde está preparado.' };
  }
  const numero = /^(ped[-\s]?)?\d+$/i.test(String(codigo ?? '').trim()) ? Number(String(codigo).replace(/\D/g, '')) : null;
  if (numero !== Number(p.numero)) return { status: 400, path: 'codigo', error: 'El número de pedido no corresponde a este pedido.' };
  const r = normalizarRut(rut ?? '');
  if (!r) return { status: 400, path: 'rut', error: 'El RUT no es válido. Revise el dígito verificador.' };
  if (!p.rut_cliente || r !== normalizarRut(p.rut_cliente)) {
    return { status: 400, path: 'rut', error: 'El RUT no corresponde al cliente que compró. No entregue el pedido.' };
  }
  return null;
}
