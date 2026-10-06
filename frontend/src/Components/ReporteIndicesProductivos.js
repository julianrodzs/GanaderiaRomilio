import React, { useCallback, useEffect, useState } from 'react';
import {
  actualizarConfiguracionProductiva,
  obtenerConfiguracionProductiva,
  obtenerCrecimientoPorcino,
  obtenerEficienciaEngorde
} from '../services/api';

const numero = (valor, decimales = 1) => valor === null || valor === undefined
  ? '--'
  : new Intl.NumberFormat('es-CR', { maximumFractionDigits: decimales }).format(valor);

const porcentaje = (valor) => valor === null || valor === undefined ? '--' : `${numero(valor)}%`;

const camposConfiguracion = [
  ['porcinosCria', 'nacidosVivosObjetivoCamada', 'Meta nacidos vivos por camada'],
  ['porcinosCria', 'destetadosObjetivoCamada', 'Meta destetados por camada'],
  ['porcinosCria', 'supervivenciaPredesteteObjetivoPct', 'Meta supervivencia predestete (%)'],
  ['porcinos', 'gmdFase1KgDia', 'GMD porcina Fase 1 (kg/día)'],
  ['porcinos', 'gmdFase2KgDia', 'GMD porcina Fase 2 (kg/día)'],
  ['porcinos', 'gmdFase3KgDia', 'GMD porcina Fase 3 (kg/día)'],
  ['porcinos', 'gmdDesarrolloKgDia', 'GMD porcina Desarrollo (kg/día)'],
  ['porcinos', 'gmdEngordeKgDia', 'GMD porcina Engorde (kg/día)'],
  ['porcinos', 'pesoObjetivoEngordeKg', 'Peso objetivo porcino (kg)'],
  ['bovinosEngorde', 'gmdObjetivoKgDia', 'GMD objetivo bovino (kg/día)'],
  ['bovinosEngorde', 'pesoObjetivoKg', 'Peso objetivo bovino (kg)']
];

const prepararFormulario = (configuracion) => ({
  porcinosCria: { ...(configuracion?.porcinosCria || {}) },
  porcinos: { ...(configuracion?.porcinos || {}) },
  bovinosEngorde: { ...(configuracion?.bovinosEngorde || {}) },
  diasPesajeReciente: configuracion?.diasPesajeReciente || 60
});

const ResumenEspecie = ({ titulo, datos }) => {
  if (!datos) return null;
  return (
    <section className="indice-especie">
      <div className="indice-especie-titulo">
        <div><p className="eyebrow">Engorde</p><h3>{titulo}</h3></div>
        <div><strong>{numero(datos.iee)}</strong><span>{datos.clasificacion || 'Datos insuficientes'}</span></div>
      </div>
      <div className="indice-detalles-grid">
        <div><span>En engorde actualmente</span><strong>{numero(datos.animalesActualmenteEngorde, 0)}</strong></div>
        <div><span>Animales evaluados</span><strong>{numero(datos.animalesEvaluados, 0)}</strong></div>
        <div><span>GMD real / objetivo</span><strong>{numero(datos.gmdReal, 3)} / {numero(datos.gmdObjetivo, 3)} kg/día</strong></div>
        <div><span>Cumplimiento GMD</span><strong>{porcentaje(datos.cumplimientoGmd)}</strong></div>
        <div><span>Peso actual / objetivo</span><strong>{numero(datos.pesoPromedioActual)} / {numero(datos.pesoObjetivo)} kg</strong></div>
        <div><span>Ganancia total</span><strong>{numero(datos.gananciaKgTotal)} kg</strong></div>
        <div><span>Días promedio evaluados</span><strong>{numero(datos.diasPromedioEngorde)} días</strong></div>
        <div><span>Supervivencia</span><strong>{porcentaje(datos.supervivencia)}</strong></div>
        <div><span>Alcanzaron peso objetivo</span><strong>{numero(datos.animalesPesoObjetivo, 0)}</strong></div>
        <div><span>Sin pesaje reciente</span><strong>{numero(datos.animalesSinPesajesRecientes, 0)}</strong></div>
      </div>
      {datos.diasEstimadosRestantes !== null && datos.diasEstimadosRestantes !== undefined && (
        <p className="indice-proyeccion">
          Al ritmo de crecimiento actual, el grupo alcanzaría el peso objetivo aproximadamente en {numero(datos.diasEstimadosRestantes, 0)} días. Esta es una proyección productiva.
        </p>
      )}
      {datos.muertesSinFechaConfiable > 0 && (
        <p className="indice-advertencia">{datos.muertesSinFechaConfiable} muerte(s) no tienen fecha confiable y no se asignaron al período.</p>
      )}
    </section>
  );
};

const ReporteIndicesProductivos = ({ fechaInicio, fechaFin, especie = 'Todos', puedeConfigurar = false }) => {
  const [icp, setIcp] = useState(null);
  const [iee, setIee] = useState(null);
  const [configuracion, setConfiguracion] = useState(null);
  const [formulario, setFormulario] = useState(null);
  const [editando, setEditando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [icpData, ieeData, configData] = await Promise.all([
        especie === 'Bovino' ? Promise.resolve(null) : obtenerCrecimientoPorcino({ fechaInicio, fechaFin }),
        obtenerEficienciaEngorde({ fechaInicio, fechaFin, especie }),
        obtenerConfiguracionProductiva()
      ]);
      setIcp(icpData);
      setIee(ieeData);
      setConfiguracion(configData);
      setFormulario(prepararFormulario(configData));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [fechaInicio, fechaFin, especie]);

  useEffect(() => { cargar(); }, [cargar]);

  const actualizarMeta = (grupo, campo, valor) => {
    setFormulario((actual) => ({
      ...actual,
      [grupo]: { ...actual[grupo], [campo]: valor }
    }));
  };

  const guardarMetas = async (evento) => {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await actualizarConfiguracionProductiva(formulario);
      setEditando(false);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <div className="estado-importacion">Calculando índices productivos...</div>;

  return (
    <section className="indices-productivos">
      <div className="partos-panel-header">
        <div><p className="eyebrow">Rendimiento de finca</p><h2>Índices productivos</h2></div>
        {puedeConfigurar && <button className="boton-secundario compacto" type="button" onClick={() => setEditando((actual) => !actual)}>Metas productivas</button>}
      </div>
      {error && <div className="alerta-formulario">{error}</div>}

      {editando && formulario && (
        <form className="metas-productivas-form" onSubmit={guardarMetas}>
          <h3>Metas internas de negocio</h3>
          <p>Estas metas son configurables y no representan estándares veterinarios universales.</p>
          <div className="metas-productivas-grid">
            {camposConfiguracion.map(([grupo, campo, etiqueta]) => (
              <label key={`${grupo}.${campo}`}>{etiqueta}
                <input type="number" min="0.001" step="0.001" value={formulario[grupo][campo] ?? ''} onChange={(evento) => actualizarMeta(grupo, campo, evento.target.value)} required />
              </label>
            ))}
            <label>Días para considerar pesaje reciente
              <input type="number" min="1" step="1" value={formulario.diasPesajeReciente} onChange={(evento) => setFormulario((actual) => ({ ...actual, diasPesajeReciente: evento.target.value }))} required />
            </label>
          </div>
          <div className="form-actions"><button className="boton-primario compacto" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar metas'}</button></div>
        </form>
      )}

      {icp && (
        <section className="reporte-panel reporte-panel-amplio indice-principal">
          <div className="indice-encabezado">
            <div><p className="eyebrow">Porcinos · Crecimiento</p><h2>Índice de Crecimiento Porcino</h2></div>
            <div><span>ICP</span><strong>{numero(icp.icp)}</strong><small>{icp.clasificacion || 'Datos insuficientes'}</small></div>
          </div>
          {icp.datosInsuficientes ? <p className="reporte-vacio">{icp.mensaje}</p> : (
            <>
              <div className="reportes-metricas indice-metricas">
                <article><span>Porcinos evaluados</span><strong>{numero(icp.resumen.porcinosEvaluados, 0)}</strong><small>{numero(icp.resumen.porcinosSinDatosSuficientes, 0)} sin pesajes suficientes</small></article>
                <article><span>GMD real</span><strong>{numero(icp.resumen.gmdRealPonderada, 3)} kg/día</strong><small>Meta ponderada: {numero(icp.resumen.gmdObjetivoPonderada, 3)}</small></article>
                <article><span>Ganancia total</span><strong>{numero(icp.resumen.gananciaKgTotal)} kg</strong><small>{numero(icp.resumen.animalDiasEvaluados)} animal-días</small></article>
                <article><span>Sin meta productiva</span><strong>{numero(icp.resumen.porcinosSinMetaProductiva, 0)}</strong><small>Excluidos de la normalización</small></article>
              </div>
              <div className="tabla-scroll tabla-dinamica">
                <table><thead><tr><th>Etapa</th><th>Animales</th><th>GMD real</th><th>Meta</th><th>Cumplimiento</th></tr></thead>
                  <tbody>{icp.porEtapa.map((item) => <tr key={item.etapa}><td>{item.etapa}</td><td>{item.animales}</td><td>{numero(item.gmdReal, 3)} kg/día</td><td>{numero(item.gmdObjetivo, 3)} kg/día</td><td>{porcentaje(item.cumplimiento)}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {iee && (
        <section className="reporte-panel reporte-panel-amplio indice-principal">
          <div className="indice-encabezado">
            <div><p className="eyebrow">Engorde · Finca</p><h2>Índice de Eficiencia de Engorde</h2></div>
            <div><span>IEE general</span><strong>{numero(iee.ieeGeneral)}</strong><small>{iee.clasificacion || 'Datos insuficientes'}</small></div>
          </div>
          {iee.datosInsuficientes && <p className="reporte-vacio">{iee.mensaje}</p>}
          <div className="indice-componentes">
            <div><span>GMD</span><strong>{porcentaje(iee.componentes.cumplimientoGmd)}</strong></div>
            <div><span>Tiempo</span><strong>{porcentaje(iee.componentes.eficienciaTiempo)}</strong></div>
            <div><span>Supervivencia</span><strong>{porcentaje(iee.componentes.supervivencia)}</strong></div>
          </div>
          <div className="indices-especies-grid">
            <ResumenEspecie titulo="Bovinos" datos={iee.bovinos} />
            <ResumenEspecie titulo="Porcinos" datos={iee.porcinos} />
          </div>
        </section>
      )}
      {configuracion && <p className="indice-nota">Los índices se calculan para la finca y el período seleccionado usando las metas internas configuradas.</p>}
    </section>
  );
};

export default ReporteIndicesProductivos;
