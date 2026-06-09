import React, { useEffect, useState } from 'react';
import {
  actualizarRegistroReproductivo,
  crearRegistroReproductivo,
  eliminarRegistroReproductivo,
  evaluarRiesgoCruce,
  obtenerAnimales,
  obtenerRegistrosReproductivos,
  registrarTerneroDesdeParto
} from '../services/api';
import { guardarGestacionOffline, obtenerGestacionOffline } from '../services/offlineStorage';
import FormularioReproduccion from './FormularioReproduccion';
import TablaDinamica from './TablaDinamica';

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
  { id: 'fechaMonta', label: 'Fecha monta', accessor: (registro) => formatearFecha(registro.fechaMonta) },
  { id: 'fechaPartoEstimada', label: 'Parto estimado', accessor: (registro) => formatearFecha(registro.fechaPartoEstimada) },
  { id: 'fechaPartoReal', label: 'Ultimo parto', accessor: (registro) => formatearFecha(registro.fechaPartoReal) },
  { id: 'fechaProximoCelo', label: 'Próximo celo estimado', accessor: (registro) => formatearFecha(registro.fechaProximoCelo || registro.fechaListaMonta) },
  { id: 'fechaDestete', label: 'Destete', accessor: (registro) => formatearFecha(registro.fechaDestete) },
  {
    id: 'ternero',
    label: 'Ternero',
    accessor: (registro) => registro.fechaPartoReal ? 'Registrar ternero' : '',
    render: (registro) => registro.fechaPartoReal && !registro.soloLectura ? (
      <button className="boton-link tabla-accion-texto" type="button" onClick={() => registro.abrirTernero?.(registro)}>
        Registrar
      </button>
    ) : '--'
  }
];

const filtros = [
  { id: 'estado', accessor: (registro) => registro.estado }
];

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
  const [formularioTernero, setFormularioTernero] = useState(estadoTerneroInicial);
  const [cruce, setCruce] = useState({ macho: '', hembra: '' });
  const [resultadoCruce, setResultadoCruce] = useState(null);
  const [evaluandoCruce, setEvaluandoCruce] = useState(false);

  const cargarDatos = async () => {
    try {
      setError('');
      const [registrosData, animalesData] = await Promise.all([
        obtenerRegistrosReproductivos(),
        obtenerAnimales()
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
    cargarDatos();
  }, []);

  const guardarRegistro = async (registro) => {
    try {
      setGuardando(true);
      setErrorFormulario('');
      if (registroSeleccionado?._id) {
        await actualizarRegistroReproductivo(registroSeleccionado._id, registro);
      } else {
        await crearRegistroReproductivo(registro);
      }
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
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const abrirEdicionRegistro = (registro) => {
    setRegistroSeleccionado(registro);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const cancelarFormulario = () => {
    setRegistroSeleccionado(null);
    setModoFormulario(false);
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

  if (modoFormulario) {
    return (
      <FormularioReproduccion
        animales={animales}
        registroInicial={registroSeleccionado}
        modo={registroSeleccionado ? 'editar' : 'crear'}
        onCancelar={cancelarFormulario}
        onGuardar={guardarRegistro}
        guardando={guardando}
        error={errorFormulario}
      />
    );
  }

  return (
    <>
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

      <TablaDinamica
        titulo="Gestión Reproductiva"
        subtitulo="Reproduccion"
        columnas={columnas}
        datos={registros.map((registro) => ({
          ...registro,
          abrirTernero: abrirFormularioTernero,
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
              <label>DIIO<input name="diio" value={formularioTernero.diio} onChange={actualizarCampoTernero} required /></label>
              <label>Identificador finca<input name="identificadorFinca" value={formularioTernero.identificadorFinca} onChange={actualizarCampoTernero} placeholder="Si se deja vacío usa el DIIO" /></label>
              <label>Nombre<input name="nombre" value={formularioTernero.nombre} onChange={actualizarCampoTernero} /></label>
              <label>Sexo<select name="sexo" value={formularioTernero.sexo} onChange={actualizarCampoTernero}><option value="Hembra">Hembra</option><option value="Macho">Macho</option></select></label>
              <label>Raza<input name="raza" value={formularioTernero.raza} onChange={actualizarCampoTernero} /></label>
              <label>Padre DIIO<input name="padreDiio" value={formularioTernero.padreDiio} onChange={actualizarCampoTernero} /></label>
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
    </>
  );
};

export default Reproduccion;
