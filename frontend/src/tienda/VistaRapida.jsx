import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { money } from '../format.js';
import { tiendaApi } from './apiTienda.js';
import Comprar from './Comprar.jsx';
import { EtiquetaDescuento, ImagenProducto, Precio } from './comunes.jsx';
import { LineasEsqueleto } from './ui/Esqueletos.jsx';
import Modal from './ui/Modal.jsx';

// Vista rápida de un producto desde su tarjeta (HU-95): foto, precio, ofertas, disponibilidad y compra, sin salir
// del listado. Con los datos de la tarjeta se muestra al instante; la descripción y la disponibilidad por sucursal
// llegan de la ficha (GET /api/tienda/productos/:id).
export default function VistaRapida({ producto, abierto, onCerrar }) {
  const [ficha, setFicha] = useState(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (!abierto) return undefined;
    let vigente = true;
    setFallo(false);
    tiendaApi.producto(producto.id).then((f) => vigente && setFicha(f)).catch(() => vigente && setFallo(true));
    return () => { vigente = false; };
  }, [abierto, producto.id]);

  const p = ficha ?? producto;
  const escalas = (ficha?.descuentos ?? []).filter((x) => x.desde > 1);
  const d = p.descuento;
  const rebajado = d?.precio_con_descuento != null;

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={`Vista rápida: ${producto.nombre}`} tituloVisible={false}>
      <div className="fct-rapida">
        <div className="fct-rapida-foto">
          <EtiquetaDescuento descuento={d} />
          <ImagenProducto producto={p} />
        </div>
        <div className="fct-rapida-info">
          <span className="fct-ficha-categoria">{p.categoria}</span>
          <h3>{p.nombre}</h3>
          {p.presentacion && <div className="fct-card-presentacion">{p.presentacion}</div>}
          <Precio producto={p} grande />
          {rebajado && <span className="fct-ahorro">Ahorras {money(p.precio - d.precio_con_descuento)}</span>}
          {escalas.map((x) => (
            <div key={`${x.desde}-${x.porcentaje}`} className="fct-escala">
              <i className="bi bi-tag" aria-hidden="true" />
              <span>Lleva <b>{x.desde}{x.hasta ? ` a ${x.hasta}` : ' o más'} y paga {x.porcentaje}% menos</b> por unidad</span>
            </div>
          ))}
          <div className="fct-rapida-descripcion">
            {ficha
              ? (ficha.descripcion ? <p>{ficha.descripcion}</p> : <p className="fct-suave">Este producto aún no tiene descripción.</p>)
              : (fallo ? null : <LineasEsqueleto lineas={3} />)}
          </div>
          {p.disponible > 0
            ? (
              <>
                <span className="fct-ok"><i className="bi bi-shop" aria-hidden="true" />
                  Disponible hoy{ficha?.sucursales?.[0] ? ` en ${ficha.sucursales[0].nombre}` : ''} · {p.disponible} {p.disponible === 1 ? 'unidad' : 'unidades'}
                </span>
                <Comprar producto={p} />
              </>
            )
            : <div className="fct-agotado"><i className="bi bi-x-circle" aria-hidden="true" />Agotado por ahora</div>}
          <Link to={`/tienda/producto/${producto.id}`} className="fct-rapida-ficha" onClick={onCerrar}>
            Ver ficha completa<i className="bi bi-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Modal>
  );
}
