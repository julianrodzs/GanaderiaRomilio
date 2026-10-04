import React from 'react';
import { ContenidoPaginado } from './PaginacionTabla';

const numero = (valor, decimales = 2) => (
  valor === null || valor === undefined
    ? '--'
    : new Intl.NumberFormat('es-CR', { maximumFractionDigits: decimales }).format(valor)
);

const kg = (valor) => (valor === null || valor === undefined ? '--' : `${numero(valor)} kg`);
const porcentaje = (valor) => `${numero(valor)}%`;
const fecha = (valor) => valor
  ? new Date(valor).toLocaleDateString('es-CR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  : '--';

const MetricasBasicasBovinos = ({ datos }) => (
  <>
    <div className="reportes-metricas destete-metricas">
      <article><span>Destetes registrados</span><strong>{numero(datos.totalDestetados, 0)}</strong><small>Según fecha real de destete</small></article>
      <article><span>Peso promedio</span><strong>{kg(datos.pesos?.promedio)}</strong><small>Mediana: {kg(datos.pesos?.mediana)}</small></article>
      <article><span>Rango observado</span><strong>{kg(datos.pesos?.minimo)} - {kg(datos.pesos?.maximo)}</strong><small>Solo pesos informados</small></article>
      <article><span>Cobertura del peso</span><strong>{porcentaje(datos.coberturaPeso)}</strong><small>{numero(datos.conPeso, 0)} de {numero(datos.totalDestetados, 0)} animales</small></article>
    </div>
    <ContenidoPaginado datos={datos.detalle || []} clavePaginacion="reporte-destete-basico-bovinos">
      {(pagina) => (
        <div className="tabla-scroll tabla-dinamica">
          <table>
            <thead><tr><th>Fecha</th><th>DIIO</th><th>Nombre</th><th>Sexo</th><th>Edad al destete</th><th>Peso</th></tr></thead>
            <tbody>{pagina.map((item) => (
              <tr key={item.animalId}>
                <td>{fecha(item.fechaDestete)}</td><td>{item.identificador}</td><td>{item.nombre || '--'}</td><td>{item.sexo || '--'}</td>
                <td>{item.edadDesteteDias ? `${item.edadDesteteDias} días` : '--'}</td><td>{kg(item.pesoDestete)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </ContenidoPaginado>
  </>
);

const MetricasBasicasPorcinos = ({ datos }) => (
  <>
    <div className="reportes-metricas destete-metricas">
      <article><span>Camadas destetadas</span><strong>{numero(datos.totalCamadas, 0)}</strong><small>{numero(datos.totalDestetados, 0)} lechones destetados</small></article>
      <article><span>Peso prom. por lechón</span><strong>{kg(datos.pesoPromedioPonderado)}</strong><small>Ponderado por destetados</small></article>
      <article><span>Peso prom. de camada</span><strong>{kg(datos.pesosTotalesCamada?.promedio)}</strong><small>Total al destete por camada</small></article>
      <article><span>Cobertura del peso</span><strong>{porcentaje(datos.coberturaCamadas)}</strong><small>{numero(datos.camadasConPeso, 0)} de {numero(datos.totalCamadas, 0)} camadas</small></article>
    </div>
    <ContenidoPaginado datos={datos.detalle || []} clavePaginacion="reporte-destete-basico-porcinos">
      {(pagina) => (
        <div className="tabla-scroll tabla-dinamica">
          <table>
            <thead><tr><th>Fecha</th><th>Camada</th><th>Madre</th><th>Edad</th><th>Destetados</th><th>Peso promedio</th><th>Peso total</th></tr></thead>
            <tbody>{pagina.map((item) => (
              <tr key={item.camadaId}>
                <td>{fecha(item.fechaDestete)}</td><td>{item.codigoCamada || '--'}</td><td>{item.madre?.identificador || '--'}</td>
                <td>{item.edadDesteteDias ? `${item.edadDesteteDias} días` : '--'}</td><td>{numero(item.destetados, 0)}</td>
                <td>{kg(item.pesoPromedio)}</td><td>{kg(item.pesoTotal)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </ContenidoPaginado>
  </>
);

export const ReportePesoDesteteBasico = ({ datos }) => {
  if (!datos?.basico) return null;
  const { bovinos, porcinos } = datos.basico;
  return (
    <section className="reporte-panel reporte-panel-amplio destete-panel">
      <div className="partos-panel-header">
        <div><p className="eyebrow">Crecimiento predestete</p><h2>Peso real al destete</h2></div>
        <span>¿Con cuánto peso se están destetando los animales?</span>
      </div>
      {bovinos && <section className="destete-reporte-bloque"><h3>Bovinos</h3><MetricasBasicasBovinos datos={bovinos} /></section>}
      {porcinos && <section className="destete-reporte-bloque"><h3>Porcinos</h3><MetricasBasicasPorcinos datos={porcinos} /></section>}
    </section>
  );
};

const AnaliticaBovinos = ({ datos }) => (
  <section className="destete-reporte-bloque">
    <h3>Bovinos · equivalente a 205 días</h3>
    <div className="reportes-metricas destete-metricas">
      <article><span>Peso equivalente 205 días</span><strong>{kg(datos.pesoEquivalente205?.promedio)}</strong><small>{numero(datos.elegibles205, 0)} animales comparables</small></article>
      <article><span>GMD predestete</span><strong>{datos.gmdPredestete?.promedio == null ? '--' : `${numero(datos.gmdPredestete.promedio, 3)} kg/día`}</strong><small>Desde nacimiento hasta destete</small></article>
      <article><span>Fuera de rango</span><strong>{numero(datos.fueraRango205, 0)}</strong><small>Destetados fuera de 160-250 días</small></article>
      <article><span>Datos incompletos</span><strong>{numero(datos.sinDatos205, 0)}</strong><small>Falta fecha o alguno de los pesos</small></article>
    </div>
    <ContenidoPaginado datos={datos.detalle || []} clavePaginacion="reporte-destete-avanzado-bovinos">
      {(pagina) => (
        <div className="tabla-scroll tabla-dinamica">
          <table>
            <thead><tr><th>DIIO</th><th>Sexo</th><th>Edad</th><th>Peso real</th><th>GMD</th><th>Equiv. 205 días</th></tr></thead>
            <tbody>{pagina.map((item) => (
              <tr key={item.animalId}><td>{item.identificador}</td><td>{item.sexo || '--'}</td><td>{item.edadDesteteDias ? `${item.edadDesteteDias} días` : '--'}</td><td>{kg(item.pesoDestete)}</td><td>{item.gmdPredestete == null ? '--' : `${numero(item.gmdPredestete, 3)} kg/día`}</td><td>{kg(item.pesoEquivalente205)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </ContenidoPaginado>
    <small className="destete-metodologia">Normalización por edad. No aplica correcciones por edad de la madre, sexo, raza o grupo contemporáneo.</small>
  </section>
);

const AnaliticaPorcinos = ({ datos }) => (
  <section className="destete-reporte-bloque">
    <h3>Porcinos · camada equivalente a 21 días</h3>
    <div className="reportes-metricas destete-metricas">
      <article><span>Peso por lechón a 21 días</span><strong>{kg(datos.pesoPromedioLechon21)}</strong><small>Ponderado por lechones destetados</small></article>
      <article><span>Peso de camada a 21 días</span><strong>{kg(datos.pesoCamada21?.promedio)}</strong><small>{numero(datos.elegibles21, 0)} camadas comparables</small></article>
      <article><span>Supervivencia predestete</span><strong>{datos.supervivencia?.promedio == null ? '--' : porcentaje(datos.supervivencia.promedio)}</strong><small>Promedio de camadas con datos</small></article>
      <article><span>Fuera de rango</span><strong>{numero(datos.fueraRango21, 0)}</strong><small>Pesadas fuera de 14-28 días</small></article>
    </div>
    <ContenidoPaginado datos={datos.detalle || []} clavePaginacion="reporte-destete-avanzado-porcinos">
      {(pagina) => (
        <div className="tabla-scroll tabla-dinamica">
          <table>
            <thead><tr><th>Camada</th><th>Madre</th><th>Edad</th><th>Destetados</th><th>Peso real</th><th>Peso camada 21 d</th><th>Supervivencia</th></tr></thead>
            <tbody>{pagina.map((item) => (
              <tr key={item.camadaId}><td>{item.codigoCamada || '--'}</td><td>{item.madre?.identificador || '--'}</td><td>{item.edadDesteteDias ? `${item.edadDesteteDias} días` : '--'}</td><td>{numero(item.destetados, 0)}</td><td>{kg(item.pesoTotal)}</td><td>{kg(item.pesoCamada21)}</td><td>{item.supervivencia == null ? '--' : porcentaje(item.supervivencia)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </ContenidoPaginado>
    <small className="destete-metodologia">La equivalencia a 21 días utiliza factores por edad; no ajusta por paridad ni transferencias entre camadas.</small>
  </section>
);

export const ReportePesoDesteteAvanzado = ({ datos }) => {
  if (!datos?.avanzado) return null;
  return (
    <section className="reporte-panel reporte-panel-amplio destete-panel">
      <div className="partos-panel-header">
        <div><p className="eyebrow">Analítica productiva</p><h2>Comparación normalizada del destete</h2></div>
        <span>¿Qué animales y camadas crecen mejor antes del destete?</span>
      </div>
      {datos.avanzado.bovinos && <AnaliticaBovinos datos={datos.avanzado.bovinos} />}
      {datos.avanzado.porcinos && <AnaliticaPorcinos datos={datos.avanzado.porcinos} />}
    </section>
  );
};
