-- =====================================================================
-- 019 — Correos al cliente por su pedido web (HU-74 y HU-79)
--   * correo_pedido: bandeja de salida. Un trigger agrega una fila cuando un pedido de la tienda (canal Online, con
--     cliente) pasa a "Pagado" (correo con el comprobante PDF, HU-74), "Listo para retiro", "En despacho" o
--     "Entregado" (aviso de estado, HU-79). La API los envía en segundo plano (tienda/correosPedido.js).
--   * Si el envío falla, la compra no se revierte: el error queda en ultimo_error y se reintenta hasta 5 veces,
--     cada vez más espaciado.
--   * Un pedido recibe a lo más un correo por estado (uq_correo_pedido_estado).
-- Idempotente. Ejecutar en el editor SQL de Supabase (primero dev, después prod).
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS correo_pedido (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
    estado_pedido_id UUID NOT NULL REFERENCES estado_pedido(id) ON DELETE RESTRICT,
    creado_en TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    enviado_en TIMESTAMPTZ,
    intentos SMALLINT DEFAULT 0 NOT NULL,
    siguiente_intento TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    ultimo_error VARCHAR(300),
    CONSTRAINT uq_correo_pedido_estado UNIQUE (pedido_id, estado_pedido_id)
);
COMMENT ON TABLE correo_pedido IS 'Correos al cliente por su pedido web (HU-74 comprobante, HU-79 cambios de estado). Bandeja de salida con reintentos.';
CREATE INDEX IF NOT EXISTS ix_correo_pedido_pendientes ON correo_pedido (siguiente_intento) WHERE enviado_en IS NULL;

CREATE OR REPLACE FUNCTION fn_encolar_correo_pedido() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.estado_pedido_id IS NOT DISTINCT FROM OLD.estado_pedido_id THEN
        RETURN NEW;
    END IF;
    IF NEW.cliente_id IS NULL THEN RETURN NEW; END IF;
    IF NOT EXISTS (SELECT 1 FROM canal_venta WHERE id = NEW.canal_venta_id AND nombre = 'Online') THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM estado_pedido WHERE id = NEW.estado_pedido_id
                AND nombre IN ('Pagado', 'Listo para retiro', 'En despacho', 'Entregado')) THEN
        INSERT INTO correo_pedido (pedido_id, estado_pedido_id) VALUES (NEW.id, NEW.estado_pedido_id)
        ON CONFLICT ON CONSTRAINT uq_correo_pedido_estado DO NOTHING;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_encolar_correo_pedido ON pedido;
CREATE TRIGGER trg_encolar_correo_pedido
    AFTER INSERT OR UPDATE OF estado_pedido_id ON pedido
    FOR EACH ROW EXECUTE FUNCTION fn_encolar_correo_pedido();

GRANT SELECT, INSERT ON correo_pedido TO app_backend;
GRANT UPDATE (enviado_en, intentos, siguiente_intento, ultimo_error) ON correo_pedido TO app_backend;

COMMIT;
