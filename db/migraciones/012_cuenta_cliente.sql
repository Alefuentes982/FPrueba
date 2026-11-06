-- =====================================================================
-- 012 — Tienda en línea: cuenta de cliente (HU-68)
-- El cliente crea su cuenta en la tienda: Supabase Auth guarda la contraseña y la base guarda su usuario (rol Cliente)
-- y su ficha en la tabla cliente (RUT, teléfono, dirección y comuna).
--   * El rol Cliente (y el rol técnico Sistema) nunca tienen módulos del personal: un trigger lo impide aunque alguien
--     lo intente desde la base, y se corrige cualquier permiso que hubiera quedado marcado.
--   * cliente.rut se guarda normalizado (12345678-5), como lo deja el backend al validarlo.
-- Idempotente. Ejecutar en el editor SQL de Supabase (primero dev, después prod).
-- =====================================================================
BEGIN;

UPDATE rol_permiso SET permitido = FALSE
 WHERE permitido AND rol_id IN (SELECT id FROM rol WHERE nombre IN ('Cliente', 'Sistema'));

CREATE OR REPLACE FUNCTION trg_rol_sin_modulos() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.permitido AND EXISTS (SELECT 1 FROM rol WHERE id = NEW.rol_id AND nombre IN ('Cliente', 'Sistema')) THEN
        RAISE EXCEPTION 'Los roles Cliente y Sistema no pueden tener módulos del personal.';
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS rol_sin_modulos ON rol_permiso;
CREATE TRIGGER rol_sin_modulos BEFORE INSERT OR UPDATE ON rol_permiso FOR EACH ROW EXECUTE FUNCTION trg_rol_sin_modulos();

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_cliente_rut') THEN
        ALTER TABLE cliente ADD CONSTRAINT ck_cliente_rut CHECK (rut IS NULL OR rut ~ '^[1-9][0-9]{0,7}-[0-9K]$');
    END IF;
END $$;

COMMENT ON TABLE cliente IS 'Ficha del cliente de la tienda en línea (rol Cliente). La contraseña la guarda Supabase Auth, nunca la base.';
COMMENT ON COLUMN cliente.rut IS 'RUT normalizado sin puntos y con guion (12345678-5). Se pide al retirar el pedido.';

COMMIT;
