// Cuenta de cliente de la tienda (HU-68): registro, ingreso, confirmación de correo y nueva contraseña.
// La contraseña la guarda Supabase Auth; la base guarda el usuario (rol Cliente) y su ficha en la tabla cliente.
// Las respuestas de "recuperar" y "reenviar" son siempre iguales, exista o no la cuenta, para no revelar qué correos
// están registrados.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { cargarUsuario } from '../../core/auth.js';
import { errorSupabase } from '../../core/cuentas.js';
import { pool, withTx } from '../../core/db.js';
import { HttpError } from '../../core/errors.js';
import { supabaseAdmin, supabaseAnon } from '../../core/supabase.js';
import { urlPublica } from '../../core/urls.js';
import { correoSchema, ingresoSchema, nuevaClaveSchema, refreshSchema, registroSchema } from './esquemasCuenta.js';
import { autenticarCliente, perfilCliente, ROL_CLIENTE } from './sesionCliente.js';

const r = Router();

const limite = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.' },
});

const ENLACE_CONFIRMACION = () => urlPublica('/tienda/cuenta?confirmado=1');
const ENLACE_NUEVA_CLAVE = () => urlPublica('/tienda/cuenta/nueva-clave');
const sesion = (s) => ({ access_token: s.access_token, refresh_token: s.refresh_token });

r.post('/registro', limite, async (req, res) => {
  const d = registroSchema.parse(req.body);
  const existe = await pool.query(
    `SELECT (SELECT 1 FROM usuario WHERE correo = $1) AS correo, (SELECT 1 FROM cliente WHERE rut = $2) AS rut`, [d.correo, d.rut]);
  if (existe.rows[0].correo) throw new HttpError(409, 'Ya existe una cuenta con ese correo. Ingresa o pide una nueva contraseña.');
  if (existe.rows[0].rut) throw new HttpError(409, 'Ese RUT ya tiene una cuenta en la tienda. Ingresa con el correo que registraste.');

  const { data, error } = await supabaseAnon().auth.signUp({
    email: d.correo, password: d.password, options: { emailRedirectTo: ENLACE_CONFIRMACION() },
  });
  if (error) throw errorSupabase(error);
  // Supabase responde sin identidades cuando el correo ya estaba registrado en Auth.
  if (!data?.user || (Array.isArray(data.user.identities) && data.user.identities.length === 0)) {
    throw new HttpError(409, 'Ya existe una cuenta con ese correo. Ingresa o pide una nueva contraseña.');
  }
  const id = data.user.id;
  try {
    await withTx(null, async (db) => {
      const rol = await db.query('SELECT id FROM rol WHERE nombre = $1', [ROL_CLIENTE]);
      if (!rol.rows[0]) throw new HttpError(500, 'Falta el rol Cliente en la base.');
      await db.query('INSERT INTO usuario (id, nombre, correo, rol_id, activo) VALUES ($1,$2,$3,$4,TRUE)', [id, d.nombre, d.correo, rol.rows[0].id]);
      await db.query('INSERT INTO cliente (usuario_id, rut, telefono, direccion_cliente, comuna_id) VALUES ($1,$2,$3,$4,$5)',
        [id, d.rut, d.telefono, d.direccion, d.comuna_id]);
    });
  } catch (err) {
    await supabaseAdmin().auth.admin.deleteUser(id).catch(() => {});
    if (err.code === '23503') throw new HttpError(400, 'Elige una comuna de la lista.');
    throw err;
  }
  // Con la confirmación de correo activada (lo normal), Supabase no entrega sesión hasta que se confirme.
  res.status(201).json(data.session
    ? { requiere_confirmacion: false, ...sesion(data.session), cliente: await perfilCliente(pool, id) }
    : { requiere_confirmacion: true, correo: d.correo });
});

r.post('/ingreso', limite, async (req, res) => {
  const { correo, password } = ingresoSchema.parse(req.body);
  const { data, error } = await supabaseAnon().auth.signInWithPassword({ email: correo, password });
  if (error && /confirm/i.test(error.message)) {
    return res.status(403).json({ error: 'Falta confirmar tu correo. Revisa tu bandeja (y la de spam) o pide un enlace nuevo.', codigo: 'correo_sin_confirmar' });
  }
  if (error || !data?.session) throw new HttpError(401, 'Correo o contraseña incorrectos.');
  const usuario = await cargarUsuario(data.user.id);
  if (!usuario || usuario.rol !== ROL_CLIENTE) throw new HttpError(403, 'Esta cuenta es del personal de la farmacia: ingresa en el sistema de gestión.');
  if (!usuario.activo) throw new HttpError(403, 'Tu cuenta no está habilitada. Escríbenos para revisarla.');
  res.json({ ...sesion(data.session), cliente: await perfilCliente(pool, usuario.id) });
});

r.post('/refresh', async (req, res) => {
  const { refresh_token } = refreshSchema.parse(req.body);
  const { data, error } = await supabaseAnon().auth.refreshSession({ refresh_token });
  if (error || !data?.session) throw new HttpError(401, 'Tu sesión venció. Vuelve a ingresar.');
  res.json(sesion(data.session));
});

r.post('/reenviar', limite, async (req, res) => {
  const { correo } = correoSchema.parse(req.body);
  await supabaseAnon().auth.resend({ type: 'signup', email: correo, options: { emailRedirectTo: ENLACE_CONFIRMACION() } }).catch(() => {});
  res.json({ ok: true });
});

r.post('/recuperar', limite, async (req, res) => {
  const { correo } = correoSchema.parse(req.body);
  const { rows } = await pool.query(
    'SELECT 1 FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE u.correo = $1 AND r.nombre = $2 AND u.activo', [correo, ROL_CLIENTE]);
  if (rows[0]) {
    const { error } = await supabaseAnon().auth.resetPasswordForEmail(correo, { redirectTo: ENLACE_NUEVA_CLAVE() });
    if (error) console.error('No se pudo enviar el correo de nueva contraseña:', error.message);
  }
  res.json({ ok: true });
});

r.post('/nueva-clave', limite, async (req, res) => {
  const { access_token: token, password } = nuevaClaveSchema.parse(req.body);
  const { data, error } = await supabaseAnon().auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'El enlace venció o ya se usó. Pide uno nuevo.');
  const usuario = await cargarUsuario(data.user.id);
  if (!usuario || usuario.rol !== ROL_CLIENTE || !usuario.activo) throw new HttpError(403, 'Este enlace no corresponde a una cuenta de la tienda.');
  const r2 = await supabaseAdmin().auth.admin.updateUserById(usuario.id, { password });
  if (r2.error) throw errorSupabase(r2.error);
  res.json({ ok: true });
});

r.get('/yo', autenticarCliente, async (req, res) => {
  res.json(await perfilCliente(pool, req.cliente.id));
});

export default r;
