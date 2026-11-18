import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { kb, reducirFoto, skuDeArchivo } from '../../fotos.js';
import { ErrorAlert, PageHeader, useAsync } from '../../components/ui.jsx';

// Fotos en lote (HU-96): se eligen todas las fotos de una carpeta, cada archivo se asocia al producto por su nombre
// (el SKU: MED-001.jpg) y se suben una por una, ya reducidas. Un archivo sin producto se informa y se salta.
export default function FotosLote() {
  const productos = useAsync(() => api.get('/productos?limit=500'), []);
  const [filas, setFilas] = useState([]); // { archivo, sku, producto, estado, detalle }
  const [subiendo, setSubiendo] = useState(false);

  const porSku = new Map((productos.data?.data ?? []).map((p) => [p.sku.toUpperCase(), p]));
  const elegir = (e) => {
    const archivos = [...(e.target.files ?? [])].filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    e.target.value = '';
    setFilas(archivos.sort((a, b) => a.name.localeCompare(b.name)).map((archivo) => {
      const sku = skuDeArchivo(archivo.name);
      const producto = porSku.get(sku) ?? null;
      return { archivo, sku, producto, estado: producto ? 'pendiente' : 'sin-producto', detalle: producto ? producto.nombre : 'No hay un producto con ese SKU' };
    }));
  };

  const cambiar = (i, x) => setFilas((f) => f.map((r, k) => (k === i ? { ...r, ...x } : r)));
  const subirTodas = async () => {
    setSubiendo(true);
    for (let i = 0; i < filas.length; i += 1) {
      const r = filas[i];
      if (r.estado !== 'pendiente' && r.estado !== 'error') continue;
      cambiar(i, { estado: 'subiendo', detalle: 'Reduciendo y subiendo…' });
      try {
        const reducida = await reducirFoto(r.archivo);
        await api.subir(`/productos/${r.producto.id}/foto`, reducida);
        cambiar(i, { estado: 'ok', detalle: `${r.producto.nombre} · ${kb(r.archivo.size)} → ${kb(reducida.size)}` });
      } catch (err) {
        cambiar(i, { estado: 'error', detalle: err.message });
      }
    }
    setSubiendo(false);
  };

  const n = (e) => filas.filter((r) => r.estado === e).length;
  const pendientes = n('pendiente') + n('error');
  const ETIQUETA = {
    pendiente: <span className="badge text-bg-secondary">Por subir</span>,
    subiendo: <span className="badge text-bg-info">Subiendo</span>,
    ok: <span className="badge text-bg-success">Subida</span>,
    error: <span className="badge text-bg-danger">Error</span>,
    'sin-producto': <span className="badge text-bg-warning">Sin producto</span>,
  };
  return (
    <>
      <PageHeader title="Fotos en lote">
        <Link to="/productos" className="btn btn-outline-secondary">Volver a Productos</Link>
      </PageHeader>
      <p className="text-muted">
        Elige las fotos de la carpeta (puedes seleccionarlas todas con <kbd>Ctrl</kbd> + <kbd>A</kbd>). Cada archivo debe
        llamarse como el SKU del producto, por ejemplo <code>MED-001.jpg</code>. El sistema las reduce a 800 px antes de
        subirlas y reemplaza la foto anterior del producto.
      </p>
      <ErrorAlert error={productos.error} />
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <label className={`btn btn-outline-primary mb-0${subiendo || !productos.data ? ' disabled' : ''}`}>
          <i className="bi bi-images me-1" />Elegir fotos
          <input type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={elegir} disabled={subiendo || !productos.data} aria-label="Elegir fotos" />
        </label>
        <button className="btn btn-primary" disabled={subiendo || pendientes === 0} onClick={subirTodas}>
          {subiendo ? 'Subiendo…' : `Subir ${pendientes} ${pendientes === 1 ? 'foto' : 'fotos'}`}
        </button>
        {filas.length > 0 && (
          <span className="small text-muted" role="status" id="resumen-lote">
            {filas.length} archivos · {n('ok')} subidas · {n('sin-producto')} sin producto · {n('error')} con error
          </span>
        )}
      </div>
      {filas.length > 0 && (
        <div className="table-responsive">
          <table className="table table-sm align-middle">
            <thead><tr><th>Archivo</th><th>SKU</th><th>Estado</th><th>Detalle</th></tr></thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.archivo.name}>
                  <td className="font-monospace small">{r.archivo.name}</td>
                  <td>{r.sku}</td>
                  <td>{ETIQUETA[r.estado]}</td>
                  <td className="small">{r.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
