import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  obtenerFinanzasCria,
  obtenerProductividadCria,
  obtenerReporteCamadas,
  obtenerReporteEconomicoCamadas,
  obtenerReporteProductosCombustibles,
  obtenerReporteProductosPorCategoria,
  obtenerReporteProductosPorProducto,
  obtenerReporteProductosProveedores,
  obtenerReporteProductosResumen,
  obtenerReporteCrecimientoPesajes,
  obtenerReporteReproductivoPorcino,
  obtenerReporteRazasBovinas,
  obtenerReporteDescendenciaBovina,
  obtenerReporteSanidad,
  obtenerReporteTareasCamadas,
  obtenerResumenVentas,
  obtenerResumenDestinosFinancieros,
  obtenerResumenReportes,
  obtenerSustentabilidadCria,
  obtenerVacasImproductivas
} from '../services/api';
import SelectorEspecie from './SelectorEspecie';
import ReporteComprasAnimales from './ReporteComprasAnimales';
import FeatureGate from './FeatureGate';
import UpgradeMessage from './UpgradeMessage';
import { usePlan } from '../context/PlanContext';
import ReporteIndicesProductivos from './ReporteIndicesProductivos';
import RendimientoPotreros from './RendimientoPotreros';
import PaginacionTabla, { ContenidoPaginado } from './PaginacionTabla';

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

const formatearCantidad = (valor, unidad) => {
  const numero = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(valor || 0);
  return `${numero}${unidad && unidad !== 'sin unidad' ? ` ${unidad}` : ''}`;
};

const formatearCantidadCompra = (cantidad, unidad) => {
  const numero = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(cantidad || 0);
  if (!unidad || unidad === 'sin unidad') return numero;
  return `${numero} x ${unidad}`;
};

const formatearCantidadFisica = (cantidad, unidadBase) => {
  if (!cantidad || !unidadBase || unidadBase === 'sin unidad') return '';
  return formatearCantidad(cantidad, unidadBase);
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

const totalizarDestino = (destino) => (destino.totales || []).reduce((total, item) => total + (item.total || 0), 0);

const LineaFinanzasMensual = ({ datos = [], maximo }) => {
  if (!datos.length) return <span className="reporte-vacio">Sin gastos para este rango.</span>;

  const maximoGrafico = maximo || obtenerMaximo(datos, 'total') || 1;
  const puntos = datos.map((item, indice) => {
    const x = datos.length === 1 ? 8 : 8 + (indice / (datos.length - 1)) * 84;
    const y = 86 - ((item.total || 0) / maximoGrafico) * 68;
    return { ...item, x, y };
  });
  const coordenadas = puntos.map((punto) => `${punto.x},${punto.y}`).join(' ');

  return (
    <div className="linea-finanzas">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Gastos por mes">
        <polyline points={coordenadas} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        {puntos.map((punto) => (
          <circle key={`${punto.anio}-${punto.mes}`} cx={punto.x} cy={punto.y} r="1.8" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="linea-finanzas-etiquetas">
        {puntos.map((punto) => (
          <span key={`${punto.anio}-${punto.mes}`}>{nombreMes(punto.mes)}</span>
        ))}
      </div>
      <div className="linea-finanzas-detalle">
        {puntos.map((punto) => (
          <article key={`${punto.anio}-${punto.mes}`}>
            <strong>{nombreMes(punto.mes)} {punto.anio}</strong>
            <span>{formatearMoneda(punto.total)} · {punto.cantidad} registros</span>
          </article>
        ))}
      </div>
    </div>
  );
};

const LineaPeso = ({ puntos = [] }) => {
  if (!puntos || puntos.length < 2) {
    return <span className="reporte-vacio">Se necesitan al menos dos pesajes.</span>;
  }

  const pesos = puntos.map((punto) => Number(punto.peso || 0));
  const minimo = Math.min(...pesos);
  const maximo = Math.max(...pesos);
  const rango = Math.max(maximo - minimo, 1);
  const coordenadas = puntos.map((punto, indice) => {
    const x = puntos.length === 1 ? 0 : (indice / (puntos.length - 1)) * 100;
    const y = 90 - ((Number(punto.peso || 0) - minimo) / rango) * 80;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="linea-peso" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Evolución de peso">
      <polyline points={coordenadas} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const Reportes = ({ usuario }) => {
  const { tieneFeature, puedeUsarEspecie } = usePlan();
  const [filtros, setFiltros] = useState({
    fechaInicio: `${obtenerAnioActual()}-01-01`,
    fechaFin: `${obtenerAnioActual()}-12-31`,
    diio: '',
    partosFechaInicio: `${obtenerAnioActual()}-01-01`,
    partosFechaFin: `${obtenerAnioActual()}-12-31`,
    mesesSinParto: '12',
    diasAbiertos: '120',
    pesoDesteteMin: '140',
    diasSinPesaje: '60',
    productoFiltro: '',
    categoriaProducto: '',
    proveedorProducto: ''
  });
  const [especie, setEspecie] = useState('Todos');
  const [reporte, setReporte] = useState(null);
  const [productividad, setProductividad] = useState(null);
  const [finanzasCria, setFinanzasCria] = useState(null);
  const [sustentabilidadCria, setSustentabilidadCria] = useState(null);
  const [vacasImproductivas, setVacasImproductivas] = useState(null);
  const [crecimientoPesajes, setCrecimientoPesajes] = useState(null);
  const [ventasReporte, setVentasReporte] = useState(null);
  const [productosReporte, setProductosReporte] = useState(null);
  const [porcinosReporte, setPorcinosReporte] = useState(null);
  const [destinosFinancieros, setDestinosFinancieros] = useState([]);
  const [sanidadReporte, setSanidadReporte] = useState(null);
  const [razasBovinas, setRazasBovinas] = useState(null);
  const [descendenciaBovina, setDescendenciaBovina] = useState(null);
  const [paginaProductos, setPaginaProductos] = useState(1);
  const [limiteProductos, setLimiteProductos] = useState(10);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const etiquetaId = 'DIIO';

  const cargarReportes = useCallback(async () => {
    try {
      setCargando(true);
      setError('');
      const incluirReportesPorcinos = especie !== 'Bovino' && puedeUsarEspecie('Porcino');
      const filtrosGenerales = {
        fechaInicio: filtros.fechaInicio,
        fechaFin: filtros.fechaFin,
        especie: especie === 'Todos' ? '' : especie
      };
      const filtrosPartosResumen = {
        partosFechaInicio: filtros.partosFechaInicio || filtros.fechaInicio,
        partosFechaFin: filtros.partosFechaFin || filtros.fechaFin,
        diio: filtros.diio
      };
      const filtrosImproductivas = {
        fechaInicio: filtros.partosFechaInicio || filtros.fechaInicio,
        fechaFin: filtros.partosFechaFin || filtros.fechaFin,
        diio: filtros.diio,
        mesesSinParto: filtros.mesesSinParto,
        diasAbiertos: filtros.diasAbiertos,
        pesoDesteteMin: filtros.pesoDesteteMin,
        especie: especie === 'Todos' ? '' : especie
      };
      const filtrosProductos = {
        fechaInicio: filtros.fechaInicio,
        fechaFin: filtros.fechaFin,
        producto: filtros.productoFiltro,
        categoria: filtros.categoriaProducto,
        proveedor: filtros.proveedorProducto,
        pagina: paginaProductos,
        limite: limiteProductos
      };
      const [
        data,
        productividadData,
        finanzasCriaData,
        sustentabilidadData,
        vacasImproductivasData,
        crecimientoData,
        ventasData,
        productosResumenData,
        productosPorProductoData,
        productosPorCategoriaData,
        productosCombustiblesData,
        productosProveedoresData,
        destinosFinancierosData,
        camadasData,
        reproduccionPorcinaData,
        tareasCamadasData,
        economiaCamadasData,
        sanidadData,
        razasBovinasData,
        descendenciaBovinaData
      ] = await Promise.all([
        obtenerResumenReportes({
          ...filtrosGenerales,
          ...filtrosPartosResumen
        }),
        tieneFeature('analiticaProductiva') ? obtenerProductividadCria(filtrosGenerales) : Promise.resolve(null),
        tieneFeature('analiticaEconomica') ? obtenerFinanzasCria(filtrosGenerales) : Promise.resolve(null),
        tieneFeature('analiticaEconomica') ? obtenerSustentabilidadCria(filtrosGenerales) : Promise.resolve(null),
        tieneFeature('analiticaProductiva') ? obtenerVacasImproductivas(filtrosImproductivas) : Promise.resolve(null),
        tieneFeature('analiticaProductiva') ? obtenerReporteCrecimientoPesajes({
          ...filtrosGenerales,
          diasSinPesaje: filtros.diasSinPesaje
        }) : Promise.resolve(null),
        obtenerResumenVentas(filtrosGenerales),
        obtenerReporteProductosResumen(filtrosProductos),
        obtenerReporteProductosPorProducto(filtrosProductos),
        obtenerReporteProductosPorCategoria(filtrosProductos),
        obtenerReporteProductosCombustibles(filtrosProductos),
        obtenerReporteProductosProveedores(filtrosProductos),
        obtenerResumenDestinosFinancieros({
          fechaInicio: filtros.fechaInicio,
          fechaFin: filtros.fechaFin
        }),
        incluirReportesPorcinos ? obtenerReporteCamadas(filtrosGenerales) : Promise.resolve(null),
        incluirReportesPorcinos && tieneFeature('analiticaProductiva') ? obtenerReporteReproductivoPorcino(filtrosGenerales) : Promise.resolve(null),
        incluirReportesPorcinos ? obtenerReporteTareasCamadas(filtrosGenerales) : Promise.resolve(null),
        incluirReportesPorcinos && tieneFeature('analiticaEconomica') ? obtenerReporteEconomicoCamadas(filtrosGenerales) : Promise.resolve(null),
        obtenerReporteSanidad(filtrosGenerales),
        tieneFeature('analiticaProductiva') && especie !== 'Porcino' ? obtenerReporteRazasBovinas() : Promise.resolve(null),
        tieneFeature('analiticaProductiva') && especie !== 'Porcino' ? obtenerReporteDescendenciaBovina(filtrosGenerales) : Promise.resolve(null)
      ]);
      setReporte(data);
      setProductividad(productividadData);
      setFinanzasCria(finanzasCriaData);
      setSustentabilidadCria(sustentabilidadData);
      setVacasImproductivas(vacasImproductivasData);
      setCrecimientoPesajes(crecimientoData);
      setVentasReporte(ventasData);
      if (!tieneFeature('analiticaEconomica') && ventasData) {
        ventasData.ventasPorOrigen = [];
        ventasData.rotacionInventarioVendido = { detalle: [] };
      }
      setProductosReporte({
        resumen: productosResumenData,
        porProducto: productosPorProductoData?.datos || productosPorProductoData || [],
        paginacionProductos: productosPorProductoData?.paginacion || null,
        porCategoria: productosPorCategoriaData,
        combustibles: productosCombustiblesData,
        proveedores: productosProveedoresData
      });
      setDestinosFinancieros(destinosFinancierosData || []);
      setPorcinosReporte(incluirReportesPorcinos ? {
        camadas: camadasData,
        reproduccion: reproduccionPorcinaData,
        tareasCamadas: tareasCamadasData,
        economia: economiaCamadasData
      } : null);
      setSanidadReporte(sanidadData);
      setRazasBovinas(razasBovinasData);
      setDescendenciaBovina(descendenciaBovinaData);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [filtros, especie, tieneFeature, puedeUsarEspecie, paginaProductos, limiteProductos]);

  useEffect(() => {
    cargarReportes();
  }, [cargarReportes]);

  useEffect(() => {
    setPaginaProductos(1);
  }, [filtros.fechaInicio, filtros.fechaFin, filtros.productoFiltro, filtros.categoriaProducto, filtros.proveedorProducto]);

  const egresos = useMemo(() => {
    return reporte?.finanzas?.porNaturaleza?.find((item) => item.naturaleza === 'Egreso')?.total || 0;
  }, [reporte]);

  const ingresos = useMemo(() => {
    return reporte?.finanzas?.porNaturaleza?.find((item) => item.naturaleza === 'Ingreso')?.total || 0;
  }, [reporte]);

  const maxCategoria = obtenerMaximo(reporte?.finanzas?.porCategoria || [], 'total');
  const maxGastosMes = obtenerMaximo(reporte?.finanzas?.gastosPorMes || [], 'total');
  const destinosOrdenados = useMemo(() => {
    return [...destinosFinancieros]
      .map((destino) => ({
        destinoUso: destino.destinoUso,
        total: totalizarDestino(destino),
        registros: destino.registros
      }))
      .sort((a, b) => b.total - a.total);
  }, [destinosFinancieros]);
  const maxDestino = obtenerMaximo(destinosOrdenados, 'total');
  const productosConPaginacionRemota = Boolean(productosReporte?.paginacionProductos);
  const productosPorProducto = productosReporte?.porProducto || [];
  const productosPagina = productosConPaginacionRemota
    ? productosPorProducto
    : productosPorProducto.slice(
      (paginaProductos - 1) * limiteProductos,
      paginaProductos * limiteProductos
    );
  const paginacionProductosActual = productosReporte
    ? (productosReporte.paginacionProductos || {
      pagina: paginaProductos,
      limite: limiteProductos,
      total: productosPorProducto.length,
      totalPaginas: Math.max(Math.ceil(productosPorProducto.length / limiteProductos), 1)
    })
    : null;
  const aplicarPeriodoRapido = (tipo) => {
    const hoy = new Date();
    let inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    if (tipo === '3m') inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
    if (tipo === '6m') inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);
    if (tipo === 'anio') inicio = new Date(hoy.getFullYear(), 0, 1);
    const formato = (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
    setFiltros((actual) => ({ ...actual, fechaInicio: formato(inicio), fechaFin: formato(hoy) }));
  };

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

      <SelectorEspecie valor={especie} onChange={setEspecie} incluirTodos />

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
      <div className="reportes-periodos" aria-label="Períodos rápidos">
        <button type="button" onClick={() => aplicarPeriodoRapido('mes')}>Este mes</button>
        <button type="button" onClick={() => aplicarPeriodoRapido('3m')}>Últimos 3 meses</button>
        <button type="button" onClick={() => aplicarPeriodoRapido('6m')}>Últimos 6 meses</button>
        <button type="button" onClick={() => aplicarPeriodoRapido('anio')}>Este año</button>
      </div>

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

          {!tieneFeature('analiticaProductiva') && (
            <section className="reportes-bloqueados" aria-label="Reportes de analítica productiva disponibles en otros planes">
              <UpgradeMessage feature="analiticaProductiva" titulo="Índice de Productividad Ganadera" pregunta="¿Cómo se comportan la natalidad, el destete, la gestación y la supervivencia?" etiqueta="Reporte productivo" />
              <UpgradeMessage feature="analiticaProductiva" titulo="Análisis de pesajes históricos" pregunta="¿Qué animales están creciendo mejor y cuáles necesitan seguimiento de peso?" etiqueta="Reporte de crecimiento" />
              <UpgradeMessage feature="analiticaProductiva" titulo="Vacas a revisar" pregunta="¿Qué vacas llevan demasiado tiempo sin parto, gestación o resultados de destete?" etiqueta="Reporte reproductivo" />
              <UpgradeMessage feature="analiticaProductiva" titulo="Partos por vaca y año" pregunta="¿Cuántos partos registra cada vaca y cuáles están bajo el objetivo anual?" etiqueta="Reporte reproductivo" />
              {especie !== 'Porcino' && <UpgradeMessage feature="analiticaProductiva" titulo="Razas y descendencia bovina" pregunta="¿Cómo se distribuyen las razas y qué resultados reproductivos tiene cada progenitor?" etiqueta="Reporte genealógico" />}
              {especie !== 'Bovino' && puedeUsarEspecie('Porcino') && <UpgradeMessage feature="analiticaProductiva" titulo="Reproductivo porcino" pregunta="¿Qué resultados tienen los ciclos, partos y destetes de las madres porcinas?" etiqueta="Reporte porcino" />}
            </section>
          )}

          {!tieneFeature('analiticaEconomica') && (
            <section className="reportes-bloqueados" aria-label="Reportes de analítica económica disponibles en otros planes">
              <UpgradeMessage feature="analiticaEconomica" titulo="Finanzas de cría" pregunta="¿Cuánto se ha invertido, gastado e ingresado y cuál es el patrimonio ganadero estimado?" etiqueta="Reporte económico" />
              <UpgradeMessage feature="analiticaEconomica" titulo="Sustentabilidad de cría" pregunta="¿Las ventas cubren las compras y el costo operativo asignado a los animales?" etiqueta="Reporte económico" />
              <UpgradeMessage feature="analiticaEconomica" titulo="Rentabilidad y rotación de ventas" pregunta="¿De dónde provienen los animales vendidos y cuánto tiempo permanecieron en la finca?" etiqueta="Análisis de ventas" />
              {especie !== 'Bovino' && puedeUsarEspecie('Porcino') && <UpgradeMessage feature="analiticaEconomica" titulo="Económico por camada" pregunta="¿Cuál es el costo, ingreso y margen estimado de cada camada?" etiqueta="Reporte porcino" />}
            </section>
          )}

          <FeatureGate feature="analiticaProductiva" titulo="Indicadores productivos de la finca" pregunta="¿Cómo avanza la productividad según la especie y el objetivo productivo de la finca?" etiqueta="Analítica productiva">
            <ReporteIndicesProductivos
              fechaInicio={filtros.fechaInicio}
              fechaFin={filtros.fechaFin}
              especie={especie}
              puedeConfigurar={usuario?.rol === 'Administrador'}
            />
          </FeatureGate>

          <FeatureGate feature="analiticaProductiva" titulo="Rendimiento de potreros" pregunta="¿Cómo se comparan la ocupación, los descansos y los animal-días entre potreros?" etiqueta="Analítica de potreros">
            <RendimientoPotreros rangoControlado={{ fechaInicio: filtros.fechaInicio, fechaFin: filtros.fechaFin }} usarRutaReportes />
          </FeatureGate>

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

          {sustentabilidadCria && (
            <section className="reporte-panel reporte-panel-amplio">
              <p className="eyebrow">Sustentabilidad de cria</p>
              <h2>Ventas por kilo menos compras y costo operativo</h2>
              <div className="reportes-metricas finanzas-cria-metricas">
                <article>
                  <span>Ventas de animales</span>
                  <strong>{formatearMoneda(sustentabilidadCria.montoVentasAnimales)}</strong>
                  <small>{formatearNumero(sustentabilidadCria.animalesVendidosPeriodo)} animales vendidos</small>
                </article>
                <article>
                  <span>Compras de animales</span>
                  <strong>{formatearMoneda(sustentabilidadCria.montoComprasAnimales)}</strong>
                  <small>{formatearNumero(sustentabilidadCria.animalesCompradosPeriodo)} animales comprados</small>
                </article>
                <article>
                  <span>Gastos operativos</span>
                  <strong>{formatearMoneda(sustentabilidadCria.gastosOperativosPeriodo)}</strong>
                  <small>{formatearNumero(sustentabilidadCria.animalesActivosCosto)} animales · {sustentabilidadCria.mesesPeriodo} meses</small>
                </article>
                <article>
                  <span>Costo mensual/animal</span>
                  <strong>{formatearMoneda(sustentabilidadCria.costoProduccionMensualPorAnimal)}</strong>
                  <small>Costo operativo prorrateado</small>
                </article>
                <article>
                  <span>Costo asignado</span>
                  <strong>{formatearMoneda(sustentabilidadCria.costoProduccionAsignado)}</strong>
                  <small>Segun meses en finca de vendidos</small>
                </article>
                <article className={sustentabilidadCria.margenSustentabilidad >= 0 ? 'sustentabilidad-positiva' : 'sustentabilidad-negativa'}>
                  <span>Utilidad / pérdida</span>
                  <strong>{formatearMoneda(sustentabilidadCria.margenSustentabilidad)}</strong>
                  <small>Ventas - compras - costo asignado</small>
                </article>
                <article>
                  <span>Precio venta prom/kg</span>
                  <strong>{formatearMoneda(sustentabilidadCria.precioVentaPromedioKg)}</strong>
                  <small>{formatearNumero(sustentabilidadCria.pesoVentaTotal)} kg vendidos</small>
                </article>
                <article>
                  <span>Precio compra prom/kg</span>
                  <strong>{formatearMoneda(sustentabilidadCria.precioCompraPromedioKg)}</strong>
                  <small>{formatearNumero(sustentabilidadCria.pesoCompraTotal)} kg compra/nacimiento</small>
                </article>
                <article>
                  <span>Duración promedio</span>
                  <strong>{sustentabilidadCria.duracionPromedioMeses || 0}</strong>
                  <small>Meses en finca por animal vendido</small>
                </article>
              </div>

              {(sustentabilidadCria.detalleAnimales || []).length > 0 && (
                <ContenidoPaginado datos={sustentabilidadCria.detalleAnimales || []}>
                  {(animalesPagina) => (
                    <div className="tabla-scroll tabla-dinamica sustentabilidad-tabla">
                      <table>
                    <thead>
                      <tr>
                        <th>{etiquetaId}</th>
                        <th>Origen</th>
                        <th>Venta kg</th>
                        <th>Compra kg</th>
                        <th>Peso venta</th>
                        <th>Peso compra</th>
                        <th>Total venta</th>
                        <th>Total compra</th>
                        <th>Meses</th>
                        <th>Costo asignado</th>
                        <th>Utilidad/pérdida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {animalesPagina.map((animal) => (
                        <tr key={animal.animalId}>
                          <td>{animal.diio}</td>
                          <td>{animal.origen}</td>
                          <td>{formatearMoneda(animal.precioVentaPorKg)}</td>
                          <td>{formatearMoneda(animal.precioCompraPorKg)}</td>
                          <td>{formatearNumero(animal.pesoVenta)} kg</td>
                          <td>{formatearNumero(animal.pesoCompra)} kg</td>
                          <td>{formatearMoneda(animal.totalVenta)}</td>
                          <td>{formatearMoneda(animal.totalCompra)}</td>
                          <td>{animal.duracionMeses}</td>
                          <td>{formatearMoneda(animal.costoProduccionAsignado)}</td>
                          <td>{formatearMoneda(animal.utilidadPerdida)}</td>
                        </tr>
                      ))}
                    </tbody>
                      </table>
                    </div>
                  )}
                </ContenidoPaginado>
              )}

              {(sustentabilidadCria.animalesIgnorados || []).length > 0 && (
                <div className="alerta-formulario">
                  {sustentabilidadCria.animalesIgnorados.length} animales vendidos no se usaron porque les falta peso de venta o precio de venta por kg.
                </div>
              )}
            </section>
          )}

          {ventasReporte && (
            <section className="reporte-panel reporte-panel-amplio">
              <p className="eyebrow">Ventas</p>
              <h2>Análisis de ventas de animales</h2>
              <div className="ventas-reportes-grid">
                <article className="ventas-reporte-card">
                  <p className="eyebrow">Periodo</p>
                  <h2>Ventas por período</h2>
                  <div className="reporte-lista-item">
                    <strong>{formatearMoneda(ventasReporte.ventasPorPeriodo?.ticketPromedioVenta)}</strong>
                    <span>Ticket promedio por venta</span>
                  </div>
                  <div className="reporte-lista-item">
                    <strong>{formatearMoneda(ventasReporte.ventasPorPeriodo?.ventaPromedioPorAnimal)}</strong>
                    <span>Venta promedio por animal</span>
                  </div>
                  <div className="reporte-lista-item">
                    <strong>{formatearNumero(ventasReporte.ventasPorPeriodo?.totalAnimalesVendidos)}</strong>
                    <span>Animales vendidos</span>
                  </div>
                </article>

                <article className="ventas-reporte-card">
                  <p className="eyebrow">Precio</p>
                  <h2>Precio por kilo</h2>
                  <div className="reporte-lista-item">
                    <strong>{formatearMoneda(ventasReporte.precioKg?.promedio)}</strong>
                    <span>Promedio general</span>
                  </div>
                  <div className="reporte-lista-item">
                    <strong>{formatearMoneda(ventasReporte.precioKg?.minimo)}</strong>
                    <span>Precio mínimo</span>
                  </div>
                  <div className="reporte-lista-item">
                    <strong>{formatearMoneda(ventasReporte.precioKg?.maximo)}</strong>
                    <span>Precio máximo</span>
                  </div>
                </article>

                <article className="ventas-reporte-card">
                  <p className="eyebrow">Origen</p>
                  <h2>Ventas por origen</h2>
                  {(ventasReporte.ventasPorOrigen || []).length === 0 && <span className="reporte-vacio">Sin ventas confirmadas.</span>}
                  {(ventasReporte.ventasPorOrigen || []).map((item) => (
                    <div className="reporte-lista-item" key={item.origen}>
                      <strong>{item.origen}</strong>
                      <span>{item.animales} animales · {formatearNumero(item.pesoTotalKg)} kg · {formatearMoneda(item.montoTotal)}</span>
                      <span>{formatearMoneda(item.precioPromedioKg)}/kg · {item.mesesPromedioEnFinca} meses promedio</span>
                    </div>
                  ))}
                </article>

                <article className="ventas-reporte-card">
                  <p className="eyebrow">Rotación</p>
                  <h2>Inventario vendido</h2>
                  <div className="reporte-lista-item">
                    <strong>{ventasReporte.rotacionInventarioVendido?.duracionPromedioMeses || 0} meses</strong>
                    <span>Duración promedio en finca</span>
                  </div>
                  <div className="reporte-lista-item">
                    <strong>{ventasReporte.rotacionInventarioVendido?.menorDuracion || 0} / {ventasReporte.rotacionInventarioVendido?.mayorDuracion || 0}</strong>
                    <span>Menor / mayor duración en meses</span>
                  </div>
                  <div className="reporte-lista-item">
                    <strong>{formatearNumero(ventasReporte.rotacionInventarioVendido?.animalesConDuracion)}</strong>
                    <span>Animales con fecha de ingreso</span>
                  </div>
                </article>
              </div>

              {ventasReporte.ventasPorMes?.length > 0 && (
                <div className="ventas-reporte-seccion">
                  <div className="partos-panel-header">
                    <div>
                      <p className="eyebrow">Ventas por mes</p>
                      <h3>Comportamiento mensual de ventas</h3>
                    </div>
                  </div>
                  <ContenidoPaginado datos={ventasReporte.ventasPorMes || []}>
                    {(ventasPagina) => (
                      <div className="tabla-scroll tabla-dinamica ventas-mes-tabla">
                        <table>
                      <thead>
                        <tr>
                          <th>Mes</th>
                          <th>Ventas</th>
                          <th>Animales</th>
                          <th>Kg vendidos</th>
                          <th>Total</th>
                          <th>Prom/kg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ventasPagina.map((item) => (
                          <tr key={item.mes}>
                            <td>{item.mes}</td>
                            <td>{item.ventas}</td>
                            <td>{item.animales}</td>
                            <td>{formatearNumero(item.pesoTotalKg)} kg</td>
                            <td>{formatearMoneda(item.total)}</td>
                            <td>{formatearMoneda(item.precioPromedioKg)}</td>
                          </tr>
                        ))}
                      </tbody>
                        </table>
                      </div>
                    )}
                  </ContenidoPaginado>
                </div>
              )}

              {ventasReporte.rotacionInventarioVendido?.detalle?.length > 0 && (
                <div className="ventas-reporte-seccion">
                  <div className="partos-panel-header">
                    <div>
                      <p className="eyebrow">Rotación de inventario vendido</p>
                      <h3>Animales vendidos y tiempo en finca</h3>
                    </div>
                  </div>
                  <ContenidoPaginado datos={ventasReporte.rotacionInventarioVendido.detalle || []}>
                    {(animalesPagina) => (
                      <div className="tabla-scroll tabla-dinamica ventas-mes-tabla">
                        <table>
                      <thead>
                        <tr>
                          <th>{etiquetaId}</th>
                          <th>Nombre</th>
                          <th>Origen</th>
                          <th>Comprador</th>
                          <th>Meses en finca</th>
                          <th>Peso venta</th>
                          <th>Precio/kg</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {animalesPagina.map((item) => (
                          <tr key={item.animalId || `${item.diio}-${item.fechaVenta}`}>
                            <td>{item.diio}</td>
                            <td>{item.nombre || '--'}</td>
                            <td>{item.origen}</td>
                            <td>{item.comprador}</td>
                            <td>{item.mesesEnFinca}</td>
                            <td>{formatearNumero(item.pesoVentaKg)} kg</td>
                            <td>{formatearMoneda(item.precioKg)}</td>
                            <td>{formatearMoneda(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                        </table>
                      </div>
                    )}
                  </ContenidoPaginado>
                </div>
              )}
            </section>
          )}

          <FeatureGate feature="analiticaEconomica" titulo="Análisis de compras de animales" pregunta="¿Qué se está comprando, a qué precio y cómo cambia por especie, sexo y origen?" etiqueta="Reporte económico">
            <ReporteComprasAnimales
              fechaInicio={filtros.fechaInicio}
              fechaFin={filtros.fechaFin}
              especie={especie}
            />
          </FeatureGate>

          {productosReporte && (
            <section className="reporte-panel reporte-panel-amplio productos-reportes-panel">
              <div className="partos-panel-header">
                <div>
                  <p className="eyebrow">Compras de productos e insumos</p>
                  <h2>Cantidades y costos comprados</h2>
                </div>
                <div className="partos-filtros productos-filtros">
                  <label>
                    Producto
                    <input
                      value={filtros.productoFiltro}
                      onChange={(evento) => setFiltros((actual) => ({ ...actual, productoFiltro: evento.target.value }))}
                      placeholder="Gasolina, sal, vacuna..."
                    />
                  </label>
                  <label>
                    Categoría
                    <input
                      value={filtros.categoriaProducto}
                      onChange={(evento) => setFiltros((actual) => ({ ...actual, categoriaProducto: evento.target.value }))}
                      placeholder="Combustible, sanidad..."
                    />
                  </label>
                  <label>
                    Proveedor
                    <input
                      value={filtros.proveedorProducto}
                      onChange={(evento) => setFiltros((actual) => ({ ...actual, proveedorProducto: evento.target.value }))}
                      placeholder="Proveedor"
                    />
                  </label>
                </div>
              </div>

              <div className="reportes-metricas finanzas-cria-metricas">
                <article>
                  <span>Monto comprado</span>
                  <strong>{formatearMoneda(productosReporte.resumen?.montoTotal)}</strong>
                  <small>Compras con producto y cantidad en el rango</small>
                </article>
                <article>
                  <span>Registros</span>
                  <strong>{formatearNumero(productosReporte.resumen?.cantidadMovimientos)}</strong>
                  <small>Movimientos de compra</small>
                </article>
                <article>
                  <span>Producto más comprado</span>
                  <strong>{productosReporte.resumen?.productosMasRegistrados?.[0]?.producto || '--'}</strong>
                  <small>
                    {formatearCantidadCompra(productosReporte.resumen?.productosMasRegistrados?.[0]?.cantidadTotal, productosReporte.resumen?.productosMasRegistrados?.[0]?.unidadMedida)}
                    {productosReporte.resumen?.productosMasRegistrados?.[0]?.cantidadFisicaTotal
                      ? ` · ${formatearCantidadFisica(productosReporte.resumen?.productosMasRegistrados?.[0]?.cantidadFisicaTotal, productosReporte.resumen?.productosMasRegistrados?.[0]?.unidadBase)}`
                      : ''}
                  </small>
                </article>
                <article>
                  <span>Categoría principal</span>
                  <strong>{productosReporte.resumen?.categoriasMasRegistradas?.[0]?.categoria || '--'}</strong>
                  <small>{formatearMoneda(productosReporte.resumen?.categoriasMasRegistradas?.[0]?.montoTotal)}</small>
                </article>
                <article>
                  <span>Proveedor principal</span>
                  <strong>{productosReporte.resumen?.proveedoresMasUsados?.[0]?.proveedor || '--'}</strong>
                  <small>{formatearNumero(productosReporte.resumen?.proveedoresMasUsados?.[0]?.cantidadRegistros)} registros</small>
                </article>
              </div>

              <div className="productos-reportes-grid">
                <article>
                  <h3>Detalle de compras por producto</h3>
                  <div className="tabla-scroll tabla-dinamica tabla-productos-compacta">
                    <table>
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Categoría</th>
                          <th>Cantidad</th>
                          <th>Monto total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productosPagina.map((item) => (
                          <tr key={`${item.producto}-${item.categoria}-${item.unidadMedida}`}>
                            <td>{item.producto}</td>
                            <td>{item.categoria}</td>
                            <td>
                              <strong>
                                {formatearCantidadFisica(item.cantidadFisicaTotal, item.unidadBase || item.unidadMedida)
                                  || formatearCantidadCompra(item.cantidadTotal, item.unidadMedida)}
                              </strong>
                              <small>{formatearNumero(item.cantidadRegistros)} compras registradas</small>
                            </td>
                            <td>
                              <strong>{formatearMoneda(item.montoTotal)}</strong>
                              <small>
                                Promedio: {formatearMoneda(item.precioPromedio)}
                                {item.unidadBase ? ` / ${item.unidadBase}` : ''}
                              </small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {productosPorProducto.length === 0 && <span className="reporte-vacio">Sin productos para este rango.</span>}
                  {paginacionProductosActual && (
                    <PaginacionTabla
                      pagina={paginacionProductosActual.pagina}
                      tamanoPagina={paginacionProductosActual.limite}
                      total={paginacionProductosActual.total}
                      totalPaginas={paginacionProductosActual.totalPaginas}
                      onPagina={setPaginaProductos}
                      onTamanoPagina={(limite) => {
                        setLimiteProductos(limite);
                        setPaginaProductos(1);
                      }}
                    />
                  )}
                </article>

                <article>
                  <h3>Gasto de productos por categoría</h3>
                  <ContenidoPaginado datos={productosReporte.porCategoria || []}>
                    {(categoriasPagina) => (
                      <div className="tabla-scroll tabla-dinamica">
                        <table>
                          <thead>
                            <tr>
                              <th>Categoría</th>
                              <th>Productos</th>
                              <th>Compras</th>
                              <th>Monto total</th>
                              <th>% del gasto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {categoriasPagina.map((item) => (
                              <tr key={item.categoria}>
                                <td>{item.categoria}</td>
                                <td>{(item.productosIncluidos || []).filter(Boolean).join(', ') || '--'}</td>
                                <td>{formatearNumero(item.cantidadRegistros)}</td>
                                <td>{formatearMoneda(item.montoTotal)}</td>
                                <td>{formatearPorcentaje(item.porcentajeDelTotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </ContenidoPaginado>
                  {(productosReporte.porCategoria || []).length === 0 && <span className="reporte-vacio">Sin categorías para este rango.</span>}
                </article>

                <article>
                  <h3>Combustibles</h3>
                  <div className="combustible-resumen">
                    <div>
                      <span>Litros totales</span>
                      <strong>{formatearCantidad(productosReporte.combustibles?.litrosTotales, 'litros')}</strong>
                    </div>
                    <div>
                      <span>Monto total</span>
                      <strong>{formatearMoneda(productosReporte.combustibles?.montoTotal)}</strong>
                    </div>
                    <div>
                      <span>Promedio/litro</span>
                      <strong>{formatearMoneda(productosReporte.combustibles?.precioPromedioLitro)}</strong>
                    </div>
                    <div>
                      <span>Proveedor más usado</span>
                      <strong>{productosReporte.combustibles?.proveedorMasUsado || '--'}</strong>
                    </div>
                  </div>
                  {(productosReporte.combustibles?.consumoPorMes || []).map((item) => (
                    <BarraReporte
                      key={`${item.anio}-${item.mes}`}
                      label={`${nombreMes(item.mes)} ${item.anio}`}
                      valor={item.litros}
                      detalle={`${formatearCantidad(item.litros, 'litros')} · ${formatearMoneda(item.montoTotal)}`}
                      maximo={obtenerMaximo(productosReporte.combustibles?.consumoPorMes || [], 'litros')}
                    />
                  ))}
                  {(productosReporte.combustibles?.consumoPorMes || []).length === 0 && <span className="reporte-vacio">Sin combustibles registrados.</span>}
                </article>

                <article>
                  <h3>Por proveedor</h3>
                  {(productosReporte.proveedores || []).slice(0, 10).map((item) => (
                    <div className="reporte-lista-item" key={item.proveedor}>
                      <strong>{item.proveedor}</strong>
                      <span>{formatearMoneda(item.montoTotal)} · {item.productosComprados.slice(0, 4).join(', ')} · Última: {formatearFecha(item.ultimaCompra)}</span>
                    </div>
                  ))}
                  {(productosReporte.proveedores || []).length === 0 && <span className="reporte-vacio">Sin proveedores para este rango.</span>}
                </article>
              </div>
            </section>
          )}

          {especie !== 'Bovino' && puedeUsarEspecie('Porcino') && porcinosReporte && (
            <section className="reporte-panel reporte-panel-amplio porcinos-reportes-panel">
              <div className="partos-panel-header">
                <div>
                  <p className="eyebrow">Porcinos</p>
                  <h2>Camadas y reproducción porcina</h2>
                </div>
              </div>

              <div className="reportes-metricas finanzas-cria-metricas">
                <article>
                  <span>Camadas</span>
                  <strong>{formatearNumero(porcinosReporte.camadas?.resumen?.totalCamadas)}</strong>
                  <small>{formatearNumero(porcinosReporte.camadas?.resumen?.camadasActivas)} activas · {formatearNumero(porcinosReporte.camadas?.resumen?.camadasDestetadas)} destetadas</small>
                </article>
                <article>
                  <span>Nacidos vivos</span>
                  <strong>{formatearNumero(porcinosReporte.camadas?.resumen?.nacidosVivos)}</strong>
                  <small>{formatearNumero(porcinosReporte.camadas?.resumen?.promedioVivosPorCamada)} promedio por camada</small>
                </article>
                <article>
                  <span>Tasa de destete</span>
                  <strong>{formatearPorcentaje(porcinosReporte.camadas?.resumen?.tasaDestete)}</strong>
                  <small>{formatearNumero(porcinosReporte.camadas?.resumen?.destetados)} destetados</small>
                </article>
                <article>
                  <span>Distribución crías</span>
                  <strong>{formatearNumero(porcinosReporte.camadas?.resumen?.criasParaFinca)} / {formatearNumero(porcinosReporte.camadas?.resumen?.criasParaVenta)} / {formatearNumero(porcinosReporte.camadas?.resumen?.criasParaEngorde)}</strong>
                  <small>Finca / venta / engorde</small>
                </article>
                <article>
                  <span>Ciclos porcinos</span>
                  <strong>{formatearNumero(porcinosReporte.reproduccion?.resumen?.ciclosRegistrados)}</strong>
                  <small>{formatearNumero(porcinosReporte.reproduccion?.resumen?.ciclosActivos)} activos · {formatearNumero(porcinosReporte.reproduccion?.resumen?.ciclosNoPrenada)} no preñada</small>
                </article>
                <article>
                  <span>Tareas por camada</span>
                  <strong>{formatearNumero(porcinosReporte.tareasCamadas?.resumen?.totalTareas)}</strong>
                  <small>{formatearNumero(porcinosReporte.tareasCamadas?.resumen?.pendientes)} pendientes · {formatearNumero(porcinosReporte.tareasCamadas?.resumen?.vencidas)} vencidas</small>
                </article>
                <article className={(porcinosReporte.economia?.resumen?.balancePorcino || 0) >= 0 ? 'sustentabilidad-positiva' : 'sustentabilidad-negativa'}>
                  <span>Balance porcino</span>
                  <strong>{formatearMoneda(porcinosReporte.economia?.resumen?.balancePorcino)}</strong>
                  <small>{formatearMoneda(porcinosReporte.economia?.resumen?.costoPromedioPorCamada)} costo prom/camada</small>
                </article>
              </div>

              <div className="crecimiento-grid porcinos-reportes-grid">
                <article>
                  <h3>Reporte de camadas</h3>
                  {(porcinosReporte.camadas?.camadas || []).slice(0, 10).map((camada) => (
                    <div className="reporte-lista-item" key={camada._id}>
                      <strong>{camada.codigoCamada || 'Camada sin código'} · {camada.estado || '--'}</strong>
                      <span>Madre: {camada.madre?.diio || camada.madre?.identificadorFinca || '--'} · Nacimiento: {formatearFecha(camada.fechaNacimiento)}</span>
                      <span>{formatearNumero(camada.nacidosVivos)} vivos · {formatearNumero(camada.destetados)} destetados · {formatearPorcentaje(camada.tasaDestete)} destete</span>
                      <span>Finca {formatearNumero(camada.criasParaFinca)} · Venta {formatearNumero(camada.criasParaVenta)} · Engorde {formatearNumero(camada.criasParaEngorde)}</span>
                    </div>
                  ))}
                  {(porcinosReporte.camadas?.camadas || []).length === 0 && <span className="reporte-vacio">Sin camadas para este rango.</span>}
                </article>

                <article>
                  <h3>Reproductivo porcino</h3>
                  {(porcinosReporte.reproduccion?.madres || []).slice(0, 10).map((madre) => (
                    <div className="reporte-lista-item" key={madre.animalId}>
                      <strong>{madre.diio || '--'} {madre.nombre || ''}</strong>
                      <span>{formatearNumero(madre.ciclos)} ciclos · {formatearNumero(madre.partos)} partos · último parto: {formatearFecha(madre.ultimoParto)}</span>
                      <span>{formatearNumero(madre.nacidosVivos)} vivos · {formatearNumero(madre.destetados)} destetados · {formatearPorcentaje(madre.tasaDestete)} destete</span>
                    </div>
                  ))}
                  {(porcinosReporte.reproduccion?.madres || []).length === 0 && <span className="reporte-vacio">Sin madres porcinas con datos en el rango.</span>}
                </article>

                <article>
                  <h3>Actividades por camada</h3>
                  {(porcinosReporte.tareasCamadas?.camadas || []).slice(0, 10).map((camada) => (
                    <div className="reporte-lista-item" key={camada._id}>
                      <strong>{camada.codigoCamada || 'Camada sin código'}</strong>
                      <span>{formatearNumero(camada.resumenTareas?.total)} tareas · {formatearNumero(camada.resumenTareas?.pendientes)} pendientes · {formatearNumero(camada.resumenTareas?.completadas)} completadas</span>
                      <span>{(camada.tareas || []).slice(0, 3).map((tarea) => tarea.titulo).join(' · ') || 'Sin tareas automáticas'}</span>
                    </div>
                  ))}
                  {(porcinosReporte.tareasCamadas?.camadas || []).length === 0 && <span className="reporte-vacio">Sin tareas automáticas por camada.</span>}
                </article>

                <article>
                  <h3>Económico por camada</h3>
                  {(porcinosReporte.economia?.camadas || []).slice(0, 10).map((camada) => (
                    <div className="reporte-lista-item" key={camada._id}>
                      <strong>{camada.codigoCamada || 'Camada sin código'} · {camada.destino || '--'}</strong>
                      <span>Costo: {formatearMoneda(camada.costoEstimado)} · Ingreso: {formatearMoneda(camada.ingresoEstimado)}</span>
                      <span>Margen: {formatearMoneda(camada.margenEstimado)} · Costo/destetado: {formatearMoneda(camada.costoPorCriaDestetada)}</span>
                    </div>
                  ))}
                  {(porcinosReporte.economia?.camadas || []).length === 0 && <span className="reporte-vacio">Sin camadas para estimación económica.</span>}
                </article>
              </div>
            </section>
          )}

          {crecimientoPesajes && (
            <section className="reporte-panel reporte-panel-amplio crecimiento-pesajes-panel">
              <div className="partos-panel-header">
                <div>
                  <p className="eyebrow">Crecimiento</p>
                  <h2>Análisis de pesajes históricos</h2>
                </div>
                <div className="partos-filtros">
                  <label>
                    Sin pesaje reciente
                    <select
                      value={filtros.diasSinPesaje}
                      onChange={(evento) => setFiltros((actual) => ({ ...actual, diasSinPesaje: evento.target.value }))}
                    >
                      <option value="30">30 días</option>
                      <option value="60">60 días</option>
                      <option value="90">90 días</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="reportes-metricas finanzas-cria-metricas">
                <article>
                  <span>Animales con pesajes</span>
                  <strong>{formatearNumero(crecimientoPesajes.resumen.animalesConPesajes)}</strong>
                  <small>{formatearNumero(crecimientoPesajes.resumen.totalPesajes)} pesajes en el rango</small>
                </article>
                <article>
                  <span>Ganancia diaria prom.</span>
                  <strong>{formatearNumero(crecimientoPesajes.resumen.gananciaDiariaPromedio)} kg</strong>
                  <small>Promedio por animal con historial</small>
                </article>
                <article>
                  <span>Ganancia mensual prom.</span>
                  <strong>{formatearNumero(crecimientoPesajes.resumen.gananciaMensualPromedio)} kg</strong>
                  <small>Proyección a 30 días</small>
                </article>
                <article>
                  <span>Sin pesaje reciente</span>
                  <strong>{formatearNumero(crecimientoPesajes.resumen.animalesSinPesajesRecientes)}</strong>
                  <small>Umbral: {crecimientoPesajes.filtros?.diasSinPesaje || filtros.diasSinPesaje} días</small>
                </article>
              </div>

              <div className="crecimiento-grid">
                <article>
                  <h3>Mejor crecimiento</h3>
                  {(crecimientoPesajes.mejoresCrecimientos || []).slice(0, 10).map((animal) => (
                    <div className="reporte-lista-item" key={animal.animalId}>
                      <strong>{animal.diio || '--'} {animal.nombre || ''}</strong>
                      <span>{formatearNumero(animal.gananciaTotal)} kg · {formatearNumero(animal.gananciaDiariaPromedio)} kg/día</span>
                    </div>
                  ))}
                  {(crecimientoPesajes.mejoresCrecimientos || []).length === 0 && <span className="reporte-vacio">Sin datos suficientes.</span>}
                </article>

                <article>
                  <h3>Menor crecimiento</h3>
                  {(crecimientoPesajes.menoresCrecimientos || []).slice(0, 10).map((animal) => (
                    <div className="reporte-lista-item" key={animal.animalId}>
                      <strong>{animal.diio || '--'} {animal.nombre || ''}</strong>
                      <span>{formatearNumero(animal.gananciaTotal)} kg · {formatearNumero(animal.gananciaDiariaPromedio)} kg/día</span>
                    </div>
                  ))}
                  {(crecimientoPesajes.menoresCrecimientos || []).length === 0 && <span className="reporte-vacio">Sin datos suficientes.</span>}
                </article>

                <article>
                  <h3>Sin pesaje reciente</h3>
                  {(crecimientoPesajes.animalesSinPesajesRecientes || []).slice(0, 10).map((animal) => (
                    <div className="reporte-lista-item" key={animal.animalId}>
                      <strong>{animal.diio || '--'} {animal.nombre || ''}</strong>
                      <span>Último pesaje: {formatearFecha(animal.fechaUltimoPesaje)}</span>
                    </div>
                  ))}
                  {(crecimientoPesajes.animalesSinPesajesRecientes || []).length === 0 && <span className="reporte-vacio">Todos tienen pesaje reciente.</span>}
                </article>

                <article>
                  <h3>Crecimiento de terneros</h3>
                  {(crecimientoPesajes.crecimientoTerneros || []).slice(0, 10).map((animal) => (
                    <div className="reporte-lista-item" key={animal.animalId}>
                      <strong>{animal.diio || '--'} {animal.nombre || ''}</strong>
                      <span>Nacimiento: {formatearNumero(animal.pesoNacimiento)} kg · Actual: {formatearNumero(animal.pesoActual)} kg</span>
                    </div>
                  ))}
                  {(crecimientoPesajes.crecimientoTerneros || []).length === 0 && <span className="reporte-vacio">Sin terneros con peso al nacer y pesajes.</span>}
                </article>
              </div>

              <div className="evolucion-peso-grid">
                {(crecimientoPesajes.evolucion || []).slice(0, 4).map((animal) => (
                  <article key={animal.animalId}>
                    <div>
                      <strong>{animal.diio || '--'} {animal.nombre || ''}</strong>
                      <span>{animal.cantidadPesajes} pesajes · {formatearNumero(animal.gananciaTotal)} kg</span>
                    </div>
                    <LineaPeso puntos={animal.evolucion} />
                  </article>
                ))}
              </div>
            </section>
          )}

          {razasBovinas && (
            <section className="reporte-panel reporte-panel-amplio reporte-racial-panel">
              <div className="partos-panel-header">
                <div>
                  <p className="eyebrow">Bovinos · Inventario</p>
                  <h2>Composición racial de la finca</h2>
                </div>
                <span>{formatearNumero(razasBovinas.resumen?.totalBovinos)} bovinos</span>
              </div>
              <div className="reporte-racial-grid">
                {(razasBovinas.porGrupo || []).map((grupo) => (
                  <article key={grupo.grupoRacial}>
                    <div className="reporte-racial-titulo">
                      <strong>{grupo.grupoRacial}</strong>
                      <span>{formatearNumero(grupo.total)}</span>
                    </div>
                    {(grupo.detalles || []).slice(0, 6).map((detalle) => (
                      <div className="reporte-lista-item" key={detalle.detalle}>
                        <strong>{detalle.detalle}</strong>
                        <span>{formatearNumero(detalle.total)} animales</span>
                      </div>
                    ))}
                  </article>
                ))}
              </div>
              {razasBovinas.resumen?.pendientesNormalizacion > 0 && (
                <span className="reporte-vacio">{formatearNumero(razasBovinas.resumen.pendientesNormalizacion)} animales históricos pendientes de normalizar.</span>
              )}
            </section>
          )}

          {descendenciaBovina && (
            <section className="reporte-panel reporte-panel-amplio descendencia-reporte-panel">
              <div className="partos-panel-header">
                <div>
                  <p className="eyebrow">Bovinos · Genealogía</p>
                  <h2>Descendencia registrada</h2>
                </div>
                <span>Partos y crías se contabilizan por separado</span>
              </div>

              <h3>Vacas</h3>
              <ContenidoPaginado datos={descendenciaBovina.vacas || []}>
                {(vacasPagina) => (
                  <div className="tabla-scroll tabla-dinamica descendencia-reporte-tabla">
                    <table>
                  <thead><tr><th>DIIO</th><th>Vaca</th><th>Partos</th><th>Crías</th><th>Vivas</th><th>Machos</th><th>Hembras</th><th>Última cría</th><th>Edad</th><th>Estado reproductivo</th></tr></thead>
                  <tbody>
                    {vacasPagina.map((vaca) => (
                      <tr key={vaca.animalId}>
                        <td>{vaca.diio || '--'}</td><td>{vaca.nombre || '--'}</td><td>{vaca.partosRegistrados}</td><td>{vaca.criasRegistradas}</td><td>{vaca.criasVivas}</td><td>{vaca.machos}</td><td>{vaca.hembras}</td><td>{formatearFecha(vaca.ultimaCria)}</td><td>{formatearEdadMeses(vaca.edadMeses)}</td><td>{vaca.estadoReproductivo}</td>
                      </tr>
                    ))}
                  </tbody>
                    </table>
                  </div>
                )}
              </ContenidoPaginado>

              <h3>Toros</h3>
              <ContenidoPaginado datos={descendenciaBovina.toros || []}>
                {(torosPagina) => (
                  <div className="tabla-scroll tabla-dinamica descendencia-reporte-tabla">
                    <table>
                  <thead><tr><th>DIIO</th><th>Toro</th><th>Crías</th><th>Madres diferentes</th><th>Machos</th><th>Hembras</th><th>Última cría</th></tr></thead>
                  <tbody>
                    {torosPagina.map((toro) => (
                      <tr key={toro.animalId}>
                        <td>{toro.diio || '--'}</td><td>{toro.nombre || '--'}</td><td>{toro.criasRegistradas}</td><td>{toro.madresDiferentes}</td><td>{toro.machos}</td><td>{toro.hembras}</td><td>{formatearFecha(toro.ultimaCria)}</td>
                      </tr>
                    ))}
                  </tbody>
                    </table>
                  </div>
                )}
              </ContenidoPaginado>
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
              <h2>Gastos por categoría</h2>
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
              <h2>Gastos por mes</h2>
              <LineaFinanzasMensual datos={reporte.finanzas.gastosPorMes || []} maximo={maxGastosMes} />
            </article>

            <article className="reporte-panel reporte-panel-amplio">
              <p className="eyebrow">Finanzas</p>
              <h2>Destino de uso</h2>
              <div className="reportes-meses">
                {destinosOrdenados.map((item) => (
                  <BarraReporte
                    key={item.destinoUso}
                    label={item.destinoUso || 'Sin destino'}
                    valor={item.total}
                    detalle={`${formatearMoneda(item.total)} · ${item.registros} registros`}
                    maximo={maxDestino}
                  />
                ))}
              </div>
              {destinosOrdenados.length === 0 && <span className="reporte-vacio">Sin destinos de uso para este rango.</span>}
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

            {sanidadReporte && (
              <article className="reporte-panel">
                <p className="eyebrow">Sanidad · Aplicaciones reales</p>
                <h2>{formatearNumero(sanidadReporte.totalAplicaciones)} aplicaciones</h2>
                {(sanidadReporte.aplicacionesPorNaturaleza || []).map((item) => (
                  <BarraReporte
                    key={item.naturaleza}
                    label={item.naturaleza}
                    valor={item.cantidad}
                    detalle={`${item.cantidad} aplicaciones`}
                    maximo={sanidadReporte.totalAplicaciones}
                  />
                ))}
                {sanidadReporte.totalAplicaciones === 0 && <span className="reporte-vacio">Sin aplicaciones realizadas en este período.</span>}
              </article>
            )}

            {sanidadReporte && (
              <article className="reporte-panel">
                <p className="eyebrow">Sanidad · Tratamientos</p>
                <h2>Estado y próximas aplicaciones</h2>
                {(sanidadReporte.tratamientosPorEstado || []).map((item) => (
                  <div className="reporte-lista-item" key={item.estado}>
                    <strong>{item.estado}</strong>
                    <span>{item.cantidad} tratamientos iniciados en el período</span>
                  </div>
                ))}
                {(sanidadReporte.proximosTratamientos || []).slice(0, 4).map((tratamiento) => (
                  <div className="reporte-lista-item" key={tratamiento._id}>
                    <strong>{tratamiento.producto}</strong>
                    <span>{formatearFecha(tratamiento.proximaAplicacion)} · {tratamiento.animales?.length || 0} animales</span>
                  </div>
                ))}
              </article>
            )}

            {sanidadReporte && (
              <article className="reporte-panel reporte-panel-amplio">
                <p className="eyebrow">Sanidad · Uso real</p>
                <h2>Productos y animales con más tratamientos</h2>
                <div className="reportes-metricas">
                  {(sanidadReporte.productosMasAplicados || []).slice(0, 6).map((item) => (
                    <article key={item.producto}>
                      <span>{item.producto}</span>
                      <strong>{item.cantidad}</strong>
                      <small>aplicaciones</small>
                    </article>
                  ))}
                  {(sanidadReporte.animalesMasTratados || []).slice(0, 6).map((item) => (
                    <article key={item.animalId}>
                      <span>{item.diio || '--'} {item.nombre || ''}</span>
                      <strong>{item.cantidad}</strong>
                      <small>aplicaciones de tratamiento</small>
                    </article>
                  ))}
                </div>
              </article>
            )}

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

            {tieneFeature('analiticaProductiva') && <article className="reporte-panel reporte-panel-amplio">
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
                    {etiquetaId}
                    <input
                      value={filtros.diio}
                      onChange={(evento) => setFiltros((actual) => ({ ...actual, diio: evento.target.value }))}
                      placeholder={`Filtrar por ${etiquetaId.toLowerCase()}`}
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
                <ContenidoPaginado datos={reporte.reproduccion.partos.porVaca}>
                  {(vacasPagina) => (
                    <div className="tabla-scroll tabla-dinamica partos-tabla">
                      <table>
                    <thead>
                      <tr>
                        <th>{etiquetaId}</th>
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
                      {vacasPagina.map((vaca) => (
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
                </ContenidoPaginado>
              )}
            </article>}

            {vacasImproductivas && (
              <article className="reporte-panel reporte-panel-amplio">
                <div className="partos-panel-header">
                  <div>
                    <p className="eyebrow">Reproduccion</p>
                    <h2>Vacas a revisar</h2>
                  </div>
                  <div className="partos-filtros">
                    <label>
                      Meses sin parto
                      <input
                        type="number"
                        min="1"
                        value={filtros.mesesSinParto}
                        onChange={(evento) => setFiltros((actual) => ({ ...actual, mesesSinParto: evento.target.value }))}
                      />
                    </label>
                    <label>
                      Días abiertos
                      <input
                        type="number"
                        min="1"
                        value={filtros.diasAbiertos}
                        onChange={(evento) => setFiltros((actual) => ({ ...actual, diasAbiertos: evento.target.value }))}
                      />
                    </label>
                    <label>
                      Peso destete min
                      <input
                        type="number"
                        min="1"
                        value={filtros.pesoDesteteMin}
                        onChange={(evento) => setFiltros((actual) => ({ ...actual, pesoDesteteMin: evento.target.value }))}
                      />
                    </label>
                  </div>
                </div>

                <div className="partos-resumen-grid">
                  <article>
                    <span>Total a revisar</span>
                    <strong>{formatearNumero(vacasImproductivas.resumen.totalVacasRevisar)}</strong>
                  </article>
                  <article>
                    <span>Sin parto reciente</span>
                    <strong>{formatearNumero(vacasImproductivas.resumen.sinPartoReciente)}</strong>
                  </article>
                  <article>
                    <span>Sin gestación</span>
                    <strong>{formatearNumero(vacasImproductivas.resumen.sinGestacionActiva)}</strong>
                  </article>
                  <article>
                    <span>Días abiertos</span>
                    <strong>{formatearNumero(vacasImproductivas.resumen.muchosDiasAbiertos)}</strong>
                  </article>
                  <article>
                    <span>Destetes bajos</span>
                    <strong>{formatearNumero(vacasImproductivas.resumen.destetesBajos)}</strong>
                  </article>
                </div>

                {vacasImproductivas.vacas.length === 0 && (
                  <span className="reporte-vacio">Sin vacas marcadas para revisión con estos criterios.</span>
                )}

                {vacasImproductivas.vacas.length > 0 && (
                  <ContenidoPaginado datos={vacasImproductivas.vacas}>
                    {(vacasPagina) => (
                      <div className="tabla-scroll tabla-dinamica partos-tabla">
                        <table>
                      <thead>
                        <tr>
                          <th>{etiquetaId}</th>
                          <th>Nombre</th>
                          <th>Edad</th>
                          <th>Último parto</th>
                          <th>Días abiertos</th>
                          <th>Gestación</th>
                          <th>Motivos</th>
                          <th>Destetes bajos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vacasPagina.map((vaca) => (
                          <tr key={vaca.animalId}>
                            <td>{vaca.diio}</td>
                            <td>{vaca.nombre || '--'}</td>
                            <td>{formatearEdadMeses(vaca.edadMeses)}</td>
                            <td>{formatearFecha(vaca.ultimoParto)}</td>
                            <td>{vaca.diasAbierta ?? '--'}</td>
                            <td>{vaca.gestacionActiva ? 'Activa' : 'No registrada'}</td>
                            <td>{vaca.motivos.join(', ')}</td>
                            <td>
                              {vaca.destetesBajos.length === 0
                                ? '--'
                                : vaca.destetesBajos.map((ternero) => `${ternero.diio}: ${ternero.pesoDestete} kg`).join(', ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                        </table>
                      </div>
                    )}
                  </ContenidoPaginado>
                )}
              </article>
            )}
          </section>
        </>
      )}
    </section>
  );
};

export default Reportes;
