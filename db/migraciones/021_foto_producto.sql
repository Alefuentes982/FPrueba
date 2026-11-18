-- =====================================================================
-- 021 — Fotos reales de los productos (HU-96)
--   * La foto se sube desde el sistema (Productos) y se guarda en Supabase Storage, bucket público "productos"
--     (lo crea la API la primera vez). producto.imagen_url queda con la dirección https pública del archivo.
--   * En el Docker de desarrollo, sin Supabase, la API guarda la foto en su disco y la sirve en /api/fotos/...:
--     la restricción acepta también esa dirección relativa. Ninguna otra forma (http://, javascript:, data:).
-- Idempotente. Ejecutar en el editor SQL de Supabase (primero dev, después prod).
-- =====================================================================
BEGIN;

ALTER TABLE producto DROP CONSTRAINT IF EXISTS ck_producto_imagen_https;
ALTER TABLE producto ADD CONSTRAINT ck_producto_imagen_https
    CHECK (imagen_url IS NULL OR imagen_url ~ '^https://[^[:space:]]+$' OR imagen_url ~ '^/api/fotos/[^[:space:]]+$');
COMMENT ON COLUMN producto.imagen_url IS 'Foto del producto para la tienda (HU-67, HU-96): dirección https (Supabase Storage) o /api/fotos/... en desarrollo local. Opcional.';

COMMIT;
