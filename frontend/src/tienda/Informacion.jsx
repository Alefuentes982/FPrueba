import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FARMACIA, FUNCIONES } from './contenido.js';
import { Migas } from './comunes.jsx';
import { useDatosTienda } from './DatosTienda.jsx';
import { prefiereMenosMovimiento } from './ui/movimiento.js';

// Página de ayuda: farmacia y horario, cómo comprar (guía de compra, HU-84), retiro, despacho, seguimiento, receta y
// pago. Los enlaces de la portada y del pie llegan a cada sección por su ancla (#retiro, #despacho...).
export default function Informacion() {
  const { hash } = useLocation();
  const { sucursales } = useDatosTienda();

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth', block: 'start' });
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
          {FUNCIONES.despacho && <a href="#despacho">Despacho a domicilio</a>}
          {FUNCIONES.seguimiento && <a href="#seguimiento">Sigue tu pedido</a>}
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
            {FUNCIONES.checkout ? (
              <ol className="fct-guia-pasos">
                <li><b>Busca tus productos.</b> Escribe el nombre o entra a una categoría. Solo ves productos con stock en la farmacia.</li>
                <li><b>Agrégalos al carro.</b> En el carro ves el total con los descuentos por cantidad que correspondan{FUNCIONES.despacho ? ' y el costo del despacho a tu comuna' : ''}.</li>
                <li><b>Ingresa o crea tu cuenta.</b> Te pedimos nombre, RUT, teléfono y correo. Confirma tu correo con el enlace que te enviamos.</li>
                <li><b>Elige cómo recibirlo.</b> Retiro en farmacia, sin costo, o despacho a domicilio con el costo de tu comuna.</li>
                <li><b>Reserva y paga con Webpay.</b> Guardamos tus productos 20 minutos mientras pagas con tarjeta de débito o crédito.</li>
                <li><b>Sigue tu pedido.</b> Te avisamos por correo cuando lo pagas, cuando está listo para retirar o va en camino, y cuando se entrega.</li>
              </ol>
            ) : (
              <ol>
                <li>Busca el producto por su nombre o entra a una categoría. Solo ves productos con stock en la farmacia.</li>
                <li>Agrégalo al carro. En el carro ves el total con los descuentos que correspondan.</li>
                <li>El pago en línea se habilita pronto. Por ahora puedes armar tu carro y comprar en la farmacia.</li>
              </ol>
            )}
            <Link to="/tienda/productos" className="fct-btn-borde">Ver productos</Link>
          </section>

          <section id="retiro" className="fct-info-seccion">
            <h2>Retiro en farmacia</h2>
            <p>
              El retiro no tiene costo. Los pedidos pagados antes de las {FARMACIA.horaCorteRetiro} quedan listos el mismo día;
              los posteriores, al día siguiente. Para retirar, presenta tu número de pedido y el RUT de quien compró.
            </p>
          </section>

          {FUNCIONES.despacho && (
            <section id="despacho" className="fct-info-seccion">
              <h2>Despacho a domicilio</h2>
              <p>
                El costo depende de tu comuna: elígela en la barra superior y lo verás en cada producto, en el carro y en el
                resumen antes de pagar. Si tu comuna aún no tiene despacho, puedes retirar en la farmacia sin costo.
              </p>
              <p>Para despacharte, una sola farmacia debe tener todo tu pedido. Si no, te lo indicamos en el checkout.</p>
            </section>
          )}

          {FUNCIONES.seguimiento && (
            <section id="seguimiento" className="fct-info-seccion">
              <h2>Sigue tu pedido</h2>
              <p>
                En <Link to="/tienda/pedido">Mis pedidos</Link> ves cada compra, en qué paso va (pagado, preparando, listo para
                retirar o en camino, entregado) y puedes descargar el comprobante.
              </p>
              <p>
                Un pedido sin pagar se anula solo a los 20 minutos y los productos vuelven a la
                tienda; no se hace ningún cargo. También puedes anularlo tú antes de pagar.
              </p>
            </section>
          )}

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
              <p>
                Si el pago se rechaza o lo anulas en Webpay, tu pedido sigue reservado y puedes intentar de nuevo mientras quede
                tiempo. Si la farmacia no puede entregar un pedido pagado, lo anula y te devuelve el dinero por Webpay.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
