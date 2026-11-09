-- =====================================================================
-- 013 — Caja: efectivo recibido y vuelto (HU-91)
-- En un cobro con efectivo se registra cuánto entregó el cliente y cuánto se le devolvió. transaccion_pago.monto sigue
-- siendo el efectivo aplicado a la venta (ya redondeado, Ley 20.956): el cierre de caja no cambia.
--   * transaccion_pago.monto_recibido: billetes y monedas que entregó el cliente (opcional; solo en efectivo).
--   * transaccion_pago.vuelto: monto_recibido - monto. La base exige que calce.
-- Idempotente. Ejecutar en el editor SQL de Supabase (primero dev, después prod).
-- =====================================================================
BEGIN;

ALTER TABLE transaccion_pago ADD COLUMN IF NOT EXISTS monto_recibido NUMERIC(12,2);
ALTER TABLE transaccion_pago ADD COLUMN IF NOT EXISTS vuelto NUMERIC(12,2);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tpago_efectivo_recibido') THEN
        ALTER TABLE transaccion_pago ADD CONSTRAINT ck_tpago_efectivo_recibido CHECK (
            (monto_recibido IS NULL AND vuelto IS NULL)
            OR (monto_recibido >= monto AND vuelto = monto_recibido - monto));
    END IF;
END $$;

COMMENT ON COLUMN transaccion_pago.monto_recibido IS 'Efectivo que entregó el cliente (billetes y monedas). Solo en pagos en efectivo; monto es lo aplicado a la venta.';
COMMENT ON COLUMN transaccion_pago.vuelto IS 'Vuelto entregado: monto_recibido - monto.';

GRANT INSERT (monto_recibido, vuelto) ON transaccion_pago TO app_backend;

COMMIT;
