# Datos de prueba

Productos, proveedores y stock de ejemplo para probar el sistema (compras, inventario, ventas, devoluciones, dashboards). **Son datos ficticios**: los nombres de productos son genéricos, los costos son aproximados y los proveedores no existen. No es un catálogo real ni se debe cargar en producción.

## Qué carga
- **Casa Matriz** en San Bernardo (solo si no existe una sucursal con ese nombre), con venta web habilitada.
- **6 categorías** con sus márgenes, **6 proveedores** con RUT válido y **90 productos**: 31 medicamentos (17 de venta directa, 11 con receta simple y 3 con receta retenida), 12 de dermocosmética, 17 de cuidado personal, 12 de primeros auxilios, 10 de vitaminas y 8 de bebé y maternidad.
- Cada producto con su proveedor principal (y uno alternativo en la mayoría), su stock mínimo y un lote con stock inicial en Casa Matriz.
- El stock entra por el **kardex** (movimiento "Ajuste positivo" a nombre del usuario Sistema), igual que un ajuste hecho desde el sistema: el lote, el stock web y el kardex quedan consistentes.
- Algunos casos a propósito, para ver las alertas: 8 productos bajo su stock mínimo (2 sin stock, 1 con todo su lote ya vencido y 5 con poco), 3 lotes que vencen en 1 o 2 meses y 1 lote vencido. Los productos sin vencimiento (algodón, termómetro, pañales…) no llevan fecha.

## Cómo cargarlo
**En Supabase:** abrir `datos-prueba.sql` en este repositorio, copiar todo su contenido y ejecutarlo en el editor SQL. Requiere el esquema base y las migraciones al día. Al final muestra un resumen (proveedores, productos, lotes y unidades). Se puede ejecutar varias veces: lo que ya existe (por SKU, RUT o nombre) no se duplica ni se pisa, y el stock inicial no se vuelve a sumar.

**En la base local:** con `npm run dev:db` corriendo, en otra terminal `cd backend && npm run datos-prueba:local`. Para empezar de cero, detener la base, borrar `backend/.pgdata` y volver a levantarla.

## Cambiar o ampliar los datos (por ejemplo, con un catálogo real)
Se editan los CSV de esta carpeta y se vuelve a generar el SQL con `cd backend && npm run datos-prueba`. Se pueden abrir y guardar con Excel (separador `;`; también se acepta `,`). El generador revisa todo y, si hay errores, los lista con archivo y línea, sin escribir nada.

| Archivo | Columnas |
|---|---|
| `categorias.csv` | `nombre`, `margen_pesimista`, `margen_probable`, `margen_optimista` (fracción del costo: `0.30` = 30%; se exige pesimista ≤ probable ≤ optimista) |
| `proveedores.csv` | `nombre`, `rut` (con dígito verificador válido), `contacto` (opcional) |
| `productos.csv` | `sku`, `nombre`, `categoria`, `condicion_venta`, `costo`, `margen`, `stock`, `stock_minimo`, `vence_meses`, `proveedor_rut`, `proveedor_alt_rut` |

Detalle de `productos.csv`:
- `categoria` debe estar en `categorias.csv`, y `proveedor_rut` / `proveedor_alt_rut` en `proveedores.csv`.
- `condicion_venta`: `Venta directa`, `Receta médica simple`, `Receta médica retenida` o `Receta cheque`. La clasificación de ejemplo debe confirmarla un químico farmacéutico.
- `costo`: **neto, sin IVA**, en pesos. El precio de venta lo calcula la base: costo × (1 + margen) × 1,19.
- `margen`: opcional; si va vacío se usa el margen probable de la categoría.
- `stock`: unidades iniciales en Casa Matriz (`0` = sin stock). `stock_minimo`: umbral de la alerta de reposición.
- `vence_meses`: meses desde hoy hasta el vencimiento del lote; **negativo = ya vencido**; **vacío = el producto no vence**.
- `proveedor_alt_rut`: opcional; se carga con un costo referencial 5% mayor.

### Si el catálogo viene de Cenabast u otra fuente
Esas listas rara vez traen todas las columnas. Se arma `productos.csv` con lo que haya (código o nombre → `sku` y `nombre`; precio → `costo`) y se completa lo demás: categoría, condición de venta, proveedor y stock de ejemplo. Un precio publicado al público no es el costo de la farmacia: conviene revisar si el valor es neto o con IVA antes de usarlo como `costo`. Un SKU que ya existe en la base se ignora, no se actualiza.

## Comunas
El esquema base ya carga las 52 comunas de la Región Metropolitana (incluye todo el centro y el sur). Se usan como destino de despacho en los pedidos. No hay nada que cargar aquí.
