-- =====================================================================
-- 018 — Anulación y reembolso por Webpay Plus (HU-80)
--   * transaccion_reembolso: cada reembolso hecho en Webpay (operación "refunds" de Transbank) sobre un pago
--     aprobado: monto, tipo que respondió Transbank (REVERSED = reversa el mismo día, NULLIFIED = anulación), su
--     código de autorización, quién lo pidió y por qué. Si viene de una devolución, queda ligado a ella.
--   * estado_transaccion 'Reembolsado': el pago se devolvió completo.
--   * La suma de los reembolsos de un pago no puede pasar de lo pagado (trigger trg_validar_reembolso).
-- Idempotente. Ejecutar en el editor SQL de Supabase (primero dev, después prod).
-- =====================================================================
BEGIN;

INSERT INTO estado_transaccion (nombre) VALUES ('Reembolsado') ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS transaccion_reembolso (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaccion_pago_id UUID NOT NULL REFERENCES transaccion_pago(id) ON DELETE RESTRICT,
    monto NUMERIC(12,2) NOT NULL CONSTRAINT ck_treembolso_monto CHECK (monto > 0),
    tipo VARCHAR(12) NOT NULL CONSTRAINT ck_treembolso_tipo CHECK (tipo IN ('REVERSED', 'NULLIFIED')),
    codigo_autorizacion VARCHAR(50),
    motivo VARCHAR(300) NOT NULL,
    devolucion_id UUID REFERENCES devolucion(id) ON DELETE RESTRICT,
    usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    fecha TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE transaccion_reembolso IS 'Reembolsos hechos en Webpay Plus sobre un pago aprobado (HU-80). No se editan.';
CREATE INDEX IF NOT EXISTS ix_treembolso_transaccion ON transaccion_reembolso (transaccion_pago_id);

CREATE OR REPLACE FUNCTION fn_validar_reembolso() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_pagado NUMERIC; v_previo NUMERIC;
BEGIN
    SELECT monto INTO v_pagado FROM transaccion_pago WHERE id = NEW.transaccion_pago_id FOR UPDATE;
    SELECT COALESCE(SUM(monto), 0) INTO v_previo FROM transaccion_reembolso WHERE transaccion_pago_id = NEW.transaccion_pago_id;
    IF v_previo + NEW.monto > v_pagado THEN
        RAISE EXCEPTION 'Los reembolsos (%) superarían lo pagado (%).', v_previo + NEW.monto, v_pagado
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_treembolso_tope';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validar_reembolso ON transaccion_reembolso;
CREATE TRIGGER trg_validar_reembolso BEFORE INSERT ON transaccion_reembolso
    FOR EACH ROW EXECUTE FUNCTION fn_validar_reembolso();

GRANT SELECT, INSERT ON transaccion_reembolso TO app_backend;

COMMIT;
