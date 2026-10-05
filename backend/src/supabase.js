import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './errors.js';

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const cache = {};

function client(nombre, keyEnv) {
  if (!cache[nombre]) {
    if (!process.env.SUPABASE_URL || !process.env[keyEnv]) {
      throw new HttpError(500, `Falta configurar SUPABASE_URL y ${keyEnv} en el .env del backend.`);
    }
    cache[nombre] = createClient(process.env.SUPABASE_URL, process.env[keyEnv], opts);
  }
  return cache[nombre];
}

// Cliente con la anon key: iniciar sesión, refrescar y validar tokens.
export const supabaseAnon = () => client('anon', 'SUPABASE_ANON_KEY');
// Cliente con la service role key: crear y modificar cuentas. Nunca debe llegar al frontend.
export const supabaseAdmin = () => client('admin', 'SUPABASE_SERVICE_ROLE_KEY');
