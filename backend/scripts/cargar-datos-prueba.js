// Aplica db/datos-prueba/datos-prueba.sql a la base LOCAL (como superusuario), regenerándolo antes desde los CSV.
// En Supabase el mismo archivo se pega en el editor SQL. Uso: npm run datos-prueba:local
// Opcional: DEV_DB_PORT si la base local no está en el puerto 54329.
import fs from 'node:fs';
import pg from 'pg';
import { archivoSql, generarSql, leerCsv } from './datos-prueba.js';

const sql = generarSql({ categorias: leerCsv('categorias.csv'), proveedores: leerCsv('proveedores.csv'), productos: leerCsv('productos.csv') });
fs.writeFileSync(archivoSql, sql, 'utf8');

const client = new pg.Client({ host: 'localhost', port: Number(process.env.DEV_DB_PORT) || 54329, user: 'postgres', password: 'postgres', database: 'farmaclick' });
await client.connect();
try {
  await client.query('BEGIN');
  const res = await client.query(sql);
  await client.query('COMMIT');
  const resumen = (Array.isArray(res) ? res.at(-1) : res).rows[0];
  console.log('Datos de prueba cargados:', resumen);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('No se pudo cargar:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
