// Vida útil mínima al recibir una orden de compra (HU-87). Reglas sin base de datos (vidaUtil.test.js); la base
// aplica la misma regla con el trigger trg_validar_vida_util (migración 015).

export const PARAMETRO_VIDA_UTIL = 'vida_util_minima_meses';

// Suma meses a una fecha AAAA-MM-DD como lo hace PostgreSQL (fecha + interval): si el día no existe en el mes de
// destino, queda el último día de ese mes (30-11 + 3 meses = 28-02).
export function sumarMeses(fecha, meses) {
  const [a, m, d] = fecha.split('-').map(Number);
  const total = (m - 1) + meses;
  const anio = a + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

export const fechaDMA = (fecha) => fecha.split('-').reverse().join('-');

// Revisa las líneas de una recepción. Devuelve los errores por línea ({ path, message }), vacío si todo cumple.
//   items:      [{ detalle_id, numero_lote, fecha_vencimiento, excepcion_motivo }]
//   detalles:   Map detalle_id -> { producto }   minima: AAAA-MM-DD   meses: plazo vigente
//   puedeExceptuar: el usuario es Administrador o Jefe de local
export function revisarVidaUtil(items, { detalles, minima, meses, puedeExceptuar }) {
  const errores = [];
  items.forEach((it, i) => {
    if (!it.fecha_vencimiento || it.fecha_vencimiento >= minima) return;
    const producto = detalles.get(it.detalle_id)?.producto ?? 'el producto';
    const lote = it.numero_lote ? `lote ${it.numero_lote}` : 'sin número de lote';
    if (!it.excepcion_motivo) {
      errores.push({
        path: `items.${i}.fecha_vencimiento`,
        message: `"${producto}", ${lote}: vence el ${fechaDMA(it.fecha_vencimiento)} y la fecha mínima es el ${fechaDMA(minima)} (${meses} ${meses === 1 ? 'mes' : 'meses'} de vida útil).`,
      });
    } else if (!puedeExceptuar) {
      errores.push({
        path: `items.${i}.excepcion_motivo`,
        message: `"${producto}": solo el Administrador o el Jefe de local pueden aceptar un lote bajo la vida útil mínima.`,
      });
    }
  });
  return errores;
}
