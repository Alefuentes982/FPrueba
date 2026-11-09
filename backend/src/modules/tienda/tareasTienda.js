// Tarea de la API que vence los pedidos web sin pagar (HU-71): cada minuto pasa a "Expirado" los que llevan más de
// 20 minutos en "Pago pendiente" y devuelve su stock. En Supabase también lo hace el job de pg_cron; las dos cosas
// juntas no se pisan (cada una salta los pedidos que la otra está procesando). En local es la única que corre.
// Se desactiva con TAREAS_TIENDA=off.
import { pool, withTx } from '../../core/db.js';
import { expirarPedidosWeb, usuarioSistema } from './pedidosWeb.js';

const CADA_MS = 60 * 1000;

export async function vencerPedidosWeb() {
  const sistema = await usuarioSistema(pool);
  return withTx(sistema, (db) => expirarPedidosWeb(db));
}

export function iniciarTareasTienda() {
  if (process.env.TAREAS_TIENDA === 'off') return null;
  const vuelta = () => vencerPedidosWeb()
    .then((n) => { if (n) console.log(`Tienda: ${n} pedido(s) web sin pagar pasaron a "Expirado".`); })
    .catch((err) => console.error('Tienda: no se pudieron vencer los pedidos sin pagar:', err.message));
  return setInterval(vuelta, CADA_MS);
}
