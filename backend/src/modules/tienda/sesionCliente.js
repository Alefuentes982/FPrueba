// Sesión de los clientes de la tienda (HU-68). Usa el mismo Supabase Auth que el personal, pero con reglas propias:
// solo entran cuentas activas con rol Cliente, y un cliente nunca pasa por autenticar/exigeModulo del personal.
import { cargarUsuario, idDesdeToken } from '../../core/auth.js';
import { HttpError } from '../../core/errors.js';

export const ROL_CLIENTE = 'Cliente';

// Ficha del cliente para la tienda: datos de contacto y de despacho. Nunca entrega permisos ni datos de otros.
export async function perfilCliente(db, usuarioId) {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre, u.correo, c.rut, c.telefono, c.direccion_cliente AS direccion, c.comuna_id,
            co.nombre AS comuna, co.region_id, r.nombre AS region
       FROM usuario u
       JOIN cliente c ON c.usuario_id = u.id
       LEFT JOIN comuna co ON co.id = c.comuna_id
       LEFT JOIN region r ON r.id = co.region_id
      WHERE u.id = $1`, [usuarioId]);
  return rows[0] ?? null;
}

// Middleware: exige el token de una cuenta de cliente activa. Deja req.cliente = { id, nombre, correo }.
export async function autenticarCliente(req, _res, next) {
  try {
    const token = req.header('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new HttpError(401, 'Inicia sesión para continuar.');
    const usuario = await cargarUsuario(await idDesdeToken(token));
    if (!usuario || usuario.rol !== ROL_CLIENTE) throw new HttpError(403, 'Esta cuenta no es de cliente de la tienda.');
    if (!usuario.activo) throw new HttpError(403, 'Tu cuenta no está habilitada. Escríbenos para revisarla.');
    req.cliente = { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo };
    next();
  } catch (err) {
    next(err);
  }
}
