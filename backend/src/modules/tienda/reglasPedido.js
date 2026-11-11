// Reglas del checkout de la tienda (HU-71) que no dependen de la base de datos (se prueban con node --test).

// Minutos que el stock queda reservado esperando el pago. Es el mismo plazo del job fn_liberar_reservas_vencidas
// (pg_cron) y de la tarea de la API (tareasTienda.js).
export const RESERVA_MINUTOS = 20;

// Minutos que quedan para pagar un pedido creado en `fecha` (nunca negativo).
export function minutosRestantes(fecha, ahora = new Date()) {
  const vence = new Date(new Date(fecha).getTime() + RESERVA_MINUTOS * 60 * 1000);
  return Math.max(0, (vence.getTime() - ahora.getTime()) / 60000);
}

export const venceEn = (fecha) => new Date(new Date(fecha).getTime() + RESERVA_MINUTOS * 60 * 1000).toISOString();

// Disponibilidad de cada sucursal para el carro completo.
//   sucursales: [{ id, nombre, ... }]  stock: [{ sucursal_id, producto_id, disponible }]  items: [{ producto_id, cantidad }]
// Devuelve cada sucursal con alcanza (tiene todo) y faltan (productos que no le alcanzan).
export function disponibilidadPorSucursal(sucursales, stock, items) {
  return sucursales.map((s) => {
    const faltan = items.filter((it) => {
      const fila = stock.find((x) => x.sucursal_id === s.id && x.producto_id === it.producto_id);
      return (fila ? Number(fila.disponible) : 0) < it.cantidad;
    }).map((it) => it.producto_id);
    return { ...s, alcanza: faltan.length === 0, faltan };
  });
}

// Sucursal que despacha: la primera (por nombre) que tiene todo el pedido. null si ninguna alcanza sola.
export function sucursalDespacho(disponibilidad) {
  return [...disponibilidad].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).find((s) => s.alcanza) ?? null;
}
