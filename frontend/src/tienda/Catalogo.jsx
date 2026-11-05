import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { money } from '../format.js';
import { tiendaApi } from './apiTienda.js';
import { Aviso, Migas } from './comunes.jsx';
import { enlaceCategoria, useDatosTienda } from './DatosTienda.jsx';
import TarjetaProducto from './TarjetaProducto.jsx';
import { GrillaEsqueleto } from './ui/Esqueletos.jsx';
import PanelLateral from './ui/PanelLateral.jsx';
import { prefiereMenosMovimiento } from './ui/movimiento.js';

const ORDENES = [
  { valor: 'relevancia', texto: 'Más vendidos' },
  { valor: 'precio_asc', texto: 'Menor precio' },
  { valor: 'precio_desc', texto: 'Mayor precio' },
  { valor: 'descuento', texto: 'Mayor descuento' },
  { valor: 'nombre', texto: 'Nombre (A-Z)' },
];
const POR_PAGINA = 24;
const entero = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : null; };

// Listado de productos: búsqueda (viene de la cabecera en ?q=), categoría, ofertas, rango de precio, orden y páginas.
// Los filtros viven en la URL para que se puedan compartir y el botón Atrás funcione.
// En celular los filtros se abren en un panel lateral; mientras llegan los productos se ven tarjetas de carga (HU-95).
export default function Catalogo() {
  const [params, setParams] = useSearchParams();
  const { categorias, sucursales } = useDatosTienda();
  const q = params.get('q') ?? '';
  const categoriaId = params.get('categoria') ?? '';
  const ofertas = params.get('ofertas') === '1';
  const desde = entero(params.get('desde'));
  const hasta = entero(params.get('hasta'));
  const orden = params.get('orden') ?? 'relevancia';
  const pagina = Math.max(entero(params.get('pagina')) ?? 1, 1);

  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  useEffect(() => {
    let vigente = true;
    setError(null);
    setCargando(true);
    tiendaApi.productos({
      q, categoria_id: categoriaId, con_descuento: ofertas ? 1 : '', precio_min: desde ?? '', precio_max: hasta ?? '',
      orden, page: pagina, limit: POR_PAGINA,
    })
      .then((r) => vigente && setResultado(r))
      .catch((e) => vigente && (setError(e), setResultado(null)))
      .finally(() => vigente && setCargando(false));
    return () => { vigente = false; };
  }, [q, categoriaId, ofertas, desde, hasta, orden, pagina]);

  // Cambiar un filtro vuelve a la primera página. En celular el panel de filtros sigue abierto: el botón de abajo
  // muestra cuántos productos quedan y lo cierra.
  const fijar = (cambios) => {
    const p = new URLSearchParams(params);
    Object.entries(cambios).forEach(([k, v]) => (v === '' || v == null ? p.delete(k) : p.set(k, v)));
    if (!('pagina' in cambios)) p.delete('pagina');
    setParams(p);
    window.scrollTo({ top: 0, behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth' });
  };

  const categoria = categorias.find((c) => c.id === categoriaId);
  const titulo = q ? `Resultados para "${q}"` : categoria?.nombre ?? (ofertas ? 'Ofertas' : 'Todos los productos');
  const activos = [
    q && { clave: 'q', texto: `"${q}"` },
    ofertas && { clave: 'ofertas', texto: 'Con descuento' },
    (desde != null || hasta != null) && { clave: ['desde', 'hasta'], texto: rangoTexto(desde, hasta) },
  ].filter(Boolean);
  const matriz = sucursales[0];

  return (
    <div className="fct-wrap">
      <Migas pasos={[{ texto: titulo }]} />
      <div className="fct-listado-cabecera">
        <div>
          <h1>{titulo}</h1>
          {resultado && <p>{resultado.total} {resultado.total === 1 ? 'producto' : 'productos'}</p>}
          <div className="fct-chips" role="list">
            <Link role="listitem" to={q ? `/tienda/productos?q=${encodeURIComponent(q)}` : '/tienda/productos'} className={!categoriaId ? 'activo' : ''}>Todo</Link>
            {categorias.map((c) => (
              <Link role="listitem" key={c.id} to={enlaceCategoria(c)} className={c.id === categoriaId ? 'activo' : ''}>{c.nombre}</Link>
            ))}
          </div>
        </div>
        <label className="fct-orden fct-solo-escritorio">
          Ordenar por
          <SelectorOrden orden={orden} onCambiar={(v) => fijar({ orden: v === 'relevancia' ? '' : v })} />
        </label>
      </div>

      <div className="fct-listado">
        <aside className="fct-filtros" aria-label="Filtros">
          <Filtros ofertas={ofertas} desde={desde} hasta={hasta} matriz={matriz} fijar={fijar} />
        </aside>

        <section>
          <div className="fct-filtros-movil fct-solo-movil">
            <button type="button" aria-haspopup="dialog" onClick={() => setFiltrosAbiertos(true)}>
              <i className="bi bi-sliders" aria-hidden="true" />Filtrar{activos.length > 0 && ` (${activos.length})`}
            </button>
            <SelectorOrden orden={orden} onCambiar={(v) => fijar({ orden: v === 'relevancia' ? '' : v })} />
          </div>
          {activos.length > 0 && (
            <div className="fct-activos">
              Filtros:
              {activos.map((a) => (
                <button key={a.texto} type="button" onClick={() => fijar(Object.fromEntries([a.clave].flat().map((k) => [k, ''])))}>
                  {a.texto}<i className="bi bi-x" aria-label="Quitar" />
                </button>
              ))}
              <Link to={categoria ? enlaceCategoria(categoria) : '/tienda/productos'}>Limpiar todo</Link>
            </div>
          )}

          {error && <Aviso error={error} />}
          {!error && !resultado && <GrillaEsqueleto cantidad={8} />}
          {resultado && resultado.data.length === 0 && (
            <Aviso>No encontramos productos con esos filtros. Prueba con otra palabra o revisa todas las categorías.</Aviso>
          )}
          {resultado && resultado.data.length > 0 && (
            <>
              <div className={`fct-grilla${cargando ? ' fct-actualizando' : ''}`} aria-busy={cargando}>
                {resultado.data.map((p) => <TarjetaProducto key={p.id} producto={p} />)}
              </div>
              <Paginacion pagina={pagina} paginas={resultado.paginas} onIr={(n) => fijar({ pagina: n > 1 ? String(n) : '' })} />
            </>
          )}
        </section>
      </div>

      <PanelLateral abierto={filtrosAbiertos} onCerrar={() => setFiltrosAbiertos(false)} titulo="Filtrar" lado="end" id="fct-panel-filtros"
        pie={(
          <button type="button" className="fct-btn-primario w-100" onClick={() => setFiltrosAbiertos(false)}>
            {resultado ? `Ver ${resultado.total} ${resultado.total === 1 ? 'producto' : 'productos'}` : 'Ver productos'}
          </button>
        )}>
        <Filtros ofertas={ofertas} desde={desde} hasta={hasta} matriz={matriz} fijar={fijar} />
      </PanelLateral>
    </div>
  );
}

// Bloques de filtros. Se usan en la columna de escritorio y en el panel lateral de celular.
function Filtros({ ofertas, desde, hasta, matriz, fijar }) {
  return (
    <>
      <div className="fct-filtro">
        <h2>Ofertas</h2>
        <label className="fct-check">
          <input type="checkbox" checked={ofertas} onChange={(e) => fijar({ ofertas: e.target.checked ? '1' : '' })} />
          Con descuento
        </label>
      </div>
      <FiltroPrecio desde={desde} hasta={hasta} onAplicar={(d, h) => fijar({ desde: d, hasta: h })} />
      <div className="fct-filtro fct-filtro-nota">
        <h2>Retiro</h2>
        <p><i className="bi bi-shop" aria-hidden="true" />Todo lo que ves tiene stock hoy {matriz ? `en ${matriz.nombre}` : 'en la farmacia'}.</p>
      </div>
    </>
  );
}

function SelectorOrden({ orden, onCambiar }) {
  return (
    <select className="fct-select" aria-label="Ordenar por" value={orden} onChange={(e) => onCambiar(e.target.value)}>
      {ORDENES.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
    </select>
  );
}

const rangoTexto = (d, h) => (d != null && h != null ? `${money(d)} a ${money(h)}` : d != null ? `Desde ${money(d)}` : `Hasta ${money(h)}`);

// Rango de precio: se aplica al presionar Aplicar (o Enter), no en cada tecla.
function FiltroPrecio({ desde, hasta, onAplicar }) {
  const [d, setD] = useState(desde ?? '');
  const [h, setH] = useState(hasta ?? '');
  useEffect(() => { setD(desde ?? ''); setH(hasta ?? ''); }, [desde, hasta]);
  const limpio = (v) => v.replace(/\D/g, '').slice(0, 7);
  const invertido = d !== '' && h !== '' && Number(d) > Number(h);
  return (
    <form className="fct-filtro" onSubmit={(e) => { e.preventDefault(); if (!invertido) onAplicar(d, h); }}>
      <h2>Precio</h2>
      <div className="fct-rango">
        <input inputMode="numeric" placeholder="Desde $" aria-label="Precio desde" value={d} onChange={(e) => setD(limpio(e.target.value))} />
        <input inputMode="numeric" placeholder="Hasta $" aria-label="Precio hasta" value={h} onChange={(e) => setH(limpio(e.target.value))} />
      </div>
      {invertido && <small className="fct-error">El precio desde no puede ser mayor que el precio hasta.</small>}
      <button type="submit" className="fct-btn-borde" disabled={invertido}>Aplicar</button>
    </form>
  );
}

// Páginas: primera, actual ±1 y última, con puntos suspensivos entre medio.
function Paginacion({ pagina, paginas, onIr }) {
  if (paginas <= 1) return null;
  const numeros = [...new Set([1, pagina - 1, pagina, pagina + 1, paginas])].filter((n) => n >= 1 && n <= paginas).sort((a, b) => a - b);
  return (
    <nav className="fct-paginas" aria-label="Páginas">
      <button type="button" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => onIr(pagina - 1)}><i className="bi bi-chevron-left" /></button>
      {numeros.map((n, i) => (
        <span key={n} className="fct-paginas-grupo">
          {i > 0 && n - numeros[i - 1] > 1 && <span className="fct-paginas-salto">…</span>}
          <button type="button" className={n === pagina ? 'activa' : ''} aria-current={n === pagina ? 'page' : undefined} onClick={() => onIr(n)}>{n}</button>
        </span>
      ))}
      <button type="button" aria-label="Página siguiente" disabled={pagina >= paginas} onClick={() => onIr(pagina + 1)}><i className="bi bi-chevron-right" /></button>
    </nav>
  );
}
