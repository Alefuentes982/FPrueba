// Genera db/datos-prueba/datos-prueba.sql a partir de los CSV de esa carpeta (categorías, proveedores y productos
// con su stock). El SQL resultante se pega en el editor SQL de Supabase o se aplica a la base local
// (npm run datos-prueba:local). Es idempotente: se puede ejecutar varias veces sin duplicar nada.
// Uso: npm run datos-prueba
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizarRut } from '../src/modules/proveedores/rut.js';

export const SUCURSAL = { nombre: 'Casa Matriz', comuna: 'San Bernardo' };
export const PREFIJO_LOTE = 'PRUEBA-';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'datos-prueba');

// CSV con separador ";" (Excel en español) o ",": se detecta por la cabecera. Admite comillas y BOM.
export function parsearCsv(texto) {
  const limpio = texto.replace(/^﻿/, '');
  const sep = (limpio.split(/\r?\n/, 1)[0] ?? '').includes(';') ? ';' : ',';
  const filas = [];
  let fila = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { celda += '"'; i++; } else if (c === '"') comillas = false; else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(celda); celda = '';
      if (fila.some((x) => x.trim() !== '')) filas.push(fila);
      fila = [];
    } else celda += c;
  }
  fila.push(celda);
  if (fila.some((x) => x.trim() !== '')) filas.push(fila);
  const [cabecera, ...datos] = filas;
  if (!cabecera) return [];
  const claves = cabecera.map((h) => h.trim());
  return datos.map((f, i) => ({ _linea: i + 2, ...Object.fromEntries(claves.map((k, j) => [k, (f[j] ?? '').trim()])) }));
}

const NUM = /^\d+([.,]\d+)?$/;
const ENTERO = /^\d+$/;
const num = (v) => v.replace(',', '.');

// Revisa los tres archivos y devuelve los datos ya normalizados, o lanza un error con todos los problemas.
export function validar({ categorias, proveedores, productos }) {
  const errores = [];
  const err = (archivo, fila, msg) => errores.push(`${archivo} (línea ${fila._linea}): ${msg}`);

  const cats = new Map();
  categorias.forEach((c) => {
    if (!c.nombre) return err('categorias.csv', c, 'falta el nombre');
    const m = [c.margen_pesimista, c.margen_probable, c.margen_optimista];
    if (!m.every((x) => NUM.test(x))) return err('categorias.csv', c, 'los tres márgenes deben ser números (0.30 = 30%)');
    const [a, b, d] = m.map((x) => Number(num(x)));
    if (!(a <= b && b <= d)) return err('categorias.csv', c, 'se exige pesimista <= probable <= optimista');
    cats.set(c.nombre, { nombre: c.nombre, pesimista: num(m[0]), probable: num(m[1]), optimista: num(m[2]) });
  });

  const ruts = new Map();
  proveedores.forEach((p) => {
    const rut = normalizarRut(p.rut);
    if (!p.nombre) return err('proveedores.csv', p, 'falta el nombre');
    if (!rut) return err('proveedores.csv', p, `RUT inválido (${p.rut})`);
    if (ruts.has(rut)) return err('proveedores.csv', p, `RUT repetido (${rut})`);
    ruts.set(rut, { nombre: p.nombre, rut, contacto: p.contacto || null });
  });

  const skus = new Set();
  const prods = [];
  productos.forEach((p) => {
    if (!p.sku || !p.nombre) return err('productos.csv', p, 'faltan sku o nombre');
    if (skus.has(p.sku)) return err('productos.csv', p, `SKU repetido (${p.sku})`);
    skus.add(p.sku);
    if (!cats.has(p.categoria)) return err('productos.csv', p, `la categoría "${p.categoria}" no está en categorias.csv`);
    if (!p.condicion_venta) return err('productos.csv', p, 'falta la condición de venta');
    if (!NUM.test(p.costo)) return err('productos.csv', p, 'costo debe ser un número (neto, sin IVA)');
    if (p.margen && !(NUM.test(p.margen) && Number(num(p.margen)) < 100)) return err('productos.csv', p, 'margen debe ser un número (0.30 = 30%) o ir vacío');
    if (!ENTERO.test(p.stock || '0') || !ENTERO.test(p.stock_minimo || '0')) return err('productos.csv', p, 'stock y stock_minimo deben ser enteros');
    if (p.vence_meses && !/^-?\d+$/.test(p.vence_meses)) return err('productos.csv', p, 'vence_meses debe ser un entero (negativo = ya vencido) o ir vacío');
    const principal = normalizarRut(p.proveedor_rut);
    if (!principal || !ruts.has(principal)) return err('productos.csv', p, `el proveedor ${p.proveedor_rut || '(vacío)'} no está en proveedores.csv`);
    let alt = null;
    if (p.proveedor_alt_rut) {
      alt = normalizarRut(p.proveedor_alt_rut);
      if (!alt || !ruts.has(alt)) return err('productos.csv', p, `el proveedor alternativo ${p.proveedor_alt_rut} no está en proveedores.csv`);
      if (alt === principal) return err('productos.csv', p, 'el proveedor alternativo es el mismo que el principal');
    }
    prods.push({
      sku: p.sku, nombre: p.nombre, categoria: p.categoria, condicion: p.condicion_venta, costo: num(p.costo),
      margen: p.margen ? num(p.margen) : '', stock: p.stock || '0', minimo: p.stock_minimo || '0', vence: p.vence_meses, prov: principal, alt: alt ?? '',
    });
  });
  if (errores.length) throw new Error(`Hay ${errores.length} problema(s) en los CSV:\n - ${errores.slice(0, 30).join('\n - ')}`);
  return { categorias: [...cats.values()], proveedores: [...ruts.values()], productos: prods };
}

const lit = (v) => (v == null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
const lista = (filas) => filas.map((f) => `    (${f.map(lit).join(', ')})`).join(',\n');

export function generarSql(datos) {
  const { categorias, proveedores, productos } = validar(datos);
  const condiciones = [...new Set(productos.map((p) => p.condicion))];
  const S = SUCURSAL;
  return `-- =====================================================================
-- Datos de prueba de FarmaClick (GENERADO por backend/scripts/datos-prueba.js: no editar a mano;
-- cambiar los CSV de db/datos-prueba/ y volver a generarlo con "npm run datos-prueba").
--
-- Carga categorías, proveedores ficticios, ${productos.length} productos con su proveedor, stock mínimo y stock inicial en
-- ${S.nombre} (${S.comuna}). Los nombres, costos y proveedores son de EJEMPLO, no son un catálogo real.
-- Idempotente: se puede ejecutar varias veces; lo que ya existe (por SKU, RUT o nombre) no se duplica ni se pisa.
-- Requisitos: esquema base y las migraciones al día. En Supabase se ejecuta en el editor SQL, con el usuario por defecto.
-- El stock entra por el kardex (movimiento "Ajuste positivo" a nombre del usuario Sistema), como cualquier ajuste.
-- =====================================================================

DO $$
DECLARE faltan TEXT;
BEGIN
    SELECT string_agg(v, ', ') INTO faltan
      FROM unnest(ARRAY[${condiciones.map(lit).join(', ')}]) v
     WHERE v NOT IN (SELECT nombre FROM condicion_venta);
    IF faltan IS NOT NULL THEN RAISE EXCEPTION 'Faltan condiciones de venta: %', faltan; END IF;
    IF NOT EXISTS (SELECT 1 FROM usuario WHERE correo = 'sistema@farmaclick.cl') THEN
        RAISE EXCEPTION 'Falta el usuario técnico sistema@farmaclick.cl (lo crea el esquema base).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM motivo_movimiento WHERE nombre = 'Ajuste positivo') THEN
        RAISE EXCEPTION 'Falta el motivo de movimiento "Ajuste positivo".';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM sucursal WHERE nombre = ${lit(S.nombre)})
       AND NOT EXISTS (SELECT 1 FROM comuna WHERE nombre = ${lit(S.comuna)}) THEN
        RAISE EXCEPTION 'No existe la comuna ${S.comuna}: cargue las comunas del esquema base.';
    END IF;
END $$;

-- 1. Sucursal (solo si no existe): la casa matriz, con venta web habilitada
INSERT INTO sucursal (nombre, comuna_id, habilita_venta_web)
SELECT ${lit(S.nombre)}, c.id, TRUE FROM comuna c JOIN region r ON r.id = c.region_id
 WHERE c.nombre = ${lit(S.comuna)} AND r.nombre = 'Metropolitana de Santiago'
   AND NOT EXISTS (SELECT 1 FROM sucursal WHERE nombre = ${lit(S.nombre)});

-- 2. Categorías con sus márgenes (fracción del costo: 0.30 = 30%)
INSERT INTO categoria (nombre, margen_pesimista, margen_probable, margen_optimista) VALUES
${categorias.map((c) => `    (${lit(c.nombre)}, ${c.pesimista}, ${c.probable}, ${c.optimista})`).join(',\n')}
ON CONFLICT (nombre) DO NOTHING;

-- 3. Proveedores ficticios
INSERT INTO proveedor (nombre, rut, contacto) VALUES
${lista(proveedores.map((p) => [p.nombre, p.rut, p.contacto]))}
ON CONFLICT (rut) DO NOTHING;

-- 4. Productos (el precio de venta lo calcula la base: costo × (1 + margen) × 1,19)
DROP TABLE IF EXISTS _prod_prueba;
CREATE TEMP TABLE _prod_prueba AS
SELECT * FROM (VALUES
${lista(productos.map((p) => [p.sku, p.nombre, p.categoria, p.condicion, p.costo, p.margen, p.stock, p.minimo, p.vence, p.prov, p.alt]))}
) AS v(sku, nombre, categoria, condicion, costo, margen, stock, minimo, vence_meses, prov, alt);

INSERT INTO producto (sku, nombre, costo, margen_utilidad, requiere_vencimiento, requiere_lote, categoria_id, condicion_venta_id)
SELECT d.sku, d.nombre, d.costo::numeric, COALESCE(NULLIF(d.margen, '')::numeric, c.margen_probable),
       d.vence_meses <> '', TRUE, c.id, cv.id
  FROM _prod_prueba d
  JOIN categoria c ON c.nombre = d.categoria
  JOIN condicion_venta cv ON cv.nombre = d.condicion
ON CONFLICT (sku) DO NOTHING;

-- 5. Proveedor principal de cada producto y, si hay, uno alternativo (5% más caro)
INSERT INTO producto_proveedor (producto_id, proveedor_id, costo_referencial, es_principal)
SELECT p.id, pv.id, d.costo::numeric, TRUE
  FROM _prod_prueba d JOIN producto p ON p.sku = d.sku JOIN proveedor pv ON pv.rut = d.prov
ON CONFLICT DO NOTHING;
INSERT INTO producto_proveedor (producto_id, proveedor_id, costo_referencial, es_principal)
SELECT p.id, pv.id, ROUND(d.costo::numeric * 1.05, 0), FALSE
  FROM _prod_prueba d JOIN producto p ON p.sku = d.sku JOIN proveedor pv ON pv.rut = d.alt
 WHERE d.alt <> ''
ON CONFLICT DO NOTHING;

-- 6. Stock mínimo en ${S.nombre}
INSERT INTO stock_minimo_sucursal (producto_id, sucursal_id, stock_minimo)
SELECT p.id, s.id, d.minimo::int
  FROM _prod_prueba d JOIN producto p ON p.sku = d.sku CROSS JOIN sucursal s
 WHERE s.nombre = ${lit(S.nombre)} AND d.minimo::int > 0
ON CONFLICT DO NOTHING;

-- 7. Un lote por producto en ${S.nombre} (vence_meses: meses desde hoy; negativo = ya vencido; vacío = no vence)
INSERT INTO lote (numero_lote, fecha_vencimiento, fecha_ingreso, cantidad_recibida, producto_id, sucursal_id)
SELECT '${PREFIJO_LOTE}' || d.sku, x.venc, LEAST(h.hoy, COALESCE((x.venc - INTERVAL '6 months')::date, h.hoy)), d.stock::int, p.id, s.id
  FROM _prod_prueba d
  CROSS JOIN (SELECT (NOW() AT TIME ZONE 'America/Santiago')::date AS hoy) h
  JOIN producto p ON p.sku = d.sku
  CROSS JOIN sucursal s
  CROSS JOIN LATERAL (SELECT CASE WHEN d.vence_meses = '' THEN NULL
                                  ELSE (h.hoy + d.vence_meses::int * INTERVAL '1 month')::date END AS venc) x
 WHERE s.nombre = ${lit(S.nombre)} AND d.stock::int > 0
ON CONFLICT DO NOTHING;

-- 8. Entrada de ese stock al kardex: los triggers de la base suben la cantidad del lote y el stock web.
INSERT INTO movimiento_inventario (producto_id, sucursal_id, cantidad, motivo_movimiento_id, lote_id, usuario_id)
SELECT l.producto_id, l.sucursal_id, l.cantidad_recibida, m.id, l.id, u.id
  FROM lote l
  JOIN motivo_movimiento m ON m.nombre = 'Ajuste positivo'
  JOIN usuario u ON u.correo = 'sistema@farmaclick.cl'
 WHERE l.numero_lote LIKE '${PREFIJO_LOTE}%' AND l.cantidad_recibida > 0
   AND NOT EXISTS (SELECT 1 FROM movimiento_inventario mi WHERE mi.lote_id = l.id);

DROP TABLE IF EXISTS _prod_prueba;

-- Resumen de lo que quedó cargado
SELECT (SELECT COUNT(*) FROM proveedor) AS proveedores,
       (SELECT COUNT(*) FROM producto) AS productos,
       (SELECT COUNT(*) FROM lote WHERE numero_lote LIKE '${PREFIJO_LOTE}%') AS lotes_de_prueba,
       (SELECT COALESCE(SUM(cantidad_actual), 0) FROM lote WHERE numero_lote LIKE '${PREFIJO_LOTE}%') AS unidades_en_stock;
`;
}

export function leerCsv(nombre) {
  return parsearCsv(fs.readFileSync(path.join(dir, nombre), 'utf8'));
}

export const archivoSql = path.join(dir, 'datos-prueba.sql');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const sql = generarSql({ categorias: leerCsv('categorias.csv'), proveedores: leerCsv('proveedores.csv'), productos: leerCsv('productos.csv') });
    fs.writeFileSync(archivoSql, sql, 'utf8');
    console.log(`Generado ${path.relative(process.cwd(), archivoSql)} (${sql.split('\n').length} líneas).`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
