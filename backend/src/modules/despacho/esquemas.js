import { z } from 'zod';

// Costo de despacho de una comuna o de todas las comunas de una región (HU-78). En pesos, IVA incluido.
export const costoSchema = z.object({
  costo: z.number({ invalid_type_error: 'Escriba el costo en pesos.' }).int('El costo va en pesos, sin decimales.')
    .min(0, 'El costo no puede ser negativo.').max(100000, 'El costo máximo es $100.000.'),
  activo: z.boolean().default(true),
});

// Varias comunas a la vez (la pantalla guarda todo lo que se cambió en una sola operación).
export const costosSchema = z.object({
  comunas: z.array(costoSchema.extend({ comuna_id: z.string().uuid() })).min(1, 'No hay cambios que guardar.').max(400),
});
