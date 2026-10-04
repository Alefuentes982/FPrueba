// Categorías de producto con sus márgenes (pesimista <= probable <= optimista, como fracción del costo).
export default async function sembrar(db) {
  await db.query(`
    INSERT INTO categoria (nombre, margen_pesimista, margen_probable, margen_optimista) VALUES
      ('Medicamentos', 0.20, 0.30, 0.40), ('Dermocosmética', 0.30, 0.45, 0.60), ('Cuidado personal', 0.25, 0.40, 0.55)`);
}
