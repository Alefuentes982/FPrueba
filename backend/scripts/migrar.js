// Aplica las migraciones pendientes de db/migraciones sobre la base LOCAL (como superusuario).
// En Supabase se ejecutan a mano en el editor SQL. Uso: npm run migrar:local
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'migraciones');

export async function aplicarMigraciones(client) {
  await client.query('CREATE TABLE IF NOT EXISTS _migraciones (nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ DEFAULT NOW())');
  const hechas = new Set((await client.query('SELECT nombre FROM _migraciones')).rows.map((r) => r.nombre));
  for (const archivo of (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => f.endsWith('.sql')).sort()) {
    if (hechas.has(archivo)) continue;
    console.log(`Migración ${archivo}…`);
    await client.query(fs.readFileSync(path.join(dir, archivo), 'utf8'));
    await client.query('INSERT INTO _migraciones (nombre) VALUES ($1)', [archivo]);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const client = new pg.Client({ host: 'localhost', port: 54329, user: 'postgres', password: 'postgres', database: 'farmaclick' });
  await client.connect();
  try { await aplicarMigraciones(client); console.log('Migraciones al día.'); } finally { await client.end(); }
}
