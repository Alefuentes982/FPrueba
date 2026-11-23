-- Revisión de migraciones 010 a 021 (OPS-02). Solo lee: se puede correr en dev y en prod.
-- Cada fila busca un objeto que crea esa migración. aplicada = false → falta correrla en esta base.
SELECT m.migracion, m.aplicada
  FROM (VALUES
    ('010 cierre automático y fuerza mayor', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'turno_caja' AND column_name = 'cierre_tipo')),
    ('011 ficha de producto de la tienda',   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'producto' AND column_name = 'imagen_url')),
    ('012 cuenta de cliente',                EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_rol_sin_modulos')),
    ('013 efectivo recibido y vuelto',       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transaccion_pago' AND column_name = 'monto_recibido')),
    ('014 entrega del pedido web',           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedido' AND column_name = 'tipo_entrega')),
    ('015 vida útil mínima',                 to_regclass('public.parametro') IS NOT NULL),
    ('016 costo de despacho',                to_regclass('public.costo_despacho') IS NOT NULL),
    ('017 historial de estados del pedido',  to_regclass('public.pedido_estado_historial') IS NOT NULL),
    ('018 reembolso por Webpay',             to_regclass('public.transaccion_reembolso') IS NOT NULL),
    ('019 correos del pedido',               to_regclass('public.correo_pedido') IS NOT NULL),
    ('020 vida útil mínima de la tienda',    to_regclass('public.vw_stock_disponible_web') IS NOT NULL),
    ('021 fotos de productos',               EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_producto_imagen_https' AND pg_get_constraintdef(oid) LIKE '%/api/fotos/%'))
  ) AS m(migracion, aplicada)
 ORDER BY m.migracion;
