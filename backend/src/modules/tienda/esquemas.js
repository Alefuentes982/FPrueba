import { z } from 'zod';
import { uuid } from '../../core/sql.js';
import { ORDENES } from './reglas.js';

// Un parámetro de la URL vacío ("?categoria_id=") se trata como ausente.
const vacioANulo = (v) => (v === '' || v == null ? undefined : v);
const precio = z.preprocess(vacioANulo, z.coerce.number().int().min(0).max(10000000).optional());

// GET /api/tienda/productos?q=&categoria_id=&con_descuento=1&precio_min=&precio_max=&orden=&page=&limit=
export const filtrosCatalogo = z.object({
  q: z.preprocess(vacioANulo, z.string().trim().max(100).optional()),
  categoria_id: z.preprocess(vacioANulo, uuid.optional()),
  // Solo "1" o "true" activan el filtro; cualquier otro valor lo deja apagado.
  con_descuento: z.preprocess((v) => v === '1' || v === 'true' || v === true, z.boolean()),
  precio_min: precio,
  precio_max: precio,
  orden: z.preprocess(vacioANulo, z.enum(Object.keys(ORDENES)).default('relevancia')),
  page: z.preprocess(vacioANulo, z.coerce.number().int().min(1).max(1000).default(1)),
  limit: z.preprocess(vacioANulo, z.coerce.number().int().min(1).max(48).default(12)),
}).refine((f) => f.precio_min == null || f.precio_max == null || f.precio_min <= f.precio_max, {
  message: 'El precio mínimo no puede ser mayor que el máximo.',
  path: ['precio_min'],
});
