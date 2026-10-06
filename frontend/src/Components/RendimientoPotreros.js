import React, { useEffect, useMemo, useState } from 'react';
import {
  obtenerCoberturaPotrero,
  obtenerRendimientoPotrero,
  obtenerRendimientoPotreros,
  obtenerReporteRendimientoPotreros,
  obtenerRendimientoPotrerosPorPasto
} from '../services/api';
import { ContenidoPaginado } from './PaginacionTabla';

const fechaInput = (fecha) => {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
};

const rangoPreset = (preset) => {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  if (preset === '3meses' || preset === '6meses') {
    const cantidad = preset === '3meses' ? 3 : 6;
    return {
      fechaInicio: fechaInput(new Date(anio, mes - cantidad + 1, 1)),
      fechaFin: fechaInput(new Date(anio, mes + 1, 0))
    };
  }
  if (preset === 'anio') return { fechaInicio: `${anio}-01-01`, fechaFin: `${anio}-12-31` };
  return { fechaInicio: fechaInput(new Date(anio, mes, 1)), fechaFin: fechaInput(new Date(anio, mes + 1, 0)) };
};

const SelectorPeriodo = ({ preset, rango, onPreset, onRango }) => (
  <div className="rendimiento-filtros">
    <label>
      Período
      <select value={preset} onChange={(evento) => onPreset(evento.target.value)}>
        <option value="mes">Este mes</option>
        <option value="3meses">Últimos 3 meses</option>
        <option value="6meses">Últimos 6 meses</option>
        <option value="anio">Este año</option>
        <option value="personalizado">Personalizado</option>
      </select>
    </label>
    {preset === 'personalizado' && (
      <>
        <label>Desde<input type="date" value={rango.fechaInicio} max={rango.fechaFin} onChange={(e) => onRango({ ...rango, fechaInicio: e.target.value })} /></label>
        <label>Hasta<input type="date" value={rango.fechaFin} min={rango.fechaInicio} onChange={(e) => onRango({ ...rango, fechaFin: e.target.value })} /></label>
      </>
    )}
  </div>
);

const usarPeriodo = () => {
  const [preset, setPreset] = useState('mes');
  const [rango, setRango] = useState(() => rangoPreset('mes'));
  const cambiarPreset = (nuevo) => {
    setPreset(nuevo);
    if (nuevo !== 'personalizado') setRango(rangoPreset(nuevo));
  };
  return { preset, rango, setRango, cambiarPreset };
};

const mostrarNumero = (valor, sufijo = '') => (valor === null || valor === undefined ? '--' : `${Number(valor).toLocaleString('es-CR', { maximumFractionDigits: 1 })}${sufijo}`);
const mostrarFecha = (valor) => (valor ? new Date(valor).toLocaleDateString('es-CR') : '--');

const TarjetasRendimiento = ({ datos }) => {
  const items = [
    ['Días ocupados', mostrarNumero(datos.diasOcupados, ' días')],
    ['Tiempo ocupado', mostrarNumero(datos.porcentajeOcupacion, ' %')],
    ['Rotaciones', mostrarNumero(datos.numeroRotaciones)],
    ['Promedio por rotación', mostrarNumero(datos.promedioDiasRotacion, ' días')],
    ['Animales promedio', mostrarNumero(datos.animalesPromedio)],
    ['Densidad al pastorear', mostrarNumero(datos.densidadAnimalesPorHectarea, ' animales/ha')],
    ['Animal-días', mostrarNumero(datos.animalDias)],
    ['Animal-días / ha', mostrarNumero(datos.animalDiasPorHectarea)],
    ['Descanso promedio', mostrarNumero(datos.descansoPromedio, ' días')]
  ];
  return <div className="rendimiento-metricas">{items.map(([label, valor]) => <article key={label}><span>{label}</span><strong>{valor}</strong></article>)}</div>;
};

const GraficoMensual = ({ datos = [] }) => {
  const maximo = Math.max(...datos.map((item) => item.animalDias), 1);
  return (
    <section className="rendimiento-bloque">
      <div><p className="eyebrow">Histórico mensual</p><h3>Animal-días por mes</h3></div>
      <div className="rendimiento-grafico">
        {datos.map((item) => (
          <div className="rendimiento-barra" key={item.mes}>
            <span>{item.mes}</span>
            <div><i style={{ width: `${(item.animalDias / maximo) * 100}%` }} /></div>
            <strong>{mostrarNumero(item.animalDias)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
};

export const DetallePotrero = ({ potrero, rotaciones, onCerrar }) => {
  const [tab, setTab] = useState('rendimiento');
  const { preset, rango, setRango, cambiarPreset } = usarPeriodo();
  const [datos, setDatos] = useState(null);
  const [datosCobertura, setDatosCobertura] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!potrero?._id || !rango.fechaInicio || !rango.fechaFin) return;
    setDatos(null);
    setError('');
    Promise.all([obtenerRendimientoPotrero(potrero._id, rango), obtenerCoberturaPotrero(potrero._id)])
      .then(([rendimiento, cobertura]) => { setDatos(rendimiento); setDatosCobertura(cobertura); })
      .catch((err) => setError(err.message));
  }, [potrero?._id, rango.fechaInicio, rango.fechaFin]);

  const rotacionesPotrero = rotaciones.filter((item) => String(item.potrero?._id || item.potrero) === String(potrero._id));

  return (
    <div className="modal-backdrop">
      <section className="modal-panel detalle-potrero-panel">
        <div className="panel-title">
          <div><p className="eyebrow">{potrero.codigo}</p><h2>{potrero.nombre}</h2></div>
          <button className="boton-link" type="button" onClick={onCerrar}>Cerrar</button>
        </div>
        <div className="potrero-tabs">
          {['informacion', 'rendimiento', 'rotaciones'].map((item) => <button className={tab === item ? 'activo' : ''} type="button" key={item} onClick={() => setTab(item)}>{item === 'informacion' ? 'Información' : item[0].toUpperCase() + item.slice(1)}</button>)}
        </div>

        {tab === 'informacion' && (
          <div className="potrero-informacion">
            <article><span>Área</span><strong>{mostrarNumero(potrero.area, ' ha')}</strong></article>
            <article><span>Estado</span><strong>{potrero.estado}</strong></article>
            <article><span>Capacidad máxima</span><strong>{mostrarNumero(potrero.capacidadMaxima)}</strong></article>
            <article><span>Ubicación</span><strong>{potrero.ubicacion || '--'}</strong></article>
            <article><span>Pasto principal</span><strong>{potrero.pastoPrincipal?.nombre || potrero.descripcionCobertura || '--'}</strong></article>
            <article><span>Descanso objetivo</span><strong>{mostrarNumero(potrero.diasDescansoObjetivo, ' días')}</strong></article>
            {datosCobertura?.historial?.length > 0 && (
              <ContenidoPaginado datos={datosCobertura.historial} clavePaginacion={`potrero-${potrero._id}-coberturas`}>
                {(coberturasPagina) => (
                  <div className="tabla-scroll tabla-panel cobertura-historial">
                    <table><thead><tr><th>Desde</th><th>Hasta</th><th>Pasto principal</th><th>Descanso objetivo</th></tr></thead><tbody>{coberturasPagina.map((item) => <tr key={item._id}><td>{mostrarFecha(item.fechaInicio)}</td><td>{item.fechaFin ? mostrarFecha(item.fechaFin) : 'Vigente'}</td><td>{item.pastoPrincipal?.nombre || item.descripcionCobertura || 'Sin registrar'}</td><td>{mostrarNumero(item.diasDescansoObjetivo, ' días')}</td></tr>)}</tbody></table>
                  </div>
                )}
              </ContenidoPaginado>
            )}
          </div>
        )}

        {tab === 'rendimiento' && (
          <div className="rendimiento-detalle">
            <SelectorPeriodo preset={preset} rango={rango} onPreset={cambiarPreset} onRango={setRango} />
            {error && <div className="alerta-formulario">{error}</div>}
            {!datos && !error && <div className="estado-importacion">Calculando rendimiento...</div>}
            {datos && (
              <>
                <TarjetasRendimiento datos={datos.rendimiento} />
                {!potrero.area && <div className="panel-alerta"><p>Registra el área del potrero para calcular animal-días por hectárea.</p></div>}
                <div className="rendimiento-dos-columnas">
                  <section className="rendimiento-bloque">
                    <div><p className="eyebrow">Última rotación del período</p><h3>{datos.ultimaRotacion ? `${mostrarNumero(datos.ultimaRotacion.numeroAnimales)} animales` : 'Sin rotaciones'}</h3></div>
                    {datos.ultimaRotacion && <dl><div><dt>Entrada</dt><dd>{mostrarFecha(datos.ultimaRotacion.fechaEntrada)}</dd></div><div><dt>Salida</dt><dd>{mostrarFecha(datos.ultimaRotacion.fechaSalida)}</dd></div><div><dt>Días ocupados</dt><dd>{mostrarNumero(datos.ultimaRotacion.diasOcupado)}</dd></div><div><dt>Animal-días</dt><dd>{mostrarNumero(datos.ultimaRotacion.animalDias)}</dd></div></dl>}
                  </section>
                  <section className="rendimiento-bloque">
                    <div><p className="eyebrow">Descanso</p><h3>Comportamiento histórico</h3></div>
                    <dl><div><dt>Último</dt><dd>{mostrarNumero(datos.rendimiento.ultimoDescanso, ' días')}</dd></div><div><dt>Mínimo</dt><dd>{mostrarNumero(datos.rendimiento.descansoMinimo, ' días')}</dd></div><div><dt>Máximo</dt><dd>{mostrarNumero(datos.rendimiento.descansoMaximo, ' días')}</dd></div><div><dt>Actual</dt><dd>{mostrarNumero(datos.rendimiento.descansoActual, ' días')}</dd></div></dl>
                  </section>
                </div>
                <GraficoMensual datos={datos.mensual} />
              </>
            )}
          </div>
        )}

        {tab === 'rotaciones' && (
          <ContenidoPaginado datos={rotacionesPotrero} clavePaginacion={`potrero-${potrero._id}-rotaciones`}>
            {(rotacionesPagina) => (
              <div className="tabla-scroll tabla-panel rotaciones-detalle">
                <table><thead><tr><th>Entrada</th><th>Salida</th><th>Animales</th><th>Estado</th></tr></thead><tbody>{rotacionesPagina.map((item) => <tr key={item._id}><td>{mostrarFecha(item.fechaEntrada)}</td><td>{mostrarFecha(item.fechaSalida)}</td><td>{item.numeroAnimales ?? '--'}</td><td>{item.estado}</td></tr>)}</tbody></table>
                {!rotacionesPotrero.length && <p>Este potrero no tiene rotaciones registradas.</p>}
              </div>
            )}
          </ContenidoPaginado>
        )}
      </section>
    </div>
  );
};

const RendimientoPotreros = ({ rangoControlado = null, usarRutaReportes = false }) => {
  const { preset, rango, setRango, cambiarPreset } = usarPeriodo();
  const rangoConsulta = rangoControlado || rango;
  const [datos, setDatos] = useState([]);
  const [orden, setOrden] = useState('animalDiasPorHectarea');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState('potrero');
  const [agruparPor, setAgruparPor] = useState('pasto');
  const [datosPorPasto, setDatosPorPasto] = useState([]);

  useEffect(() => {
    if (!rangoConsulta.fechaInicio || !rangoConsulta.fechaFin) return;
    setCargando(true);
    setError('');
    const solicitud = vista === 'potrero'
      ? (usarRutaReportes ? obtenerReporteRendimientoPotreros(rangoConsulta) : obtenerRendimientoPotreros(rangoConsulta)).then((respuesta) => setDatos(respuesta.potreros || []))
      : obtenerRendimientoPotrerosPorPasto({ ...rangoConsulta, agruparPor }, usarRutaReportes).then((respuesta) => setDatosPorPasto(respuesta.grupos || []));
    solicitud.catch((err) => setError(err.message)).finally(() => setCargando(false));
  }, [rangoConsulta.fechaInicio, rangoConsulta.fechaFin, vista, agruparPor, usarRutaReportes]);

  const ordenados = useMemo(() => [...datos].sort((a, b) => (Number(b[orden]) || 0) - (Number(a[orden]) || 0)), [datos, orden]);

  return (
    <section className="rendimiento-general">
      <div className="panel-title">
        <div><p className="eyebrow">Uso histórico</p><h2>Rendimiento de potreros</h2></div>
      </div>
      <div className="potrero-tabs rendimiento-vistas">
        <button className={vista === 'potrero' ? 'activo' : ''} type="button" onClick={() => setVista('potrero')}>Por potrero</button>
        <button className={vista === 'pasto' ? 'activo' : ''} type="button" onClick={() => setVista('pasto')}>Por tipo de pasto</button>
      </div>
      <div className="rendimiento-toolbar">
        {!rangoControlado && <SelectorPeriodo preset={preset} rango={rango} onPreset={cambiarPreset} onRango={setRango} />}
        {vista === 'potrero'
          ? <label>Ordenar por<select value={orden} onChange={(e) => setOrden(e.target.value)}><option value="animalDias">Animal-días</option><option value="animalDiasPorHectarea">Animal-días / ha</option><option value="densidadAnimalesPorHectarea">Densidad al pastorear</option><option value="diasOcupados">Días ocupados</option><option value="descansoPromedio">Descanso promedio</option></select></label>
          : <label>Agrupar por<select value={agruparPor} onChange={(e) => setAgruparPor(e.target.value)}><option value="pasto">Pasto o cultivar</option><option value="especieBase">Especie base</option></select></label>}
      </div>
      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && <div className="estado-importacion">Calculando rendimiento...</div>}
      {!cargando && vista === 'potrero' && (
        <ContenidoPaginado datos={ordenados} clavePaginacion="rendimiento-potreros">
          {(potrerosPagina) => (
            <div className="tabla-scroll tabla-panel rendimiento-tabla">
              <table><thead><tr><th>Potrero</th><th>Pasto actual</th><th>Área</th><th>Días ocupado</th><th>Tiempo ocupado</th><th>Rotaciones</th><th>Densidad al pastorear</th><th>Animal-días</th><th>Animal-días / ha</th><th>Descanso real / objetivo</th></tr></thead><tbody>{potrerosPagina.map((item) => <tr key={item.id}><td><strong>{item.codigo}</strong><small>{item.nombre}</small></td><td>{item.coberturaActual?.nombre || item.descripcionCobertura || '--'}</td><td>{mostrarNumero(item.area, ' ha')}</td><td>{mostrarNumero(item.diasOcupados)}</td><td>{mostrarNumero(item.porcentajeOcupacion, ' %')}</td><td>{item.numeroRotaciones}</td><td>{mostrarNumero(item.densidadAnimalesPorHectarea, ' animales/ha')}</td><td>{mostrarNumero(item.animalDias)}</td><td>{mostrarNumero(item.animalDiasPorHectarea)}</td><td>{mostrarNumero(item.descansoPromedio, ' días')} / {mostrarNumero(item.descansoObjetivo, ' días')}</td></tr>)}</tbody></table>
            </div>
          )}
        </ContenidoPaginado>
      )}
      {!cargando && vista === 'pasto' && (
        <>
          <ContenidoPaginado datos={datosPorPasto} clavePaginacion={`rendimiento-${agruparPor}`}>
            {(pastosPagina) => (
              <div className="tabla-scroll tabla-panel rendimiento-tabla">
                <table><thead><tr><th>{agruparPor === 'pasto' ? 'Pasto' : 'Especie base'}</th><th>Potreros</th><th>Área</th><th>Días ocupado</th><th>Rotaciones</th><th>Animales promedio</th><th>Densidad al pastorear</th><th>Animal-días</th><th>Animal-días / ha</th><th>Descanso real / objetivo</th></tr></thead><tbody>{pastosPagina.map((item) => <tr key={item.clave}><td><strong>{item.nombre}</strong><small>{agruparPor === 'pasto' ? item.especieBase : ''}{item.potrerosConCoberturaActualSinHistorial > 0 ? ` · ${item.potrerosConCoberturaActualSinHistorial} sin historial previo` : ''}</small></td><td>{item.cantidadPotreros}</td><td>{mostrarNumero(item.areaHectareas, ' ha')}</td><td>{mostrarNumero(item.diasOcupados)}</td><td>{item.numeroRotaciones}</td><td>{mostrarNumero(item.animalesPromedio)}</td><td>{mostrarNumero(item.densidadAnimalesPorHectarea, ' animales/ha')}</td><td>{mostrarNumero(item.animalDias)}</td><td>{mostrarNumero(item.animalDiasPorHectarea)}</td><td>{mostrarNumero(item.descansoPromedio, ' días')} / {mostrarNumero(item.descansoObjetivo, ' días')}</td></tr>)}</tbody></table>
              </div>
            )}
          </ContenidoPaginado>
          <p className="reporte-nota-metodologica">Tiempo ocupado mide días con animales dentro del período. Densidad al pastorear es el promedio de animales por hectárea mientras hubo ocupación; animal-días por hectárea acumula animales y duración. Cuando falta historial, se usa la cobertura actual del potrero y se indica en la fila.</p>
        </>
      )}
    </section>
  );
};

export default RendimientoPotreros;
