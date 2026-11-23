import { ZodError } from 'zod';

// details: [{ path, message }] para marcar el campo que falló (por ejemplo items.2.fecha_vencimiento).
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    if (details?.length) this.details = details;
  }
}

export const notFound = (what = 'Registro') => new HttpError(404, `${what} no encontrado.`);

// Restricciones de la base con nombre (HU-88) -> campo del formulario y mensaje. mensaje null = usar el texto que
// arma la base (los triggers ya lo escriben para el usuario). Una restricción que no está aquí muestra el texto
// genérico y su nombre queda en el log para agregarla.
export const RESTRICCIONES = {
  ck_lote_vida_util_minima: { campo: 'fecha_vencimiento', mensaje: null },
  ck_lote_excepcion_autorizada: { campo: 'excepcion_vida_util', mensaje: null },
  ck_lote_excepcion_motivo: { campo: 'excepcion_vida_util', mensaje: 'Escriba el motivo de la excepción (al menos 5 caracteres).' },
  ck_lote_vencimiento_posterior_ingreso: { campo: 'fecha_vencimiento', mensaje: 'El vencimiento no puede ser anterior a la fecha de ingreso.' },
  ck_lote_cantidad_recibida: { campo: 'cantidad', mensaje: 'La cantidad recibida no puede ser negativa.' },
  ck_lote_cantidad_actual: { campo: 'cantidad', mensaje: 'El lote no tiene unidades suficientes.' },
  uq_lote_producto_sucursal_numero: { campo: 'numero_lote', mensaje: 'Ese número de lote ya existe para este producto en la sucursal.' },
  ck_ocd_cantidad_solicitada: { campo: 'cantidad_solicitada', mensaje: 'La cantidad debe ser mayor a cero.' },
  ck_ocd_cantidad_recibida: { campo: 'cantidad', mensaje: 'La cantidad recibida no puede ser negativa.' },
  ck_ocd_costo_unitario: { campo: 'costo_unitario', mensaje: 'El costo no puede ser negativo.' },
  ck_parametro_rango: { campo: 'valor', mensaje: 'El valor está fuera del rango permitido.' },
  ck_cliente_rut: { campo: 'rut', mensaje: 'El RUT no tiene el formato 12345678-5.' },
  ck_producto_imagen_https: { campo: 'imagen_url', mensaje: 'La foto debe ser una dirección que empiece con https://.' },
  ck_pedido_tipo_entrega: { campo: 'direccion', mensaje: 'Un despacho necesita dirección y comuna.' },
  ck_tpago_efectivo_recibido: { campo: 'efectivo_recibido', mensaje: 'El efectivo recibido no calza con el monto y el vuelto.' },
};

// Traduce el error de una restricción con nombre. prefijo: ruta de la línea que se estaba guardando (items.2.).
// Devuelve null si el error no es de una restricción conocida.
export function traducirRestriccion(err, prefijo = err?.prefijo ?? '') {
  const r = err?.constraint && RESTRICCIONES[err.constraint];
  if (!r) return null;
  const mensaje = r.mensaje ?? err.message;
  const status = err.code === '23505' || err.code === '23503' ? 409 : 400;
  return new HttpError(status, mensaje, [{ path: `${prefijo}${r.campo}`, message: mensaje }]);
}

// Envuelve un paso que guarda una línea: si falla por una restricción, el error recuerda qué línea era.
export async function enLinea(prefijo, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err && typeof err === 'object' && !err.prefijo) err.prefijo = prefijo;
    throw err;
  }
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos inválidos.',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  // Errores al leer el cuerpo (express.json / express.raw): tamaño y formato.
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo o los datos enviados son demasiado grandes.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Los datos enviados no tienen un formato válido.' });
  const traducido = traducirRestriccion(err);
  if (traducido) return res.status(traducido.status).json({ error: traducido.message, details: traducido.details });
  if (err.constraint && ['23505', '23503', '23514'].includes(err.code)) {
    console.warn(`Restricción sin traducción en errors.js: ${err.constraint}`);
  }
  switch (err.code) {
    case '23505': return res.status(409).json({ error: 'Ya existe un registro con ese valor único (SKU, RUT, número de lote...).' });
    case '23503': return res.status(409).json({ error: 'Referencia inválida o registro en uso por otros datos.' });
    case '23514': return res.status(400).json({ error: 'Los datos no cumplen una regla de la base de datos.' });
    case '22P02':
    case '22007': return res.status(400).json({ error: 'Formato de dato inválido (identificador o fecha).' });
    case 'P0001': return res.status(409).json({ error: err.message }); // RAISE EXCEPTION de los triggers
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
}
