-- =====================================================================
-- 015 — Vida útil mínima al recibir una orden de compra (HU-87) y restricciones con nombre (HU-88)
--   * Tabla parametro: valores del negocio que edita el Administrador. Primer parámetro: vida_util_minima_meses = 3.
--   * Un lote que entra por una orden de compra debe vencer en hoy + ese plazo o después (hoy en Chile). Lo exige un
--     trigger, aunque el lote se inserte por otra ruta que la API.
--   * El Administrador o el Jefe de local pueden aceptar un lote bajo el mínimo indicando un motivo: queda en el lote
--     (excepcion_vida_util) junto a quién lo aceptó (excepcion_usuario_id).
--   * lote.fecha_ingreso por defecto es el día de hoy en Chile, no el del servidor (UTC).
--   * Las restricciones de lote y de las líneas de la orden de compra pasan a tener nombre (ck_..., uq_...): la API las
--     traduce a un mensaje con el campo (backend/src/core/errors.js).
-- Idempotente. Ejecutar en el editor SQL de Supabase (primero dev, después prod).
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS parametro (
    clave VARCHAR(50) PRIMARY KEY,
    valor INTEGER NOT NULL,
    descripcion VARCHAR(300) NOT NULL,
    minimo INTEGER,
    maximo INTEGER,
    actualizado_en TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    actualizado_por UUID REFERENCES usuario(id) ON DELETE RESTRICT,
    CONSTRAINT ck_parametro_rango CHECK ((minimo IS NULL OR valor >= minimo) AND (maximo IS NULL OR valor <= maximo))
);
COMMENT ON TABLE parametro IS 'Valores del negocio que edita el Administrador desde el sistema (por ejemplo, la vida útil mínima de un lote).';

INSERT INTO parametro (clave, valor, descripcion, minimo, maximo)
VALUES ('vida_util_minima_meses', 3, 'Meses de vida útil que debe tener un lote al recibirlo en una orden de compra.', 0, 24)
ON CONFLICT (clave) DO NOTHING;

GRANT SELECT ON parametro TO app_backend;
GRANT UPDATE (valor, actualizado_en, actualizado_por) ON parametro TO app_backend;

ALTER TABLE lote ADD COLUMN IF NOT EXISTS excepcion_vida_util VARCHAR(300);
ALTER TABLE lote ADD COLUMN IF NOT EXISTS excepcion_usuario_id UUID REFERENCES usuario(id) ON DELETE RESTRICT;
ALTER TABLE lote ALTER COLUMN fecha_ingreso SET DEFAULT (NOW() AT TIME ZONE 'America/Santiago')::date;
COMMENT ON COLUMN lote.excepcion_vida_util IS 'Motivo por el que se aceptó un lote que vence antes de la vida útil mínima (HU-87). Vacío si cumple.';
COMMENT ON COLUMN lote.excepcion_usuario_id IS 'Administrador o Jefe de local que aceptó el lote bajo la vida útil mínima.';

-- Restricciones con nombre (HU-88). Se renombran solo si aún tienen el nombre automático.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('lote', 'lote_check', 'ck_lote_vencimiento_posterior_ingreso'),
        ('lote', 'lote_cantidad_recibida_check', 'ck_lote_cantidad_recibida'),
        ('lote', 'lote_cantidad_actual_check', 'ck_lote_cantidad_actual'),
        ('lote', 'lote_producto_id_sucursal_id_numero_lote_key', 'uq_lote_producto_sucursal_numero'),
        ('orden_compra_detalle', 'orden_compra_detalle_cantidad_solicitada_check', 'ck_ocd_cantidad_solicitada'),
        ('orden_compra_detalle', 'orden_compra_detalle_cantidad_recibida_check', 'ck_ocd_cantidad_recibida'),
        ('orden_compra_detalle', 'orden_compra_detalle_costo_unitario_check', 'ck_ocd_costo_unitario')
    ) AS v(tabla, viejo, nuevo) LOOP
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = r.tabla::regclass AND conname = r.viejo)
           AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = r.tabla::regclass AND conname = r.nuevo) THEN
            EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', r.tabla, r.viejo, r.nuevo);
        END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_lote_excepcion_motivo') THEN
        ALTER TABLE lote ADD CONSTRAINT ck_lote_excepcion_motivo
            CHECK (excepcion_vida_util IS NULL OR LENGTH(BTRIM(excepcion_vida_util)) >= 5);
    END IF;
END $$;

-- Plazo vigente (en meses). Si alguien borrara el parámetro, se usan 3.
CREATE OR REPLACE FUNCTION fn_vida_util_minima_meses() RETURNS INTEGER STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT valor FROM parametro WHERE clave = 'vida_util_minima_meses'), 3);
$$ LANGUAGE sql;

-- Regla de la vida útil mínima para los lotes que entran por una orden de compra.
CREATE OR REPLACE FUNCTION trg_validar_vida_util() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_minima DATE; v_usuario UUID;
BEGIN
    IF NEW.orden_compra_detalle_id IS NULL OR NEW.fecha_vencimiento IS NULL THEN RETURN NEW; END IF;
    v_minima := ((NOW() AT TIME ZONE 'America/Santiago')::date + make_interval(months => fn_vida_util_minima_meses()))::date;
    IF NEW.fecha_vencimiento >= v_minima THEN
        NEW.excepcion_vida_util := NULL;
        NEW.excepcion_usuario_id := NULL;
        RETURN NEW;
    END IF;
    IF NEW.excepcion_vida_util IS NULL THEN
        RAISE EXCEPTION 'El lote % vence el % y la fecha mínima es el %.', COALESCE(NEW.numero_lote, 'sin número'),
            to_char(NEW.fecha_vencimiento, 'DD-MM-YYYY'), to_char(v_minima, 'DD-MM-YYYY')
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_lote_vida_util_minima';
    END IF;
    v_usuario := NULLIF(current_setting('app.usuario_id', true), '')::uuid;
    IF v_usuario IS NULL OR NOT EXISTS (
        SELECT 1 FROM usuario u JOIN rol r ON r.id = u.rol_id
         WHERE u.id = v_usuario AND u.activo AND r.nombre IN ('Administrador', 'Jefe de local')) THEN
        RAISE EXCEPTION 'Solo el Administrador o el Jefe de local pueden aceptar un lote bajo la vida útil mínima.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_lote_excepcion_autorizada';
    END IF;
    NEW.excepcion_usuario_id := v_usuario;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS val_vida_util ON lote;
CREATE TRIGGER val_vida_util BEFORE INSERT ON lote FOR EACH ROW EXECUTE FUNCTION trg_validar_vida_util();

GRANT INSERT (excepcion_vida_util) ON lote TO app_backend;
GRANT SELECT (excepcion_vida_util, excepcion_usuario_id) ON lote TO app_backend;

COMMIT;
