// Una sucursal de ejemplo (Casa Matriz, con venta web habilitada para que el stock sume a stock_total_web).
export default async function sembrar(db) {
  await db.query(
    `INSERT INTO sucursal (nombre, direccion, comuna_id, habilita_venta_web)
     SELECT 'Casa Matriz', 'Av. Libertador B. O''Higgins 1000', id, TRUE FROM comuna WHERE nombre = 'Santiago'`);
}
