import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { money } from '../../format.js';
import { descargarComprobante, pedidosApi } from '../apiTienda.js';
import { Aviso, Cargando } from '../comunes.jsx';
import { useCuenta } from '../CuentaContext.jsx';
import Seguimiento from './Seguimiento.jsx';
import './compra.css';

// Mis pedidos (HU-75): los pedidos del cliente, el más reciente primero, con su estado y su comprobante.
export default function MisPedidos() {
  const { cliente, cargando } = useCuenta();
  if (cargando) return <Cargando />;
  if (!cliente) return <Navigate to={`/tienda/cuenta?volver=${encodeURIComponent('/tienda/pedido')}`} replace />;
  return <Lista />;
}

const fecha = (v) => new Date(v).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'long', year: 'numeric' });

function Lista() {
  const [pedidos, setPedidos] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [descargando, setDescargando] = useState(null);

  const cargar = useCallback(async (n) => {
    setError(null);
    try {
      const r = await pedidosApi.listar(n);
      setPedidos((antes) => (n === 1 ? r.data : [...(antes ?? []), ...r.data]));
      setTotal(r.total);
      setPage(n);
    } catch (err) {
      setError(err);
    }
  }, []);
  useEffect(() => { cargar(1); }, [cargar]);

  const comprobante = async (p) => {
    setDescargando(p.id); setError(null);
    try { await descargarComprobante(p.id); } catch (err) { setError(err); } finally { setDescargando(null); }
  };

  if (!pedidos && !error) return <Cargando />;
  return (
    <div className="fct-wrap fct-pagina">
      <div className="fct-pedido-titulo"><h1>Mis pedidos</h1></div>
      {error && <Aviso error={error} />}
      {pedidos?.length === 0 && (
        <div className="fct-estado-caja">
          <p className="fct-suave">Todavía no tienes pedidos. Cuando compres, aquí verás en qué va cada uno.</p>
          <Link to="/tienda/productos" className="fct-btn-primario">Ver productos</Link>
        </div>
      )}
      <ul className="fct-mis-pedidos">
        {pedidos?.map((p) => (
          <li key={p.id} className="fct-bloque-form">
            <div className="fct-mis-pedidos-cabeza">
              <div>
                <Link to={`/tienda/pedido/${p.id}`} className="fct-mis-pedidos-codigo">Pedido {p.codigo}</Link>
                <small>{fecha(p.fecha)} · {p.unidades} {p.unidades === 1 ? 'unidad' : 'unidades'} · {money(p.total_a_pagar)}</small>
              </div>
              <span className={`fct-estado fct-estado-${p.estado.toLowerCase().replace(/\s+/g, '-')}`}>{p.estado}</span>
            </div>
            <p className="fct-mis-pedidos-entrega">
              <i className={`bi ${p.entrega === 'despacho' ? 'bi-truck' : 'bi-shop'}`} aria-hidden="true" />
              {p.entrega === 'despacho' ? `Despacho a ${p.lugar}` : `Retiro en ${p.lugar}`} · {p.mensaje}
            </p>
            <Seguimiento estado={p.estado} entrega={p.entrega} compacto />
            <div className="fct-mis-pedidos-acciones">
              <Link to={`/tienda/pedido/${p.id}`} className="fct-btn-borde">{p.estado === 'Pago pendiente' ? 'Pagar o anular' : 'Ver detalle'}</Link>
              {p.comprobante && (
                <button type="button" className="fct-btn-borde" disabled={descargando === p.id} onClick={() => comprobante(p)}>
                  <i className="bi bi-file-earmark-pdf" aria-hidden="true" />&nbsp;{descargando === p.id ? 'Descargando…' : 'Comprobante'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {pedidos && pedidos.length < total && (
        <button type="button" className="fct-btn-borde fct-ancho-completo" disabled={cargandoMas}
          onClick={async () => { setCargandoMas(true); await cargar(page + 1); setCargandoMas(false); }}>
          {cargandoMas ? 'Cargando…' : `Ver pedidos anteriores (${total - pedidos.length})`}
        </button>
      )}
    </div>
  );
}
