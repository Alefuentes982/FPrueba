-- =====================================================================
-- 014 — Tienda en línea: forma de entrega del pedido web (HU-71)
--   * pedido.tipo_entrega: 'retiro' (en la sucursal del pedido) o 'despacho' (a la dirección y comuna del pedido).
--     Vacío en las ventas de caja y en los pedidos que crea el personal.
--   * Un despacho exige dirección y comuna.
--   * Índice para buscar los pedidos web pendientes de un cliente (se anula el anterior al crear uno nuevo).
-- Idempotente. Ejecutar en el editor SQL de Supabase (primero dev, después prod).
-- =====================================================================
BEGIN;

ALTER TABLE pedido ADD COLUMN IF NOT EXISTS tipo_entrega VARCHAR(10);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pedido_tipo_entrega') THEN
        ALTER TABLE pedido ADD CONSTRAINT ck_pedido_tipo_entrega CHECK (
            tipo_entrega IS NULL OR tipo_entrega = 'retiro'
            OR (tipo_entrega = 'despacho' AND direccion_pedido IS NOT NULL AND comuna_id IS NOT NULL));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ped_cliente_estado ON pedido(cliente_id, estado_pedido_id) WHERE cliente_id IS NOT NULL;

COMMENT ON COLUMN pedido.tipo_entrega IS 'Pedido web: retiro (en sucursal_id) o despacho (a direccion_pedido y comuna_id). Vacío en ventas de caja.';

GRANT INSERT (tipo_entrega) ON pedido TO app_backend;

COMMIT;
