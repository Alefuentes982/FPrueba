// La casa matriz, en San Bernardo, con venta web habilitada para que el stock sume a stock_total_web.
// La dirección no se carga aquí: se completa cuando se conozca.
export default async function sembrar(db) {
  await db.query(
    `INSERT INTO sucursal (nombre, comuna_id, habilita_venta_web)
     SELECT 'Casa Matriz', id, TRUE FROM comuna WHERE nombre = 'San Bernardo'`);
}
