import { useState } from 'react';
import { api, qs } from '../../api.js';
import { Slot } from '../../extensiones.jsx';
import { fechaCorta, hoyIso, money } from '../../format.js';
import Barras from '../../components/Barras.jsx';
import FiltroFechas from '../../components/FiltroFechas.jsx';
import Kpi from '../../components/Kpi.jsx';
import { ErrorAlert, PageHeader, Spinner, useAsync } from '../../components/ui.jsx';
import TablaInforme from './TablaInforme.jsx';

const diaCorto = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

function Ventas({ filtros }) {
  return (
    <>
      <TablaInforme id="ventas-diarias" titulo="Ventas por día" params={filtros} plegable
        antes={(d) => <div className="mb-2"><Barras datos={d.filas.map((f) => ({ etiqueta: diaCorto(f.fecha), valor: f.neto }))} /></div>} />
      <div className="row">
        <div className="col-lg-6"><TablaInforme id="ventas-por-canal" titulo="Por canal" params={filtros} /></div>
        <div className="col-lg-6"><TablaInforme id="ventas-por-medio" titulo="Por medio de pago" params={filtros} /></div>
        <div className="col-lg-6"><TablaInforme id="ventas-por-categoria" titulo="Por categoría" params={filtros} /></div>
        <div className="col-lg-6"><TablaInforme id="ventas-por-sucursal" titulo="Por sucursal" params={filtros} /></div>
      </div>
      <TablaInforme id="top-productos" titulo="Los 10 productos más vendidos" params={{ ...filtros, limite: 10 }} />
    </>
  );
}

function Inventario({ sucursal, resumen }) {
  const [dias, setDias] = useState(60);
  const i = resumen.inventario;
  const filtros = { sucursal_id: sucursal };
  return (
    <>
      <div className="row g-2 mb-3">
        <Kpi titulo="Inventario al costo" valor={money(i.valor_inventario)} sub={i.valor_vencido ? `${money(i.valor_vencido)} ya vencido` : 'sin vencidos'} />
        <Kpi titulo="Bajo el stock mínimo" valor={i.bajo_minimo} clase={i.bajo_minimo ? 'text-danger' : 'text-success'} sub="productos por reponer" />
        <Kpi titulo="Vencen en 30 días" valor={i.lotes_por_vencer} clase={i.lotes_por_vencer ? 'text-warning' : ''} sub="lotes" />
        <Kpi titulo="Lotes vencidos" valor={i.lotes_vencidos} clase={i.lotes_vencidos ? 'text-danger' : ''} sub="con existencias" />
      </div>
      <TablaInforme id="stock-bajo-minimo" titulo="Stock bajo el mínimo" params={filtros} vacio="Ningún producto bajo su mínimo." />
      <div className="d-flex align-items-center gap-2 mb-2">
        <span className="small text-muted">Lotes que vencen en los próximos</span>
        <select className="form-select form-select-sm w-auto" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          {[30, 60, 90, 180].map((d) => <option key={d} value={d}>{d} días</option>)}
        </select>
      </div>
      <TablaInforme id="lotes-por-vencer" titulo="Lotes por vencer o vencidos" params={{ ...filtros, dias }} vacio="Sin lotes por vencer en ese plazo." />
      <TablaInforme id="inventario-valorizado" titulo="Inventario valorizado" params={filtros} />
    </>
  );
}

function Compras({ filtros, sucursal, resumen }) {
  const c = resumen.compras;
  return (
    <>
      <div className="row g-2 mb-3">
        <Kpi titulo="Comprado en el período" valor={money(c.total_comprado)} sub={`${c.ordenes} orden(es) emitida(s)`} />
        <Kpi titulo="Órdenes por recibir" valor={c.por_recibir} sub="pendientes o parciales" />
        <Kpi titulo="Atrasadas" valor={c.atrasadas} clase={c.atrasadas ? 'text-danger' : 'text-success'} sub="pasada la fecha esperada" />
      </div>
      <TablaInforme id="compras-por-proveedor" titulo="Compras por proveedor" params={filtros} />
      <TablaInforme id="ordenes-pendientes" titulo="Órdenes por recibir" params={{ sucursal_id: sucursal }} vacio="No hay órdenes pendientes de recepción." />
    </>
  );
}

export default function Dashboard() {
  const [fechas, setFechas] = useState({ desde: hoyIso(-29), hasta: hoyIso() });
  const [sucursal, setSucursal] = useState('');
  const [pestana, setPestana] = useState('ventas');
  const rangoInvalido = fechas.desde && fechas.hasta && fechas.desde > fechas.hasta;
  const filtros = { ...fechas, sucursal_id: sucursal };
  const catalogos = useAsync(() => api.get('/catalogos'), []);
  const resumen = useAsync(() => (rangoInvalido ? Promise.resolve(null) : api.get(`/dashboard/resumen${qs(filtros)}`)), [fechas.desde, fechas.hasta, sucursal]);
  const r = resumen.data;
  const v = r?.ventas;
  const pestanas = [['ventas', 'Ventas', true], ['inventario', 'Inventario', r?.inventario], ['compras', 'Compras', r?.compras]].filter((p) => p[2]);
  const activa = pestanas.some((p) => p[0] === pestana) ? pestana : 'ventas';

  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <FiltroFechas desde={fechas.desde} hasta={fechas.hasta} onChange={setFechas} />
        <select className="form-select form-select-sm w-auto" value={sucursal} onChange={(e) => setSucursal(e.target.value)} aria-label="Sucursal">
          <option value="">Todas las sucursales</option>
          {catalogos.data?.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </div>
      {rangoInvalido && <div className="alert alert-warning py-2">La fecha "desde" no puede ser posterior a "hasta".</div>}
      <ErrorAlert error={resumen.error} />
      {fechas.desde && fechas.hasta && !rangoInvalido && (
        <p className="small text-muted">Período: {fechaCorta(`${fechas.desde}T12:00:00`)} al {fechaCorta(`${fechas.hasta}T12:00:00`)}. Las ventas se muestran netas de devoluciones.</p>
      )}

      {resumen.loading && !r ? <Spinner /> : r && (
        <>
          <div className="row g-2 mb-2">
            <Kpi titulo="Ventas netas" valor={money(v.ventas_netas)} sub={`${money(v.total_ventas)} vendido − ${money(v.total_devoluciones)} devuelto`} />
            <Kpi titulo="Ventas" valor={v.ventas} sub={`ticket promedio ${money(v.ticket_promedio)}`} />
            <Kpi titulo="Unidades vendidas" valor={v.unidades} />
            <Kpi titulo="Devoluciones" valor={v.devoluciones} clase={v.devoluciones ? 'text-danger' : ''} sub={v.devoluciones ? money(v.total_devoluciones) : 'sin devoluciones'} />
            {!rangoInvalido && <Slot nombre="dashboard.tarjetas" desde={fechas.desde} hasta={fechas.hasta} sucursalId={sucursal} />}
          </div>
          <ul className="nav nav-tabs my-3">
            {pestanas.map(([clave, nombre]) => (
              <li className="nav-item" key={clave}>
                <button className={`nav-link ${activa === clave ? 'active' : ''}`} onClick={() => setPestana(clave)}>{nombre}</button>
              </li>
            ))}
          </ul>
          {!rangoInvalido && activa === 'ventas' && <Ventas filtros={filtros} />}
          {activa === 'inventario' && <Inventario sucursal={sucursal} resumen={r} />}
          {!rangoInvalido && activa === 'compras' && <Compras filtros={filtros} sucursal={sucursal} resumen={r} />}
        </>
      )}
    </>
  );
}
