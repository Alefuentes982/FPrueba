// Checkout de la tienda (HU-71). Todas las rutas exigen la sesión de un cliente y solo muestran sus propios pedidos.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool, withTx } from '../../core/db.js';
import { checkoutSchema, idPedido, opcionesSchema } from './esquemasPedido.js';
import { cancelarPedidoWeb, crearPedidoWeb, opcionesCheckout, pedidoDelCliente, usuarioSistema } from './pedidosWeb.js';
import { autenticarCliente } from './sesionCliente.js';

const r = Router();
r.use(autenticarCliente);

// Crear pedidos reserva stock: se limita por cliente para que nadie bloquee el inventario a propósito.
const limiteCrear = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  keyGenerator: (req) => req.cliente.id,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Creaste muchos pedidos seguidos. Espera unos minutos para volver a intentarlo.' },
});

r.post('/opciones', async (req, res) => {
  const { items } = opcionesSchema.parse(req.body);
  res.json(await opcionesCheckout(pool, req.cliente.id, items));
});

r.post('/', limiteCrear, async (req, res) => {
  const d = checkoutSchema.parse(req.body);
  const sistema = await usuarioSistema(pool);
  const creado = await withTx(sistema, (db) => crearPedidoWeb(db, req.cliente, d));
  res.status(201).json(creado);
});

r.get('/:id', async (req, res) => {
  res.json(await pedidoDelCliente(pool, req.cliente.id, idPedido.parse(req.params.id)));
});

r.post('/:id/cancelar', async (req, res) => {
  const id = idPedido.parse(req.params.id);
  await withTx(await usuarioSistema(pool), (db) => cancelarPedidoWeb(db, req.cliente.id, id));
  res.json(await pedidoDelCliente(pool, req.cliente.id, id));
});

export default r;
