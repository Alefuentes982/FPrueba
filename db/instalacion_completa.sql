-- =====================================================================
-- FarmaClick — instalación completa (GENERADO: no editar a mano)
-- = farmaclick_postgresql_completo.sql + migraciones, en orden. Para crear una base nueva de una sola vez
-- (editor SQL de Supabase). Después: ALTER ROLE app_backend LOGIN PASSWORD '<secreto>';
-- Regenerar: db/generar-instalacion.sh
-- =====================================================================

-- =====================================================================
-- FarmaClick — Modelo físico PostgreSQL (Supabase) — VERSIÓN COMPLETA
-- Proyecto de título: MediFarm × D-Software
--
-- USO: ejecutar UNA vez sobre una base NUEVA (por ejemplo, el editor SQL de
-- Supabase). Todo el script corre en una sola transacción: si algo falla, no
-- queda nada a medias. Requiere PostgreSQL 15 o superior.
--
-- QUÉ INCLUYE
--   1. Roles y extensiones            5. Funciones de negocio (reserva FEFO,
--   2. Catálogos y tablas maestras       liberación, vencidos, Cierre Z)
--   3. Inventario, ventas y caja      6. Vistas, jobs (pg_cron) y datos semilla
--   4. Triggers de integridad         7. Seguridad (permisos mínimos + RLS)
--
-- DIFERENCIAS RESPECTO A FarmaClickDB_8_Postgre (para actualizar los diagramas)
--   * condicion_venta.permite_venta_online  (nuevo; hace cumplir el filtro online)
--   * transaccion_pago.pedido_id ahora es ON DELETE RESTRICT (auditoría de pagos)
--   * Triggers nuevos: congelar líneas del pedido, totales de orden de compra,
--     regla de condición de venta online, bloqueo de TRUNCATE en el kardex
--   * Funciones nuevas: fn_reservar_pedido (reemplaza a fn_reservar_stock),
--     fn_liberar_reserva, fn_liberar_reservas_vencidas, fn_baja_lotes_vencidos,
--     fn_cierre_esperado_efectivo, fn_cerrar_turno, fn_programar_jobs
--   * Vistas: vw_catalogo_web, vw_stock_disponible
--   * Seguridad: se aplica AL FINAL; permisos por columna; RLS activado
--   * Índices: se restituyeron los que se habían perdido
--
-- CAMBIOS DE ESTA REVISIÓN (v2, sobre el script original)
--   * transaccion_pago.buy_order VARCHAR(26) UNIQUE (+ CHECK): Webpay Plus exige una orden de compra de
--     hasta 26 caracteres y el uuid del pedido tiene 36, así que no puede usarse como buy_order.
--   * estado_transaccion: se agrega 'Abortado' (pago cancelado por el cliente o expirado en Webpay).
--   * proveedor.activo y categoria.activa: baja lógica sin perder historial (como el resto de maestros).
--   * Índice único parcial uq_prod_prov_principal: un solo proveedor principal por producto.
--
-- CONTRATO DE NOMBRES (los usan las funciones; vienen sembrados y NO deben
-- renombrarse desde la interfaz):
--   estado_pedido:     'Pago pendiente', 'Expirado'
--   estado_transaccion:'Aprobado'        medio_pago: 'Efectivo'
--   motivo_movimiento: 'Venta', 'Liberación de reserva', 'Producto vencido',
--                      'Recepción OC'
--
-- CÓMO LO USA EL BACKEND (Node.js, rol app_backend, pooler en modo transacción)
--   BEGIN;
--   SELECT set_config('app.usuario_id', '<uuid del usuario autenticado>', true);
--   ...operaciones (fn_reservar_pedido, fn_cerrar_turno, INSERT/UPDATE)...
--   COMMIT;
--   La identidad debe fijarse DENTRO de cada transacción, nunca con SET de sesión.
--
-- DESPUÉS DE EJECUTAR (fuera del repositorio):
--   ALTER ROLE app_backend LOGIN PASSWORD '<secreto>';
--   Si pg_cron no estaba habilitado: habilitarlo y ejecutar SELECT fn_programar_jobs();
-- =====================================================================
BEGIN;

DO $$ BEGIN
    IF current_setting('server_version_num')::int < 150000 THEN
        RAISE EXCEPTION 'FarmaClick requiere PostgreSQL 15 o superior (UNIQUE NULLS NOT DISTINCT).';
    END IF;
END $$;

-- =====================================================================
-- 1. EXTENSIONES Y ROLES
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- restricción de exclusión de promociones

DO $$ BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pg_cron no disponible (%). Los jobs se programarán después con fn_programar_jobs().', SQLERRM;
    END;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backend') THEN
        CREATE ROLE app_backend NOLOGIN;
    END IF;
END $$;
GRANT USAGE ON SCHEMA public TO app_backend;

-- =====================================================================
-- 2. CATÁLOGOS Y PARAMÉTRICAS
-- =====================================================================
CREATE TABLE canal_venta (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    requiere_turno BOOLEAN DEFAULT FALSE NOT NULL
);
CREATE TABLE condicion_venta (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    permite_venta_online BOOLEAN DEFAULT FALSE NOT NULL,
    activa BOOLEAN DEFAULT TRUE NOT NULL
);
CREATE TABLE estado_orden_compra ( id UUID DEFAULT gen_random_uuid() PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE );
CREATE TABLE estado_pedido       ( id UUID DEFAULT gen_random_uuid() PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE );
CREATE TABLE estado_transaccion  ( id UUID DEFAULT gen_random_uuid() PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE );
CREATE TABLE medio_pago          ( id UUID DEFAULT gen_random_uuid() PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE, activo BOOLEAN DEFAULT TRUE NOT NULL );
CREATE TABLE modulo              ( id UUID DEFAULT gen_random_uuid() PRIMARY KEY, nombre VARCHAR(100) NOT NULL, clave VARCHAR(50) NOT NULL UNIQUE );
CREATE TABLE pasarela            ( id UUID DEFAULT gen_random_uuid() PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE, activa BOOLEAN DEFAULT TRUE NOT NULL );
CREATE TABLE region              ( id UUID DEFAULT gen_random_uuid() PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE );
CREATE TABLE rol                 ( id UUID DEFAULT gen_random_uuid() PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE );
CREATE TABLE tipo_movimiento (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    signo SMALLINT NOT NULL CHECK (signo IN (1, -1))
);

-- =====================================================================
-- 3. TABLAS MAESTRAS
-- =====================================================================
CREATE TABLE categoria (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    activa BOOLEAN DEFAULT TRUE NOT NULL,
    margen_pesimista NUMERIC(4,2) NOT NULL CHECK (margen_pesimista >= 0),
    margen_probable  NUMERIC(4,2) NOT NULL,
    margen_optimista NUMERIC(4,2) NOT NULL,
    CHECK (margen_pesimista <= margen_probable AND margen_probable <= margen_optimista)
);

CREATE TABLE comuna (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    region_id UUID NOT NULL REFERENCES region(id) ON DELETE RESTRICT,
    UNIQUE (nombre, region_id)
);

CREATE TABLE motivo_movimiento (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    tipo_movimiento_id UUID NOT NULL REFERENCES tipo_movimiento(id) ON DELETE RESTRICT,
    activo BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE TABLE proveedor (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    rut VARCHAR(12) NOT NULL UNIQUE,
    contacto VARCHAR(150),
    activo BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE TABLE regla_descuento (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    categoria_id UUID REFERENCES categoria(id) ON DELETE RESTRICT,
    cantidad_minima INTEGER NOT NULL CHECK (cantidad_minima > 0),
    cantidad_maxima INTEGER CHECK (cantidad_maxima IS NULL OR cantidad_maxima >= cantidad_minima),
    porcentaje_descuento NUMERIC(5,2) NOT NULL CHECK (porcentaje_descuento >= 0 AND porcentaje_descuento <= 100),
    fecha_inicio TIMESTAMPTZ,
    fecha_fin TIMESTAMPTZ,
    activa BOOLEAN DEFAULT TRUE NOT NULL,
    CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio),
    EXCLUDE USING gist (
        COALESCE(categoria_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        tstzrange(fecha_inicio, fecha_fin) WITH &&,
        int4range(cantidad_minima, cantidad_maxima, '[]') WITH &&
    ) WHERE (activa)
);

CREATE TABLE rol_permiso (
    rol_id UUID NOT NULL REFERENCES rol(id) ON DELETE CASCADE,
    modulo_id UUID NOT NULL REFERENCES modulo(id) ON DELETE CASCADE,
    permitido BOOLEAN DEFAULT FALSE NOT NULL,
    PRIMARY KEY (rol_id, modulo_id)
);

CREATE TABLE sucursal (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    direccion VARCHAR(200),
    telefono VARCHAR(30),
    activa BOOLEAN DEFAULT TRUE NOT NULL,
    habilita_venta_web BOOLEAN DEFAULT FALSE NOT NULL,
    comuna_id UUID NOT NULL REFERENCES comuna(id) ON DELETE RESTRICT
);

CREATE TABLE caja (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sucursal_id UUID NOT NULL REFERENCES sucursal(id) ON DELETE RESTRICT,
    numero INTEGER NOT NULL CHECK (numero > 0),
    activa BOOLEAN DEFAULT TRUE NOT NULL,
    UNIQUE (sucursal_id, numero)
);

CREATE TABLE usuario (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,   -- para cuentas con login: usar el mismo id de Supabase Auth
    nombre VARCHAR(150) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    rol_id UUID NOT NULL REFERENCES rol(id) ON DELETE RESTRICT,
    sucursal_id UUID REFERENCES sucursal(id) ON DELETE RESTRICT,
    activo BOOLEAN DEFAULT TRUE NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE cliente (
    usuario_id UUID PRIMARY KEY REFERENCES usuario(id) ON DELETE RESTRICT,
    rut VARCHAR(12) UNIQUE,
    telefono VARCHAR(30),
    direccion_cliente VARCHAR(200),
    comuna_id UUID REFERENCES comuna(id) ON DELETE RESTRICT
);

-- =====================================================================
-- 4. PRODUCTOS, ABASTECIMIENTO E INVENTARIO
-- =====================================================================
CREATE TABLE producto (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    nombre VARCHAR(200) NOT NULL,
    costo NUMERIC(12,2) DEFAULT 0 NOT NULL CHECK (costo >= 0),
    margen_utilidad NUMERIC(4,2) NOT NULL CHECK (margen_utilidad >= 0),
    precio NUMERIC(12,2) GENERATED ALWAYS AS (ROUND(costo * (1 + margen_utilidad) * 1.19, 0)) STORED,
    activo BOOLEAN DEFAULT TRUE NOT NULL,
    stock_total_web INTEGER DEFAULT 0 NOT NULL CHECK (stock_total_web >= 0),
    requiere_vencimiento BOOLEAN DEFAULT TRUE NOT NULL,
    requiere_lote BOOLEAN DEFAULT TRUE NOT NULL,
    categoria_id UUID NOT NULL REFERENCES categoria(id) ON DELETE RESTRICT,
    condicion_venta_id UUID NOT NULL REFERENCES condicion_venta(id) ON DELETE RESTRICT,
    creado_en TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE producto_proveedor (
    producto_id UUID NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
    proveedor_id UUID NOT NULL REFERENCES proveedor(id) ON DELETE CASCADE,
    costo_referencial NUMERIC(12,2) NOT NULL CHECK (costo_referencial >= 0),
    es_principal BOOLEAN DEFAULT FALSE NOT NULL,
    PRIMARY KEY (producto_id, proveedor_id)
);

CREATE TABLE stock_minimo_sucursal (
    producto_id UUID NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
    sucursal_id UUID NOT NULL REFERENCES sucursal(id) ON DELETE CASCADE,
    stock_minimo INTEGER DEFAULT 0 NOT NULL CHECK (stock_minimo >= 0),
    PRIMARY KEY (producto_id, sucursal_id)
);

CREATE TABLE orden_compra (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fecha TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    fecha_esperada DATE,
    estado_orden_compra_id UUID NOT NULL REFERENCES estado_orden_compra(id) ON DELETE RESTRICT,
    subtotal_neto NUMERIC(12,2) DEFAULT 0 NOT NULL CHECK (subtotal_neto >= 0),
    iva NUMERIC(12,2) DEFAULT 0 NOT NULL,
    total NUMERIC(12,2) DEFAULT 0 NOT NULL,
    proveedor_id UUID NOT NULL REFERENCES proveedor(id) ON DELETE RESTRICT,
    usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    sucursal_id UUID NOT NULL REFERENCES sucursal(id) ON DELETE RESTRICT,
    CHECK (subtotal_neto = ROUND(total / 1.19, 0)),
    CHECK (total >= subtotal_neto),
    CHECK (iva = total - subtotal_neto)
);

CREATE TABLE orden_compra_detalle (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cantidad_solicitada INTEGER NOT NULL CHECK (cantidad_solicitada > 0),
    cantidad_recibida INTEGER DEFAULT 0 NOT NULL CHECK (cantidad_recibida >= 0),
    costo_unitario NUMERIC(12,2) NOT NULL CHECK (costo_unitario >= 0),
    orden_compra_id UUID NOT NULL REFERENCES orden_compra(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES producto(id) ON DELETE RESTRICT
);

CREATE TABLE lote (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    numero_lote VARCHAR(50),
    fecha_vencimiento DATE,
    fecha_ingreso DATE DEFAULT CURRENT_DATE NOT NULL,
    cantidad_recibida INTEGER NOT NULL CHECK (cantidad_recibida >= 0),
    cantidad_actual INTEGER DEFAULT 0 NOT NULL CHECK (cantidad_actual >= 0),
    producto_id UUID NOT NULL REFERENCES producto(id) ON DELETE RESTRICT,
    sucursal_id UUID NOT NULL REFERENCES sucursal(id) ON DELETE RESTRICT,
    orden_compra_detalle_id UUID REFERENCES orden_compra_detalle(id) ON DELETE RESTRICT,
    UNIQUE NULLS NOT DISTINCT (producto_id, sucursal_id, numero_lote),
    CHECK (fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_ingreso)
);

CREATE TABLE turno_caja (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    caja_id UUID NOT NULL REFERENCES caja(id) ON DELETE RESTRICT,
    fecha_apertura TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    fecha_cierre TIMESTAMPTZ,
    monto_apertura_efectivo NUMERIC(12,2) DEFAULT 0 NOT NULL CHECK (monto_apertura_efectivo >= 0),
    monto_cierre_esperado_efectivo NUMERIC(12,2) DEFAULT 0 NOT NULL,
    monto_cierre_real_efectivo NUMERIC(12,2),
    CHECK (fecha_cierre IS NULL OR fecha_cierre >= fecha_apertura)
);

CREATE TABLE pedido (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fecha TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    canal_venta_id UUID NOT NULL REFERENCES canal_venta(id) ON DELETE RESTRICT,
    estado_pedido_id UUID NOT NULL REFERENCES estado_pedido(id) ON DELETE RESTRICT,
    subtotal_bruto NUMERIC(12,2) DEFAULT 0 NOT NULL CHECK (subtotal_bruto >= 0),
    total NUMERIC(12,2) DEFAULT 0 NOT NULL CHECK (total >= 0),
    subtotal_neto NUMERIC(12,2) DEFAULT 0 NOT NULL CHECK (subtotal_neto >= 0),
    iva NUMERIC(12,2) DEFAULT 0 NOT NULL CHECK (iva >= 0),
    nombre_cliente VARCHAR(150) NOT NULL,
    direccion_pedido VARCHAR(200),
    telefono VARCHAR(30),
    comuna_id UUID REFERENCES comuna(id) ON DELETE RESTRICT,
    cliente_id UUID REFERENCES usuario(id) ON DELETE RESTRICT,
    vendedor_id UUID REFERENCES usuario(id) ON DELETE RESTRICT,
    sucursal_id UUID REFERENCES sucursal(id) ON DELETE RESTRICT,
    turno_caja_id UUID REFERENCES turno_caja(id) ON DELETE RESTRICT,
    CHECK (subtotal_neto = ROUND(total / 1.19, 0)),
    CHECK (total <= subtotal_bruto),
    CHECK (iva = total - subtotal_neto)
);

CREATE TABLE detalle_pedido (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre_producto VARCHAR(200) DEFAULT '' NOT NULL,          -- lo fija el trigger (snapshot)
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12,2) DEFAULT 0 NOT NULL CHECK (precio_unitario >= 0),   -- lo fija el trigger (snapshot)
    descuento_monto NUMERIC(12,2) DEFAULT 0 NOT NULL CHECK (descuento_monto >= 0),   -- lo calcula el trigger
    pedido_id UUID NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES producto(id) ON DELETE RESTRICT,
    regla_descuento_id UUID REFERENCES regla_descuento(id) ON DELETE RESTRICT,
    CHECK (descuento_monto <= (cantidad * precio_unitario))
);

CREATE TABLE transaccion_pago (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pedido_id UUID NOT NULL REFERENCES pedido(id) ON DELETE RESTRICT,
    pasarela_id UUID REFERENCES pasarela(id) ON DELETE RESTRICT,
    medio_pago_id UUID NOT NULL REFERENCES medio_pago(id) ON DELETE RESTRICT,
    buy_order VARCHAR(26) UNIQUE,                      -- orden de compra enviada a Webpay (máx. 26 caracteres)
    token_inicio VARCHAR(100),
    codigo_autorizacion VARCHAR(50),
    estado_transaccion_id UUID NOT NULL REFERENCES estado_transaccion(id) ON DELETE RESTRICT,
    monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    fecha_transaccion TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CHECK (pasarela_id IS NULL OR buy_order IS NOT NULL)
);

CREATE TABLE movimiento_inventario (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    producto_id UUID NOT NULL REFERENCES producto(id) ON DELETE RESTRICT,
    sucursal_id UUID NOT NULL REFERENCES sucursal(id) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),      -- siempre positiva: el signo lo da tipo_movimiento.signo
    fecha TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    motivo_movimiento_id UUID NOT NULL REFERENCES motivo_movimiento(id) ON DELETE RESTRICT,
    lote_id UUID NOT NULL REFERENCES lote(id) ON DELETE RESTRICT,
    usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    pedido_id UUID REFERENCES pedido(id) ON DELETE RESTRICT,
    orden_compra_id UUID REFERENCES orden_compra(id) ON DELETE RESTRICT
);

-- =====================================================================
-- 5. ÍNDICES
-- =====================================================================
CREATE INDEX idx_detped_ped        ON detalle_pedido(pedido_id);
CREATE INDEX idx_detped_prod       ON detalle_pedido(producto_id);
CREATE INDEX idx_movinv_lote       ON movimiento_inventario(lote_id);
CREATE INDEX idx_movinv_ped        ON movimiento_inventario(pedido_id);
CREATE INDEX idx_movinv_oc         ON movimiento_inventario(orden_compra_id);
CREATE INDEX idx_movinv_prod_suc   ON movimiento_inventario(producto_id, sucursal_id);
CREATE INDEX idx_ped_cliente       ON pedido(cliente_id);
CREATE INDEX idx_ped_vendedor      ON pedido(vendedor_id);
CREATE INDEX idx_ped_sucursal_fecha ON pedido(sucursal_id, fecha);
CREATE INDEX idx_ped_turno_fecha   ON pedido(turno_caja_id, fecha);
CREATE INDEX idx_ped_estado_fecha  ON pedido(estado_pedido_id, fecha);
CREATE INDEX idx_tpago_ped         ON transaccion_pago(pedido_id);
CREATE INDEX idx_lote_suc          ON lote(sucursal_id);
CREATE INDEX idx_lote_ocd          ON lote(orden_compra_detalle_id);
CREATE INDEX idx_lote_venc_activo  ON lote(producto_id, sucursal_id, fecha_vencimiento) WHERE cantidad_actual > 0;
CREATE INDEX idx_turno_caja_fecha  ON turno_caja(caja_id, fecha_apertura);
CREATE INDEX idx_turno_usuario     ON turno_caja(usuario_id);
CREATE INDEX idx_oc_prov           ON orden_compra(proveedor_id);
CREATE INDEX idx_ocd_oc            ON orden_compra_detalle(orden_compra_id);
CREATE INDEX idx_ocd_prod          ON orden_compra_detalle(producto_id);
CREATE INDEX idx_prod_cat          ON producto(categoria_id);
CREATE INDEX idx_pprov_prov        ON producto_proveedor(proveedor_id);
CREATE UNIQUE INDEX uq_turno_abierto_por_caja ON turno_caja(caja_id)   WHERE fecha_cierre IS NULL;
CREATE UNIQUE INDEX uq_turno_abierto_por_usu  ON turno_caja(usuario_id) WHERE fecha_cierre IS NULL;
CREATE UNIQUE INDEX uq_prod_prov_principal    ON producto_proveedor(producto_id) WHERE es_principal;   -- un solo proveedor principal por producto

-- =====================================================================
-- 6. FUNCIONES Y TRIGGERS DE INTEGRIDAD (todas SECURITY DEFINER)
-- =====================================================================

-- 6.1 Regla "quien abre, cierra": la identidad la informa el backend en cada transacción
CREATE OR REPLACE FUNCTION trg_cierre_solo_quien_abrio() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF OLD.fecha_cierre IS NULL AND NEW.fecha_cierre IS NOT NULL
       AND NULLIF(current_setting('app.usuario_id', true), '')::uuid IS DISTINCT FROM OLD.usuario_id THEN
        RAISE EXCEPTION 'Solo quien abrió el turno puede cerrarlo.';
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER cierre_turno BEFORE UPDATE ON turno_caja FOR EACH ROW EXECUTE FUNCTION trg_cierre_solo_quien_abrio();

-- 6.2 Pedido: el canal define si exige turno; el turno debe estar abierto y ser de la misma sucursal
CREATE OR REPLACE FUNCTION trg_validar_pedido_turno() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req_turno BOOLEAN; v_caja_sucursal UUID; v_fecha_cierre TIMESTAMPTZ;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.canal_venta_id IS NOT DISTINCT FROM OLD.canal_venta_id
       AND NEW.turno_caja_id IS NOT DISTINCT FROM OLD.turno_caja_id
       AND NEW.sucursal_id IS NOT DISTINCT FROM OLD.sucursal_id THEN RETURN NEW; END IF;
    SELECT requiere_turno INTO v_req_turno FROM canal_venta WHERE id = NEW.canal_venta_id;
    IF NOT v_req_turno THEN
        IF NEW.turno_caja_id IS NOT NULL THEN RAISE EXCEPTION 'Canal sin turno no admite turno_caja_id.'; END IF;
    ELSE
        IF NEW.turno_caja_id IS NULL THEN RAISE EXCEPTION 'Canal exige turno.'; END IF;
        IF NEW.sucursal_id IS NULL THEN RAISE EXCEPTION 'Pedido exige sucursal_id.'; END IF;
        SELECT c.sucursal_id, t.fecha_cierre INTO v_caja_sucursal, v_fecha_cierre
          FROM turno_caja t JOIN caja c ON t.caja_id = c.id WHERE t.id = NEW.turno_caja_id;
        IF NEW.sucursal_id IS DISTINCT FROM v_caja_sucursal THEN RAISE EXCEPTION 'Sucursal del pedido difiere de la caja.'; END IF;
        IF v_fecha_cierre IS NOT NULL THEN RAISE EXCEPTION 'El turno asignado está cerrado.'; END IF;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER val_pedido_turno BEFORE INSERT OR UPDATE ON pedido FOR EACH ROW EXECUTE FUNCTION trg_validar_pedido_turno();

-- 6.3 Línea de pedido: precio y nombre congelados al crearla, promoción validada y calculada
--     por la base, producto activo y condición de venta compatible con el canal
CREATE OR REPLACE FUNCTION trg_calcular_linea_pedido() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_precio NUMERIC; v_nombre VARCHAR; v_cat UUID; v_activo BOOLEAN; v_cond UUID; v_regla RECORD; v_canal_remoto BOOLEAN;
BEGIN
    SELECT precio, nombre, categoria_id, activo, condicion_venta_id INTO v_precio, v_nombre, v_cat, v_activo, v_cond
      FROM producto WHERE id = NEW.producto_id;
    IF TG_OP = 'INSERT' OR NEW.producto_id IS DISTINCT FROM OLD.producto_id THEN
        IF NOT v_activo THEN RAISE EXCEPTION 'El producto está dado de baja.'; END IF;
        SELECT NOT cv.requiere_turno INTO v_canal_remoto FROM pedido p JOIN canal_venta cv ON cv.id = p.canal_venta_id WHERE p.id = NEW.pedido_id;
        IF v_canal_remoto AND NOT (SELECT permite_venta_online FROM condicion_venta WHERE id = v_cond) THEN
            RAISE EXCEPTION 'La condición de venta del producto no permite venderlo por un canal remoto.'; END IF;
        NEW.precio_unitario := v_precio; NEW.nombre_producto := v_nombre;
    ELSE
        NEW.precio_unitario := OLD.precio_unitario; NEW.nombre_producto := OLD.nombre_producto;
    END IF;
    IF NEW.regla_descuento_id IS NOT NULL THEN
        SELECT * INTO v_regla FROM regla_descuento WHERE id = NEW.regla_descuento_id;
        IF NOT v_regla.activa THEN RAISE EXCEPTION 'Regla inactiva'; END IF;
        IF v_regla.categoria_id IS NOT NULL AND v_regla.categoria_id <> v_cat THEN RAISE EXCEPTION 'La regla pertenece a otra categoría.'; END IF;
        IF v_regla.fecha_inicio IS NOT NULL AND CURRENT_TIMESTAMP < v_regla.fecha_inicio THEN RAISE EXCEPTION 'Fuera de fecha'; END IF;
        IF v_regla.fecha_fin IS NOT NULL AND CURRENT_TIMESTAMP > v_regla.fecha_fin THEN RAISE EXCEPTION 'Fuera de fecha'; END IF;
        IF NEW.cantidad < v_regla.cantidad_minima OR (v_regla.cantidad_maxima IS NOT NULL AND NEW.cantidad > v_regla.cantidad_maxima) THEN
            RAISE EXCEPTION 'Rango de cantidad inválido'; END IF;
        NEW.descuento_monto := ROUND(NEW.cantidad * NEW.precio_unitario * v_regla.porcentaje_descuento / 100, 0);
    ELSE NEW.descuento_monto := 0; END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER calcular_linea BEFORE INSERT OR UPDATE ON detalle_pedido FOR EACH ROW EXECUTE FUNCTION trg_calcular_linea_pedido();

-- 6.4 Congelar líneas: solo se editan mientras el pedido está "Pago pendiente" y sin stock reservado
CREATE OR REPLACE FUNCTION fn_pedido_editable(p_pedido_id UUID) RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pendiente BOOLEAN; v_reservado NUMERIC;
BEGIN
    SELECT (ep.nombre = 'Pago pendiente') INTO v_pendiente
      FROM pedido p JOIN estado_pedido ep ON ep.id = p.estado_pedido_id WHERE p.id = p_pedido_id;
    IF NOT COALESCE(v_pendiente, FALSE) THEN RAISE EXCEPTION 'Las líneas solo se modifican mientras el pedido está en "Pago pendiente".'; END IF;
    SELECT COALESCE(SUM(m.cantidad * t.signo), 0) INTO v_reservado
      FROM movimiento_inventario m JOIN motivo_movimiento mm ON mm.id = m.motivo_movimiento_id
      JOIN tipo_movimiento t ON t.id = mm.tipo_movimiento_id WHERE m.pedido_id = p_pedido_id;
    IF v_reservado <> 0 THEN RAISE EXCEPTION 'El pedido tiene stock reservado: libere la reserva antes de modificar sus líneas.'; END IF;
    RETURN TRUE;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_congelar_lineas() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN PERFORM fn_pedido_editable(OLD.pedido_id); END IF;
    IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id) THEN PERFORM fn_pedido_editable(NEW.pedido_id); END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER congelar_lineas BEFORE INSERT OR UPDATE OR DELETE ON detalle_pedido FOR EACH ROW EXECUTE FUNCTION trg_congelar_lineas();

-- 6.5 Totales del pedido (la base es la única que los escribe)
CREATE OR REPLACE FUNCTION recalcular_un_pedido(p_id UUID) RETURNS VOID SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bruto NUMERIC; v_total NUMERIC; v_neto NUMERIC;
BEGIN
    PERFORM id FROM pedido WHERE id = p_id FOR UPDATE;
    SELECT COALESCE(SUM(cantidad * precio_unitario), 0), COALESCE(SUM((cantidad * precio_unitario) - descuento_monto), 0)
      INTO v_bruto, v_total FROM detalle_pedido WHERE pedido_id = p_id;
    v_neto := ROUND(v_total / 1.19, 0);
    UPDATE pedido SET subtotal_bruto = v_bruto, total = v_total, subtotal_neto = v_neto, iva = v_total - v_neto WHERE id = p_id;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_recalcular_totales_pedido() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN PERFORM recalcular_un_pedido(NEW.pedido_id); END IF;
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.pedido_id IS DISTINCT FROM NEW.pedido_id) THEN PERFORM recalcular_un_pedido(OLD.pedido_id); END IF;
    RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER recalcular_pedido AFTER INSERT OR UPDATE OR DELETE ON detalle_pedido FOR EACH ROW EXECUTE FUNCTION trg_recalcular_totales_pedido();

-- 6.6 Totales de la orden de compra: neto = suma de líneas pedidas (redondeado a peso), IVA 19 %
CREATE OR REPLACE FUNCTION recalcular_una_orden_compra(p_id UUID) RETURNS VOID SECURITY DEFINER SET search_path = public AS $$
DECLARE v_neto NUMERIC; v_iva NUMERIC;
BEGIN
    PERFORM id FROM orden_compra WHERE id = p_id FOR UPDATE;
    SELECT ROUND(COALESCE(SUM(cantidad_solicitada * costo_unitario), 0), 0) INTO v_neto FROM orden_compra_detalle WHERE orden_compra_id = p_id;
    v_iva := ROUND(v_neto * 0.19, 0);
    UPDATE orden_compra SET subtotal_neto = v_neto, iva = v_iva, total = v_neto + v_iva WHERE id = p_id;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_recalcular_totales_oc() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN PERFORM recalcular_una_orden_compra(NEW.orden_compra_id); END IF;
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.orden_compra_id IS DISTINCT FROM NEW.orden_compra_id) THEN PERFORM recalcular_una_orden_compra(OLD.orden_compra_id); END IF;
    RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER recalcular_oc AFTER INSERT OR UPDATE OR DELETE ON orden_compra_detalle FOR EACH ROW EXECUTE FUNCTION trg_recalcular_totales_oc();

-- 6.7 Kardex inmutable (incluye TRUNCATE)
CREATE OR REPLACE FUNCTION trg_kardex_inmutable() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Kardex inmutable. Ingrese un movimiento inverso.'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER prevent_kardex_upd BEFORE UPDATE OR DELETE ON movimiento_inventario FOR EACH ROW EXECUTE FUNCTION trg_kardex_inmutable();
CREATE TRIGGER prevent_kardex_truncate BEFORE TRUNCATE ON movimiento_inventario FOR EACH STATEMENT EXECUTE FUNCTION trg_kardex_inmutable();

-- 6.8 Sanidad: lote y vencimiento según las banderas del producto
CREATE OR REPLACE FUNCTION trg_validar_sanidad() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req_venc BOOLEAN; v_req_lote BOOLEAN;
BEGIN
    SELECT requiere_vencimiento, requiere_lote INTO v_req_venc, v_req_lote FROM producto WHERE id = NEW.producto_id;
    IF v_req_venc AND NEW.fecha_vencimiento IS NULL THEN RAISE EXCEPTION 'Exige fecha de vencimiento.'; END IF;
    IF v_req_lote AND NEW.numero_lote IS NULL THEN RAISE EXCEPTION 'Exige número de lote.'; END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER val_sanidad BEFORE INSERT OR UPDATE ON lote FOR EACH ROW EXECUTE FUNCTION trg_validar_sanidad();

-- 6.9 PMP (se ejecuta ANTES del trigger de stock: los triggers del mismo momento corren por orden alfabético)
CREATE OR REPLACE FUNCTION trg_01_pmp() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_stock_previo INTEGER; v_costo_previo NUMERIC; v_costo_entrada NUMERIC; v_nuevo NUMERIC;
        v_hoy DATE := (NOW() AT TIME ZONE 'America/Santiago')::date;
BEGIN
    IF NEW.motivo_movimiento_id IS DISTINCT FROM (SELECT id FROM motivo_movimiento WHERE nombre = 'Recepción OC') THEN RETURN NEW; END IF;
    SELECT ocd.costo_unitario INTO v_costo_entrada
      FROM lote l JOIN orden_compra_detalle ocd ON ocd.id = l.orden_compra_detalle_id WHERE l.id = NEW.lote_id;
    IF v_costo_entrada IS NULL THEN RAISE EXCEPTION 'La recepción no está asociada a una línea de orden de compra con costo.'; END IF;
    SELECT costo INTO v_costo_previo FROM producto WHERE id = NEW.producto_id FOR UPDATE;
    SELECT COALESCE(SUM(cantidad_actual), 0) INTO v_stock_previo FROM lote
     WHERE producto_id = NEW.producto_id AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= v_hoy);
    IF v_stock_previo = 0 THEN v_nuevo := v_costo_entrada;
    ELSE v_nuevo := (v_stock_previo * v_costo_previo + NEW.cantidad * v_costo_entrada) / (v_stock_previo + NEW.cantidad); END IF;
    UPDATE producto SET costo = ROUND(v_nuevo, 2) WHERE id = NEW.producto_id;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_01_pmp_trigger BEFORE INSERT ON movimiento_inventario FOR EACH ROW EXECUTE FUNCTION trg_01_pmp();

-- 6.10 Stock por deltas. Todas las rutas bloquean primero el producto y luego el lote (sin interbloqueos).
CREATE OR REPLACE FUNCTION trg_02_actualizar_stock() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_signo SMALLINT; v_lote_prod UUID; v_lote_suc UUID; v_habilita_web BOOLEAN;
BEGIN
    PERFORM 1 FROM producto WHERE id = NEW.producto_id FOR UPDATE;
    SELECT tm.signo INTO v_signo FROM tipo_movimiento tm JOIN motivo_movimiento mm ON mm.tipo_movimiento_id = tm.id WHERE mm.id = NEW.motivo_movimiento_id;
    SELECT producto_id, sucursal_id INTO v_lote_prod, v_lote_suc FROM lote WHERE id = NEW.lote_id;
    IF v_lote_prod IS DISTINCT FROM NEW.producto_id OR v_lote_suc IS DISTINCT FROM NEW.sucursal_id THEN RAISE EXCEPTION 'Producto o sucursal no coinciden con el lote.'; END IF;
    UPDATE lote SET cantidad_actual = cantidad_actual + (NEW.cantidad * v_signo) WHERE id = NEW.lote_id;
    SELECT habilita_venta_web INTO v_habilita_web FROM sucursal WHERE id = NEW.sucursal_id;
    IF v_habilita_web THEN UPDATE producto SET stock_total_web = stock_total_web + (NEW.cantidad * v_signo) WHERE id = NEW.producto_id; END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_02_stock_trigger BEFORE INSERT ON movimiento_inventario FOR EACH ROW EXECUTE FUNCTION trg_02_actualizar_stock();

-- =====================================================================
-- 7. FUNCIONES DE NEGOCIO
-- =====================================================================

-- 7.1 Reserva FEFO: lee las líneas del propio pedido, es idempotente y bloquea en orden fijo
CREATE OR REPLACE FUNCTION fn_reservar_pedido(p_pedido_id UUID) RETURNS VOID SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_ped RECORD; v_usuario UUID; v_motivo UUID; v_linea RECORD; v_lote RECORD;
    v_restante INTEGER; v_toma INTEGER; v_hoy DATE := (NOW() AT TIME ZONE 'America/Santiago')::date;
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
                         AND cantidad_actual > 0 AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= v_hoy)
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

-- 7.2 Liberación de la reserva (pago rechazado, vencido o pedido cancelado). Idempotente.
CREATE OR REPLACE FUNCTION fn_liberar_reserva(p_pedido_id UUID) RETURNS VOID SECURITY DEFINER SET search_path = public AS $$
DECLARE v_usuario UUID; v_motivo UUID; v_mov RECORD;
BEGIN
    v_usuario := NULLIF(current_setting('app.usuario_id', true), '')::uuid;
    IF v_usuario IS NULL THEN RAISE EXCEPTION 'Falta app.usuario_id.'; END IF;
    SELECT id INTO v_motivo FROM motivo_movimiento WHERE nombre = 'Liberación de reserva';
    IF v_motivo IS NULL THEN RAISE EXCEPTION 'Falta el motivo "Liberación de reserva".'; END IF;
    PERFORM 1 FROM pedido WHERE id = p_pedido_id FOR UPDATE;
    FOR v_mov IN SELECT m.producto_id, m.sucursal_id, m.lote_id, SUM(m.cantidad * t.signo)::INTEGER AS neto
                   FROM movimiento_inventario m
                   JOIN motivo_movimiento mm ON mm.id = m.motivo_movimiento_id
                   JOIN tipo_movimiento t ON t.id = mm.tipo_movimiento_id
                  WHERE m.pedido_id = p_pedido_id
                  GROUP BY m.producto_id, m.sucursal_id, m.lote_id HAVING SUM(m.cantidad * t.signo) < 0
                  ORDER BY m.producto_id, m.lote_id LOOP
        INSERT INTO movimiento_inventario (producto_id, sucursal_id, cantidad, motivo_movimiento_id, lote_id, usuario_id, pedido_id)
        VALUES (v_mov.producto_id, v_mov.sucursal_id, -v_mov.neto, v_motivo, v_mov.lote_id, v_usuario, p_pedido_id);
    END LOOP;
END; $$ LANGUAGE plpgsql;

-- 7.3 Job: expira pedidos "Pago pendiente" antiguos y libera su reserva. Salta los pedidos que
--     otra transacción está procesando (por ejemplo, una aprobación de pago en curso).
CREATE OR REPLACE FUNCTION fn_liberar_reservas_vencidas(p_minutos INTEGER, p_usuario_id UUID) RETURNS INTEGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ped UUID; v_n INTEGER := 0; v_pend UUID; v_exp UUID;
BEGIN
    PERFORM set_config('app.usuario_id', p_usuario_id::text, true);
    SELECT id INTO v_pend FROM estado_pedido WHERE nombre = 'Pago pendiente';
    SELECT id INTO v_exp  FROM estado_pedido WHERE nombre = 'Expirado';
    IF v_pend IS NULL OR v_exp IS NULL THEN RAISE EXCEPTION 'Faltan los estados "Pago pendiente" / "Expirado".'; END IF;
    FOR v_ped IN SELECT id FROM pedido WHERE estado_pedido_id = v_pend AND fecha < NOW() - make_interval(mins => p_minutos)
                  ORDER BY id FOR UPDATE SKIP LOCKED LOOP
        PERFORM fn_liberar_reserva(v_ped);
        UPDATE pedido SET estado_pedido_id = v_exp WHERE id = v_ped;
        v_n := v_n + 1;
    END LOOP;
    RETURN v_n;
END; $$ LANGUAGE plpgsql;

-- 7.4 Job nocturno: baja de lotes vencidos (movimiento "Producto vencido"). Bloquea producto antes que lote.
CREATE OR REPLACE FUNCTION fn_baja_lotes_vencidos(p_usuario_id UUID) RETURNS INTEGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prod UUID; v_lote RECORD; v_motivo UUID; v_n INTEGER := 0;
        v_hoy DATE := (NOW() AT TIME ZONE 'America/Santiago')::date;
BEGIN
    SELECT id INTO v_motivo FROM motivo_movimiento WHERE nombre = 'Producto vencido';
    IF v_motivo IS NULL THEN RAISE EXCEPTION 'Falta el motivo "Producto vencido".'; END IF;
    FOR v_prod IN SELECT DISTINCT producto_id FROM lote WHERE cantidad_actual > 0 AND fecha_vencimiento < v_hoy ORDER BY 1 LOOP
        PERFORM 1 FROM producto WHERE id = v_prod FOR UPDATE;
        FOR v_lote IN SELECT id, producto_id, sucursal_id, cantidad_actual FROM lote
                       WHERE producto_id = v_prod AND cantidad_actual > 0 AND fecha_vencimiento < v_hoy ORDER BY id FOR UPDATE LOOP
            INSERT INTO movimiento_inventario (producto_id, sucursal_id, cantidad, motivo_movimiento_id, lote_id, usuario_id)
            VALUES (v_lote.producto_id, v_lote.sucursal_id, v_lote.cantidad_actual, v_motivo, v_lote.id, p_usuario_id);
            v_n := v_n + 1;
        END LOOP;
    END LOOP;
    RETURN v_n;
END; $$ LANGUAGE plpgsql;

-- 7.5 Cierre Z. El efectivo esperado suma SOLO pagos en efectivo aprobados de los pedidos del turno.
--     transaccion_pago.monto en efectivo debe ser el monto APLICADO a la venta (no el entregado).
CREATE OR REPLACE FUNCTION fn_cierre_esperado_efectivo(p_turno_id UUID) RETURNS NUMERIC SECURITY DEFINER SET search_path = public AS $$
DECLARE v_esperado NUMERIC;
BEGIN
    SELECT t.monto_apertura_efectivo + COALESCE((
             SELECT SUM(tp.monto) FROM pedido p
               JOIN transaccion_pago tp ON tp.pedido_id = p.id
               JOIN medio_pago mp ON mp.id = tp.medio_pago_id AND mp.nombre = 'Efectivo'
               JOIN estado_transaccion et ON et.id = tp.estado_transaccion_id AND et.nombre = 'Aprobado'
              WHERE p.turno_caja_id = t.id), 0)
      INTO v_esperado FROM turno_caja t WHERE t.id = p_turno_id;
    IF v_esperado IS NULL THEN RAISE EXCEPTION 'Turno inexistente.'; END IF;
    RETURN v_esperado;
END; $$ LANGUAGE plpgsql;

-- Cierra el turno: congela el esperado y el contado. Devuelve la diferencia (contado - esperado).
-- La regla "quien abre, cierra" la aplica el trigger cierre_turno con app.usuario_id.
CREATE OR REPLACE FUNCTION fn_cerrar_turno(p_turno_id UUID, p_monto_real NUMERIC) RETURNS NUMERIC SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cierre TIMESTAMPTZ; v_esperado NUMERIC;
BEGIN
    IF p_monto_real IS NULL OR p_monto_real < 0 THEN RAISE EXCEPTION 'El efectivo contado debe ser un monto mayor o igual a cero.'; END IF;
    SELECT fecha_cierre INTO v_cierre FROM turno_caja WHERE id = p_turno_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Turno inexistente.'; END IF;
    IF v_cierre IS NOT NULL THEN RAISE EXCEPTION 'El turno ya está cerrado.'; END IF;
    v_esperado := fn_cierre_esperado_efectivo(p_turno_id);
    UPDATE turno_caja SET fecha_cierre = NOW(), monto_cierre_esperado_efectivo = v_esperado, monto_cierre_real_efectivo = p_monto_real WHERE id = p_turno_id;
    RETURN p_monto_real - v_esperado;
END; $$ LANGUAGE plpgsql;

-- 7.6 Programación de jobs con pg_cron. Idempotente: se puede volver a ejecutar.
--     Liberación de reservas cada 5 min (pedidos con más de 20 min sin pago); baja de vencidos a las
--     05:00 UTC (01:00 o 02:00 en Chile, siempre después de medianoche local).
CREATE OR REPLACE FUNCTION fn_programar_jobs() RETURNS TEXT SET search_path = public AS $$
DECLARE v_sis UUID;
BEGIN
    IF to_regnamespace('cron') IS NULL THEN
        RETURN 'pg_cron no está habilitado. Habilítelo (Supabase: Database > Extensions) y ejecute SELECT fn_programar_jobs();';
    END IF;
    SELECT id INTO v_sis FROM usuario WHERE correo = 'sistema@farmaclick.cl';
    IF v_sis IS NULL THEN RAISE EXCEPTION 'Falta el usuario de sistema (sistema@farmaclick.cl).'; END IF;
    EXECUTE format('SELECT cron.schedule(%L, %L, %L)', 'farmaclick-liberar-reservas', '*/5 * * * *',
                   format('SELECT public.fn_liberar_reservas_vencidas(20, %L::uuid)', v_sis));
    EXECUTE format('SELECT cron.schedule(%L, %L, %L)', 'farmaclick-baja-vencidos', '0 5 * * *',
                   format('SELECT public.fn_baja_lotes_vencidos(%L::uuid)', v_sis));
    RETURN 'Jobs programados: farmaclick-liberar-reservas y farmaclick-baja-vencidos.';
END; $$ LANGUAGE plpgsql;

-- =====================================================================
-- 8. VISTAS
-- =====================================================================
-- Vitrina del e-commerce: solo productos activos con condición de venta permitida online.
-- stock_total_web es la suma de las sucursales hub (habilita_venta_web = TRUE).
CREATE VIEW vw_catalogo_web AS
SELECT p.id, p.sku, p.nombre, p.precio, p.stock_total_web,
       c.nombre AS categoria, cv.nombre AS condicion_venta
  FROM producto p
  JOIN categoria c ON c.id = p.categoria_id
  JOIN condicion_venta cv ON cv.id = p.condicion_venta_id
 WHERE p.activo AND cv.activa AND cv.permite_venta_online;

-- Disponibilidad por sucursal (retiro en tienda): excluye lotes vencidos.
CREATE VIEW vw_stock_disponible AS
SELECT l.producto_id, l.sucursal_id, SUM(l.cantidad_actual)::INTEGER AS disponible
  FROM lote l
 WHERE l.cantidad_actual > 0
   AND (l.fecha_vencimiento IS NULL OR l.fecha_vencimiento >= (NOW() AT TIME ZONE 'America/Santiago')::date)
 GROUP BY l.producto_id, l.sucursal_id;

-- =====================================================================
-- 9. DATOS SEMILLA
-- =====================================================================
INSERT INTO rol (nombre) VALUES ('Administrador'), ('Vendedor'), ('Bodega'), ('Cliente'), ('Sistema');

INSERT INTO modulo (nombre, clave) VALUES
    ('Dashboard', 'dashboard'), ('Venta presencial', 'pos'), ('Inventario', 'inventario'),
    ('Proveedores', 'proveedores'), ('Pedidos', 'pedidos'), ('Cuadratura', 'cuadratura'),
    ('Usuarios y permisos', 'usuarios');

INSERT INTO rol_permiso (rol_id, modulo_id, permitido)
SELECT r.id, m.id,
       CASE r.nombre
            WHEN 'Administrador' THEN TRUE
            WHEN 'Vendedor' THEN m.clave IN ('dashboard', 'pos', 'pedidos', 'cuadratura')
            WHEN 'Bodega'   THEN m.clave IN ('dashboard', 'inventario', 'proveedores')
            ELSE FALSE END
  FROM rol r CROSS JOIN modulo m;

INSERT INTO canal_venta (nombre, requiere_turno) VALUES ('Online', FALSE), ('Presencial', TRUE);

-- Clasificación de condiciones de venta: confirmar con el químico farmacéutico.
-- En el MVP el e-commerce solo vende "Venta directa" (la venta con receta se difiere a la Fase 2).
INSERT INTO condicion_venta (nombre, permite_venta_online) VALUES
    ('Venta directa', TRUE), ('Receta médica simple', FALSE),
    ('Receta médica retenida', FALSE), ('Receta cheque', FALSE);

INSERT INTO estado_pedido (nombre) VALUES
    ('Pago pendiente'), ('Pagado'), ('En preparación'), ('Listo para retiro'),
    ('En despacho'), ('Entregado'), ('Cancelado'), ('Expirado');
INSERT INTO estado_orden_compra (nombre) VALUES ('Pendiente'), ('Recibida parcial'), ('Recibida'), ('Cancelada');
INSERT INTO estado_transaccion (nombre) VALUES ('Pendiente'), ('Aprobado'), ('Rechazado'), ('Anulado'), ('Abortado');
INSERT INTO medio_pago (nombre) VALUES ('Efectivo'), ('Débito'), ('Crédito'), ('Transferencia'), ('Webpay Plus');
INSERT INTO pasarela (nombre) VALUES ('Transbank Webpay Plus');

INSERT INTO tipo_movimiento (nombre, signo) VALUES ('Entrada', 1), ('Salida', -1);
INSERT INTO motivo_movimiento (nombre, tipo_movimiento_id)
SELECT v.nombre, t.id FROM tipo_movimiento t
  JOIN (VALUES ('Recepción OC', 'Entrada'), ('Liberación de reserva', 'Entrada'), ('Ajuste positivo', 'Entrada'),
               ('Venta', 'Salida'), ('Producto vencido', 'Salida'), ('Merma', 'Salida'), ('Ajuste negativo', 'Salida')) v(nombre, tipo)
    ON v.tipo = t.nombre;

INSERT INTO region (nombre) VALUES
    ('Arica y Parinacota'), ('Tarapacá'), ('Antofagasta'), ('Atacama'), ('Coquimbo'), ('Valparaíso'),
    ('Metropolitana de Santiago'), ('Libertador General Bernardo O''Higgins'), ('Maule'), ('Ñuble'),
    ('Biobío'), ('La Araucanía'), ('Los Ríos'), ('Los Lagos'),
    ('Aysén del General Carlos Ibáñez del Campo'), ('Magallanes y de la Antártica Chilena');

-- Comunas de la Región Metropolitana (52). Las de las demás regiones deben cargarse desde la fuente oficial (SUBDERE/INE).
INSERT INTO comuna (nombre, region_id)
SELECT c, r.id FROM region r,
       unnest(ARRAY['Alhué','Buin','Calera de Tango','Cerrillos','Cerro Navia','Colina','Conchalí','Curacaví','El Bosque',
                    'El Monte','Estación Central','Huechuraba','Independencia','Isla de Maipo','La Cisterna','La Florida',
                    'La Granja','La Pintana','La Reina','Lampa','Las Condes','Lo Barnechea','Lo Espejo','Lo Prado','Macul',
                    'Maipú','María Pinto','Melipilla','Ñuñoa','Padre Hurtado','Paine','Pedro Aguirre Cerda','Peñaflor',
                    'Peñalolén','Pirque','Providencia','Pudahuel','Puente Alto','Quilicura','Quinta Normal','Recoleta','Renca',
                    'San Bernardo','San Joaquín','San José de Maipo','San Miguel','San Pedro','San Ramón','Santiago',
                    'Talagante','Tiltil','Vitacura']) AS c
 WHERE r.nombre = 'Metropolitana de Santiago';

-- Usuario técnico: autor de los movimientos automáticos (jobs y ventas web). No tiene permisos de módulos.
INSERT INTO usuario (nombre, correo, rol_id)
SELECT 'Sistema FarmaClick', 'sistema@farmaclick.cl', id FROM rol WHERE nombre = 'Sistema';

-- =====================================================================
-- 10. SEGURIDAD (se ejecuta AL FINAL, cuando ya existen todos los objetos)
-- =====================================================================
-- 10.1 Cerrar la API pública de Supabase y hacer que los objetos futuros nazcan cerrados
DO $$
DECLARE r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
            EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
            EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
        END IF;
    END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- 10.2 RLS activado en todas las tablas como red de seguridad: sin políticas para anon/authenticated,
--      aunque alguien les conceda permisos por error no verán filas. El backend tiene su política;
--      los privilegios (10.3) siguen siendo los que limitan lo que puede hacer.
DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY p_backend_all ON public.%I FOR ALL TO app_backend USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;

-- 10.3 Permisos mínimos del backend. Un REVOKE de columna NO quita un GRANT de tabla, por eso se
--      parte de cero y se concede columna por columna donde hay campos protegidos.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_backend;

GRANT SELECT ON canal_venta, condicion_venta, estado_orden_compra, estado_pedido, estado_transaccion,
                medio_pago, modulo, pasarela, region, comuna, rol, tipo_movimiento, motivo_movimiento TO app_backend;

GRANT SELECT, INSERT, UPDATE ON categoria, proveedor, regla_descuento, sucursal, caja, cliente TO app_backend;
GRANT SELECT, INSERT, UPDATE, DELETE ON rol_permiso, producto_proveedor, stock_minimo_sucursal TO app_backend;

GRANT SELECT ON producto TO app_backend;
GRANT INSERT (sku, nombre, costo, margen_utilidad, activo, requiere_vencimiento, requiere_lote, categoria_id, condicion_venta_id) ON producto TO app_backend;
GRANT UPDATE (sku, nombre, margen_utilidad, activo, requiere_vencimiento, requiere_lote, categoria_id, condicion_venta_id) ON producto TO app_backend;

GRANT SELECT ON usuario TO app_backend;
GRANT INSERT (id, nombre, correo, rol_id, sucursal_id, activo) ON usuario TO app_backend;
GRANT UPDATE (nombre, correo, rol_id, sucursal_id, activo) ON usuario TO app_backend;

GRANT SELECT ON lote TO app_backend;
GRANT INSERT (numero_lote, fecha_vencimiento, fecha_ingreso, cantidad_recibida, producto_id, sucursal_id, orden_compra_detalle_id) ON lote TO app_backend;
GRANT UPDATE (numero_lote, fecha_vencimiento) ON lote TO app_backend;

GRANT SELECT, INSERT ON movimiento_inventario TO app_backend;   -- sin UPDATE/DELETE: kardex inmutable

GRANT SELECT ON pedido TO app_backend;
GRANT INSERT (canal_venta_id, estado_pedido_id, nombre_cliente, direccion_pedido, telefono, comuna_id, cliente_id, vendedor_id, sucursal_id, turno_caja_id) ON pedido TO app_backend;
GRANT UPDATE (estado_pedido_id, nombre_cliente, direccion_pedido, telefono, comuna_id) ON pedido TO app_backend;

GRANT SELECT, DELETE ON detalle_pedido TO app_backend;
GRANT INSERT (pedido_id, producto_id, cantidad, regla_descuento_id) ON detalle_pedido TO app_backend;
GRANT UPDATE (cantidad, regla_descuento_id) ON detalle_pedido TO app_backend;

GRANT SELECT ON transaccion_pago TO app_backend;
GRANT INSERT (pedido_id, pasarela_id, medio_pago_id, buy_order, token_inicio, codigo_autorizacion, estado_transaccion_id, monto) ON transaccion_pago TO app_backend;
GRANT UPDATE (estado_transaccion_id, codigo_autorizacion) ON transaccion_pago TO app_backend;

GRANT SELECT ON turno_caja TO app_backend;                       -- el cierre se hace solo con fn_cerrar_turno
GRANT INSERT (usuario_id, caja_id, monto_apertura_efectivo) ON turno_caja TO app_backend;

GRANT SELECT ON orden_compra TO app_backend;                     -- los totales los calcula el trigger
GRANT INSERT (fecha_esperada, estado_orden_compra_id, proveedor_id, usuario_id, sucursal_id) ON orden_compra TO app_backend;
GRANT UPDATE (fecha_esperada, estado_orden_compra_id) ON orden_compra TO app_backend;
GRANT SELECT, DELETE ON orden_compra_detalle TO app_backend;
GRANT INSERT (cantidad_solicitada, costo_unitario, orden_compra_id, producto_id) ON orden_compra_detalle TO app_backend;
GRANT UPDATE (cantidad_solicitada, cantidad_recibida, costo_unitario) ON orden_compra_detalle TO app_backend;

GRANT SELECT ON vw_catalogo_web, vw_stock_disponible TO app_backend;

-- 10.4 Funciones: el backend ejecuta solo las de negocio. Los jobs los corre el propietario (pg_cron).
GRANT EXECUTE ON FUNCTION fn_reservar_pedido(UUID)                TO app_backend;
GRANT EXECUTE ON FUNCTION fn_liberar_reserva(UUID)                TO app_backend;
GRANT EXECUTE ON FUNCTION fn_cierre_esperado_efectivo(UUID)       TO app_backend;
GRANT EXECUTE ON FUNCTION fn_cerrar_turno(UUID, NUMERIC)          TO app_backend;

-- =====================================================================
-- 11. DOCUMENTACIÓN EN EL PROPIO ESQUEMA
-- =====================================================================
COMMENT ON COLUMN lote.cantidad_actual IS 'Unidades DISPONIBLES PARA VENDER (no necesariamente en la estantería: incluye reservas). Solo la mueve el trigger del kardex.';
COMMENT ON COLUMN producto.stock_total_web IS 'Suma de las sucursales con habilita_venta_web. Mantenido por trigger; el backend no puede escribirlo.';
COMMENT ON COLUMN producto.costo IS 'Costo NETO. Se recalcula por Precio Medio Ponderado (PMP) en cada Recepción OC.';
COMMENT ON COLUMN producto.precio IS 'Precio de venta BRUTO (con IVA), generado: ROUND(costo * (1 + margen_utilidad) * 1.19). margen_utilidad es un recargo (markup) sobre el costo.';
COMMENT ON COLUMN detalle_pedido.precio_unitario IS 'Snapshot del precio al crear la línea; lo fija el trigger, no el cliente.';
COMMENT ON COLUMN detalle_pedido.descuento_monto IS 'Calculado por el trigger a partir de regla_descuento; nunca lo informa el backend.';
COMMENT ON COLUMN pedido.total IS 'Calculado por trigger a partir de las líneas; el backend no puede escribirlo.';
COMMENT ON COLUMN orden_compra.total IS 'Calculado por trigger a partir de las líneas (cantidad_solicitada x costo_unitario, IVA 19 %).';
COMMENT ON COLUMN transaccion_pago.monto IS 'Monto APLICADO a la venta. En efectivo no incluye el vuelto: el Cierre Z suma este campo.';
COMMENT ON COLUMN turno_caja.monto_cierre_esperado_efectivo IS 'Se congela al cerrar el turno con fn_cerrar_turno: apertura + efectivo aprobado de los pedidos del turno.';
COMMENT ON TABLE  movimiento_inventario IS 'Kardex inmutable (sin UPDATE, DELETE ni TRUNCATE). Correcciones = movimiento inverso. cantidad siempre > 0; el signo sale de tipo_movimiento.signo.';
COMMENT ON TABLE  condicion_venta IS 'Clasificación de venta del producto. permite_venta_online controla qué puede venderse por canales sin caja física.';

-- Programar los jobs si pg_cron está disponible; si no, queda el aviso.
DO $$
BEGIN
    RAISE NOTICE '%', fn_programar_jobs();
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudieron programar los jobs (%). Ejecute más tarde: SELECT fn_programar_jobs();', SQLERRM;
END $$;

COMMIT;

-- =====================================================================
-- 001 — Órdenes de compra: estado "Borrador" y número correlativo
-- Ejecutar UNA vez sobre la base existente (editor SQL de Supabase). Es seguro repetirla:
-- no vuelve a numerar si la columna ya existe.
--   * estado_orden_compra 'Borrador': la orden se guarda sin enviarla; solo en ese estado se edita.
--   * orden_compra.numero: correlativo (1, 2, 3...) que se muestra como OC-000123.
--     Las órdenes ya existentes se numeran por fecha de creación.
--   * Permiso para cambiar proveedor y sucursal mientras la orden es borrador.
-- Contrato de nombres: 'Borrador' y 'Pendiente' (= emitida) no deben renombrarse desde la interfaz.
-- =====================================================================
BEGIN;

INSERT INTO estado_orden_compra (nombre) VALUES ('Borrador') ON CONFLICT (nombre) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'orden_compra' AND column_name = 'numero') THEN
        ALTER TABLE orden_compra ADD COLUMN numero BIGINT GENERATED BY DEFAULT AS IDENTITY;
        WITH n AS (SELECT id, ROW_NUMBER() OVER (ORDER BY fecha, id) AS rn FROM orden_compra)
        UPDATE orden_compra o SET numero = n.rn FROM n WHERE o.id = n.id;
        PERFORM setval(pg_get_serial_sequence('orden_compra', 'numero'),
                       GREATEST((SELECT COALESCE(MAX(numero), 0) FROM orden_compra), 1),
                       EXISTS (SELECT 1 FROM orden_compra));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_oc_numero ON orden_compra(numero);
COMMENT ON COLUMN orden_compra.numero IS 'Número correlativo de la orden (OC-000123). Lo asigna la base al crearla; puede haber saltos si una transacción se revierte.';

GRANT UPDATE (proveedor_id, sucursal_id) ON orden_compra TO app_backend;   -- solo se usa mientras es Borrador

COMMIT;

-- =====================================================================
-- 002 — Kardex: observación en los movimientos
-- Ejecutar UNA vez sobre la base existente (editor SQL de Supabase). Es seguro repetirla.
--   * movimiento_inventario.observacion: motivo escrito de ajustes, mermas y bajas manuales.
--     Es opcional (las ventas y recepciones no la usan). El kardex sigue siendo inmutable: la columna se
--     informa al insertar el movimiento y no se puede modificar después.
-- No requiere GRANT nuevo: app_backend ya tiene INSERT sobre toda la tabla.
-- =====================================================================
BEGIN;

ALTER TABLE movimiento_inventario ADD COLUMN IF NOT EXISTS observacion VARCHAR(300);
COMMENT ON COLUMN movimiento_inventario.observacion IS 'Motivo escrito (ajustes, mermas, bajas manuales). Opcional; se informa al insertar y no se modifica.';

COMMIT;

-- =====================================================================
-- 003 — Pedidos: número correlativo
-- Ejecutar UNA vez sobre la base existente (editor SQL de Supabase). Es seguro repetirla:
-- no vuelve a numerar si la columna ya existe.
--   * pedido.numero: correlativo (1, 2, 3...) que se muestra como PED-000123. Lo asigna la base al crear
--     el pedido; los pedidos existentes se numeran por fecha de creación.
-- No requiere GRANT nuevo: app_backend ya tiene SELECT sobre toda la tabla y el INSERT usa lista de columnas
-- (numero toma su valor por defecto).
-- =====================================================================
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'pedido' AND column_name = 'numero') THEN
        ALTER TABLE pedido ADD COLUMN numero BIGINT GENERATED BY DEFAULT AS IDENTITY;
        WITH n AS (SELECT id, ROW_NUMBER() OVER (ORDER BY fecha, id) AS rn FROM pedido)
        UPDATE pedido p SET numero = n.rn FROM n WHERE p.id = n.id;
        PERFORM setval(pg_get_serial_sequence('pedido', 'numero'),
                       GREATEST((SELECT COALESCE(MAX(numero), 0) FROM pedido), 1),
                       EXISTS (SELECT 1 FROM pedido));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_numero ON pedido(numero);
COMMENT ON COLUMN pedido.numero IS 'Número correlativo del pedido (PED-000123), común a todos los canales. Lo asigna la base; puede haber saltos si una transacción se revierte.';

COMMIT;

-- =====================================================================
-- 004 — Devoluciones de clientes
-- Ejecutar UNA vez sobre la base existente (editor SQL de Supabase). Es seguro repetirla.
--   * Tablas devolucion, devolucion_detalle y devolucion_pago (inmutables, como el kardex).
--   * Triggers de integridad: no se devuelve más de lo vendido y los totales de líneas y reembolsos
--     deben calzar con el total de la devolución (se verifica al confirmar la transacción).
--   * Motivo de kardex "Devolución de cliente" (entrada) para reingresar stock.
--   * Módulo de permisos "devoluciones" (Administrador y Vendedor; se ajusta en Roles y permisos).
--   * fn_cierre_esperado_efectivo ahora descuenta el efectivo devuelto en el turno, de modo que el
--     cierre de caja cuadre.
-- Contrato de nombres: 'Devolución de cliente' y 'devoluciones' no deben renombrarse desde la interfaz.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS devolucion (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    numero BIGINT GENERATED BY DEFAULT AS IDENTITY,
    fecha TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    pedido_id UUID NOT NULL REFERENCES pedido(id) ON DELETE RESTRICT,
    usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    turno_caja_id UUID REFERENCES turno_caja(id) ON DELETE RESTRICT,   -- turno desde cuya caja se hizo (si lo hubo)
    motivo VARCHAR(300) NOT NULL CHECK (LENGTH(BTRIM(motivo)) >= 3),
    total_reembolso NUMERIC(12,2) NOT NULL CHECK (total_reembolso > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_devolucion_numero ON devolucion(numero);
CREATE INDEX IF NOT EXISTS idx_devolucion_pedido ON devolucion(pedido_id);
CREATE INDEX IF NOT EXISTS idx_devolucion_turno  ON devolucion(turno_caja_id);
CREATE INDEX IF NOT EXISTS idx_devolucion_fecha  ON devolucion(fecha);

CREATE TABLE IF NOT EXISTS devolucion_detalle (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    devolucion_id UUID NOT NULL REFERENCES devolucion(id) ON DELETE RESTRICT,
    detalle_pedido_id UUID NOT NULL REFERENCES detalle_pedido(id) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    monto_reembolso NUMERIC(12,2) NOT NULL CHECK (monto_reembolso >= 0),   -- precio con IVA, descuento prorrateado
    reingresa_stock BOOLEAN DEFAULT FALSE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devdet_dev  ON devolucion_detalle(devolucion_id);
CREATE INDEX IF NOT EXISTS idx_devdet_det  ON devolucion_detalle(detalle_pedido_id);

CREATE TABLE IF NOT EXISTS devolucion_pago (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    devolucion_id UUID NOT NULL REFERENCES devolucion(id) ON DELETE RESTRICT,
    medio_pago_id UUID NOT NULL REFERENCES medio_pago(id) ON DELETE RESTRICT,
    monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    referencia VARCHAR(50)
);
CREATE INDEX IF NOT EXISTS idx_devpago_dev ON devolucion_pago(devolucion_id);

COMMENT ON TABLE  devolucion IS 'Devolución de productos de un pedido entregado. Inmutable: una corrección es otra operación, no un UPDATE.';
COMMENT ON COLUMN devolucion.turno_caja_id IS 'Turno de caja desde el que se hizo la devolución; el efectivo reembolsado se descuenta en el cierre de ese turno.';
COMMENT ON COLUMN devolucion_detalle.monto_reembolso IS 'Valor con IVA de las unidades devueltas: subtotal de la línea (con descuento) prorrateado por cantidad, con redondeo acumulado.';
COMMENT ON COLUMN devolucion_detalle.reingresa_stock IS 'TRUE si las unidades volvieron al inventario (movimiento "Devolución de cliente" en el lote de origen).';
COMMENT ON TABLE  devolucion_pago IS 'Cómo se devolvió el dinero (medio y monto). La suma debe igualar devolucion.total_reembolso.';

-- Integridad ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_validar_devolucion_detalle() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cantidad INTEGER; v_prev INTEGER;
BEGIN
    SELECT cantidad INTO v_cantidad FROM detalle_pedido WHERE id = NEW.detalle_pedido_id FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM devolucion d JOIN detalle_pedido dp ON dp.pedido_id = d.pedido_id
                    WHERE d.id = NEW.devolucion_id AND dp.id = NEW.detalle_pedido_id) THEN
        RAISE EXCEPTION 'La línea no pertenece al pedido de la devolución.';
    END IF;
    SELECT COALESCE(SUM(cantidad), 0) INTO v_prev FROM devolucion_detalle WHERE detalle_pedido_id = NEW.detalle_pedido_id;
    IF v_prev + NEW.cantidad > v_cantidad THEN
        RAISE EXCEPTION 'La cantidad devuelta (%) supera lo vendido (%).', v_prev + NEW.cantidad, v_cantidad;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS val_devolucion_detalle ON devolucion_detalle;
CREATE TRIGGER val_devolucion_detalle BEFORE INSERT ON devolucion_detalle FOR EACH ROW EXECUTE FUNCTION trg_validar_devolucion_detalle();

-- Al confirmar la transacción: las líneas y los reembolsos deben sumar exactamente el total de la devolución.
CREATE OR REPLACE FUNCTION trg_validar_totales_devolucion() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lineas NUMERIC; v_pagos NUMERIC;
BEGIN
    SELECT COALESCE(SUM(monto_reembolso), 0) INTO v_lineas FROM devolucion_detalle WHERE devolucion_id = NEW.id;
    SELECT COALESCE(SUM(monto), 0) INTO v_pagos FROM devolucion_pago WHERE devolucion_id = NEW.id;
    IF v_lineas <> NEW.total_reembolso THEN
        RAISE EXCEPTION 'Las líneas de la devolución suman % y el total es %.', v_lineas, NEW.total_reembolso;
    END IF;
    IF v_pagos <> NEW.total_reembolso THEN
        RAISE EXCEPTION 'Los reembolsos suman % y el total de la devolución es %.', v_pagos, NEW.total_reembolso;
    END IF;
    RETURN NULL;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS val_totales_devolucion ON devolucion;
CREATE CONSTRAINT TRIGGER val_totales_devolucion AFTER INSERT ON devolucion
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_validar_totales_devolucion();

CREATE OR REPLACE FUNCTION trg_devolucion_inmutable() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Las devoluciones son inmutables.'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS inmutable_devolucion ON devolucion;
CREATE TRIGGER inmutable_devolucion BEFORE UPDATE OR DELETE ON devolucion FOR EACH ROW EXECUTE FUNCTION trg_devolucion_inmutable();
DROP TRIGGER IF EXISTS inmutable_devolucion_detalle ON devolucion_detalle;
CREATE TRIGGER inmutable_devolucion_detalle BEFORE UPDATE OR DELETE ON devolucion_detalle FOR EACH ROW EXECUTE FUNCTION trg_devolucion_inmutable();
DROP TRIGGER IF EXISTS inmutable_devolucion_pago ON devolucion_pago;
CREATE TRIGGER inmutable_devolucion_pago BEFORE UPDATE OR DELETE ON devolucion_pago FOR EACH ROW EXECUTE FUNCTION trg_devolucion_inmutable();

-- Seguridad (mismo criterio que el resto del esquema) --------------------------
DO $$
DECLARE r TEXT; t TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON devolucion, devolucion_detalle, devolucion_pago FROM %I', r);
        END IF;
    END LOOP;
    FOREACH t IN ARRAY ARRAY['devolucion', 'devolucion_detalle', 'devolucion_pago'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'p_backend_all') THEN
            EXECUTE format('CREATE POLICY p_backend_all ON public.%I FOR ALL TO app_backend USING (true) WITH CHECK (true)', t);
        END IF;
    END LOOP;
END $$;
GRANT SELECT, INSERT ON devolucion, devolucion_detalle, devolucion_pago TO app_backend;   -- sin UPDATE/DELETE

-- Kardex y permisos -----------------------------------------------------------
INSERT INTO motivo_movimiento (nombre, tipo_movimiento_id)
SELECT 'Devolución de cliente', id FROM tipo_movimiento WHERE nombre = 'Entrada'
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO modulo (nombre, clave) VALUES ('Devoluciones', 'devoluciones') ON CONFLICT (clave) DO NOTHING;
INSERT INTO rol_permiso (rol_id, modulo_id, permitido)
SELECT r.id, m.id, r.nombre IN ('Administrador', 'Vendedor')
  FROM rol r CROSS JOIN modulo m WHERE m.clave = 'devoluciones'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- Cierre de caja: el efectivo esperado descuenta lo devuelto en efectivo durante el turno.
CREATE OR REPLACE FUNCTION fn_cierre_esperado_efectivo(p_turno_id UUID) RETURNS NUMERIC SECURITY DEFINER SET search_path = public AS $$
DECLARE v_esperado NUMERIC;
BEGIN
    SELECT t.monto_apertura_efectivo
           + COALESCE((
             SELECT SUM(tp.monto) FROM pedido p
               JOIN transaccion_pago tp ON tp.pedido_id = p.id
               JOIN medio_pago mp ON mp.id = tp.medio_pago_id AND mp.nombre = 'Efectivo'
               JOIN estado_transaccion et ON et.id = tp.estado_transaccion_id AND et.nombre = 'Aprobado'
              WHERE p.turno_caja_id = t.id), 0)
           - COALESCE((
             SELECT SUM(dp.monto) FROM devolucion d
               JOIN devolucion_pago dp ON dp.devolucion_id = d.id
               JOIN medio_pago mp ON mp.id = dp.medio_pago_id AND mp.nombre = 'Efectivo'
              WHERE d.turno_caja_id = t.id), 0)
      INTO v_esperado FROM turno_caja t WHERE t.id = p_turno_id;
    IF v_esperado IS NULL THEN RAISE EXCEPTION 'Turno inexistente.'; END IF;
    RETURN v_esperado;
END; $$ LANGUAGE plpgsql;

COMMIT;

-- =====================================================================
-- 005 — Cuadratura: revisión de turnos de caja cerrados
-- Ejecutar UNA vez sobre la base existente (editor SQL de Supabase). Es seguro repetirla.
--   * turno_revision: una revisión por turno cerrado, hecha por alguien distinto de quien lo abrió.
--     "conforme" = la cuadratura está bien; si no, la observación explica la diferencia (obligatoria).
--   * Inmutable: la revisión no se modifica ni se borra (como el kardex y las devoluciones).
-- Los datos del turno (esperado, contado) ya los congela fn_cerrar_turno; esta tabla solo agrega el visto bueno.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS turno_revision (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    turno_caja_id UUID NOT NULL UNIQUE REFERENCES turno_caja(id) ON DELETE RESTRICT,
    usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    fecha TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    conforme BOOLEAN NOT NULL,
    observacion VARCHAR(500),
    CHECK (conforme OR LENGTH(BTRIM(COALESCE(observacion, ''))) >= 3)
);
CREATE INDEX IF NOT EXISTS idx_turno_revision_usuario ON turno_revision(usuario_id);

COMMENT ON TABLE  turno_revision IS 'Visto bueno de la cuadratura de un turno cerrado. Una por turno, inmutable, y el revisor no puede ser quien abrió el turno.';
COMMENT ON COLUMN turno_revision.conforme IS 'TRUE = revisado conforme; FALSE = revisado con observaciones (la observación es obligatoria).';

CREATE OR REPLACE FUNCTION trg_validar_turno_revision() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_usuario UUID; v_cierre TIMESTAMPTZ;
BEGIN
    SELECT usuario_id, fecha_cierre INTO v_usuario, v_cierre FROM turno_caja WHERE id = NEW.turno_caja_id;
    IF v_cierre IS NULL THEN RAISE EXCEPTION 'Solo se revisa un turno cerrado.'; END IF;
    IF v_usuario = NEW.usuario_id THEN RAISE EXCEPTION 'Nadie puede revisar su propio turno.'; END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS val_turno_revision ON turno_revision;
CREATE TRIGGER val_turno_revision BEFORE INSERT ON turno_revision FOR EACH ROW EXECUTE FUNCTION trg_validar_turno_revision();

CREATE OR REPLACE FUNCTION trg_turno_revision_inmutable() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Las revisiones de turno son inmutables.'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS inmutable_turno_revision ON turno_revision;
CREATE TRIGGER inmutable_turno_revision BEFORE UPDATE OR DELETE ON turno_revision FOR EACH ROW EXECUTE FUNCTION trg_turno_revision_inmutable();

-- Seguridad (mismo criterio que el resto del esquema)
DO $$
DECLARE r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON turno_revision FROM %I', r);
        END IF;
    END LOOP;
    ALTER TABLE public.turno_revision ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'turno_revision' AND policyname = 'p_backend_all') THEN
        CREATE POLICY p_backend_all ON public.turno_revision FOR ALL TO app_backend USING (true) WITH CHECK (true);
    END IF;
END $$;
GRANT SELECT, INSERT ON turno_revision TO app_backend;   -- sin UPDATE/DELETE

COMMIT;

-- =====================================================================
-- 006 — Redondeo del efectivo (Ley 20.956)
-- Los pagos en efectivo se redondean al múltiplo de $10 más cercano. El total del pedido y el valor de lo devuelto no
-- cambian: la diferencia se guarda aparte, en `redondeo` (negativo si se cobra o devuelve de menos, positivo si de más).
--   * pedido.redondeo:     suma de los pagos aprobados = total + redondeo
--   * devolucion.redondeo: suma de los reembolsos      = total_reembolso + redondeo
-- transaccion_pago.monto en efectivo sigue siendo el monto realmente recibido, así el cierre de caja no cambia.
-- Idempotente. Ejecutar en el editor SQL de Supabase (en local, docker compose la aplica al crear la base; ver db/generar-instalacion.sh).
-- =====================================================================
BEGIN;

ALTER TABLE pedido ADD COLUMN IF NOT EXISTS redondeo NUMERIC(12,2) DEFAULT 0 NOT NULL;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_redondeo_rango') THEN
        ALTER TABLE pedido ADD CONSTRAINT pedido_redondeo_rango CHECK (redondeo BETWEEN -5 AND 5);
    END IF;
END $$;
COMMENT ON COLUMN pedido.redondeo IS 'Ajuste por redondeo del efectivo (Ley 20.956). Pagos aprobados = total + redondeo.';
GRANT UPDATE (redondeo) ON pedido TO app_backend;

ALTER TABLE devolucion ADD COLUMN IF NOT EXISTS redondeo NUMERIC(12,2) DEFAULT 0 NOT NULL;
COMMENT ON COLUMN devolucion.redondeo IS 'Ajuste por redondeo del efectivo devuelto (Ley 20.956). Reembolsos = total_reembolso + redondeo.';

-- Los reembolsos deben sumar el total devuelto más el redondeo del efectivo.
CREATE OR REPLACE FUNCTION trg_validar_totales_devolucion() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lineas NUMERIC; v_pagos NUMERIC;
BEGIN
    SELECT COALESCE(SUM(monto_reembolso), 0) INTO v_lineas FROM devolucion_detalle WHERE devolucion_id = NEW.id;
    SELECT COALESCE(SUM(monto), 0) INTO v_pagos FROM devolucion_pago WHERE devolucion_id = NEW.id;
    IF v_lineas <> NEW.total_reembolso THEN
        RAISE EXCEPTION 'Las líneas de la devolución suman % y el total es %.', v_lineas, NEW.total_reembolso;
    END IF;
    IF v_pagos <> NEW.total_reembolso + NEW.redondeo THEN
        RAISE EXCEPTION 'Los reembolsos suman % y la devolución es de % con un redondeo de %.', v_pagos, NEW.total_reembolso, NEW.redondeo;
    END IF;
    RETURN NULL;
END; $$ LANGUAGE plpgsql;

COMMIT;

-- =====================================================================
-- 007 — Jefe de local y permiso de supervisión de caja
-- Hasta ahora supervisar la caja (ver todos los turnos, revisarlos, ver el efectivo esperado de un turno abierto)
-- lo podía quien administraba usuarios. Se separa en un permiso propio, `supervision_caja`, que tienen el
-- Administrador y el nuevo rol "Jefe de local", sin darle a este la gestión de usuarios.
-- El rol Jefe de local trae permisos de operación; se pueden ajustar en "Roles y permisos".
-- Idempotente. Ejecutar en el editor SQL de Supabase (en local, docker compose la aplica al crear la base; ver db/generar-instalacion.sh).
-- =====================================================================
BEGIN;

INSERT INTO rol (nombre) VALUES ('Jefe de local') ON CONFLICT (nombre) DO NOTHING;
INSERT INTO modulo (nombre, clave) VALUES ('Supervisión de caja', 'supervision_caja') ON CONFLICT (clave) DO NOTHING;

-- Todos los roles reciben la fila del módulo nuevo: lo tienen el Administrador y el Jefe de local.
INSERT INTO rol_permiso (rol_id, modulo_id, permitido)
SELECT r.id, m.id, r.nombre IN ('Administrador', 'Jefe de local')
  FROM rol r CROSS JOIN modulo m WHERE m.clave = 'supervision_caja'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- Permisos de operación del Jefe de local en los demás módulos (sin usuarios y permisos).
INSERT INTO rol_permiso (rol_id, modulo_id, permitido)
SELECT r.id, m.id, m.clave IN ('dashboard', 'pos', 'inventario', 'proveedores', 'pedidos', 'cuadratura', 'devoluciones', 'supervision_caja')
  FROM rol r CROSS JOIN modulo m WHERE r.nombre = 'Jefe de local'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

COMMIT;

-- =====================================================================
-- 008 — Correcciones del esquema base (revisión v2 del script)
-- Para una base creada con la versión anterior de farmaclick_postgresql_completo.sql. Es seguro repetirla.
-- Si la base se creó con la versión actual del script, esta migración no cambia nada.
--   * transaccion_pago.buy_order: orden de compra enviada a Webpay Plus (máx. 26 caracteres, única). El uuid del
--     pedido (36) no cabe, así que cada intento de pago por pasarela lleva su propia orden. Obligatoria si hay pasarela.
--   * estado_transaccion 'Abortado': el cliente abandonó el formulario de Webpay o el plazo expiró.
--   * proveedor.activo y categoria.activa: baja lógica sin perder historial.
--   * Índice único parcial: un solo proveedor principal por producto.
-- No afecta a la caja ni a la venta presencial: sus pagos no usan pasarela (pasarela_id nulo).
-- =====================================================================
BEGIN;

ALTER TABLE transaccion_pago ADD COLUMN IF NOT EXISTS buy_order VARCHAR(26);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'transaccion_pago'::regclass AND conname = 'transaccion_pago_buy_order_key') THEN
        ALTER TABLE transaccion_pago ADD CONSTRAINT transaccion_pago_buy_order_key UNIQUE (buy_order);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'transaccion_pago'::regclass AND conname = 'transaccion_pago_check') THEN
        ALTER TABLE transaccion_pago ADD CONSTRAINT transaccion_pago_check CHECK (pasarela_id IS NULL OR buy_order IS NOT NULL);
    END IF;
END $$;
COMMENT ON COLUMN transaccion_pago.buy_order IS 'Orden de compra enviada a Webpay Plus (máx. 26 caracteres). Obligatoria cuando hay pasarela.';

INSERT INTO estado_transaccion (nombre) VALUES ('Abortado') ON CONFLICT (nombre) DO NOTHING;

ALTER TABLE proveedor ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE NOT NULL;
ALTER TABLE categoria ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT TRUE NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_prod_prov_principal ON producto_proveedor(producto_id) WHERE es_principal;

GRANT INSERT (buy_order) ON transaccion_pago TO app_backend;

COMMIT;

-- =====================================================================
-- 009 — Cuadratura: corrección de montos del turno, observaciones y autorrevisión del Administrador
-- Ejecutar UNA vez sobre la base existente (editor SQL de Supabase). Es seguro repetirla.
--   * turno_correccion: corrige un error de digitación en el efectivo de apertura o en el contado del cierre.
--     Solo la hace un usuario con rol Administrador, con motivo obligatorio y mientras el turno no esté revisado.
--     Guarda el valor anterior y el nuevo (y el esperado antes y después): nada se pierde. Inmutable.
--   * fn_corregir_turno: única vía para corregir. Valida las reglas, actualiza el turno, recalcula el efectivo
--     esperado si el turno está cerrado y registra la corrección, todo en la misma operación.
--   * turno_observacion: notas sobre un turno (quién, cuándo, qué). Se agregan, nunca se editan ni se borran.
--   * Revisión: el Administrador puede revisar su propio turno; el resto (Jefe de local) sigue sin poder hacerlo.
-- Contrato de nombres: el rol 'Administrador' no debe renombrarse desde la interfaz.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- Correcciones
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS turno_correccion (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    turno_caja_id UUID NOT NULL REFERENCES turno_caja(id) ON DELETE RESTRICT,
    usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    fecha TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    campo VARCHAR(10) NOT NULL CHECK (campo IN ('apertura', 'cierre')),
    valor_anterior NUMERIC(12,2) NOT NULL,
    valor_nuevo NUMERIC(12,2) NOT NULL CHECK (valor_nuevo >= 0),
    esperado_anterior NUMERIC(12,2),
    esperado_nuevo NUMERIC(12,2),
    motivo VARCHAR(500) NOT NULL CHECK (LENGTH(BTRIM(motivo)) >= 10),
    CHECK (valor_nuevo <> valor_anterior)
);
CREATE INDEX IF NOT EXISTS idx_turno_correccion_turno ON turno_correccion(turno_caja_id, fecha);
CREATE INDEX IF NOT EXISTS idx_turno_correccion_usuario ON turno_correccion(usuario_id);

COMMENT ON TABLE  turno_correccion IS 'Corrección de un monto digitado en un turno de caja (apertura o contado del cierre). Solo Administrador, con motivo, antes de la revisión. Inmutable; se escribe solo con fn_corregir_turno.';
COMMENT ON COLUMN turno_correccion.campo IS 'apertura = monto_apertura_efectivo; cierre = monto_cierre_real_efectivo (efectivo contado).';
COMMENT ON COLUMN turno_correccion.esperado_anterior IS 'Efectivo esperado del turno antes de la corrección (solo turnos cerrados).';

-- ---------------------------------------------------------------------
-- Observaciones
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS turno_observacion (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    turno_caja_id UUID NOT NULL REFERENCES turno_caja(id) ON DELETE RESTRICT,
    usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    fecha TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    texto VARCHAR(1000) NOT NULL CHECK (LENGTH(BTRIM(texto)) >= 3)
);
CREATE INDEX IF NOT EXISTS idx_turno_observacion_turno ON turno_observacion(turno_caja_id, fecha);
CREATE INDEX IF NOT EXISTS idx_turno_observacion_usuario ON turno_observacion(usuario_id);

COMMENT ON TABLE turno_observacion IS 'Notas sobre un turno de caja (cuadratura). Se agregan en cualquier estado del turno; inmutables.';

-- Ambas tablas son inmutables, como el kardex, las devoluciones y las revisiones.
CREATE OR REPLACE FUNCTION trg_registro_turno_inmutable() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Las correcciones y observaciones de un turno son inmutables: registre una nueva.'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS inmutable_turno_correccion ON turno_correccion;
CREATE TRIGGER inmutable_turno_correccion BEFORE UPDATE OR DELETE ON turno_correccion FOR EACH ROW EXECUTE FUNCTION trg_registro_turno_inmutable();
DROP TRIGGER IF EXISTS inmutable_turno_observacion ON turno_observacion;
CREATE TRIGGER inmutable_turno_observacion BEFORE UPDATE OR DELETE ON turno_observacion FOR EACH ROW EXECUTE FUNCTION trg_registro_turno_inmutable();

-- ---------------------------------------------------------------------
-- ¿El usuario es Administrador (activo)?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_es_administrador(p_usuario UUID) RETURNS BOOLEAN STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM usuario u JOIN rol r ON r.id = u.rol_id
                    WHERE u.id = p_usuario AND u.activo AND r.nombre = 'Administrador');
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------
-- Corrección de un monto del turno. Quien corrige se toma de app.usuario_id (lo fija el backend en la transacción).
--   p_campo: 'apertura' | 'cierre'.  Devuelve el id de la corrección.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_corregir_turno(p_turno_id UUID, p_campo TEXT, p_valor NUMERIC, p_motivo TEXT)
RETURNS UUID SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_usuario UUID := NULLIF(current_setting('app.usuario_id', true), '')::uuid;
    t turno_caja%ROWTYPE;
    v_anterior NUMERIC; v_esp_ant NUMERIC; v_esp_nuevo NUMERIC; v_id UUID;
BEGIN
    IF v_usuario IS NULL THEN RAISE EXCEPTION 'Falta el usuario que corrige (app.usuario_id).'; END IF;
    IF NOT fn_es_administrador(v_usuario) THEN RAISE EXCEPTION 'Solo un Administrador puede corregir los montos de un turno.'; END IF;
    IF p_campo NOT IN ('apertura', 'cierre') THEN RAISE EXCEPTION 'Campo a corregir inválido: %.', p_campo; END IF;
    IF p_valor IS NULL OR p_valor < 0 THEN RAISE EXCEPTION 'El monto corregido debe ser mayor o igual a cero.'; END IF;
    IF LENGTH(BTRIM(COALESCE(p_motivo, ''))) < 10 THEN RAISE EXCEPTION 'Explique el motivo de la corrección (al menos 10 caracteres).'; END IF;

    SELECT * INTO t FROM turno_caja WHERE id = p_turno_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Turno inexistente.'; END IF;
    IF EXISTS (SELECT 1 FROM turno_revision WHERE turno_caja_id = p_turno_id) THEN
        RAISE EXCEPTION 'El turno ya fue revisado: sus montos no se pueden corregir. Agregue una observación.';
    END IF;
    IF p_campo = 'cierre' AND t.fecha_cierre IS NULL THEN RAISE EXCEPTION 'El contado del cierre solo se corrige en un turno cerrado.'; END IF;

    v_anterior := CASE p_campo WHEN 'apertura' THEN t.monto_apertura_efectivo ELSE t.monto_cierre_real_efectivo END;
    IF v_anterior = p_valor THEN RAISE EXCEPTION 'El monto corregido es igual al registrado.'; END IF;

    IF p_campo = 'apertura' THEN
        UPDATE turno_caja SET monto_apertura_efectivo = p_valor WHERE id = p_turno_id;
    ELSE
        UPDATE turno_caja SET monto_cierre_real_efectivo = p_valor WHERE id = p_turno_id;
    END IF;

    -- En un turno cerrado el esperado está congelado: se recalcula con la apertura corregida.
    IF t.fecha_cierre IS NOT NULL THEN
        v_esp_ant := t.monto_cierre_esperado_efectivo;
        v_esp_nuevo := fn_cierre_esperado_efectivo(p_turno_id);
        UPDATE turno_caja SET monto_cierre_esperado_efectivo = v_esp_nuevo WHERE id = p_turno_id;
    END IF;

    INSERT INTO turno_correccion (turno_caja_id, usuario_id, campo, valor_anterior, valor_nuevo, esperado_anterior, esperado_nuevo, motivo)
    VALUES (p_turno_id, v_usuario, p_campo, v_anterior, p_valor, v_esp_ant, v_esp_nuevo, BTRIM(p_motivo))
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Revisión: nadie revisa su propio turno, salvo el Administrador.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_validar_turno_revision() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_usuario UUID; v_cierre TIMESTAMPTZ;
BEGIN
    SELECT usuario_id, fecha_cierre INTO v_usuario, v_cierre FROM turno_caja WHERE id = NEW.turno_caja_id;
    IF v_cierre IS NULL THEN RAISE EXCEPTION 'Solo se revisa un turno cerrado.'; END IF;
    IF v_usuario = NEW.usuario_id AND NOT fn_es_administrador(NEW.usuario_id) THEN
        RAISE EXCEPTION 'Nadie puede revisar su propio turno, salvo el Administrador.';
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
COMMENT ON TABLE turno_revision IS 'Visto bueno de la cuadratura de un turno cerrado. Una por turno, inmutable. El revisor no puede ser quien abrió el turno, salvo el Administrador.';

-- ---------------------------------------------------------------------
-- Seguridad (mismo criterio que el resto del esquema)
-- ---------------------------------------------------------------------
DO $$
DECLARE r TEXT; tabla TEXT;
BEGIN
    FOREACH tabla IN ARRAY ARRAY['turno_correccion', 'turno_observacion'] LOOP
        FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
                EXECUTE format('REVOKE ALL ON %I FROM %I', tabla, r);
            END IF;
        END LOOP;
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabla);
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tabla AND policyname = 'p_backend_all') THEN
            EXECUTE format('CREATE POLICY p_backend_all ON public.%I FOR ALL TO app_backend USING (true) WITH CHECK (true)', tabla);
        END IF;
    END LOOP;
END $$;
GRANT SELECT ON turno_correccion TO app_backend;                    -- se escribe solo con fn_corregir_turno
GRANT SELECT, INSERT ON turno_observacion TO app_backend;           -- sin UPDATE/DELETE
REVOKE ALL ON FUNCTION fn_corregir_turno(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_corregir_turno(UUID, TEXT, NUMERIC, TEXT) TO app_backend;
GRANT EXECUTE ON FUNCTION fn_es_administrador(UUID) TO app_backend;

COMMIT;

-- =====================================================================
-- 010 — Caja: cierre automático a las 23:59, farmacia de turno, cierre por fuerza mayor y arqueo posterior
-- Ejecutar UNA vez sobre la base existente (editor SQL de Supabase). Es seguro repetirla.
-- Después, en Supabase: SELECT fn_programar_jobs();  (agrega el job del cierre automático).
--   * sucursal.farmacia_de_turno: la sucursal atiende 24 horas y sus turnos NO se cierran solos.
--   * Cierre automático (fn_cierre_automatico_turnos): a las 23:59 (hora de Chile) cierra los turnos que sigan
--     abiertos en las demás sucursales. No inventa el efectivo: el contado queda vacío ("pendiente de arqueo").
--     También cierra turnos que quedaron abiertos de un día anterior (por si el job no corrió).
--   * Cierre por fuerza mayor (fn_cerrar_turno_forzado): el Administrador o el Jefe de local cierran el turno de
--     otra persona con el efectivo contado y un motivo.
--   * Arqueo (fn_registrar_arqueo): el Administrador o el Jefe de local registran el contado de un turno cerrado
--     automáticamente. Recién entonces hay diferencia y se puede revisar.
--   * Revisión: el Administrador y el Jefe de local pueden revisar su propio turno; la revisión cruzada queda
--     solo para los cajeros. No se revisa un turno con arqueo pendiente.
--   * El Jefe de local actúa sobre las cajas de su sucursal (si tiene una asignada); el Administrador, sobre todas.
--   * turno_aviso: registro de los recordatorios por correo ya enviados (evita duplicados).
-- Contrato de nombres: los roles 'Administrador' y 'Jefe de local' no deben renombrarse desde la interfaz.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------
ALTER TABLE sucursal ADD COLUMN IF NOT EXISTS farmacia_de_turno BOOLEAN DEFAULT FALSE NOT NULL;
COMMENT ON COLUMN sucursal.farmacia_de_turno IS 'Atiende 24 horas: sus turnos de caja no se cierran automáticamente a las 23:59.';

ALTER TABLE turno_caja ADD COLUMN IF NOT EXISTS cierre_tipo VARCHAR(12);
ALTER TABLE turno_caja ADD COLUMN IF NOT EXISTS cerrado_por UUID REFERENCES usuario(id) ON DELETE RESTRICT;
ALTER TABLE turno_caja ADD COLUMN IF NOT EXISTS cierre_motivo VARCHAR(500);
ALTER TABLE turno_caja ADD COLUMN IF NOT EXISTS arqueo_por UUID REFERENCES usuario(id) ON DELETE RESTRICT;
ALTER TABLE turno_caja ADD COLUMN IF NOT EXISTS arqueo_fecha TIMESTAMPTZ;
COMMENT ON COLUMN turno_caja.cierre_tipo IS 'normal = lo cerró quien lo abrió; automatico = el sistema a las 23:59 (contado pendiente hasta el arqueo); forzado = Administrador o Jefe de local por fuerza mayor.';
COMMENT ON COLUMN turno_caja.cerrado_por IS 'Quién cerró el turno (en el cierre automático, el usuario de sistema).';
COMMENT ON COLUMN turno_caja.cierre_motivo IS 'Motivo del cierre por fuerza mayor.';
COMMENT ON COLUMN turno_caja.arqueo_por IS 'Quién registró el contado de un turno cerrado automáticamente.';
COMMENT ON COLUMN turno_caja.monto_cierre_real_efectivo IS 'Efectivo contado. Vacío solo en un turno cerrado automáticamente mientras no se registre el arqueo.';

-- Turnos cerrados antes de esta migración: cierre normal hecho por quien los abrió.
UPDATE turno_caja SET cierre_tipo = 'normal', cerrado_por = usuario_id WHERE fecha_cierre IS NOT NULL AND cierre_tipo IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'turno_caja'::regclass AND conname = 'turno_caja_cierre_tipo_check') THEN
        ALTER TABLE turno_caja ADD CONSTRAINT turno_caja_cierre_tipo_check
            CHECK (cierre_tipo IN ('normal', 'automatico', 'forzado') AND fecha_cierre IS NOT NULL OR cierre_tipo IS NULL AND fecha_cierre IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'turno_caja'::regclass AND conname = 'turno_caja_contado_check') THEN
        ALTER TABLE turno_caja ADD CONSTRAINT turno_caja_contado_check
            CHECK (fecha_cierre IS NULL OR monto_cierre_real_efectivo IS NOT NULL OR cierre_tipo = 'automatico');
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
-- Administrador o Jefe de local, activo.
CREATE OR REPLACE FUNCTION fn_es_supervisor_caja(p_usuario UUID) RETURNS BOOLEAN STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM usuario u JOIN rol r ON r.id = u.rol_id
                    WHERE u.id = p_usuario AND u.activo AND r.nombre IN ('Administrador', 'Jefe de local'));
$$ LANGUAGE sql;

-- ¿El usuario puede operar sobre esta caja? El Administrador, sobre todas; el Jefe de local, sobre las de su
-- sucursal (o todas, si no tiene una asignada).
CREATE OR REPLACE FUNCTION fn_supervisa_caja(p_usuario UUID, p_caja UUID) RETURNS BOOLEAN STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT fn_es_administrador(p_usuario)
        OR (fn_es_supervisor_caja(p_usuario)
            AND (SELECT u.sucursal_id IS NULL OR u.sucursal_id = c.sucursal_id
                   FROM usuario u, caja c WHERE u.id = p_usuario AND c.id = p_caja));
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------
-- Cerrar un turno: quien lo abrió, o una función autorizada (cierre automático o por fuerza mayor)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_cierre_solo_quien_abrio() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF OLD.fecha_cierre IS NULL AND NEW.fecha_cierre IS NOT NULL
       AND COALESCE(current_setting('app.cierre_autorizado', true), '') <> 'on'
       AND NULLIF(current_setting('app.usuario_id', true), '')::uuid IS DISTINCT FROM OLD.usuario_id THEN
        RAISE EXCEPTION 'Solo quien abrió el turno puede cerrarlo.';
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Cierre normal (lo hace quien abrió el turno): ahora registra el tipo y quién cerró.
CREATE OR REPLACE FUNCTION fn_cerrar_turno(p_turno_id UUID, p_monto_real NUMERIC) RETURNS NUMERIC SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cierre TIMESTAMPTZ; v_usuario UUID; v_esperado NUMERIC;
BEGIN
    IF p_monto_real IS NULL OR p_monto_real < 0 THEN RAISE EXCEPTION 'El efectivo contado debe ser un monto mayor o igual a cero.'; END IF;
    SELECT fecha_cierre, usuario_id INTO v_cierre, v_usuario FROM turno_caja WHERE id = p_turno_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Turno inexistente.'; END IF;
    IF v_cierre IS NOT NULL THEN RAISE EXCEPTION 'El turno ya está cerrado.'; END IF;
    v_esperado := fn_cierre_esperado_efectivo(p_turno_id);
    UPDATE turno_caja SET fecha_cierre = NOW(), monto_cierre_esperado_efectivo = v_esperado, monto_cierre_real_efectivo = p_monto_real,
                          cierre_tipo = 'normal', cerrado_por = v_usuario
     WHERE id = p_turno_id;
    RETURN p_monto_real - v_esperado;
END; $$ LANGUAGE plpgsql;

-- Cierre por fuerza mayor: el Administrador o el Jefe de local cierran el turno de otra persona con el contado y un motivo.
CREATE OR REPLACE FUNCTION fn_cerrar_turno_forzado(p_turno_id UUID, p_monto_real NUMERIC, p_motivo TEXT) RETURNS NUMERIC
SECURITY DEFINER SET search_path = public AS $$
DECLARE v_usuario UUID := NULLIF(current_setting('app.usuario_id', true), '')::uuid; t turno_caja%ROWTYPE; v_esperado NUMERIC;
BEGIN
    IF v_usuario IS NULL THEN RAISE EXCEPTION 'Falta el usuario que cierra (app.usuario_id).'; END IF;
    IF p_monto_real IS NULL OR p_monto_real < 0 THEN RAISE EXCEPTION 'El efectivo contado debe ser un monto mayor o igual a cero.'; END IF;
    IF LENGTH(BTRIM(COALESCE(p_motivo, ''))) < 10 THEN RAISE EXCEPTION 'Explique el motivo del cierre (al menos 10 caracteres).'; END IF;
    SELECT * INTO t FROM turno_caja WHERE id = p_turno_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Turno inexistente.'; END IF;
    IF NOT fn_supervisa_caja(v_usuario, t.caja_id) THEN
        RAISE EXCEPTION 'Solo el Administrador o el Jefe de local de la sucursal pueden cerrar el turno de otra persona.';
    END IF;
    IF t.fecha_cierre IS NOT NULL THEN RAISE EXCEPTION 'El turno ya está cerrado.'; END IF;
    IF t.usuario_id = v_usuario THEN RAISE EXCEPTION 'Es su propio turno: ciérrelo desde la caja.'; END IF;
    v_esperado := fn_cierre_esperado_efectivo(p_turno_id);
    PERFORM set_config('app.cierre_autorizado', 'on', true);
    UPDATE turno_caja SET fecha_cierre = NOW(), monto_cierre_esperado_efectivo = v_esperado, monto_cierre_real_efectivo = p_monto_real,
                          cierre_tipo = 'forzado', cerrado_por = v_usuario, cierre_motivo = BTRIM(p_motivo)
     WHERE id = p_turno_id;
    PERFORM set_config('app.cierre_autorizado', 'off', true);
    RETURN p_monto_real - v_esperado;
END; $$ LANGUAGE plpgsql;

-- Cierre automático: turnos abiertos de sucursales que no son farmacia de turno, a partir de las 23:59 (Chile), y
-- cualquier turno de esas sucursales que siga abierto desde un día anterior. El contado queda pendiente de arqueo.
-- Se puede llamar en cualquier momento (pg_cron cada hora al minuto 59, y la API cada pocos minutos): si no
-- corresponde cerrar nada, no hace nada. Devuelve cuántos turnos cerró.
CREATE OR REPLACE FUNCTION fn_cierre_automatico_turnos() RETURNS INTEGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_local TIMESTAMP := NOW() AT TIME ZONE 'America/Santiago'; v_sis UUID; v_n INTEGER := 0; r RECORD;
BEGIN
    SELECT id INTO v_sis FROM usuario WHERE correo = 'sistema@farmaclick.cl';
    IF v_sis IS NULL THEN RAISE EXCEPTION 'Falta el usuario de sistema (sistema@farmaclick.cl).'; END IF;
    PERFORM set_config('app.cierre_autorizado', 'on', true);
    FOR r IN
        SELECT t.id FROM turno_caja t JOIN caja c ON c.id = t.caja_id JOIN sucursal s ON s.id = c.sucursal_id
         WHERE t.fecha_cierre IS NULL AND NOT s.farmacia_de_turno
           AND (v_local::time >= TIME '23:59' OR (t.fecha_apertura AT TIME ZONE 'America/Santiago')::date < v_local::date)
         FOR UPDATE OF t SKIP LOCKED
    LOOP
        UPDATE turno_caja SET fecha_cierre = NOW(), monto_cierre_esperado_efectivo = fn_cierre_esperado_efectivo(r.id),
                              monto_cierre_real_efectivo = NULL, cierre_tipo = 'automatico', cerrado_por = v_sis
         WHERE id = r.id;
        v_n := v_n + 1;
    END LOOP;
    PERFORM set_config('app.cierre_autorizado', 'off', true);
    RETURN v_n;
END; $$ LANGUAGE plpgsql;

-- Arqueo de un turno cerrado automáticamente: el Administrador o el Jefe de local registran el efectivo contado.
CREATE OR REPLACE FUNCTION fn_registrar_arqueo(p_turno_id UUID, p_monto_real NUMERIC, p_observacion TEXT) RETURNS NUMERIC
SECURITY DEFINER SET search_path = public AS $$
DECLARE v_usuario UUID := NULLIF(current_setting('app.usuario_id', true), '')::uuid; t turno_caja%ROWTYPE;
BEGIN
    IF v_usuario IS NULL THEN RAISE EXCEPTION 'Falta el usuario que registra el arqueo (app.usuario_id).'; END IF;
    IF p_monto_real IS NULL OR p_monto_real < 0 THEN RAISE EXCEPTION 'El efectivo contado debe ser un monto mayor o igual a cero.'; END IF;
    SELECT * INTO t FROM turno_caja WHERE id = p_turno_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Turno inexistente.'; END IF;
    IF NOT fn_supervisa_caja(v_usuario, t.caja_id) THEN
        RAISE EXCEPTION 'Solo el Administrador o el Jefe de local de la sucursal pueden registrar el arqueo.';
    END IF;
    IF t.cierre_tipo IS DISTINCT FROM 'automatico' OR t.monto_cierre_real_efectivo IS NOT NULL THEN
        RAISE EXCEPTION 'Este turno no tiene un arqueo pendiente.';
    END IF;
    UPDATE turno_caja SET monto_cierre_real_efectivo = p_monto_real, arqueo_por = v_usuario, arqueo_fecha = NOW() WHERE id = p_turno_id;
    IF LENGTH(BTRIM(COALESCE(p_observacion, ''))) >= 3 THEN
        INSERT INTO turno_observacion (turno_caja_id, usuario_id, texto) VALUES (p_turno_id, v_usuario, BTRIM(p_observacion));
    END IF;
    RETURN p_monto_real - t.monto_cierre_esperado_efectivo;
END; $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Revisión: el Administrador y el Jefe de local pueden revisar su propio turno; nadie revisa con arqueo pendiente.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_validar_turno_revision() RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
DECLARE v_usuario UUID; v_cierre TIMESTAMPTZ; v_contado NUMERIC;
BEGIN
    SELECT usuario_id, fecha_cierre, monto_cierre_real_efectivo INTO v_usuario, v_cierre, v_contado FROM turno_caja WHERE id = NEW.turno_caja_id;
    IF v_cierre IS NULL THEN RAISE EXCEPTION 'Solo se revisa un turno cerrado.'; END IF;
    IF v_contado IS NULL THEN RAISE EXCEPTION 'El turno tiene el arqueo pendiente: registre el efectivo contado antes de revisarlo.'; END IF;
    IF v_usuario = NEW.usuario_id AND NOT fn_es_supervisor_caja(NEW.usuario_id) THEN
        RAISE EXCEPTION 'Nadie puede revisar su propio turno, salvo el Administrador o el Jefe de local.';
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
COMMENT ON TABLE turno_revision IS 'Visto bueno de la cuadratura de un turno cerrado. Una por turno, inmutable. El revisor no puede ser quien abrió el turno, salvo el Administrador o el Jefe de local.';

-- Corrección (009): el contado de un turno con arqueo pendiente no se corrige, se registra con el arqueo.
CREATE OR REPLACE FUNCTION fn_corregir_turno(p_turno_id UUID, p_campo TEXT, p_valor NUMERIC, p_motivo TEXT)
RETURNS UUID SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_usuario UUID := NULLIF(current_setting('app.usuario_id', true), '')::uuid;
    t turno_caja%ROWTYPE;
    v_anterior NUMERIC; v_esp_ant NUMERIC; v_esp_nuevo NUMERIC; v_id UUID;
BEGIN
    IF v_usuario IS NULL THEN RAISE EXCEPTION 'Falta el usuario que corrige (app.usuario_id).'; END IF;
    IF NOT fn_es_administrador(v_usuario) THEN RAISE EXCEPTION 'Solo un Administrador puede corregir los montos de un turno.'; END IF;
    IF p_campo NOT IN ('apertura', 'cierre') THEN RAISE EXCEPTION 'Campo a corregir inválido: %.', p_campo; END IF;
    IF p_valor IS NULL OR p_valor < 0 THEN RAISE EXCEPTION 'El monto corregido debe ser mayor o igual a cero.'; END IF;
    IF LENGTH(BTRIM(COALESCE(p_motivo, ''))) < 10 THEN RAISE EXCEPTION 'Explique el motivo de la corrección (al menos 10 caracteres).'; END IF;

    SELECT * INTO t FROM turno_caja WHERE id = p_turno_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Turno inexistente.'; END IF;
    IF EXISTS (SELECT 1 FROM turno_revision WHERE turno_caja_id = p_turno_id) THEN
        RAISE EXCEPTION 'El turno ya fue revisado: sus montos no se pueden corregir. Agregue una observación.';
    END IF;
    IF p_campo = 'cierre' AND t.fecha_cierre IS NULL THEN RAISE EXCEPTION 'El contado del cierre solo se corrige en un turno cerrado.'; END IF;
    IF p_campo = 'cierre' AND t.monto_cierre_real_efectivo IS NULL THEN
        RAISE EXCEPTION 'El turno tiene el arqueo pendiente: registre el efectivo contado con el arqueo.';
    END IF;

    v_anterior := CASE p_campo WHEN 'apertura' THEN t.monto_apertura_efectivo ELSE t.monto_cierre_real_efectivo END;
    IF v_anterior = p_valor THEN RAISE EXCEPTION 'El monto corregido es igual al registrado.'; END IF;

    IF p_campo = 'apertura' THEN
        UPDATE turno_caja SET monto_apertura_efectivo = p_valor WHERE id = p_turno_id;
    ELSE
        UPDATE turno_caja SET monto_cierre_real_efectivo = p_valor WHERE id = p_turno_id;
    END IF;

    IF t.fecha_cierre IS NOT NULL THEN
        v_esp_ant := t.monto_cierre_esperado_efectivo;
        v_esp_nuevo := fn_cierre_esperado_efectivo(p_turno_id);
        UPDATE turno_caja SET monto_cierre_esperado_efectivo = v_esp_nuevo WHERE id = p_turno_id;
    END IF;

    INSERT INTO turno_correccion (turno_caja_id, usuario_id, campo, valor_anterior, valor_nuevo, esperado_anterior, esperado_nuevo, motivo)
    VALUES (p_turno_id, v_usuario, p_campo, v_anterior, p_valor, v_esp_ant, v_esp_nuevo, BTRIM(p_motivo))
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Avisos por correo ya enviados (recordatorios de cierre y aviso de cierre automático): uno por turno y tipo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS turno_aviso (
    turno_caja_id UUID NOT NULL REFERENCES turno_caja(id) ON DELETE RESTRICT,
    tipo VARCHAR(30) NOT NULL CHECK (tipo ~ '^[a-z0-9_]+$'),
    enviado_en TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    destinatarios INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (turno_caja_id, tipo)
);
COMMENT ON TABLE turno_aviso IS 'Avisos por correo enviados para un turno (recordatorio_60, recordatorio_30, cierre_automatico). Evita enviarlos dos veces.';

-- ---------------------------------------------------------------------
-- Job del cierre automático (pg_cron, cada hora al minuto 59: las 23:59 de Chile caen siempre en un minuto 59 UTC)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_programar_jobs() RETURNS TEXT SET search_path = public AS $$
DECLARE v_sis UUID;
BEGIN
    IF to_regnamespace('cron') IS NULL THEN
        RETURN 'pg_cron no está habilitado. Habilítelo (Supabase: Database > Extensions) y ejecute SELECT fn_programar_jobs();';
    END IF;
    SELECT id INTO v_sis FROM usuario WHERE correo = 'sistema@farmaclick.cl';
    IF v_sis IS NULL THEN RAISE EXCEPTION 'Falta el usuario de sistema (sistema@farmaclick.cl).'; END IF;
    EXECUTE format('SELECT cron.schedule(%L, %L, %L)', 'farmaclick-liberar-reservas', '*/5 * * * *',
                   format('SELECT public.fn_liberar_reservas_vencidas(20, %L::uuid)', v_sis));
    EXECUTE format('SELECT cron.schedule(%L, %L, %L)', 'farmaclick-baja-vencidos', '0 5 * * *',
                   format('SELECT public.fn_baja_lotes_vencidos(%L::uuid)', v_sis));
    EXECUTE format('SELECT cron.schedule(%L, %L, %L)', 'farmaclick-cierre-automatico', '59 * * * *',
                   'SELECT public.fn_cierre_automatico_turnos()');
    RETURN 'Jobs programados: farmaclick-liberar-reservas, farmaclick-baja-vencidos y farmaclick-cierre-automatico.';
END; $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------
DO $$
DECLARE r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON turno_aviso FROM %I', r);
        END IF;
    END LOOP;
    ALTER TABLE public.turno_aviso ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'turno_aviso' AND policyname = 'p_backend_all') THEN
        CREATE POLICY p_backend_all ON public.turno_aviso FOR ALL TO app_backend USING (true) WITH CHECK (true);
    END IF;
END $$;
GRANT SELECT, INSERT ON turno_aviso TO app_backend;
REVOKE ALL ON FUNCTION fn_cerrar_turno_forzado(UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_registrar_arqueo(UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_cierre_automatico_turnos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cerrar_turno_forzado(UUID, NUMERIC, TEXT) TO app_backend;
GRANT EXECUTE ON FUNCTION fn_registrar_arqueo(UUID, NUMERIC, TEXT) TO app_backend;
GRANT EXECUTE ON FUNCTION fn_cierre_automatico_turnos() TO app_backend;
GRANT EXECUTE ON FUNCTION fn_es_supervisor_caja(UUID) TO app_backend;
GRANT EXECUTE ON FUNCTION fn_supervisa_caja(UUID, UUID) TO app_backend;

-- Si pg_cron está disponible, se agrega el job ahora; si no, queda para SELECT fn_programar_jobs();
DO $$
BEGIN
    RAISE NOTICE '%', fn_programar_jobs();
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudieron programar los jobs (%). Ejecute más tarde: SELECT fn_programar_jobs();', SQLERRM;
END $$;

COMMIT;

-- =====================================================================
-- 011 — Tienda en línea: contenido de la ficha del producto (HU-67)
-- La ficha pública muestra una descripción, la presentación del producto (por ejemplo "Caja 30 comprimidos") y
-- una foto. La foto es la dirección https de una imagen ya publicada (por ejemplo, un archivo público de Supabase
-- Storage); la base no guarda imágenes.
-- Las tres columnas son opcionales: los productos existentes siguen funcionando igual y la tienda muestra una
-- ilustración por categoría mientras no haya foto. El backend puede escribirlas desde el módulo Productos.
-- Idempotente. Ejecutar en el editor SQL de Supabase (primero dev, después prod).
-- =====================================================================
BEGIN;

ALTER TABLE producto ADD COLUMN IF NOT EXISTS descripcion VARCHAR(2000);
ALTER TABLE producto ADD COLUMN IF NOT EXISTS presentacion VARCHAR(100);
ALTER TABLE producto ADD COLUMN IF NOT EXISTS imagen_url VARCHAR(500);
COMMENT ON COLUMN producto.descripcion IS 'Texto de la ficha pública de la tienda. Opcional.';
COMMENT ON COLUMN producto.presentacion IS 'Formato de venta mostrado en la tienda, por ejemplo "Caja 30 comprimidos". Opcional.';
COMMENT ON COLUMN producto.imagen_url IS 'Dirección https de la foto del producto para la tienda. Opcional.';

-- Solo direcciones https: una imagen por http se bloquea en un sitio con https y una dirección "javascript:" no
-- debe llegar nunca a la página.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_producto_imagen_https') THEN
        ALTER TABLE producto ADD CONSTRAINT ck_producto_imagen_https
            CHECK (imagen_url IS NULL OR imagen_url ~ '^https://[^[:space:]]+$');
    END IF;
END $$;

GRANT INSERT (descripcion, presentacion, imagen_url), UPDATE (descripcion, presentacion, imagen_url) ON producto TO app_backend;

COMMIT;

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

-- =====================================================================
-- 021 — Fotos reales de los productos (HU-96)
--   * La foto se sube desde el sistema (Productos) y se guarda en Supabase Storage, bucket público "productos"
--     (lo crea la API la primera vez). producto.imagen_url queda con la dirección https pública del archivo.
--   * En el Docker de desarrollo, sin Supabase, la API guarda la foto en su disco y la sirve en /api/fotos/...:
--     la restricción acepta también esa dirección relativa. Ninguna otra forma (http://, javascript:, data:).
-- Idempotente. Ejecutar en el editor SQL de Supabase (primero dev, después prod).
-- =====================================================================
BEGIN;

ALTER TABLE producto DROP CONSTRAINT IF EXISTS ck_producto_imagen_https;
ALTER TABLE producto ADD CONSTRAINT ck_producto_imagen_https
    CHECK (imagen_url IS NULL OR imagen_url ~ '^https://[^[:space:]]+$' OR imagen_url ~ '^/api/fotos/[^[:space:]]+$');
COMMENT ON COLUMN producto.imagen_url IS 'Foto del producto para la tienda (HU-67, HU-96): dirección https (Supabase Storage) o /api/fotos/... en desarrollo local. Opcional.';

COMMIT;
