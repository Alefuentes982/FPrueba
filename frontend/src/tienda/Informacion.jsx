import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FARMACIA, FUNCIONES } from './contenido.js';
import { Migas } from './comunes.jsx';
import { useDatosTienda } from './DatosTienda.jsx';

// Página de ayuda: farmacia y horario, cómo comprar, retiro, medicamentos con receta y pago. Los enlaces de la
// portada y del pie llegan a cada sección por su ancla (#retiro, #receta...).
export default function Informacion() {
  const { hash } = useLocation();
  const { sucursales } = useDatosTienda();

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, sucursales.length]);

  return (
    <div className="fct-wrap fct-pagina">
      <Migas pasos={[{ texto: 'Ayuda e información' }]} />
      <h1 className="fct-h1">Ayuda e información</h1>
      <div className="fct-info-pagina">
        <nav className="fct-info-indice" aria-label="Secciones">
          <a href="#farmacia">Farmacia y horario</a>
          <a href="#como-comprar">Cómo comprar</a>
          <a href="#retiro">Retiro en farmacia</a>
          <a href="#receta">Medicamentos con receta</a>
          {FUNCIONES.checkout && <a href="#pago">Medios de pago</a>}
        </nav>
        <div>
          <section id="farmacia" className="fct-info-seccion">
            <h2>Farmacia y horario</h2>
            {sucursales.map((s) => (
              <div key={s.id} className="fct-caja">
                <b><i className="bi bi-shop" aria-hidden="true" />{s.nombre}</b>
                <p>{[s.direccion, s.comuna, s.region].filter(Boolean).join(', ') || 'Dirección por confirmar'}</p>
                {s.telefono && <p>Teléfono: <a href={`tel:${s.telefono.replace(/\s/g, '')}`}>{s.telefono}</a></p>}
              </div>
            ))}
            <p><i className="bi bi-clock" aria-hidden="true" /> {FARMACIA.horario}.</p>
            {FARMACIA.ventaTelefonica && <p>Venta telefónica: <a href={`tel:${FARMACIA.ventaTelefonica.replace(/\s/g, '')}`}>{FARMACIA.ventaTelefonica}</a></p>}
          </section>

          <section id="como-comprar" className="fct-info-seccion">
            <h2>Cómo comprar</h2>
            <ol>
              <li>Busca el producto por su nombre o entra a una categoría. Solo ves productos con stock en la farmacia.</li>
              <li>Agrégalo al carro. En el carro ves el total con los descuentos que correspondan.</li>
              {FUNCIONES.checkout
                ? <><li>Continúa la compra, indica tus datos y paga con Webpay.</li><li>Te avisamos por correo cuando tu pedido esté listo.</li></>
                : <li>El pago en línea se habilita pronto. Por ahora puedes armar tu carro y comprar en la farmacia.</li>}
            </ol>
            <Link to="/tienda/productos" className="fct-btn-borde">Ver productos</Link>
          </section>

          <section id="retiro" className="fct-info-seccion">
            <h2>Retiro en farmacia</h2>
            <p>
              El retiro no tiene costo. Los pedidos pagados antes de las {FARMACIA.horaCorteRetiro} quedan listos el mismo día;
              los posteriores, al día siguiente. Para retirar, presenta tu número de pedido y el RUT de quien compró.
            </p>
          </section>

          <section id="receta" className="fct-info-seccion">
            <h2>Medicamentos con receta</h2>
            <p>
              En la tienda en línea vendemos solo productos de venta directa. Los medicamentos que exigen receta médica se
              venden en la farmacia, donde el químico farmacéutico revisa la receta.
            </p>
            <p>Lee siempre el envase y el folleto, respeta la dosis indicada y consulta ante cualquier duda.</p>
          </section>

          {FUNCIONES.checkout && (
            <section id="pago" className="fct-info-seccion">
              <h2>Medios de pago</h2>
              <p>Pagas con Webpay, con tarjeta de débito o de crédito. FarmaClick no recibe ni guarda los datos de tu tarjeta.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
