// Validación de los formularios de la cuenta de cliente (HU-68). Se prueban sin base de datos (esquemasCuenta.test.js).
import { z } from 'zod';
import { normalizarRut } from '../proveedores/rut.js';

const correo = z.string().trim().toLowerCase().email('Escribe un correo válido.').max(150);

// Contraseña: al menos 8 caracteres, con una letra y un número. Supabase Auth exige 6 como mínimo.
export const contrasena = z.string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(72, 'La contraseña puede tener hasta 72 caracteres.')
  .refine((v) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(v) && /\d/.test(v), 'La contraseña debe tener al menos una letra y un número.');

// Teléfono chileno: se guardan solo los dígitos con el +56 (por ejemplo +56912345678).
export function normalizarTelefono(v) {
  const digitos = String(v ?? '').replace(/\D/g, '').replace(/^56/, '');
  return /^\d{9}$/.test(digitos) ? `+56${digitos}` : null;
}
const telefono = z.string().transform((v, ctx) => {
  const n = normalizarTelefono(v);
  if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Escribe un teléfono de 9 dígitos, por ejemplo 9 1234 5678.' });
  return n ?? v;
});

const rut = z.string().transform((v, ctx) => {
  const n = normalizarRut(v);
  if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El RUT no es válido. Revisa el número y el dígito verificador.' });
  return n ?? v;
});

export const registroSchema = z.object({
  nombre: z.string().trim().min(3, 'Escribe tu nombre y apellido.').max(150),
  rut,
  correo,
  telefono,
  direccion: z.string().trim().min(5, 'Escribe tu dirección (calle, número y depto. si corresponde).').max(200),
  comuna_id: z.string().uuid('Elige tu comuna.'),
  password: contrasena,
});

export const ingresoSchema = z.object({ correo, password: z.string().min(1, 'Escribe tu contraseña.') });
export const correoSchema = z.object({ correo });
export const nuevaClaveSchema = z.object({ access_token: z.string().min(10), password: contrasena });
export const refreshSchema = z.object({ refresh_token: z.string().min(1) });
