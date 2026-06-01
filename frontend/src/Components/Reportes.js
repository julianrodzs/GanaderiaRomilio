import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { obtenerResumenReportes } from '../services/api';

const formatearNumero = (valor) => new Intl.NumberFormat('es-CR').format(Math.round(valor || 0));

const formatearMoneda = (valor) => new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  maximumFractionDigits: 0
}).format(valor || 0);

const formatearFecha = (fecha) => {
  if (!fecha) return '--';
  return new Date(fecha).toLocaleDateString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const nombreMes = (mes) => {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return meses[(mes || 1) - 1] || '--';
};

const BarraReporte = ({ label, valor, detalle, maximo }) => {
  const porcentaje = maximo ? Math.max((valor / maximo) * 100, 4) : 0;

  return (
    <article className="reporte-barra">
      <div>
        <strong>{label}</strong>
        <span>{detalle}</span>
      </div>
      <div className="barra-base">
        <span style={{ width: `${porcentaje}%` }} />
      </div>
    </article>
  );
};

const obtenerMaximo = (items, campo) => Math.max(...items.map((item) => item[campo] || 0), 0);

const Reportes = () => {
  const [filtros, setFiltros] = useState({ fechaInicio: '', fechaFin: '' });
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargarReportes = useCallback(async () => {
    try {
      setCargando(true);
      setError('');
      const data = await obtenerResumenReportes(filtros);
      setReporte(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => {
    cargarReportes();
  }, [cargarReportes]);

  const egresos = useMemo(() => {
    return reporte?.finanzas?.porNaturaleza?.find((item) => item.naturaleza === 'Egreso')?.total || 0;
  }, [reporte]);

  const ingresos = useMemo(() => {
    return reporte?.finanzas?.porNaturaleza?.find((item) => item.naturaleza === 'Ingreso')?.total || 0;
  }, [reporte]);

  const maxCategoria = obtenerMaximo(reporte?.finanzas?.porCategoria || [], 'total');
  const maxMes = obtenerMaximo(reporte?.finanzas?.porMes || [], 'total');

  return (
    <section className="reportes-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Estadisticas</p>
          <h2>Reportes de la finca</h2>
        </div>
        <button className="boton-primario compacto" type="button" onClick={cargarReportes} disabled={cargando}>
          {cargando ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      <section className="reportes-filtros">
        <label>
          Desde
          <input
            type="date"
            value={filtros.fechaInicio}
            onChange={(evento) => setFiltros((actual) => ({ ...actual, fechaInicio: evento.target.value }))}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={filtros.fechaFin}
            onChange={(evento) => setFiltros((actual) => ({ ...actual, fechaFin: evento.target.value }))}
          />
        </label>
      </section>

      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && <div className="estado-importacion">Cargando reportes...</div>}

      {reporte && (
        <>
          <section className="reportes-metricas">
            <article>
              <span>Total animales</span>
              <strong>{formatearNumero(reporte.inventario.totalAnimales)}</strong>
              <small>Peso promedio: {formatearNumero(reporte.inventario.pesoPromedio)} kg</small>
            </article>
            <article>
              <span>Potreros</span>
              <strong>{formatearNumero(reporte.potreros.totalPotreros)}</strong>
              <small>{reporte.potreros.rotacionesActivas.length} rotaciones activas</small>
            </article>
            <article>
              <span>Egresos</span>
              <strong>{formatearMoneda(egresos)}</strong>
              <small>Segun rango de fechas</small>
            </article>
            <article>
              <span>Ingresos</span>
              <strong>{formatearMoneda(ingresos)}</strong>
              <small>Segun rango de fechas</small>
            </article>
            <article>
              <span>Conteos drone</span>
              <strong>{formatearNumero(reporte.drone.totalConteos)}</strong>
              <small>Segun rango de fechas</small>
            </article>
          </section>

          <section className="reportes-grid">
            <article className="reporte-panel">
              <p className="eyebrow">Inventario</p>
              <h2>Distribucion del ganado</h2>
              {(reporte.inventario.porSexo || []).map((item) => (
                <BarraReporte
                  key={item.sexo}
                  label={item.sexo}
                  valor={item.cantidad}
                  detalle={`${item.cantidad} animales`}
                  maximo={reporte.inventario.totalAnimales}
                />
              ))}
              {(reporte.inventario.porEstado || []).map((item) => (
                <BarraReporte
                  key={item.estado}
                  label={item.estado}
                  valor={item.cantidad}
                  detalle={`${item.cantidad} registros`}
                  maximo={reporte.inventario.totalAnimales}
                />
              ))}
            </article>

            <article className="reporte-panel">
              <p className="eyebrow">Finanzas</p>
              <h2>Gastos por categoria</h2>
              {(reporte.finanzas.porCategoria || []).map((item) => (
                <BarraReporte
                  key={item.categoria}
                  label={item.categoria}
                  valor={item.total}
                  detalle={`${formatearMoneda(item.total)} · ${item.cantidad} registros`}
                  maximo={maxCategoria}
                />
              ))}
            </article>

            <article className="reporte-panel reporte-panel-amplio">
              <p className="eyebrow">Finanzas</p>
              <h2>Movimientos por mes</h2>
              <div className="reportes-meses">
                {(reporte.finanzas.porMes || []).map((item) => (
                  <BarraReporte
                    key={`${item.anio}-${item.mes}`}
                    label={`${nombreMes(item.mes)} ${item.anio}`}
                    valor={item.total}
                    detalle={`${formatearMoneda(item.total)} · ${item.cantidad} movimientos`}
                    maximo={maxMes}
                  />
                ))}
              </div>
            </article>

            <article className="reporte-panel">
              <p className="eyebrow">Sanidad</p>
              <h2>Alertas sanitarias</h2>
              {reporte.sanidad.alertas.length === 0 && <span className="reporte-vacio">Sin alertas sanitarias.</span>}
              {reporte.sanidad.alertas.map((plan) => (
                <div className="reporte-lista-item" key={plan._id}>
                  <strong>{plan.actividad}</strong>
                  <span>{plan.grupoGanado} · {plan.estado} · {formatearFecha(plan.proximaAplicacion)}</span>
                </div>
              ))}
            </article>

            <article className="reporte-panel">
              <p className="eyebrow">Potreros</p>
              <h2>Rotaciones activas</h2>
              {reporte.potreros.rotacionesActivas.length === 0 && <span className="reporte-vacio">Sin rotaciones activas.</span>}
              {reporte.potreros.rotacionesActivas.map((rotacion) => (
                <div className="reporte-lista-item" key={rotacion._id}>
                  <strong>{rotacion.potrero?.codigo || '--'} {rotacion.potrero?.nombre || ''}</strong>
                  <span>{rotacion.lote || 'Sin lote'} · {formatearFecha(rotacion.fechaEntrada)} · {rotacion.numeroAnimales || 0} animales</span>
                </div>
              ))}
            </article>
          </section>
        </>
      )}
    </section>
  );
};

export default Reportes;
