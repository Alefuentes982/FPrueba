import { z } from 'zod';
import { optionalText } from '../../core/sql.js';

// Revisión del turno por alguien distinto de quien lo abrió. Si hay observaciones o diferencia de caja,
// la observación es obligatoria (la regla de la diferencia la aplica el servicio, que conoce el turno).
export const revisionSchema = z.object({
  conforme: z.boolean(),
  observacion: optionalText(500),
}).superRefine((d, ctx) => {
  if (!d.conforme && (d.observacion ?? '').length < 3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['observacion'], message: 'Explique las observaciones.' });
  }
});

export const ESTADOS_TURNO = ['abierto', 'cerrado', 'sin_revisar', 'con_diferencia'];
