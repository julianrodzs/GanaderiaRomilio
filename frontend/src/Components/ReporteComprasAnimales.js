import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { obtenerReporteComprasAnimales } from '../services/api';

const formatearNumero = (valor, decimales = 0) => new Intl.NumberFormat('es-CR', {
  maximumFractionDigits: decimales
}).format(valor || 0);

const formatearMoneda = (valor) => new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  maximumFractionDigits: 0
}).format(valor || 0);

const formatearPorcentaje = (valor) => `${formatearNumero(valor, 2)}%`;
const formatearFecha = (fecha) => fecha
  ? new Date(fecha).toLocaleDateString('es-CR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  : '--';

const nombreMes = (mes) => ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][(mes || 1) - 1];

const LineaPrecioCompra = ({ datos = [] }) => {
  if (!datos.length) return <span className="reporte-vacio">Sin compras para construir la tendencia.</span>;

  const valores = datos.map((item) => Number(item.precioEfectivoKg || 0));
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const rango = Math.max(maximo - minimo, 1);
  const puntos = datos.map((item, indice) => ({
    ...item,
    x: datos.length === 1 ? 50 : 7 + (indice / (datos.length - 1)) * 86,
    y: 83 - ((Number(item.precioEfectivoKg || 0) - minimo) / rango) * 65
  }));

  return (
    <div className="compras-linea-precio">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Evolución del precio efectivo por kilogramo">
        <polyline
          points={puntos.map((punto) => `${punto.x},${punto.y}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
        {puntos.map((punto) => (
          <circle key={punto.clave} cx={punto.x} cy={punto.y} r="2" vectorEffect="non-scaling-stroke">
            <title>{nombreMes(punto.mes)} {punto.anio}: {formatearMoneda(punto.precioEfectivoKg)}/kg</title>
          </circle>
        ))}
      </svg>
      <div className="compras-grafico-etiquetas">
        {puntos.map((punto) => <span key={punto.clave}>{nombreMes(punto.mes)} {punto.anio}</span>)}
      </div>
      <div className="compras-grafico-resumen">
        <span>Mínimo: <strong>{formatearMoneda(minimo)}/kg</strong></span>
        <span>Máximo: <strong>{formatearMoneda(maximo)}/kg</strong></span>
      </div>
    </div>
  );
};

const DispersionPesoPrecio = ({ puntos = [] }) => {
  if (!puntos.length) return <span className="reporte-vacio">Sin animales con peso y precio válidos.</span>;

  const pesos = puntos.map((item) => Number(item.pesoCompraKg || 0));
  const precios = puntos.map((item) => Number(item.precioEfectivoKg || 0));
  const pesoMin = Math.min(...pesos);
  const pesoMax = Math.max(...pesos);
  const precioMin = Math.min(...precios);
  const precioMax = Math.max(...precios);
  const rangoPeso = Math.max(pesoMax - pesoMin, 1);
  const rangoPrecio = Math.max(precioMax - precioMin, 1);

  return (
    <div className="compras-dispersion">
      <svg viewBox="0 0 100 100" aria-label="Relación entre peso de entrada y precio efectivo por kilogramo">
        <line x1="10" y1="88" x2="96" y2="88" />
        <line x1="10" y1="8" x2="10" y2="88" />
        {puntos.map((punto, indice) => {
          const x = 10 + ((punto.pesoCompraKg - pesoMin) / rangoPeso) * 84;
          const y = 86 - ((punto.precioEfectivoKg - precioMin) / rangoPrecio) * 75;
          return (
            <circle
              className={punto.sexo === 'Macho' ? 'punto-macho' : 'punto-hembra'}
              key={`${punto.animalId || punto.identificador}-${indice}`}
              cx={x}
              cy={y}
              r="2.2"
            >
              <title>
                {punto.identificador} · {punto.sexo} · {formatearNumero(punto.pesoCompraKg, 2)} kg · {formatearMoneda(punto.precioEfectivoKg)}/kg · {punto.proveedor}
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="compras-dispersion-ejes">
        <span>{formatearNumero(pesoMin, 2)} kg</span>
        <strong>Peso de entrada</strong>
        <span>{formatearNumero(pesoMax, 2)} kg</span>
      </div>
      <div className="compras-dispersion-leyenda">
        <span><i className="punto-macho" /> Machos</span>
        <span><i className="punto-hembra" /> Hembras</span>
        <span>{formatearMoneda(precioMin)} a {formatearMoneda(precioMax)}/kg</span>
      </div>
    </div>
  );
};

const filtrosIniciales = { sexo: '', proveedor: '', raza: '' };

const ReporteComprasAnimales = ({ fechaInicio, fechaFin, especie }) => {
  const [filtrosEdicion, setFiltrosEdicion] = useState(filtrosIniciales);
  const [filtrosAplicados, setFiltrosAplicados] = useState(filtrosIniciales);
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargarReporte = useCallback(async () => {
    try {
      setCargando(true);
      setError('');
      const data = await obtenerReporteComprasAnimales({
        fechaInicio,
        fechaFin,
        especie: especie === 'Todos' ? '' : especie,
        ...filtrosAplicados
      });
      setReporte(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [fechaInicio, fechaFin, especie, filtrosAplicados]);

  useEffect(() => {
    cargarReporte();
  }, [cargarReporte]);

  const maximoInversionMensual = useMemo(() => Math.max(
    ...(reporte?.porMes || []).map((item) => item.montoTotal || 0),
    0
  ), [reporte]);

  const aplicarFiltros = (evento) => {
    evento.preventDefault();
    setFiltrosAplicados({ ...filtrosEdicion });
  };

  const limpiarFiltros = () => {
    setFiltrosEdicion(filtrosIniciales);
    setFiltrosAplicados(filtrosIniciales);
  };

  return (
    <section className="reporte-compras-animales">
      <div className="partos-panel-header">
        <div>
          <p className="eyebrow">Compras</p>
          <h2>Análisis de compras de animales</h2>
          <p className="reporte-descripcion">Inversión de entrada y desempeño posterior de cada compra.</p>
        </div>
      </div>

      <form className="compras-reporte-filtros" onSubmit={aplicarFiltros}>
        <label>
          Sexo
          <select
            value={filtrosEdicion.sexo}
            onChange={(evento) => setFiltrosEdicion((actual) => ({ ...actual, sexo: evento.target.value }))}
          >
            <option value="">Todos</option>
            <option value="Hembra">Hembras</option>
            <option value="Macho">Machos</option>
          </select>
        </label>
        <label>
          Proveedor
          <input
            list="proveedores-compras-reporte"
            value={filtrosEdicion.proveedor}
            onChange={(evento) => setFiltrosEdicion((actual) => ({ ...actual, proveedor: evento.target.value }))}
            placeholder="Todos los proveedores"
          />
          <datalist id="proveedores-compras-reporte">
            {(reporte?.opcionesFiltros?.proveedores || []).map((proveedor) => <option value={proveedor} key={proveedor} />)}
          </datalist>
        </label>
        <label>
          Raza o línea
          <input
            list="razas-compras-reporte"
            value={filtrosEdicion.raza}
            onChange={(evento) => setFiltrosEdicion((actual) => ({ ...actual, raza: evento.target.value }))}
            placeholder="Todas las razas"
          />
          <datalist id="razas-compras-reporte">
            {(reporte?.opcionesFiltros?.razas || []).map((raza) => <option value={raza} key={raza} />)}
          </datalist>
        </label>
        <div className="compras-reporte-filtros-acciones">
          <button className="boton-secundario compacto" type="button" onClick={limpiarFiltros}>Limpiar</button>
          <button className="boton-primario compacto" type="submit">Aplicar</button>
        </div>
      </form>

      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && <div className="estado-importacion">Calculando compras y seguimiento...</div>}

      {!cargando && reporte && (
        <>
          <section className="reportes-metricas compras-reporte-metricas">
            <article><span>Total invertido</span><strong>{formatearMoneda(reporte.resumen.totalInvertido)}</strong><small>{reporte.resumen.totalCompras} compras confirmadas</small></article>
            <article><span>Animales comprados</span><strong>{formatearNumero(reporte.resumen.totalAnimales)}</strong><small>{formatearNumero(reporte.resumen.totalKg, 2)} kg ingresados</small></article>
            <article><span>Precio efectivo/kg</span><strong>{formatearMoneda(reporte.resumen.precioEfectivoKg)}</strong><small>{especie === 'Todos' ? 'Total combinado; compara por especie abajo' : 'Promedio ponderado por peso'}</small></article>
            <article><span>Costo por animal</span><strong>{formatearMoneda(reporte.resumen.costoPromedioAnimal)}</strong><small>{formatearNumero(reporte.resumen.pesoPromedioEntrada, 2)} kg de entrada promedio</small></article>
            <article><span>Ajuste final</span><strong>{formatearMoneda(reporte.resumen.ajusteMonto)}</strong><small>{formatearPorcentaje(reporte.resumen.porcentajeAjuste)} sobre el monto calculado</small></article>
            <article><span>Ganancia diaria</span><strong>{formatearNumero(reporte.resumen.gananciaDiariaPromedio, 3)} kg/día</strong><small>{reporte.resumen.animalesConSeguimientoPeso} animales con seguimiento</small></article>
          </section>

          {especie === 'Todos' && (
            <section className="reporte-panel reporte-panel-amplio">
              <p className="eyebrow">Especies</p>
              <h2>Bovinos y porcinos por separado</h2>
              <p className="reporte-nota">La inversión total sí puede sumarse, pero peso, precio/kg y crecimiento deben compararse dentro de cada especie.</p>
              <div className="compras-especie-grid">
                {(reporte.porEspecie || []).map((item) => (
                  <section key={item.especie}>
                    <h3>{item.especie === 'Bovino' ? 'Bovinos' : 'Porcinos'}</h3>
                    <strong>{formatearMoneda(item.montoTotal)}</strong>
                    <span>{item.animales} animales · {formatearNumero(item.pesoTotalKg, 2)} kg</span>
                    <span>{formatearMoneda(item.precioEfectivoKg)}/kg · {formatearNumero(item.pesoPromedio, 2)} kg de entrada</span>
                    <span>{item.hembras} hembras · {item.machos} machos</span>
                    <span>{formatearNumero(item.gananciaDiariaPromedio, 3)} kg/día · {formatearPorcentaje(item.tasaMortalidad)} mortalidad</span>
                  </section>
                ))}
              </div>
            </section>
          )}

          <section className="compras-analisis-grid">
            <article className="reporte-panel">
              <p className="eyebrow">Inversión</p>
              <h2>Compras por mes</h2>
              <div className="compras-barras-mensuales">
                {(reporte.porMes || []).map((item) => (
                  <div className="compras-barra-mes" key={item.clave}>
                    <div><strong>{nombreMes(item.mes)} {item.anio}</strong><span>{formatearMoneda(item.montoTotal)}</span></div>
                    <div className="barra-base"><span style={{ width: `${maximoInversionMensual ? Math.max((item.montoTotal / maximoInversionMensual) * 100, 3) : 0}%` }} /></div>
                    <small>{item.animales} animales · {formatearNumero(item.pesoTotalKg, 2)} kg</small>
                  </div>
                ))}
                {!reporte.porMes?.length && <span className="reporte-vacio">Sin compras para este rango.</span>}
              </div>
            </article>

            <article className="reporte-panel">
              <p className="eyebrow">Precio efectivo</p>
              <h2>Evolución del precio/kg</h2>
              {especie === 'Todos'
                ? <span className="reporte-vacio">Selecciona Bovinos o Porcinos en el selector superior para analizar la tendencia sin mezclar especies.</span>
                : <LineaPrecioCompra datos={reporte.porMes || []} />}
            </article>

            <article className="reporte-panel reporte-panel-amplio">
              <p className="eyebrow">Sexo</p>
              <h2>Valor y resultado por sexo</h2>
              <div className="compras-sexo-grid">
                {(reporte.porSexo || []).map((item) => (
                  <section key={item.sexo}>
                    <div className="compras-sexo-titulo">
                      <h3>{item.sexo}</h3>
                      <span>{formatearPorcentaje(item.porcentajeAnimales)} de los animales</span>
                    </div>
                    <dl>
                      <div><dt>Animales</dt><dd>{formatearNumero(item.animales)}</dd></div>
                      <div><dt>Inversión</dt><dd>{formatearMoneda(item.montoTotal)}</dd></div>
                      <div><dt>Peso entrada</dt><dd>{formatearNumero(item.pesoPromedio, 2)} kg</dd></div>
                      <div><dt>Precio efectivo</dt><dd>{formatearMoneda(item.precioEfectivoKg)}/kg</dd></div>
                      <div><dt>Ganancia diaria</dt><dd>{formatearNumero(item.gananciaDiariaPromedio, 3)} kg/día</dd></div>
                      <div><dt>Tratamiento 60 días</dt><dd>{formatearPorcentaje(item.tasaTratamientoTemprano)}</dd></div>
                      <div><dt>Mortalidad</dt><dd>{formatearPorcentaje(item.tasaMortalidad)}</dd></div>
                      <div><dt>Margen bruto vendidos</dt><dd>{formatearMoneda(item.margenBruto)}</dd></div>
                    </dl>
                  </section>
                ))}
                {!reporte.porSexo?.length && <span className="reporte-vacio">Sin información por sexo.</span>}
              </div>
            </article>

            <article className="reporte-panel reporte-panel-amplio">
              <p className="eyebrow">Proveedores</p>
              <h2>Costo de entrada y resultado posterior</h2>
              <div className="tabla-scroll tabla-dinamica compras-proveedores-tabla">
                <table>
                  <thead><tr><th>Proveedor</th><th>Compras</th><th>Animales</th><th>H / M</th><th>Peso prom.</th><th>Precio/kg</th><th>Inversión</th><th>Trat. 60 días</th><th>Mortalidad</th><th>Ganancia/día</th></tr></thead>
                  <tbody>
                    {(reporte.proveedores || []).map((item) => (
                      <tr key={item.proveedor}>
                        <td>{item.proveedor}</td><td>{item.compras}</td><td>{item.animales}</td><td>{item.hembras} / {item.machos}</td>
                        <td>{formatearNumero(item.pesoPromedio, 2)} kg</td><td>{formatearMoneda(item.precioEfectivoKg)}</td><td>{formatearMoneda(item.montoTotal)}</td>
                        <td>{formatearPorcentaje(item.tasaTratamientoTemprano)}</td><td>{formatearPorcentaje(item.tasaMortalidad)}</td><td>{formatearNumero(item.gananciaDiariaPromedio, 3)} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!reporte.proveedores?.length && <span className="reporte-vacio">Sin proveedores para comparar.</span>}
            </article>

            <article className="reporte-panel">
              <p className="eyebrow">Peso y precio</p>
              <h2>Precio según peso de entrada</h2>
              {especie === 'Todos'
                ? <span className="reporte-vacio">Selecciona una especie para relacionar pesos y precios comparables.</span>
                : <DispersionPesoPrecio puntos={reporte.puntosPesoPrecio || []} />}
            </article>

            <article className="reporte-panel">
              <p className="eyebrow">Rangos de peso</p>
              <h2>Resumen comparable</h2>
              {(reporte.rangosPeso || []).map((item) => (
                <div className="reporte-lista-item" key={item.clave}>
                  <strong>{especie === 'Todos' ? `${item.especie} · ` : ''}{item.rango}</strong>
                  <span>{item.animales} animales · {formatearNumero(item.pesoPromedio, 2)} kg promedio</span>
                  <span>{formatearMoneda(item.precioEfectivoKg)}/kg · {item.hembras} H / {item.machos} M</span>
                </div>
              ))}
              {!reporte.rangosPeso?.length && <span className="reporte-vacio">Sin rangos de peso para mostrar.</span>}
            </article>

            <article className="reporte-panel reporte-panel-amplio">
              <p className="eyebrow">Resultado posterior</p>
              <h2>Qué ocurrió con los animales comprados</h2>
              <div className="compras-resultado-grid">
                <div><strong>{reporte.resumen.activos}</strong><span>Activos</span></div>
                <div><strong>{reporte.resumen.vendidos}</strong><span>Vendidos</span></div>
                <div><strong>{reporte.resumen.muertos}</strong><span>Muertos · {formatearPorcentaje(reporte.resumen.tasaMortalidad)}</span></div>
                <div><strong>{reporte.resumen.tratadosPrimeros60Dias}</strong><span>Tratados en primeros 60 días · {formatearPorcentaje(reporte.resumen.tasaTratamientoTemprano)}</span></div>
                <div><strong>{formatearMoneda(reporte.resumen.margenBrutoVendidos)}</strong><span>Margen bruto de {reporte.resumen.animalesVendidosConMargen} vendidos</span></div>
              </div>
              <p className="reporte-nota">El margen bruto resta solamente el costo asignado de compra al monto de venta. No incluye alimentación, sanidad ni otros costos operativos.</p>
            </article>

            <article className="reporte-panel reporte-panel-amplio">
              <p className="eyebrow">Compras o lotes</p>
              <h2>Seguimiento por compra</h2>
              <div className="tabla-scroll tabla-dinamica compras-lotes-tabla">
                <table>
                  <thead><tr><th>Fecha</th><th>Especie</th><th>Proveedor</th><th>Animales</th><th>H / M</th><th>Peso</th><th>Precio/kg</th><th>Total</th><th>Ajuste</th><th>A / V / M</th><th>Trat. 60 días</th><th>Margen bruto</th></tr></thead>
                  <tbody>
                    {(reporte.compras || []).map((item) => (
                      <tr key={item.compraId}>
                        <td>{formatearFecha(item.fechaCompra)}</td><td>{item.especie}</td><td>{item.proveedor}</td><td>{item.animales}</td><td>{item.hembras} / {item.machos}</td>
                        <td>{formatearNumero(item.pesoTotalKg, 2)} kg</td><td>{formatearMoneda(item.precioEfectivoKg)}</td><td>{formatearMoneda(item.montoTotal)}</td><td>{formatearMoneda(item.ajusteMonto)}</td>
                        <td>{item.activos} / {item.vendidos} / {item.muertos}</td><td>{item.tratadosPrimeros60Dias}</td><td>{formatearMoneda(item.margenBruto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!reporte.compras?.length && <span className="reporte-vacio">No hay compras confirmadas con estos filtros.</span>}
            </article>
          </section>
        </>
      )}
    </section>
  );
};

export default ReporteComprasAnimales;
