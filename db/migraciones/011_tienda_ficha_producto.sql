-- =====================================================================
-- 011 — Tienda en línea: contenido de la ficha del producto (HU-67)
-- La ficha pública muestra una descripción, la presentación del producto (por ejemplo "Caja 30 comprimidos") y
-- una foto. La foto es la dirección https de una imagen ya publicada (por ejemplo, un archivo público de Supabase
-- Storage); la base no guarda imágenes.
-- Las tres columnas son opcionales: los productos existentes siguen funcionando igual y la tienda muestra una
-- ilustración por categoría mientras no haya foto. El backend puede escribirlas desde el módulo Productos.
-- Idempotente. Ejecutar en el editor SQL de Supabase (primero dev, después prod).
-- =====================================================================
BEGIN;

ALTER TABLE producto ADD COLUMN IF NOT EXISTS descripcion VARCHAR(2000);
ALTER TABLE producto ADD COLUMN IF NOT EXISTS presentacion VARCHAR(100);
ALTER TABLE producto ADD COLUMN IF NOT EXISTS imagen_url VARCHAR(500);
COMMENT ON COLUMN producto.descripcion IS 'Texto de la ficha pública de la tienda. Opcional.';
COMMENT ON COLUMN producto.presentacion IS 'Formato de venta mostrado en la tienda, por ejemplo "Caja 30 comprimidos". Opcional.';
COMMENT ON COLUMN producto.imagen_url IS 'Dirección https de la foto del producto para la tienda. Opcional.';

-- Solo direcciones https: una imagen por http se bloquea en un sitio con https y una dirección "javascript:" no
-- debe llegar nunca a la página.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_producto_imagen_https') THEN
        ALTER TABLE producto ADD CONSTRAINT ck_producto_imagen_https
            CHECK (imagen_url IS NULL OR imagen_url ~ '^https://[^[:space:]]+$');
    END IF;
END $$;

GRANT INSERT (descripcion, presentacion, imagen_url), UPDATE (descripcion, presentacion, imagen_url) ON producto TO app_backend;

COMMIT;
