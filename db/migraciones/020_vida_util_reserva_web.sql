-- =====================================================================
-- 020 — Vida útil mínima para vender en la tienda (HU-93)
--   * Parámetro vida_util_web_dias (30 por defecto, de 0 a 365): días de vida que debe tener un lote para venderlo a
--     distancia. Lo edita el Administrador en Pedidos > Despacho.
--   * fn_reservar_pedido: un pedido sin turno (canal Online) solo reserva lotes que vencen en hoy + ese plazo o
--     después. La venta en mostrador sigue igual (FEFO desde hoy).
--   * vw_stock_disponible_web: lo que la tienda puede vender por sucursal con la misma regla. La tienda muestra y
--     revisa la disponibilidad con esta vista, así no ofrece unidades que la reserva no podría tomar.
-- Idempotente. Ejecutar en el editor SQL de Supabase (primero dev, después prod).
-- =====================================================================
BEGIN;

INSERT INTO parametro (clave, valor, descripcion, minimo, maximo)
VALUES ('vida_util_web_dias', 30, 'Días de vida que debe tener un lote para venderlo en la tienda en línea.', 0, 365)
ON CONFLICT (clave) DO NOTHING;

CREATE OR REPLACE FUNCTION fn_vida_util_web_dias() RETURNS INTEGER STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT valor FROM parametro WHERE clave = 'vida_util_web_dias'), 30);
$$ LANGUAGE sql;

CREATE OR REPLACE VIEW vw_stock_disponible_web AS
SELECT l.producto_id, l.sucursal_id, SUM(l.cantidad_actual)::INTEGER AS disponible
  FROM lote l
 WHERE l.cantidad_actual > 0
   AND (l.fecha_vencimiento IS NULL
        OR l.fecha_vencimiento >= (NOW() AT TIME ZONE 'America/Santiago')::date + fn_vida_util_web_dias())
 GROUP BY l.producto_id, l.sucursal_id;
COMMENT ON VIEW vw_stock_disponible_web IS 'Stock que se puede vender a distancia (HU-93): sin lotes que vencen antes de hoy + vida_util_web_dias.';

-- 7.1 Reserva FEFO (misma función de la instalación, con el mínimo para el canal a distancia)
CREATE OR REPLACE FUNCTION fn_reservar_pedido(p_pedido_id UUID) RETURNS VOID SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_ped RECORD; v_usuario UUID; v_motivo UUID; v_linea RECORD; v_lote RECORD;
    v_restante INTEGER; v_toma INTEGER; v_hoy DATE := (NOW() AT TIME ZONE 'America/Santiago')::date; v_minimo DATE;
BEGIN
    v_usuario := NULLIF(current_setting('app.usuario_id', true), '')::uuid;
    IF v_usuario IS NULL THEN RAISE EXCEPTION 'Falta app.usuario_id: el movimiento debe quedar a nombre de alguien.'; END IF;
    SELECT id INTO v_motivo FROM motivo_movimiento WHERE nombre = 'Venta';
    IF v_motivo IS NULL THEN RAISE EXCEPTION 'Falta el motivo de movimiento "Venta".'; END IF;

    SELECT p.id, p.sucursal_id, cv.requiere_turno INTO v_ped
      FROM pedido p JOIN canal_venta cv ON cv.id = p.canal_venta_id WHERE p.id = p_pedido_id FOR UPDATE OF p;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido inexistente.'; END IF;
    IF v_ped.sucursal_id IS NULL THEN RAISE EXCEPTION 'El pedido no tiene sucursal de despacho.'; END IF;
    IF NOT v_ped.requiere_turno AND NOT (SELECT habilita_venta_web FROM sucursal WHERE id = v_ped.sucursal_id) THEN
        RAISE EXCEPTION 'La sucursal del pedido online no habilita venta web.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM detalle_pedido WHERE pedido_id = p_pedido_id) THEN RAISE EXCEPTION 'El pedido no tiene líneas.'; END IF;
    -- HU-93: un pedido a distancia (canal sin turno, la tienda) no toma lotes que vencen antes de hoy + N días.
    -- La venta en mostrador sigue con FEFO desde hoy: el cliente ve el producto antes de llevarlo.
    v_minimo := CASE WHEN v_ped.requiere_turno THEN v_hoy ELSE v_hoy + fn_vida_util_web_dias() END;

    IF COALESCE((SELECT SUM(m.cantidad * t.signo) FROM movimiento_inventario m
                   JOIN motivo_movimiento mm ON mm.id = m.motivo_movimiento_id
                   JOIN tipo_movimiento t ON t.id = mm.tipo_movimiento_id
                  WHERE m.pedido_id = p_pedido_id), 0) <> 0 THEN
        RAISE EXCEPTION 'El pedido ya tiene stock reservado.'; END IF;

    FOR v_linea IN SELECT producto_id, SUM(cantidad)::INTEGER AS cantidad FROM detalle_pedido
                    WHERE pedido_id = p_pedido_id GROUP BY producto_id ORDER BY producto_id LOOP
        PERFORM 1 FROM producto WHERE id = v_linea.producto_id FOR UPDATE;   -- orden: producto -> lotes
        v_restante := v_linea.cantidad;
        FOR v_lote IN SELECT id, cantidad_actual FROM lote
                       WHERE producto_id = v_linea.producto_id AND sucursal_id = v_ped.sucursal_id
                         AND cantidad_actual > 0 AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= v_minimo)
                       ORDER BY fecha_vencimiento ASC NULLS LAST, id ASC FOR UPDATE LOOP
            EXIT WHEN v_restante = 0;
            v_toma := LEAST(v_lote.cantidad_actual, v_restante);
            INSERT INTO movimiento_inventario (producto_id, sucursal_id, cantidad, motivo_movimiento_id, lote_id, usuario_id, pedido_id)
            VALUES (v_linea.producto_id, v_ped.sucursal_id, v_toma, v_motivo, v_lote.id, v_usuario, p_pedido_id);
            v_restante := v_restante - v_toma;
        END LOOP;
        IF v_restante > 0 THEN RAISE EXCEPTION 'Stock insuficiente para el producto %', v_linea.producto_id; END IF;
    END LOOP;
END; $$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION fn_vida_util_web_dias() TO app_backend;
GRANT SELECT ON vw_stock_disponible_web TO app_backend;

COMMIT;
