import React, { useEffect, useMemo, useState } from 'react';
import {
  actualizarRegistroReproductivo,
  cancelarCicloReproductivo,
  cerrarCicloReproductivo,
  crearCamada,
  crearRegistroReproductivo,
  eliminarRegistroReproductivo,
  evaluarRiesgoCruce,
  marcarCicloNoPrenada,
  obtenerAnimales,
  obtenerRegistrosReproductivos,
  registrarTerneroDesdeParto
} from '../services/api';
import { guardarGestacionOffline, obtenerGestacionOffline } from '../services/offlineStorage';
import { fechaEnRango, obtenerRangoUltimosAnios } from '../utils/fechas';
import FormularioCamada from './FormularioCamada';
import FormularioReproduccion from './FormularioReproduccion';
import SelectorEspecie from './SelectorEspecie';
import TablaDinamica from './TablaDinamica';

const obtenerEspecieInicial = () => localStorage.getItem('ganaderiaEspecie') || 'Bovino';

const formatearFecha = (fecha) => {
  if (!fecha) return '--';
  return new Date(fecha).toLocaleDateString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC'
  });
};

const obtenerAnimal = (registro) => registro.animal || {};
const etiquetaAnimal = (animal) => {
  const codigo = animal?.diio || animal?.identificadorFinca || 'Sin codigo';
  return `${codigo}${animal?.nombre ? ` - ${animal.nombre}` : ''}`;
};

const estadoTerneroInicial = {
  diio: '',
  identificadorFinca: '',
  nombre: '',
  sexo: 'Hembra',
  raza: '',
  padreDiio: '',
  padreExternoNombre: '',
  pesoNacimiento: '',
  observaciones: ''
};

const columnas = [
  { id: 'diio', label: 'DIIO', accessor: (registro) => obtenerAnimal(registro).diio || obtenerAnimal(registro).identificadorFinca },
  { id: 'nombre', label: 'Nombre', accessor: (registro) => obtenerAnimal(registro).nombre },
  {
    id: 'estado',
    label: 'Estado reproductivo',
    accessor: (registro) => registro.estado,
    render: (registro) => <span className={`estado-badge estado-${registro.estado}`}>{registro.estado}</span>
  },
  {
    id: 'estadoCiclo',
    label: 'Ciclo',
    accessor: (registro) => registro.estadoCiclo || 'Activo',
    render: (registro) => <span className={`estado-badge estado-ciclo-${registro.estadoCiclo || 'Activo'}`}>{registro.estadoCiclo || 'Activo'}</span>
  },
  { id: 'fechaMonta', label: 'Fecha monta', accessor: (registro) => formatearFecha(registro.fechaInseminacion || registro.fechaMonta) },
  { id: 'fechaPartoEstimada', label: 'Parto estimado', accessor: (registro) => formatearFecha(registro.fechaPartoEstimada) },
  { id: 'fechaPartoReal', label: 'Ultimo parto', accessor: (registro) => formatearFecha(registro.fechaPartoReal) },
  { id: 'fechaProximoCelo', label: 'Próximo celo estimado', accessor: (registro) => formatearFecha(registro.fechaProximoCelo || registro.fechaListaMonta) },
  { id: 'fechaDestete', label: 'Destete', accessor: (registro) => formatearFecha(registro.fechaDestete) },
  {
    id: 'ternero',
    label: 'Ternero',
    accessor: (registro) => {
      if (obtenerAnimal(registro).especie === 'Porcino') return registro.fechaPartoReal || registro.fechaPartoEstimada ? 'Registrar camada' : '';
      return registro.fechaPartoReal ? 'Registrar ternero' : '';
    },
    render: (registro) => obtenerAnimal(registro).especie === 'Porcino' && (registro.fechaPartoReal || registro.fechaPartoEstimada) && !registro.soloLectura ? (
      <button className="boton-link tabla-accion-texto" type="button" onClick={() => registro.abrirCamada?.(registro)}>
        Registrar camada
      </button>
    ) : registro.fechaPartoReal && !registro.soloLectura ? (
      <button className="boton-link tabla-accion-texto" type="button" onClick={() => registro.abrirTernero?.(registro)}>
        Registrar
      </button>
    ) : '--'
  },
  {
    id: 'gestionCiclo',
    label: 'Gestión ciclo',
    accessor: (registro) => registro.estadoCiclo || 'Activo',
    render: (registro) => {
      if (registro.soloLectura || (registro.estadoCiclo && registro.estadoCiclo !== 'Activo')) return '--';

      return (
        <div className="acciones-ciclo">
          <button type="button" onClick={() => registro.cerrarCiclo?.(registro)}>Cerrar</button>
          <button type="button" onClick={() => registro.marcarNoPrenada?.(registro)}>No preñada</button>
          <button type="button" onClick={() => registro.cancelarCiclo?.(registro)}>Cancelar</button>
        </div>
      );
    }
  }
];

const filtros = [
  { id: 'estado', accessor: (registro) => registro.estado },
  { id: 'estadoCiclo', accessor: (registro) => registro.estadoCiclo || 'Activo' }
];

const fechasRegistro = (registro) => [
  registro.fechaMonta,
  registro.fechaInseminacion,
  registro.fechaPartoEstimada,
  registro.fechaPartoReal,
  registro.fechaProximoCelo || registro.fechaListaMonta,
  registro.fechaDestete,
  registro.fechaRevisionCelo,
  registro.fechaNuevaInseminacion,
  registro.fechaRevisionCeloPosterior
].filter(Boolean);

const Reproduccion = ({ soloLectura = false }) => {
  const [registros, setRegistros] = useState([]);
  const [animales, setAnimales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [modoFormulario, setModoFormulario] = useState(false);
  const [registroSeleccionado, setRegistroSeleccionado] = useState(null);
  const [registroTernero, setRegistroTernero] = useState(null);
  const [registroCamada, setRegistroCamada] = useState(null);
  const [formularioTernero, setFormularioTernero] = useState(estadoTerneroInicial);
  const [cruce, setCruce] = useState({ macho: '', hembra: '' });
  const [resultadoCruce, setResultadoCruce] = useState(null);
  const [evaluandoCruce, setEvaluandoCruce] = useState(false);
  const [filtroFechas, setFiltroFechas] = useState(() => obtenerRangoUltimosAnios(2));
  const [especie, setEspecie] = useState(obtenerEspecieInicial);
  const [resumenPorcino, setResumenPorcino] = useState(null);
  const [conflictoCiclo, setConflictoCiclo] = useState(null);
  const [errorCamada, setErrorCamada] = useState('');
  const etiquetaId = 'DIIO';

  const cambiarEspecie = (valor) => {
    localStorage.setItem('ganaderiaEspecie', valor);
    setEspecie(valor);
  };

  const registrosFiltrados = useMemo(() => {
    return registros.filter((registro) => {
      const fechas = fechasRegistro(registro);
      if (fechas.length === 0) return true;
      return fechas.some((fecha) => fechaEnRango(fecha, filtroFechas));
    });
  }, [filtroFechas, registros]);

  const cargarDatos = async () => {
    try {
      setError('');
      const [registrosData, animalesData] = await Promise.all([
        obtenerRegistrosReproductivos({ especie }),
        obtenerAnimales({ especie })
      ]);
      setRegistros(registrosData);
      setAnimales(animalesData);
      if (soloLectura) {
        await guardarGestacionOffline(registrosData);
      }
    } catch (err) {
      if (soloLectura) {
        const gestacionOffline = await obtenerGestacionOffline().catch(() => []);
        setRegistros(gestacionOffline);
        setError(gestacionOffline.length ? 'Sin conexion. Mostrando gestacion guardada en este dispositivo.' : err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    setCargando(true);
    cargarDatos();
  }, [especie]);

  const guardarRegistro = async (registro) => {
    try {
      setGuardando(true);
      setErrorFormulario('');
      let registroGuardado;
      if (registroSeleccionado?._id) {
        registroGuardado = await actualizarRegistroReproductivo(registroSeleccionado._id, registro);
      } else {
        registroGuardado = await crearRegistroReproductivo(registro);
      }
      setResumenPorcino(registroGuardado?.especie === 'Porcino' ? registroGuardado : null);
      setRegistroSeleccionado(null);
      setModoFormulario(false);
      setCargando(true);
      await cargarDatos();
    } catch (err) {
      if (err.status === 409 && err.data?.cicloActivo && !registroSeleccionado?._id) {
        setConflictoCiclo({
          cicloActivo: err.data.cicloActivo,
          registroPendiente: registro
        });
      } else {
        setErrorFormulario(err.message);
      }
    } finally {
      setGuardando(false);
    }
  };

  const crearCerrandoCicloAnterior = async () => {
    if (!conflictoCiclo?.registroPendiente) return;

    try {
      setGuardando(true);
      setErrorFormulario('');
      const registroGuardado = await crearRegistroReproductivo({
        ...conflictoCiclo.registroPendiente,
        cerrarCicloAnterior: true
      });
      setResumenPorcino(registroGuardado?.especie === 'Porcino' ? registroGuardado : null);
      setConflictoCiclo(null);
      setRegistroSeleccionado(null);
      setModoFormulario(false);
      setCargando(true);
      await cargarDatos();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrarRegistro = async (registro) => {
    const animal = obtenerAnimal(registro);
    const confirmar = window.confirm(`¿Eliminar el registro reproductivo de ${animal.diio || animal.nombre || 'esta hembra'}? Esta accion no se puede deshacer.`);
    if (!confirmar) return;

    try {
      await eliminarRegistroReproductivo(registro._id);
      window.alert('Registro reproductivo eliminado correctamente.');
      setCargando(true);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const abrirNuevoRegistro = () => {
    setRegistroSeleccionado(null);
    setResumenPorcino(null);
    setConflictoCiclo(null);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const abrirEdicionRegistro = (registro) => {
    setRegistroSeleccionado(registro);
    setConflictoCiclo(null);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const cancelarFormulario = () => {
    setRegistroSeleccionado(null);
    setResumenPorcino(null);
    setConflictoCiclo(null);
    setModoFormulario(false);
  };

  const cerrarCiclo = async (registro) => {
    const motivo = window.prompt('Motivo de cierre del ciclo:', 'Ciclo reproductivo finalizado');
    if (motivo === null) return;

    try {
      await cerrarCicloReproductivo(registro._id, motivo);
      setCargando(true);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const marcarNoPrenada = async (registro) => {
    const motivo = window.prompt('Motivo para marcar como no preñada:', 'El animal no quedó preñado.');
    if (motivo === null) return;

    try {
      await marcarCicloNoPrenada(registro._id, motivo);
      setCargando(true);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const cancelarCiclo = async (registro) => {
    const motivo = window.prompt('Motivo de cancelación:', 'Ciclo reproductivo cancelado');
    if (motivo === null) return;

    try {
      await cancelarCicloReproductivo(registro._id, motivo);
      setCargando(true);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const abrirFormularioTernero = (registro) => {
    const madre = obtenerAnimal(registro);
    setRegistroTernero(registro);
    setFormularioTernero({
      ...estadoTerneroInicial,
      raza: madre.raza || ''
    });
    setErrorFormulario('');
  };

  const abrirFormularioCamada = (registro) => {
    setRegistroCamada(registro);
    setErrorCamada('');
  };

  const actualizarCampoTernero = (evento) => {
    const { name, value } = evento.target;
    setFormularioTernero((actual) => ({ ...actual, [name]: value }));
  };

  const evaluarCruce = async (evento) => {
    evento.preventDefault();
    if (!cruce.macho || !cruce.hembra) return;

    try {
      setEvaluandoCruce(true);
      setError('');
      const resultado = await evaluarRiesgoCruce(cruce);
      setResultadoCruce(resultado);
    } catch (err) {
      setResultadoCruce(null);
      setError(err.message);
    } finally {
      setEvaluandoCruce(false);
    }
  };

  const guardarTernero = async (evento) => {
    evento.preventDefault();

    try {
      setGuardando(true);
      setErrorFormulario('');
      await registrarTerneroDesdeParto(registroTernero._id, {
        ...formularioTernero,
        identificadorFinca: formularioTernero.identificadorFinca || formularioTernero.diio,
        pesoNacimiento: formularioTernero.pesoNacimiento === '' ? null : Number(formularioTernero.pesoNacimiento)
      });
      window.alert('Ternero registrado correctamente.');
      setRegistroTernero(null);
      setFormularioTernero(estadoTerneroInicial);
      setCargando(true);
      await cargarDatos();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const guardarCamadaDesdeReproduccion = async (camada) => {
    const madre = obtenerAnimal(registroCamada);

    try {
      setGuardando(true);
      setErrorCamada('');
      await crearCamada({
        ...camada,
        madre: madre._id,
        registroReproductivo: registroCamada._id
      });
      window.alert('Camada registrada correctamente. Se generaron las tareas asociadas segun el destino.');
      setRegistroCamada(null);
      setCargando(true);
      await cargarDatos();
    } catch (err) {
      setErrorCamada(err.message);
    } finally {
      setGuardando(false);
    }
  };

  if (modoFormulario) {
    return (
      <>
        <FormularioReproduccion
          animales={animales}
          registroInicial={registroSeleccionado}
          modo={registroSeleccionado ? 'editar' : 'crear'}
          onCancelar={cancelarFormulario}
          onGuardar={guardarRegistro}
          guardando={guardando}
          error={errorFormulario}
          especie={especie}
        />
        {conflictoCiclo && (
          <div className="modal-backdrop">
            <section className="modal-panel usuario-modal ciclo-conflicto-modal">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">Ciclo activo</p>
                  <h2>Este animal ya tiene un ciclo reproductivo activo</h2>
                </div>
              </div>
              <p>
                Para crear un ciclo nuevo primero hay que cerrar el anterior, editar el ciclo actual o cancelar esta acción.
              </p>
              <div className="detalle-animal-grid">
                <article><span>Animal</span><strong>{etiquetaAnimal(conflictoCiclo.cicloActivo?.animal)}</strong></article>
                <article><span>Estado reproductivo</span><strong>{conflictoCiclo.cicloActivo?.estado || '--'}</strong></article>
                <article><span>Parto estimado</span><strong>{formatearFecha(conflictoCiclo.cicloActivo?.fechaPartoEstimada)}</strong></article>
                <article><span>Próximo celo</span><strong>{formatearFecha(conflictoCiclo.cicloActivo?.fechaProximoCelo)}</strong></article>
              </div>
              <div className="modal-actions">
                <button className="boton-primario compacto" type="button" onClick={crearCerrandoCicloAnterior} disabled={guardando}>
                  Cerrar ciclo anterior y crear nuevo
                </button>
                <button className="boton-link" type="button" onClick={() => abrirEdicionRegistro(conflictoCiclo.cicloActivo)}>
                  Editar ciclo actual
                </button>
                <button className="boton-link" type="button" onClick={() => setConflictoCiclo(null)}>
                  Cancelar
                </button>
              </div>
            </section>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <SelectorEspecie valor={especie} onChange={cambiarEspecie} />
      <section className="panel-seccion evaluar-cruce-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Genealogía</p>
            <h2>Evaluar cruce</h2>
          </div>
        </div>

        <form className="form-grid evaluar-cruce-form" onSubmit={evaluarCruce}>
          <label>
            Toro
            <select value={cruce.macho} onChange={(evento) => setCruce((actual) => ({ ...actual, macho: evento.target.value }))}>
              <option value="">Seleccionar toro</option>
              {animales.filter((animal) => animal.sexo === 'Macho').map((animal) => (
                <option key={animal._id} value={animal._id}>{etiquetaAnimal(animal)}</option>
              ))}
            </select>
          </label>

          <label>
            Vaca
            <select value={cruce.hembra} onChange={(evento) => setCruce((actual) => ({ ...actual, hembra: evento.target.value }))}>
              <option value="">Seleccionar vaca</option>
              {animales.filter((animal) => animal.sexo === 'Hembra').map((animal) => (
                <option key={animal._id} value={animal._id}>{etiquetaAnimal(animal)}</option>
              ))}
            </select>
          </label>

          <button className="boton-primario compacto" type="submit" disabled={evaluandoCruce || !cruce.macho || !cruce.hembra}>
            {evaluandoCruce ? 'Evaluando...' : 'Evaluar'}
          </button>
        </form>

        {resultadoCruce && (
          <div className={`riesgo-cruce resultado-${resultadoCruce.nivel}`}>
            <span>Riesgo {resultadoCruce.nivel}</span>
            <strong>{resultadoCruce.motivo}</strong>
            <p>{resultadoCruce.recomendacion}</p>
            {(resultadoCruce.ancestrosComunes || []).length > 0 && (
              <small>
                Ancestros comunes: {resultadoCruce.ancestrosComunes.map((animal) => animal.diio || animal.identificadorFinca || animal.nombre).join(', ')}
              </small>
            )}
          </div>
        )}
      </section>

      <section className="reproduccion-tabla-panel">
        {resumenPorcino && (
          <section className="resumen-porcino-panel">
            <div>
              <p className="eyebrow">Automatización porcina</p>
              <h3>Se generaron las tareas de seguimiento de la chancha. Las tareas de crías se crearán al registrar la camada.</h3>
            </div>
            <div className="resumen-fechas-porcinas">
              <article><span>Revisar celo</span><strong>{formatearFecha(resumenPorcino.fechaRevisionCelo)}</strong></article>
              <article><span>Parto estimado</span><strong>{formatearFecha(resumenPorcino.fechaPartoEstimada)}</strong></article>
              <article><span>Ventana de parto</span><strong>{formatearFecha(resumenPorcino.fechaInicioVentanaParto)} a {formatearFecha(resumenPorcino.fechaFinVentanaParto)}</strong></article>
              <article><span>Desparasitar antes</span><strong>{formatearFecha(resumenPorcino.fechaDesparasitacionAntesParto)}</strong></article>
              <article><span>Alimento lactancia</span><strong>{formatearFecha(resumenPorcino.fechaAlimentoLactancia)}</strong></article>
              <article><span>Destete</span><strong>{formatearFecha(resumenPorcino.fechaDestete)}</strong></article>
              <article><span>Nueva inseminación</span><strong>{formatearFecha(resumenPorcino.fechaNuevaInseminacion)}</strong></article>
              <article><span>Celo posterior</span><strong>{formatearFecha(resumenPorcino.fechaRevisionCeloPosterior)}</strong></article>
            </div>
          </section>
        )}

        <div className="finanzas-rango-fechas reproduccion-rango-fechas">
          <label>
            Desde
            <input
              type="date"
              value={filtroFechas.fechaInicio}
              onChange={(evento) => setFiltroFechas((actual) => ({ ...actual, fechaInicio: evento.target.value }))}
              max={filtroFechas.fechaFin || undefined}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={filtroFechas.fechaFin}
              onChange={(evento) => setFiltroFechas((actual) => ({ ...actual, fechaFin: evento.target.value }))}
              min={filtroFechas.fechaInicio || undefined}
            />
          </label>
        </div>

          <TablaDinamica
          titulo="Gestión Reproductiva"
          subtitulo="Reproduccion"
          columnas={columnas.map((columna) => {
            if (columna.id === 'diio') return { ...columna, label: etiquetaId };
            if (columna.id === 'fechaMonta' && especie === 'Porcino') return { ...columna, label: 'Inseminación/monta' };
            if (columna.id === 'ternero' && especie === 'Porcino') return { ...columna, label: 'Crías' };
            return columna;
          })}
          datos={registrosFiltrados.map((registro) => ({
              ...registro,
              abrirTernero: abrirFormularioTernero,
              abrirCamada: abrirFormularioCamada,
              cerrarCiclo,
              marcarNoPrenada,
              cancelarCiclo,
              soloLectura
            }))}
          cargando={cargando}
          error={error}
          filtros={filtros}
          textoAgregar="Nuevo registro"
          onAgregar={soloLectura ? undefined : abrirNuevoRegistro}
          onEditar={soloLectura ? undefined : abrirEdicionRegistro}
          onEliminar={soloLectura ? undefined : borrarRegistro}
          mostrarAcciones={!soloLectura}
        />
      </section>

      {registroTernero && (
        <div className="modal-backdrop">
          <section className="modal-panel usuario-form-modal">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Reproducción</p>
                <h2>Registrar ternero</h2>
              </div>
              <button className="boton-link" type="button" onClick={() => setRegistroTernero(null)}>Cerrar</button>
            </div>

            <form className="usuario-form-grid" onSubmit={guardarTernero}>
              {errorFormulario && <div className="alerta-formulario">{errorFormulario}</div>}
              <label>{etiquetaId}<input name="diio" value={formularioTernero.diio} onChange={actualizarCampoTernero} required /></label>
              <label>Identificador finca<input name="identificadorFinca" value={formularioTernero.identificadorFinca} onChange={actualizarCampoTernero} placeholder={`Si se deja vacío usa el ${etiquetaId.toLowerCase()}`} /></label>
              <label>Nombre<input name="nombre" value={formularioTernero.nombre} onChange={actualizarCampoTernero} /></label>
              <label>Sexo<select name="sexo" value={formularioTernero.sexo} onChange={actualizarCampoTernero}><option value="Hembra">Hembra</option><option value="Macho">Macho</option></select></label>
              <label>Raza<input name="raza" value={formularioTernero.raza} onChange={actualizarCampoTernero} /></label>
              <label>Padre {etiquetaId}<input name="padreDiio" value={formularioTernero.padreDiio} onChange={actualizarCampoTernero} /></label>
              <label>Padre externo<input name="padreExternoNombre" value={formularioTernero.padreExternoNombre || ''} onChange={actualizarCampoTernero} /></label>
              <label>Peso al nacer<input name="pesoNacimiento" type="number" min="0" step="0.01" value={formularioTernero.pesoNacimiento} onChange={actualizarCampoTernero} /></label>
              <label>Observaciones<textarea name="observaciones" rows="3" value={formularioTernero.observaciones} onChange={actualizarCampoTernero} /></label>
              <div className="modal-actions">
                <button className="boton-link" type="button" onClick={() => setRegistroTernero(null)}>Cancelar</button>
                <button className="boton-primario compacto" type="submit" disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Guardar ternero'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {registroCamada && (
        <div className="modal-backdrop">
          <section className="modal-panel usuario-form-modal">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Reproducción porcina</p>
                <h2>Registrar camada</h2>
              </div>
              <button className="boton-link" type="button" onClick={() => setRegistroCamada(null)}>Cerrar</button>
            </div>

            <FormularioCamada
              madreFija={obtenerAnimal(registroCamada)}
              registroReproductivo={registroCamada}
              onCancelar={() => setRegistroCamada(null)}
              onGuardar={guardarCamadaDesdeReproduccion}
              guardando={guardando}
              error={errorCamada}
            />
          </section>
        </div>
      )}
    </>
  );
};

export default Reproduccion;
