// Una caja por sucursal para poder abrir turnos y vender en el mostrador.
export default async function sembrar(db) {
  await db.query('INSERT INTO caja (sucursal_id, numero) SELECT id, 1 FROM sucursal');
}
