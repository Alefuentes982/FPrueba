-- =====================================================================
-- 016 — Tienda en línea: costo de despacho por comuna (HU-78)
--   * costo_despacho: cuánto cuesta despachar a cada comuna. Lo configura el Administrador; una comuna sin fila (o
--     inactiva) no tiene despacho.
--   * pedido.costo_despacho: lo que se cobra por el despacho de ese pedido. Lo fija el servidor al crear el pedido web
--     según la comuna, nunca el navegador. pedido.total sigue siendo el de los productos (su IVA y su neto no cambian);
--     lo que se paga en Webpay es total + costo_despacho.
-- Idempotente. Ejecutar en el editor SQL de Supabase (primero dev, después prod). En producción el Administrador
-- carga los costos desde Pedidos > Costos de despacho antes de anunciar el despacho.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS costo_despacho (
    comuna_id UUID PRIMARY KEY REFERENCES comuna(id) ON DELETE RESTRICT,
    costo NUMERIC(12,0) NOT NULL CONSTRAINT ck_costo_despacho_costo CHECK (costo >= 0 AND costo <= 100000),
    activo BOOLEAN DEFAULT TRUE NOT NULL,
    actualizado_en TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    actualizado_por UUID REFERENCES usuario(id) ON DELETE RESTRICT
);
COMMENT ON TABLE costo_despacho IS 'Costo de despacho a domicilio por comuna (HU-78). Sin fila o inactiva = no se despacha a esa comuna.';

ALTER TABLE pedido ADD COLUMN IF NOT EXISTS costo_despacho NUMERIC(12,0) DEFAULT 0 NOT NULL;
COMMENT ON COLUMN pedido.costo_despacho IS 'Costo del despacho a domicilio (IVA incluido). Se paga junto al total de los productos: total + costo_despacho.';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pedido_costo_despacho') THEN
        ALTER TABLE pedido ADD CONSTRAINT ck_pedido_costo_despacho
            CHECK (costo_despacho >= 0 AND (costo_despacho = 0 OR tipo_entrega = 'despacho'));
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON costo_despacho TO app_backend;
GRANT INSERT (costo_despacho) ON pedido TO app_backend;

COMMIT;
