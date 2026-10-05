import { clp, fechaDMA, generarDocumentoPdf, pdfABuffer } from '../../core/documentos.js';
import { detalleDevolucion } from './servicio.js';

// Comprobante de devolución (no es una nota de crédito tributaria), como JSON con el PDF en base64
// (los gestores de descarga como IDM interceptan application/pdf).
export async function comprobanteDevolucion(db, id) {
  const d = await detalleDevolucion(db, id);
  const redondeo = Number(d.redondeo ?? 0); // ajuste del efectivo devuelto (Ley 20.956)
  const doc = generarDocumentoPdf({
    titulo: 'COMPROBANTE DE DEVOLUCIÓN',
    codigo: d.codigo,
    emisor: {
      nombre: process.env.EMPRESA_NOMBRE || 'FarmaClick',
      lineas: [process.env.EMPRESA_RUT && `RUT ${process.env.EMPRESA_RUT}`, process.env.EMPRESA_DIRECCION].filter(Boolean),
    },
    metadatos: [['Fecha', fechaDMA(d.fecha)], ['Pedido original', d.pedido_codigo], ['Atendió', d.usuario]],
    partes: [
      { titulo: 'Cliente', lineas: [d.nombre_cliente] },
      { titulo: 'Sucursal', lineas: [d.sucursal, d.sucursal_direccion] },
    ],
    columnas: [
      { header: 'SKU', key: 'sku', ancho: 0.16 },
      { header: 'Producto', key: 'producto', ancho: 0.46 },
      { header: 'Cant.', key: 'cantidad', ancho: 0.1, alinear: 'right' },
      { header: 'Reembolso', key: 'monto', ancho: 0.28, alinear: 'right' },
    ],
    filas: d.lineas.map((l) => ({ sku: l.sku, producto: l.nombre_producto, cantidad: l.cantidad, monto: clp(l.monto_reembolso) })),
    totales: [
      ['Total devuelto', clp(d.total_reembolso)],
      ...(redondeo ? [['Ajuste por redondeo (Ley 20.956)', `${redondeo < 0 ? '-' : '+'}${clp(Math.abs(redondeo))}`], ['Dinero devuelto', clp(Number(d.total_reembolso) + redondeo)]] : []),
    ],
    nota: `Motivo: ${d.motivo}. Dinero devuelto por: ${d.pagos.map((x) => `${x.medio_pago} ${clp(x.monto)}`).join(', ')}. Documento no tributario.`,
  });
  const pdf = await pdfABuffer(doc);
  return { archivo: `${d.codigo}.pdf`, tipo: 'application/pdf', base64: pdf.toString('base64') };
}
