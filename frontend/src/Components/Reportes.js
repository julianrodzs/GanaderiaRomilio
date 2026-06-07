import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  obtenerFinanzasCria,
  obtenerProductividadCria,
  obtenerResumenReportes
} from '../services/api';

const formatearNumero = (valor) => new Intl.NumberFormat('es-CR').format(Math.round(valor || 0));

const formatearMoneda = (valor) => new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  maximumFractionDigits: 0
}).format(valor || 0);

const formatearPorcentaje = (valor) => `${new Intl.NumberFormat('es-CR', {
  maximumFractionDigits: 2
}).format(valor || 0)}%`;

const formatearFecha = (fecha) => {
  if (!fecha) return '--';
  return new Date(fecha).toLocaleDateString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const formatearEdadMeses = (meses) => {
  if (meses === null || meses === undefined) return '--';
  const anios = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;
  if (anios === 0) return `${mesesRestantes} meses`;
  if (mesesRestantes === 0) return `${anios} años`;
  return `${anios} años ${mesesRestantes} meses`;
};

const nombreMes = (mes) => {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return meses[(mes || 1) - 1] || '--';
};

const obtenerAnioActual = () => new Date().getFullYear();

const obtenerNivelIpg = (ipg) => {
  if (ipg >= 95) return 'excelente';
  if (ipg >= 85) return 'muy-bueno';
  if (ipg >= 75) return 'bueno';
  if (ipg >= 60) return 'regular';
  return 'deficiente';
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
  const [filtros, setFiltros] = useState({
    fechaInicio: `${obtenerAnioActual()}-01-01`,
    fechaFin: `${obtenerAnioActual()}-12-31`,
    diio: '',
    partosFechaInicio: `${obtenerAnioActual()}-01-01`,
    partosFechaFin: `${obtenerAnioActual()}-12-31`
  });
  const [reporte, setReporte] = useState(null);
  const [productividad, setProductividad] = useState(null);
  const [finanzasCria, setFinanzasCria] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargarReportes = useCallback(async () => {
    try {
      setCargando(true);
      setError('');
      const filtrosGenerales = {
        fechaInicio: filtros.fechaInicio,
        fechaFin: filtros.fechaFin
      };
      const filtrosPartos = {
        ...filtros,
        fechaInicio: filtros.partosFechaInicio || filtros.fechaInicio,
        fechaFin: filtros.partosFechaFin || filtros.fechaFin
      };
      const [data, productividadData, finanzasCriaData] = await Promise.all([
        obtenerResumenReportes(filtrosPartos),
        obtenerProductividadCria(filtrosGenerales),
        obtenerFinanzasCria(filtrosGenerales)
      ]);
      setReporte(data);
      setProductividad(productividadData);
      setFinanzasCria(finanzasCriaData);
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
            <article>
              <span>Partos registrados</span>
              <strong>{formatearNumero(reporte.reproduccion?.partos?.resumen?.totalPartos)}</strong>
              <small>{formatearNumero(reporte.reproduccion?.partos?.resumen?.vacasCumplen)} vacas cumplen</small>
            </article>
          </section>

          {productividad && (
            <section className="reporte-panel reporte-panel-amplio cria-panel">
              <div className="cria-panel-header">
                <div>
                  <p className="eyebrow">Productividad de cria</p>
                  <h2>Indice de Productividad Ganadera</h2>
                </div>
                <span className={`tarea-badge ipg-clasificacion ipg-${productividad.clasificacion?.toLowerCase().replaceAll(' ', '-')}`}>
                  {productividad.clasificacion}
                </span>
              </div>
              <div className="cria-productividad-grid">
                <article className={`ipg-card ipg-fondo-${obtenerNivelIpg(productividad.ipg)}`}>
                  <span>IPG</span>
                  <strong>{formatearNumero(productividad.ipg)}</strong>
                  <small>Escala de 0 a 100 enfocada en cria</small>
                </article>
                <BarraReporte
                  label="Natalidad"
                  valor={productividad.tasaNatalidad}
                  detalle={`${formatearPorcentaje(productividad.tasaNatalidad)} · ${productividad.ternerosNacidosPeriodo} nacimientos`}
                  maximo={100}
                />
                <BarraReporte
                  label="Destete"
                  valor={productividad.tasaDestete}
                  detalle={`${formatearPorcentaje(productividad.tasaDestete)} · ${productividad.ternerosDestetadosPeriodo} destetes`}
                  maximo={100}
                />
                <BarraReporte
                  label="Gestacion"
                  valor={productividad.tasaGestacion}
                  detalle={`${formatearPorcentaje(productividad.tasaGestacion)} · ${productividad.vacasGestantes} gestantes`}
                  maximo={100}
                />
                <BarraReporte
                  label="Supervivencia"
                  valor={productividad.tasaSupervivencia}
                  detalle={`${formatearPorcentaje(productividad.tasaSupervivencia)} · ${productividad.muertesPeriodo} muertes`}
                  maximo={100}
                />
              </div>
              <div className="cria-recomendaciones">
                <strong>Recomendaciones</strong>
                {(productividad.recomendaciones || []).map((recomendacion) => (
                  <span key={recomendacion}>{recomendacion}</span>
                ))}
              </div>
            </section>
          )}

          {finanzasCria && (
            <section className="reporte-panel reporte-panel-amplio">
              <p className="eyebrow">Finanzas de cria</p>
              <h2>Inversion, operacion y patrimonio</h2>
              <div className="reportes-metricas finanzas-cria-metricas">
                <article>
                  <span>Inversion acumulada</span>
                  <strong>{formatearMoneda(finanzasCria.inversionAcumulada)}</strong>
                  <small>Separada de los gastos operativos</small>
                </article>
                <article>
                  <span>Gastos operativos</span>
                  <strong>{formatearMoneda(finanzasCria.gastosOperativosPeriodo)}</strong>
                  <small>Segun rango de fechas</small>
                </article>
                <article>
                  <span>Ingresos</span>
                  <strong>{formatearMoneda(finanzasCria.ingresosPeriodo)}</strong>
                  <small>Ventas u otros ingresos</small>
                </article>
                <article>
                  <span>Balance operativo</span>
                  <strong>{formatearMoneda(finanzasCria.balanceOperativo)}</strong>
                  <small>Ingresos menos gastos operativos</small>
                </article>
                <article>
                  <span>Valor estimado del hato</span>
                  <strong>{formatearMoneda(finanzasCria.valorEstimadoHato)}</strong>
                  <small>Usa valor o peso/precio si existen</small>
                </article>
                <article>
                  <span>Crecimiento del hato</span>
                  <strong>{formatearNumero(finanzasCria.crecimientoHato)}</strong>
                  <small>{formatearNumero(finanzasCria.animalesInicioPeriodo)} inicio · {formatearNumero(finanzasCria.animalesActuales)} actuales</small>
                </article>
                <article>
                  <span>Patrimonio estimado</span>
                  <strong>{formatearMoneda(finanzasCria.patrimonioGanaderoEstimado)}</strong>
                  <small>Hato estimado mas inversion acumulada</small>
                </article>
              </div>
            </section>
          )}

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

            <article className="reporte-panel reporte-panel-amplio">
              <div className="partos-panel-header">
                <div>
                  <p className="eyebrow">Reproduccion</p>
                  <h2>Partos por vaca y año</h2>
                </div>
                <div className="partos-filtros">
                  <label>
                    Desde
                    <input
                      type="date"
                      value={filtros.partosFechaInicio}
                      onChange={(evento) => setFiltros((actual) => ({ ...actual, partosFechaInicio: evento.target.value }))}
                    />
                  </label>
                  <label>
                    Hasta
                    <input
                      type="date"
                      value={filtros.partosFechaFin}
                      onChange={(evento) => setFiltros((actual) => ({ ...actual, partosFechaFin: evento.target.value }))}
                    />
                  </label>
                  <label>
                    DIIO
                    <input
                      value={filtros.diio}
                      onChange={(evento) => setFiltros((actual) => ({ ...actual, diio: evento.target.value }))}
                      placeholder="Filtrar por DIIO"
                    />
                  </label>
                </div>
              </div>
              <div className="partos-resumen-grid">
                <article>
                  <span>Vacas con partos</span>
                  <strong>{formatearNumero(reporte.reproduccion.partos.resumen.vacasConPartos)}</strong>
                </article>
                <article>
                  <span>Cumplen objetivo</span>
                  <strong>{formatearNumero(reporte.reproduccion.partos.resumen.vacasCumplen)}</strong>
                </article>
                <article>
                  <span>Bajo objetivo</span>
                  <strong>{formatearNumero(reporte.reproduccion.partos.resumen.vacasBajoObjetivo)}</strong>
                </article>
                <article>
                  <span>Revisar</span>
                  <strong>{formatearNumero(reporte.reproduccion.partos.resumen.vacasRevisar)}</strong>
                </article>
              </div>

              {reporte.reproduccion.partos.porVaca.length === 0 && (
                <span className="reporte-vacio">Sin partos registrados para el filtro actual.</span>
              )}

              {reporte.reproduccion.partos.porVaca.length > 0 && (
                <div className="tabla-scroll tabla-dinamica partos-tabla">
                  <table>
                    <thead>
                      <tr>
                        <th>DIIO</th>
                        <th>Nombre</th>
                        <th>Edad</th>
                        {reporte.reproduccion.partos.anios.map((anio) => <th key={anio}>{anio}</th>)}
                        <th>Cantidad partos</th>
                        <th>Promedio anual</th>
                        <th>Ultimo parto</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reporte.reproduccion.partos.porVaca.map((vaca) => (
                        <tr key={vaca.animalId}>
                          <td>{vaca.diio}</td>
                          <td>{vaca.nombre || '--'}</td>
                          <td>{formatearEdadMeses(vaca.edadMeses)}</td>
                          {reporte.reproduccion.partos.anios.map((anio) => {
                            const cantidad = vaca.partosPorAnio[anio] || 0;
                            return (
                              <td key={anio}>
                                <span className={`parto-celda parto-celda-${cantidad === 1 ? 'ok' : cantidad > 1 ? 'revisar' : 'bajo'}`}>
                                  {cantidad}
                                </span>
                              </td>
                            );
                          })}
                          <td>{vaca.totalPartos}</td>
                          <td>{vaca.promedioAnual.toFixed(2)}</td>
                          <td>{formatearFecha(vaca.ultimoParto)}</td>
                          <td>
                            <span className={`tarea-badge tarea-estado-${vaca.estado === 'Cumple' ? 'completada' : vaca.estado === 'Revisar' ? 'vencida' : 'pendiente'}`}>
                              {vaca.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        </>
      )}
    </section>
  );
};

export default Reportes;
