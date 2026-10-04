// Base de datos local para desarrollo: levanta un PostgreSQL embebido (sin instalar nada), carga el esquema
// de db/farmaclick_postgresql_completo.sql la primera vez, corre los datos de ejemplo de scripts/seeds/ y
// aplica las migraciones de db/migraciones/.
// Uso: npm run dev:db   (déjelo corriendo; Ctrl+C lo detiene. Los datos persisten en backend/.pgdata)
// Opcional: DEV_DB_PORT y DEV_DB_DIR para levantar una segunda base (pruebas).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { aplicarMigraciones } from './migrar.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DEV_DB_DIR ? path.resolve(process.env.DEV_DB_DIR) : path.join(raiz, '.pgdata');
const sqlFile = path.join(raiz, '..', 'db', 'farmaclick_postgresql_completo.sql');
const seedsDir = path.join(raiz, 'scripts', 'seeds');
const PORT = Number(process.env.DEV_DB_PORT) || 54329;
const nuevo = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));

const server = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: true,
});

if (nuevo) await server.initialise();
await server.start();
if (nuevo) await server.createDatabase('farmaclick');

const admin = new pg.Client({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: 'farmaclick' });
await admin.connect();

const { rows } = await admin.query("SELECT to_regclass('public.producto') AS t");
if (!rows[0].t) {
  console.log('Cargando esquema…');
  await admin.query(fs.readFileSync(sqlFile, 'utf8'));
  await admin.query("ALTER ROLE app_backend LOGIN PASSWORD 'app_backend'");

  // Datos de ejemplo: un archivo por módulo, en orden alfabético (cada uno exporta default async (client) => …).
  for (const archivo of fs.readdirSync(seedsDir).filter((f) => f.endsWith('.js')).sort()) {
    console.log(`Datos de ejemplo: ${archivo}`);
    await (await import(pathToFileURL(path.join(seedsDir, archivo)).href)).default(admin);
  }
}
await aplicarMigraciones(admin); // cambios al esquema posteriores al SQL base (db/migraciones)
await admin.end();

console.log(`\nPostgreSQL local listo en localhost:${PORT} (base farmaclick).`);
console.log('Login de prueba: admin@farmaclick.local / Admin12345\n');

const apagar = async () => { await server.stop(); process.exit(0); };
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
