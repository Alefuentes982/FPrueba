// Datos del checkout (HU-71). Las líneas repetidas se juntan en el servicio (unirLineas), igual que en la cotización.
import { z } from 'zod';
import { uuid } from '../../core/sql.js';
import { carritoSchema } from './esquemas.js';
import { normalizarTelefono } from './esquemasCuenta.js';

const telefono = z.string().transform((v, ctx) => {
  const n = normalizarTelefono(v);
  if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Escribe un teléfono de 9 dígitos, por ejemplo 9 1234 5678.' });
  return n ?? v;
});

const items = carritoSchema.shape.items.min(1, 'Tu carro está vacío.');

export const opcionesSchema = z.object({ items });

export const checkoutSchema = z.discriminatedUnion('entrega', [
  z.object({ entrega: z.literal('retiro'), items, sucursal_id: z.string().uuid('Elige la farmacia donde retiras.'), telefono }),
  z.object({
    entrega: z.literal('despacho'),
    items,
    telefono,
    direccion: z.string().trim().min(5, 'Escribe la dirección de despacho (calle, número y depto.).').max(200),
    comuna_id: z.string().uuid('Elige la comuna de despacho.'),
  }),
], { errorMap: () => ({ message: 'Elige retiro en farmacia o despacho a domicilio.' }) });

export const idPedido = uuid;
