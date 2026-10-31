import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { money } from '../format.js';
import { tiendaApi } from './apiTienda.js';
import { FUNCIONES } from './contenido.js';
import { Aviso, Cargando, EtiquetaDescuento, ImagenProducto, Migas } from './comunes.jsx';
import { enlaceCategoria } from './DatosTienda.jsx';
import TarjetaProducto from './TarjetaProducto.jsx';

const PESTANAS = ['Descripción', 'Ficha técnica', 'Aviso legal'];

// Ficha del producto: foto, precio con ofertas, disponibilidad por sucursal, pestañas y relacionados.
// Sin stock se muestra agotado.
export default function Ficha() {
  const { id } = useParams();
  const [producto, setProducto] = useState(null);
  const [error, setError] = useState(null);
  const [pestana, setPestana] = useState(PESTANAS[0]);

  useEffect(() => {
    let vigente = true;
    setProducto(null);
    setError(null);
    setPestana(PESTANAS[0]);
    tiendaApi.producto(id).then((p) => vigente && setProducto(p)).catch((e) => vigente && setError(e));
    return () => { vigente = false; };
  }, [id]);

  if (error) {
    return (
      <div className="fct-wrap fct-pagina">
        <Aviso error={[400, 404].includes(error.status) ? { message: 'Este producto no está disponible en la tienda.' } : error} />
        <Link to="/tienda/productos" className="fct-btn-borde">Ver todos los productos</Link>
      </div>
    );
  }
  if (!producto) return <Cargando />;

  const categoria = { id: producto.categoria_id, nombre: producto.categoria };
  const d = producto.descuento;
  const rebajado = d?.precio_con_descuento != null;
  const escalas = producto.descuentos.filter((x) => x.desde > 1);

  return (
    <div className="fct-wrap">
      <Migas pasos={[{ texto: producto.categoria, a: enlaceCategoria(categoria) }, { texto: producto.nombre }]} />
      <div className="fct-ficha">
        <div className="fct-ficha-foto">
          <EtiquetaDescuento descuento={d} />
          <ImagenProducto producto={producto} />
        </div>

        <div className="fct-ficha-info">
          <Link to={enlaceCategoria(categoria)} className="fct-ficha-categoria">{producto.categoria}</Link>
          <h1>{producto.nombre}</h1>
          <div className="fct-ficha-meta">
            <span>SKU {producto.sku}</span>
            {producto.presentacion && <span>{producto.presentacion}</span>}
            <span>{producto.condicion_venta}</span>
          </div>
          <div className="fct-sellos">
            {!producto.agotado && <span><i className="bi bi-shop" aria-hidden="true" />Retiro en farmacia</span>}
            {FUNCIONES.despacho && !producto.agotado && <span><i className="bi bi-truck" aria-hidden="true" />Despacho a domicilio</span>}
          </div>

          <div className="fct-ficha-precio">
            {rebajado && <div className="fct-precio-normal">Precio normal {money(producto.precio)}</div>}
            <div className="fct-ficha-precio-linea">
              <span className="fct-ficha-precio-final">{money(rebajado ? d.precio_con_descuento : producto.precio)}</span>
              {rebajado && <span className="fct-ahorro">Ahorras {money(producto.precio - d.precio_con_descuento)}</span>}
            </div>
            <p>Precio de venta en línea, IVA incluido.</p>
            {escalas.map((x) => (
              <div key={`${x.desde}-${x.porcentaje}`} className="fct-escala">
                <i className="bi bi-tag" aria-hidden="true" />
                <span>Lleva <b>{x.desde}{x.hasta ? ` a ${x.hasta}` : ' o más'} y paga {x.porcentaje}% menos</b> por unidad</span>
              </div>
            ))}
          </div>

          {producto.agotado && <div className="fct-agotado"><i className="bi bi-x-circle" aria-hidden="true" />Agotado por ahora</div>}

          <div className="fct-disponibilidad">
            {producto.sucursales.map((s) => (
              <div key={s.id} className="fct-caja">
                <b><i className="bi bi-shop" aria-hidden="true" />Retiro en {s.nombre}</b>
                {s.disponible > 0
                  ? <span className="fct-ok">Disponible hoy · {s.disponible} {s.disponible === 1 ? 'unidad' : 'unidades'}</span>
                  : <span className="fct-no">Sin stock en esta farmacia</span>}
                {(s.direccion || s.comuna) && <p>{[s.direccion, s.comuna].filter(Boolean).join(', ')}</p>}
              </div>
            ))}
          </div>
          <p className="fct-ficha-aviso"><i className="bi bi-shield-check" aria-hidden="true" />
            Lee las instrucciones del envase antes de usar. Ante cualquier duda, consulta al químico farmacéutico.
          </p>
        </div>
      </div>

      <div className="fct-pestanas" role="tablist">
        {PESTANAS.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={pestana === p} className={pestana === p ? 'activa' : ''} onClick={() => setPestana(p)}>{p}</button>
        ))}
      </div>
      <div className="fct-pestana" role="tabpanel">
        {pestana === 'Descripción' && (
          producto.descripcion ? <p className="fct-descripcion">{producto.descripcion}</p> : <p className="fct-suave">Este producto aún no tiene descripción.</p>
        )}
        {pestana === 'Ficha técnica' && (
          <dl className="fct-tabla">
            <div><dt>Código (SKU)</dt><dd>{producto.sku}</dd></div>
            {producto.presentacion && <div><dt>Presentación</dt><dd>{producto.presentacion}</dd></div>}
            <div><dt>Categoría</dt><dd>{producto.categoria}</dd></div>
            <div><dt>Condición de venta</dt><dd>{producto.condicion_venta}</dd></div>
          </dl>
        )}
        {pestana === 'Aviso legal' && (
          <p className="fct-suave">
            Los precios incluyen IVA y rigen solo para la venta en línea. Las imágenes son referenciales. Condición de
            venta: {producto.condicion_venta}. Ante cualquier duda sobre su uso, consulta a un profesional de la salud.
          </p>
        )}
      </div>

      <Relacionados producto={producto} />
    </div>
  );
}

// Otros productos de la misma categoría (los más vendidos).
function Relacionados({ producto }) {
  const [lista, setLista] = useState([]);
  useEffect(() => {
    tiendaApi.productos({ categoria_id: producto.categoria_id, limit: 6 })
      .then((r) => setLista(r.data.filter((p) => p.id !== producto.id).slice(0, 5)))
      .catch(() => setLista([]));
  }, [producto.id, producto.categoria_id]);
  if (lista.length === 0) return null;
  return (
    <section className="fct-seccion">
      <div className="fct-titulo-seccion">
        <h2>También te puede interesar</h2>
        <Link to={enlaceCategoria({ id: producto.categoria_id })}>Ver más de {producto.categoria}</Link>
      </div>
      <div className="fct-grilla fct-grilla-5">{lista.map((p) => <TarjetaProducto key={p.id} producto={p} />)}</div>
    </section>
  );
}
