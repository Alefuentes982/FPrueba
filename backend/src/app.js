import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { autenticar, exigeModulo } from './core/auth.js';
import { routerCatalogos } from './core/catalogos.js';
import { errorHandler, HttpError } from './core/errors.js';
import modulos from './modules/index.js';

export const app = express();
app.set('trust proxy', 1); // detrás de un proxy/hosting, el rate limit debe ver la IP real
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Cada módulo exige sesión y su permiso (rol_permiso), salvo los públicos.
for (const m of modulos) {
  if (!m.publico && !m.modulo) throw new Error(`El módulo "${m.nombre}" debe declarar su clave de permiso.`);
  const guardas = m.publico ? [] : [autenticar, exigeModulo(m.modulo, m.lectura)];
  for (const { ruta, router } of m.rutas) app.use(ruta, ...guardas, router);
}
app.use('/api/catalogos', autenticar, routerCatalogos(modulos)); // cualquier usuario con sesión

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada.')));
app.use(errorHandler);
