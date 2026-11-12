// Pago con Webpay Plus (HU-72). Iniciar exige la sesión del cliente; el regreso lo hace el navegador desde Webpay,
// sin sesión, por GET o por POST según el caso (Transbank usa los dos), y termina en la página del pedido.
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool, withTx } from '../../core/db.js';
import { idPedido } from './esquemasPedido.js';
import { iniciarPago, procesarRetorno, urlResultado } from './pagosWeb.js';
import { usuarioSistema } from './pedidosWeb.js';
import { autenticarCliente } from './sesionCliente.js';

const r = Router();

const limite = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de pago seguidos. Espera unos minutos.' },
});

r.post('/webpay/iniciar', limite, autenticarCliente, async (req, res) => {
  const pedidoId = idPedido.parse(req.body?.pedido_id);
  res.json(await withTx(await usuarioSistema(pool), (db) => iniciarPago(db, req.cliente.id, pedidoId)));
});

async function retorno(req, res) {
  const datos = { ...req.query, ...(req.body ?? {}) };
  const resultado = await withTx(await usuarioSistema(pool), (db) => procesarRetorno(db, datos));
  res.redirect(303, urlResultado(resultado));
}
r.get('/webpay/retorno', limite, retorno);
r.post('/webpay/retorno', limite, express.urlencoded({ extended: false }), retorno);

export default r;
