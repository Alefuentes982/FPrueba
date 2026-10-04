import { useState } from 'react';
import { api, qs } from '../../api.js';
import { descargarArchivo } from '../../archivos.js';
import { money, soloFecha } from '../../format.js';
import { ErrorAlert, Spinner, useAsync } from '../../components/ui.jsx';

const numero = new Intl.NumberFormat('es-CL');
const celda = (tipo, v) => (v == null || v === '' ? '—' : tipo === 'clp' ? money(v) : tipo === 'entero' ? numero.format(v) : tipo === 'fecha' ? soloFecha(v) : v);

// Un informe del dashboard: lo pide al backend, lo muestra como tabla con su fila de totales y ofrece CSV y PDF.
// `plegable` deja la tabla oculta bajo `antes` hasta que se pide. `params` son los filtros (desde, hasta, sucursal_id, dias, limite); el CSV y el PDF traen todas las filas, sin el límite; `antes(informe)` permite poner un gráfico encima.
export default function TablaInforme({ id, titulo, params, antes, vacio = 'Sin datos para los filtros elegidos.', plegable = false }) {
  const consulta = qs(params);
  const { data, error, loading } = useAsync(() => api.get(`/dashboard/informes/${id}${consulta}`), [id, consulta]);
  const [errorArchivo, setErrorArchivo] = useState(null);
  const [bajando, setBajando] = useState(null);
  const [abierta, setAbierta] = useState(!plegable);

  const exportar = async (formato) => {
    setErrorArchivo(null);
    setBajando(formato);
    try {
      await descargarArchivo(`/dashboard/informes/${id}/exportar${qs({ ...params, limite: '', formato })}`);
    } catch (err) {
      setErrorArchivo(err);
    } finally {
      setBajando(null);
    }
  };

  return (
    <section className="mb-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <h3 className="h5 mb-0">{titulo ?? data?.titulo}</h3>
        <div className="btn-group btn-group-sm">
          <button className="btn btn-outline-secondary" disabled={!data?.filas.length || bajando} onClick={() => exportar('csv')} title="Descargar en CSV (Excel)">
            <i className="bi bi-filetype-csv me-1" />{bajando === 'csv' ? 'Generando…' : 'CSV'}
          </button>
          <button className="btn btn-outline-secondary" disabled={!data?.filas.length || bajando} onClick={() => exportar('pdf')} title="Descargar en PDF">
            <i className="bi bi-file-earmark-pdf me-1" />{bajando === 'pdf' ? 'Generando…' : 'PDF'}
          </button>
        </div>
      </div>
      <ErrorAlert error={error || errorArchivo} onClose={errorArchivo ? () => setErrorArchivo(null) : undefined} />
      {loading && !data ? <Spinner /> : data && (
        <>
          {antes?.(data)}
          {plegable && (
            <button className="btn btn-link btn-sm p-0 mb-2" onClick={() => setAbierta((a) => !a)}>{abierta ? 'Ocultar' : 'Ver'} el detalle en tabla</button>
          )}
          {abierta && <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-1">
              <thead>
                <tr>{data.columnas.map((c) => <th key={c.key} className={c.tipo === 'texto' || c.tipo === 'fecha' ? '' : 'text-end'}>{c.header}</th>)}</tr>
              </thead>
              <tbody>
                {data.filas.length === 0 && <tr><td colSpan={data.columnas.length} className="text-center text-muted py-3">{vacio}</td></tr>}
                {data.filas.map((f, i) => (
                  <tr key={i}>
                    {data.columnas.map((c) => (
                      <td key={c.key} className={c.tipo === 'texto' || c.tipo === 'fecha' ? '' : 'text-end'}>{celda(c.tipo, f[c.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {data.filas.length > 1 && Object.keys(data.totales).length > 0 && (
                <tfoot>
                  <tr className="fw-semibold table-light">
                    {data.columnas.map((c, i) => (
                      <td key={c.key} className={c.tipo === 'texto' || c.tipo === 'fecha' ? '' : 'text-end'}>
                        {i === 0 ? 'Total' : c.key in data.totales ? celda(c.tipo, data.totales[c.key]) : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>}
        </>
      )}
    </section>
  );
}
