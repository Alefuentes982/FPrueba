-- =====================================================================
-- 017 — Historial de estados del pedido (HU-76)
--   * pedido_estado_historial: cada cambio de estado de un pedido (de qué estado a cuál, cuándo y quién). Lo llena un
--     trigger, así queda registrado aunque el cambio venga de la tienda, de Webpay, de la caja o de un job.
--   * El usuario se toma de app.usuario_id (lo fija el backend en cada transacción). Vacío = un proceso automático
--     (por ejemplo, la expiración de pedidos sin pagar con pg_cron).
--   * Los pedidos que ya existen parten con una fila con su estado actual y la fecha del pedido.
-- Idempotente. Ejecutar en el editor SQL de Supabase (primero dev, después prod).
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS pedido_estado_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
    estado_anterior_id UUID REFERENCES estado_pedido(id) ON DELETE RESTRICT,
    estado_nuevo_id UUID NOT NULL REFERENCES estado_pedido(id) ON DELETE RESTRICT,
    usuario_id UUID REFERENCES usuario(id) ON DELETE RESTRICT,
    fecha TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE pedido_estado_historial IS 'Cambios de estado de cada pedido con su fecha y usuario (HU-76). Lo llena trg_pedido_estado_historial; no se edita.';
CREATE INDEX IF NOT EXISTS ix_pedido_estado_historial_pedido ON pedido_estado_historial (pedido_id, fecha);

CREATE OR REPLACE FUNCTION fn_registrar_estado_pedido() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.estado_pedido_id IS NOT DISTINCT FROM OLD.estado_pedido_id THEN
        RETURN NEW;
    END IF;
    INSERT INTO pedido_estado_historial (pedido_id, estado_anterior_id, estado_nuevo_id, usuario_id)
    VALUES (NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.estado_pedido_id END, NEW.estado_pedido_id,
            NULLIF(current_setting('app.usuario_id', true), '')::uuid);
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pedido_estado_historial ON pedido;
CREATE TRIGGER trg_pedido_estado_historial
    AFTER INSERT OR UPDATE OF estado_pedido_id ON pedido
    FOR EACH ROW EXECUTE FUNCTION fn_registrar_estado_pedido();

-- Pedidos anteriores a esta migración: una fila con su estado actual.
INSERT INTO pedido_estado_historial (pedido_id, estado_nuevo_id, fecha)
SELECT p.id, p.estado_pedido_id, p.fecha
  FROM pedido p
 WHERE NOT EXISTS (SELECT 1 FROM pedido_estado_historial h WHERE h.pedido_id = p.id);

-- Solo lectura e inserción (la inserción la hace el trigger con el usuario de la API): el historial no se edita.
GRANT SELECT, INSERT ON pedido_estado_historial TO app_backend;

COMMIT;
