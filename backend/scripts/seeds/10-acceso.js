// Login local (AUTH_MODE=local): tabla de credenciales y un administrador de prueba.
import { hashPassword } from '../../src/core/localAuth.js';

export default async function sembrar(db) {
  await db.query(`
    CREATE TABLE dev_credencial (
      usuario_id UUID PRIMARY KEY, correo VARCHAR(150) NOT NULL UNIQUE, password_hash TEXT NOT NULL);
    GRANT SELECT, INSERT, UPDATE, DELETE ON dev_credencial TO app_backend;`);
  const { rows } = await db.query(
    `INSERT INTO usuario (nombre, correo, rol_id) SELECT 'Administrador Local', 'admin@farmaclick.local', id
       FROM rol WHERE nombre = 'Administrador' RETURNING id`);
  await db.query('INSERT INTO dev_credencial (usuario_id, correo, password_hash) VALUES ($1,$2,$3)',
    [rows[0].id, 'admin@farmaclick.local', hashPassword('Admin12345')]);
}
