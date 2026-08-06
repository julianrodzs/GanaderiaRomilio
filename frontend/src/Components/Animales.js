import React, { useEffect, useState } from 'react';
import {
  actualizarAnimal,
  actualizarCamada,
  cancelarCamada,
  cerrarCamada,
  crearCamada,
  crearAnimal,
  crearEventoAnimal,
  eliminarAnimal,
  eliminarCamada,
  obtenerAnimales,
  obtenerArbolGenealogico,
  obtenerCamadas,
  obtenerDescendenciaAnimal,
  obtenerEventosAnimal,
  obtenerPesajesPorAnimal,
  registrarDesteteCamada
} from '../services/api';
import { guardarInventarioOffline, obtenerInventarioOffline } from '../services/offlineStorage';
import FormularioAnimal from './FormularioAnimal';
import FormularioCamada from './FormularioCamada';
import SelectorEspecie from './SelectorEspecie';
import TablaDinamica from './TablaDinamica';

const obtenerEspecieInicial = () => localStorage.getItem('ganaderiaEspecie') || 'Bovino';

const calcularEdadMeses = (fechaNacimiento) => {
  if (!fechaNacimiento) return null;

  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return null;

  const hoy = new Date();
  let meses = (hoy.getFullYear() - nacimiento.getFullYear()) * 12;
  meses += hoy.getMonth() - nacimiento.getMonth();

  if (hoy.getDate() < nacimiento.getDate()) {
    meses -= 1;
  }

  return Math.max(meses, 0);
};

const formatearEdad = (fechaNacimiento) => {
  const meses = calcularEdadMeses(fechaNacimiento);
  if (meses === null) return '--';

  const anios = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;

  if (anios === 0) return `${mesesRestantes} meses`;
  if (mesesRestantes === 0) return `${anios} años`;
  return `${anios} años ${mesesRestantes} meses`;
};

const estaListaMontaPorEdad = (animal) => animal.sexo === 'Hembra' && (calcularEdadMeses(animal.fechaNacimiento) || 0) >= 24;

const obtenerEstadoMontaEdad = (animal) => {
  if (animal.sexo !== 'Hembra') return 'No aplica';
  return estaListaMontaPorEdad(animal) ? 'Lista' : 'Esperar';
};

const obtenerCategoriaAnimal = (animal) => {
  if (animal.categoria) return animal.categoria;
  if (animal.especie === 'Porcino') return animal.sexo === 'Macho' ? 'Verraco' : 'Chancha';

  const meses = calcularEdadMeses(animal.fechaNacimiento);
  if (meses !== null && meses < 12) return 'Ternero';
  if (animal.sexo === 'Hembra') return meses !== null && meses >= 24 ? 'Vaca' : 'Novilla';
  if (animal.sexo === 'Macho') return meses !== null && meses >= 24 ? 'Toro' : 'Novillo';
  return '--';
};

const formatearFecha = (fecha) => {
  if (!fecha) return '--';
  return new Date(fecha).toLocaleDateString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const calcularDiasDestete = (animal) => {
  if (!animal.fechaNacimiento || !animal.fechaDestete) return '--';

  const nacimiento = new Date(animal.fechaNacimiento);
  const destete = new Date(animal.fechaDestete);
  if (Number.isNaN(nacimiento.getTime()) || Number.isNaN(destete.getTime())) return '--';

  return `${Math.max(Math.round((destete - nacimiento) / (1000 * 60 * 60 * 24)), 0)} dias`;
};

const formatearPeso = (peso) => {
  if (peso === null || peso === undefined || peso === '') return '--';
  return `${peso} kg`;
};

const formatearMoneda = (valor) => {
  if (valor === null || valor === undefined || valor === '') return '--';
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0
  }).format(valor || 0);
};

const etiquetaAnimal = (animal) => {
  if (!animal) return '';
  if (animal.externo) return `${animal.nombre || 'Externo'} (externo)`;
  const codigo = animal.diio || animal.identificadorFinca || animal.nombre || '';
  return `${codigo}${animal.nombre && codigo !== animal.nombre ? ` - ${animal.nombre}` : ''}`;
};

const NodoGenealogico = ({ nodo, titulo = 'Animal' }) => {
  if (!nodo?.animal) return null;

  return (
    <article className={`genealogia-nodo ${nodo.animal.externo ? 'externo' : ''}`}>
      <span>{titulo}</span>
      <strong>{etiquetaAnimal(nodo.animal) || '--'}</strong>
      <small>{nodo.animal.sexo || 'Sin sexo registrado'}</small>
      {(nodo.padre || nodo.madre) && (
        <div className="genealogia-ramas">
          <NodoGenealogico nodo={nodo.padre} titulo="Padre" />
          <NodoGenealogico nodo={nodo.madre} titulo="Madre" />
        </div>
      )}
    </article>
  );
};

const columnas = [
  {
    id: 'diio',
    label: 'DIIO',
    accessor: (animal) => animal.diio,
    render: (animal) => (
      <button className="tabla-link" type="button" onClick={() => animal.abrirDetalle?.(animal)}>
        {animal.diio || '--'}
      </button>
    )
  },
  { id: 'nombre', label: 'Nombre', accessor: (animal) => animal.nombre },
  { id: 'categoria', label: 'Categoría', accessor: obtenerCategoriaAnimal },
  { id: 'sexo', label: 'Sexo', accessor: (animal) => animal.sexo },
  { id: 'edad', label: 'Edad', accessor: (animal) => formatearEdad(animal.fechaNacimiento) },
  {
    id: 'listaMontaEdad',
    label: 'Edad reproductiva',
    accessor: obtenerEstadoMontaEdad,
    render: (animal) => (
      <span className={estaListaMontaPorEdad(animal) ? 'estado-badge estado-Gestante' : 'estado-badge estado-Vacía'}>
        {obtenerEstadoMontaEdad(animal)}
      </span>
    )
  },
  { id: 'pesoActual', label: 'Peso actual', accessor: (animal) => animal.pesoActual },
  { id: 'estado', label: 'Estado', accessor: (animal) => animal.estado }
];

const filtros = [
  { id: 'categoria', accessor: obtenerCategoriaAnimal },
  { id: 'sexo', accessor: (animal) => animal.sexo },
  { id: 'estado', accessor: (animal) => animal.estado }
];

const columnasCamadas = [
  {
    id: 'codigoCamada',
    label: 'Camada',
    accessor: (camada) => camada.codigoCamada,
    render: (camada) => (
      <button className="tabla-link" type="button" onClick={() => camada.abrirDetalle?.(camada)}>
        {camada.codigoCamada || '--'}
      </button>
    )
  },
  { id: 'madre', label: 'Madre', accessor: (camada) => etiquetaAnimal(camada.madre) },
  { id: 'fechaNacimiento', label: 'Nacimiento', accessor: (camada) => formatearFecha(camada.fechaNacimiento), sortAccessor: (camada) => new Date(camada.fechaNacimiento || 0).getTime() },
  { id: 'nacidosVivos', label: 'Nacidos vivos', accessor: (camada) => camada.nacidosVivos },
  { id: 'destetados', label: 'Destetados', accessor: (camada) => camada.destetados },
  { id: 'destino', label: 'Destino', accessor: (camada) => camada.destino },
  {
    id: 'estado',
    label: 'Estado',
    accessor: (camada) => camada.estado,
    render: (camada) => <span className={`estado-badge estado-camada-${camada.estado}`}>{camada.estado}</span>
  },
  {
    id: 'manejo',
    label: 'Manejo',
    accessor: (camada) => camada.estado,
    render: (camada) => camada.soloLectura ? '--' : (
      <div className="acciones-ciclo">
        <button type="button" onClick={() => camada.destetar?.(camada)} disabled={camada.estado !== 'Activa'}>Destetar</button>
        <button type="button" onClick={() => camada.cerrar?.(camada)} disabled={camada.estado === 'Cerrada'}>Cerrar</button>
        <button type="button" onClick={() => camada.cancelar?.(camada)} disabled={camada.estado === 'Cancelada'}>Cancelar</button>
      </div>
    )
  }
];

const filtrosCamadas = [
  { id: 'estado', accessor: (camada) => camada.estado },
  { id: 'destino', accessor: (camada) => camada.destino }
];

const Animales = ({ soloLectura = false }) => {
  const [animales, setAnimales] = useState([]);
  const [camadas, setCamadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoCamadas, setCargandoCamadas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorCamadas, setErrorCamadas] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [modoFormulario, setModoFormulario] = useState(false);
  const [modoFormularioCamada, setModoFormularioCamada] = useState(false);
  const [animalSeleccionado, setAnimalSeleccionado] = useState(null);
  const [camadaSeleccionada, setCamadaSeleccionada] = useState(null);
  const [camadaDetalle, setCamadaDetalle] = useState(null);
  const [animalDetalle, setAnimalDetalle] = useState(null);
  const [eventosAnimal, setEventosAnimal] = useState([]);
  const [pesajesAnimal, setPesajesAnimal] = useState([]);
  const [arbolGenealogico, setArbolGenealogico] = useState(null);
  const [descendenciaAnimal, setDescendenciaAnimal] = useState(null);
  const [cargandoEventos, setCargandoEventos] = useState(false);
  const [cargandoPesajes, setCargandoPesajes] = useState(false);
  const [cargandoGenealogia, setCargandoGenealogia] = useState(false);
  const [errorEventos, setErrorEventos] = useState('');
  const [errorPesajes, setErrorPesajes] = useState('');
  const [errorGenealogia, setErrorGenealogia] = useState('');
  const [observacionManual, setObservacionManual] = useState('');
  const [guardandoEvento, setGuardandoEvento] = useState(false);
  const [especie, setEspecie] = useState(obtenerEspecieInicial);
  const [vistaPorcina, setVistaPorcina] = useState('Animales');
  const etiquetaId = 'DIIO';

  const cambiarEspecie = (valor) => {
    localStorage.setItem('ganaderiaEspecie', valor);
    setEspecie(valor);
    setVistaPorcina('Animales');
  };

  const cargarAnimales = async () => {
    try {
      setError('');
      const data = await obtenerAnimales({ especie });
      setAnimales(data);
      if (soloLectura) {
        await guardarInventarioOffline(data);
      }
    } catch (err) {
      if (soloLectura) {
        const datosOffline = await obtenerInventarioOffline().catch(() => []);
        setAnimales(datosOffline);
        setError(datosOffline.length ? 'Sin conexion. Mostrando inventario guardado en este dispositivo.' : err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setCargando(false);
    }
  };

  const cargarCamadas = async () => {
    if (especie !== 'Porcino') {
      setCamadas([]);
      return;
    }

    try {
      setCargandoCamadas(true);
      setErrorCamadas('');
      const data = await obtenerCamadas();
      setCamadas(data);
    } catch (err) {
      setErrorCamadas(err.message);
    } finally {
      setCargandoCamadas(false);
    }
  };

  useEffect(() => {
    setCargando(true);
    cargarAnimales();
  }, [especie]);

  useEffect(() => {
    cargarCamadas();
  }, [especie]);

  const guardarAnimal = async (animal) => {
    try {
      setGuardando(true);
      setErrorFormulario('');
      if (animalSeleccionado?._id) {
        await actualizarAnimal(animalSeleccionado._id, animal);
      } else {
        await crearAnimal(animal);
      }
      setAnimalSeleccionado(null);
      setModoFormulario(false);
      setCargando(true);
      await cargarAnimales();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const guardarCamada = async (camada) => {
    try {
      setGuardando(true);
      setErrorFormulario('');
      if (camadaSeleccionada?._id) {
        await actualizarCamada(camadaSeleccionada._id, camada);
      } else {
        await crearCamada(camada);
      }
      setCamadaSeleccionada(null);
      setModoFormularioCamada(false);
      await cargarCamadas();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrarAnimal = async (animal) => {
    const confirmar = window.confirm(`¿Eliminar el animal ${animal.diio || animal.nombre || ''}? Esta accion no se puede deshacer.`);
    if (!confirmar) return;

    try {
      await eliminarAnimal(animal._id);
      window.alert('Animal eliminado correctamente.');
      setCargando(true);
      await cargarAnimales();
    } catch (err) {
      setError(err.message);
    }
  };

  const abrirNuevoAnimal = () => {
    setAnimalSeleccionado(null);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const abrirNuevaCamada = () => {
    setCamadaSeleccionada(null);
    setErrorFormulario('');
    setModoFormularioCamada(true);
  };

  const abrirEdicionCamada = (camada) => {
    setCamadaSeleccionada(camada);
    setErrorFormulario('');
    setModoFormularioCamada(true);
  };

  const abrirEdicionAnimal = (animal) => {
    setAnimalSeleccionado(animal);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const cargarEventosAnimal = async (animalId) => {
    try {
      setCargandoEventos(true);
      setErrorEventos('');
      const eventos = await obtenerEventosAnimal(animalId);
      setEventosAnimal(eventos);
    } catch (err) {
      setErrorEventos(err.message);
    } finally {
      setCargandoEventos(false);
    }
  };

  const cargarPesajesAnimal = async (animalId) => {
    try {
      setCargandoPesajes(true);
      setErrorPesajes('');
      const pesajes = await obtenerPesajesPorAnimal(animalId);
      setPesajesAnimal(pesajes);
    } catch (err) {
      setErrorPesajes(err.message);
    } finally {
      setCargandoPesajes(false);
    }
  };

  const cargarGenealogiaAnimal = async (animalId) => {
    try {
      setCargandoGenealogia(true);
      setErrorGenealogia('');
      const [arbol, descendencia] = await Promise.all([
        obtenerArbolGenealogico(animalId, 3),
        obtenerDescendenciaAnimal(animalId)
      ]);
      setArbolGenealogico(arbol);
      setDescendenciaAnimal(descendencia);
    } catch (err) {
      setErrorGenealogia(err.message);
    } finally {
      setCargandoGenealogia(false);
    }
  };

  const abrirDetalleAnimal = async (animal) => {
    setAnimalDetalle(animal);
    setObservacionManual('');
    setEventosAnimal([]);
    setPesajesAnimal([]);
    setArbolGenealogico(null);
    setDescendenciaAnimal(null);
    await Promise.all([
      cargarEventosAnimal(animal._id),
      cargarPesajesAnimal(animal._id),
      cargarGenealogiaAnimal(animal._id)
    ]);
  };

  const cerrarDetalleAnimal = () => {
    setAnimalDetalle(null);
    setEventosAnimal([]);
    setPesajesAnimal([]);
    setArbolGenealogico(null);
    setDescendenciaAnimal(null);
    setObservacionManual('');
    setErrorEventos('');
    setErrorPesajes('');
    setErrorGenealogia('');
  };

  const crearObservacionManual = async (evento) => {
    evento.preventDefault();
    if (!observacionManual.trim() || !animalDetalle?._id) return;

    try {
      setGuardandoEvento(true);
      setErrorEventos('');
      await crearEventoAnimal({
        animal: animalDetalle._id,
        tipoEvento: 'Observacion',
        fecha: new Date().toISOString(),
        titulo: 'Observación manual',
        descripcion: observacionManual.trim(),
        moduloOrigen: 'Manual'
      });
      setObservacionManual('');
      await cargarEventosAnimal(animalDetalle._id);
    } catch (err) {
      setErrorEventos(err.message);
    } finally {
      setGuardandoEvento(false);
    }
  };

  const cancelarFormulario = () => {
    setAnimalSeleccionado(null);
    setModoFormulario(false);
  };

  const cancelarFormularioCamada = () => {
    setCamadaSeleccionada(null);
    setModoFormularioCamada(false);
  };

  const borrarCamada = async (camada) => {
    const confirmar = window.confirm(`¿Eliminar la camada ${camada.codigoCamada || ''}? Esta accion no se puede deshacer.`);
    if (!confirmar) return;

    try {
      await eliminarCamada(camada._id);
      window.alert('Camada eliminada correctamente.');
      await cargarCamadas();
    } catch (err) {
      setErrorCamadas(err.message);
    }
  };

  const destetarCamada = async (camada) => {
    const destetados = window.prompt('Cantidad de crías destetadas:', camada.destetados || camada.nacidosVivos || '');
    if (destetados === null) return;
    const fechaDesteteReal = window.prompt('Fecha real de destete (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (fechaDesteteReal === null) return;

    try {
      await registrarDesteteCamada(camada._id, {
        destetados,
        fechaDesteteReal
      });
      await cargarCamadas();
    } catch (err) {
      setErrorCamadas(err.message);
    }
  };

  const cerrarRegistroCamada = async (camada) => {
    const observaciones = window.prompt('Observaciones de cierre:', 'Camada cerrada');
    if (observaciones === null) return;

    try {
      await cerrarCamada(camada._id, observaciones);
      await cargarCamadas();
    } catch (err) {
      setErrorCamadas(err.message);
    }
  };

  const cancelarRegistroCamada = async (camada) => {
    const observaciones = window.prompt('Motivo de cancelación:', 'Camada cancelada');
    if (observaciones === null) return;

    try {
      await cancelarCamada(camada._id, observaciones);
      await cargarCamadas();
    } catch (err) {
      setErrorCamadas(err.message);
    }
  };

  const pesajesConDiferencia = [...pesajesAnimal]
    .sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0))
    .map((pesaje, indice, lista) => ({
      ...pesaje,
      diferencia: indice === 0 ? null : Number(pesaje.peso || 0) - Number(lista[indice - 1].peso || 0)
    }))
    .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));

  const formatearDiferenciaPeso = (diferencia) => {
    if (diferencia === null || diferencia === undefined || Number.isNaN(diferencia)) return '--';
    if (diferencia > 0) return `+${diferencia} kg`;
    return `${diferencia} kg`;
  };

  if (modoFormulario) {
    return (
      <FormularioAnimal
        animalInicial={animalSeleccionado}
        animales={animales}
        modo={animalSeleccionado ? 'editar' : 'crear'}
        onCancelar={cancelarFormulario}
        onGuardar={guardarAnimal}
        guardando={guardando}
        error={errorFormulario}
      />
    );
  }

  if (modoFormularioCamada) {
    return (
      <FormularioCamada
        madres={animales.filter((animal) => animal.especie === 'Porcino' && animal.sexo === 'Hembra')}
        camadaInicial={camadaSeleccionada}
        modo={camadaSeleccionada ? 'editar' : 'crear'}
        onCancelar={cancelarFormularioCamada}
        onGuardar={guardarCamada}
        guardando={guardando}
        error={errorFormulario}
      />
    );
  }

  return (
    <>
      <SelectorEspecie valor={especie} onChange={cambiarEspecie} />
      {especie === 'Porcino' && (
        <div className="inventario-tabs">
          <button className={vistaPorcina === 'Animales' ? 'activo' : ''} type="button" onClick={() => setVistaPorcina('Animales')}>
            Animales
          </button>
          <button className={vistaPorcina === 'Camadas' ? 'activo' : ''} type="button" onClick={() => setVistaPorcina('Camadas')}>
            Camadas
          </button>
        </div>
      )}

      {especie === 'Porcino' && vistaPorcina === 'Camadas' ? (
        <TablaDinamica
          titulo="Camadas porcinas"
          subtitulo="Inventario"
          columnas={columnasCamadas}
          datos={camadas.map((camada) => ({
            ...camada,
            abrirDetalle: setCamadaDetalle,
            destetar: destetarCamada,
            cerrar: cerrarRegistroCamada,
            cancelar: cancelarRegistroCamada,
            soloLectura
          }))}
          cargando={cargandoCamadas}
          error={errorCamadas}
          filtros={filtrosCamadas}
          textoAgregar="Nueva camada"
          onAgregar={soloLectura ? undefined : abrirNuevaCamada}
          onEditar={soloLectura ? undefined : abrirEdicionCamada}
          onEliminar={soloLectura ? undefined : borrarCamada}
          mostrarAcciones={!soloLectura}
        />
      ) : (
        <TablaDinamica
          titulo={especie === 'Porcino' ? 'Porcinos' : 'Bovinos'}
          subtitulo="Inventario"
          columnas={columnas.map((columna) => columna.id === 'diio' ? { ...columna, label: etiquetaId } : columna)}
          datos={animales.map((animal) => ({ ...animal, abrirDetalle: abrirDetalleAnimal }))}
          cargando={cargando}
          error={error}
          filtros={filtros}
          textoAgregar="Nuevo animal"
          onAgregar={soloLectura ? undefined : abrirNuevoAnimal}
          onEditar={soloLectura ? undefined : abrirEdicionAnimal}
          onEliminar={soloLectura ? undefined : borrarAnimal}
          mostrarAcciones={!soloLectura}
        />
      )}

      {camadaDetalle && (
        <div className="modal-backdrop">
          <section className="modal-panel detalle-animal-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Detalle camada</p>
                <h2>{camadaDetalle.codigoCamada}</h2>
              </div>
              <button className="boton-link" type="button" onClick={() => setCamadaDetalle(null)}>Cerrar</button>
            </div>

            <div className="detalle-animal-grid">
              <article><span>Madre</span><strong>{etiquetaAnimal(camadaDetalle.madre)}</strong></article>
              <article><span>Estado</span><strong>{camadaDetalle.estado || '--'}</strong></article>
              <article><span>Destino</span><strong>{camadaDetalle.destino || '--'}</strong></article>
              <article><span>Nacimiento</span><strong>{formatearFecha(camadaDetalle.fechaNacimiento)}</strong></article>
              <article><span>Destete estimado</span><strong>{formatearFecha(camadaDetalle.fechaDesteteEstimada)}</strong></article>
              <article><span>Destete real</span><strong>{formatearFecha(camadaDetalle.fechaDesteteReal)}</strong></article>
              <article><span>Nacidos totales</span><strong>{camadaDetalle.nacidosTotales ?? '--'}</strong></article>
              <article><span>Nacidos vivos</span><strong>{camadaDetalle.nacidosVivos ?? '--'}</strong></article>
              <article><span>Nacidos muertos</span><strong>{camadaDetalle.nacidosMuertos ?? '--'}</strong></article>
              <article><span>Momias</span><strong>{camadaDetalle.momias ?? '--'}</strong></article>
              <article><span>Destetados</span><strong>{camadaDetalle.destetados ?? '--'}</strong></article>
              <article><span>Muertos pre-destete</span><strong>{camadaDetalle.muertosPreDestete ?? '--'}</strong></article>
              <article><span>Peso prom. nacimiento</span><strong>{formatearPeso(camadaDetalle.pesoPromedioNacimiento)}</strong></article>
              <article><span>Peso prom. destete</span><strong>{formatearPeso(camadaDetalle.pesoPromedioDestete)}</strong></article>
              <article><span>Peso total destete</span><strong>{formatearPeso(camadaDetalle.pesoTotalDestete)}</strong></article>
            </div>

            {camadaDetalle.observaciones && (
              <div className="detalle-observaciones">
                <span>Observaciones</span>
                <p>{camadaDetalle.observaciones}</p>
              </div>
            )}

            {(camadaDetalle.tareasGeneradas || []).length > 0 && (
              <div className="detalle-observaciones">
                <span>Tareas generadas</span>
                <p>{camadaDetalle.tareasGeneradas.length} tareas automáticas asociadas a esta camada.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {animalDetalle && (
        <div className="modal-backdrop">
          <section className="modal-panel detalle-animal-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Detalle animal</p>
                <h2>{animalDetalle.diio || animalDetalle.nombre || 'Animal'}</h2>
              </div>
              <button className="boton-link" type="button" onClick={cerrarDetalleAnimal}>Cerrar</button>
            </div>

            <div className="detalle-animal-grid">
              <article>
                <span>Categoría</span>
                <strong>{obtenerCategoriaAnimal(animalDetalle)}</strong>
              </article>
              <article>
                <span>Edad</span>
                <strong>{formatearEdad(animalDetalle.fechaNacimiento)}</strong>
              </article>
              <article>
                <span>Edad reproductiva</span>
                <strong>{estaListaMontaPorEdad(animalDetalle) ? 'Sí' : 'No'}</strong>
              </article>
              <article>
                <span>Madre</span>
                <strong>{etiquetaAnimal(animalDetalle.madre) || animalDetalle.madreExternaNombre || animalDetalle.madreDiio || '--'}</strong>
              </article>
              <article>
                <span>Padre</span>
                <strong>{etiquetaAnimal(animalDetalle.padre) || animalDetalle.padreExternoNombre || animalDetalle.padreDiio || '--'}</strong>
              </article>
              <article>
                <span>Fecha nacimiento</span>
                <strong>{formatearFecha(animalDetalle.fechaNacimiento)}</strong>
              </article>
              <article>
                <span>Peso al nacer</span>
                <strong>{formatearPeso(animalDetalle.pesoNacimiento)}</strong>
              </article>
              <article>
                <span>Fecha destete</span>
                <strong>{formatearFecha(animalDetalle.fechaDestete)}</strong>
              </article>
              <article>
                <span>Tiempo destete</span>
                <strong>{calcularDiasDestete(animalDetalle)}</strong>
              </article>
              <article>
                <span>Peso al destete</span>
                <strong>{formatearPeso(animalDetalle.pesoDestete)}</strong>
              </article>
              <article>
                <span>Peso actual</span>
                <strong>{formatearPeso(animalDetalle.pesoActual)}</strong>
              </article>
              <article>
                <span>Peso compra</span>
                <strong>{formatearPeso(animalDetalle.pesoCompra)}</strong>
              </article>
              <article>
                <span>Peso venta</span>
                <strong>{formatearPeso(animalDetalle.pesoVenta)}</strong>
              </article>
              <article>
                <span>Precio compra por kg</span>
                <strong>{formatearMoneda(animalDetalle.precioCompraPorKg)}</strong>
              </article>
              <article>
                <span>Precio venta por kg</span>
                <strong>{formatearMoneda(animalDetalle.precioVentaPorKg)}</strong>
              </article>
              <article>
                <span>Monto compra</span>
                <strong>{formatearMoneda(animalDetalle.montoCompra)}</strong>
              </article>
              <article>
                <span>Monto venta</span>
                <strong>{formatearMoneda(animalDetalle.montoVenta)}</strong>
              </article>
              <article>
                <span>Fecha compra</span>
                <strong>{formatearFecha(animalDetalle.fechaCompra)}</strong>
              </article>
              <article>
                <span>Fecha venta</span>
                <strong>{formatearFecha(animalDetalle.fechaVenta)}</strong>
              </article>
              <article>
                <span>Fecha muerte</span>
                <strong>{formatearFecha(animalDetalle.fechaMuerte)}</strong>
              </article>
            </div>

            {animalDetalle.observaciones && (
              <div className="detalle-observaciones">
                <span>Observaciones</span>
                <p>{animalDetalle.observaciones}</p>
              </div>
            )}

            <section className="genealogia-animal">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">Genealogía</p>
                  <h2>Árbol familiar</h2>
                </div>
                {!soloLectura && (
                  <button className="boton-link" type="button" onClick={() => abrirEdicionAnimal(animalDetalle)}>
                    Editar genealogía
                  </button>
                )}
              </div>

              {errorGenealogia && <div className="alerta-formulario">{errorGenealogia}</div>}
              {cargandoGenealogia && <span className="reporte-vacio">Cargando genealogía...</span>}

              {!cargandoGenealogia && (
                <>
                  <div className="detalle-animal-grid">
                    <article><span>Padre</span><strong>{etiquetaAnimal(animalDetalle.padre) || animalDetalle.padreExternoNombre || animalDetalle.padreDiio || '--'}</strong></article>
                    <article><span>Madre</span><strong>{etiquetaAnimal(animalDetalle.madre) || animalDetalle.madreExternaNombre || animalDetalle.madreDiio || '--'}</strong></article>
                    <article><span>Origen</span><strong>{animalDetalle.origenGenealogico || 'Desconocido'}</strong></article>
                    <article><span>Registro</span><strong>{animalDetalle.registroGenealogico || '--'}</strong></article>
                  </div>

                  {animalDetalle.observacionesGenealogicas && (
                    <div className="detalle-observaciones">
                      <span>Observaciones genealógicas</span>
                      <p>{animalDetalle.observacionesGenealogicas}</p>
                    </div>
                  )}

                  <div className="genealogia-arbol">
                    {arbolGenealogico?.animal ? (
                      <NodoGenealogico nodo={arbolGenealogico} titulo="Animal" />
                    ) : (
                      <div className="bitacora-vacia">
                        <strong>Sin árbol genealógico registrado.</strong>
                        <span>Agrega padre o madre para empezar a construir la línea familiar.</span>
                      </div>
                    )}
                  </div>

                  <div className="genealogia-descendencia">
                    <h3>Descendencia</h3>
                    <div className="detalle-animal-grid">
                      <article><span>Hijos</span><strong>{descendenciaAnimal?.hijos?.length || 0}</strong></article>
                      <article><span>Nietos</span><strong>{descendenciaAnimal?.nietos?.length || 0}</strong></article>
                      <article><span>Total descendientes</span><strong>{descendenciaAnimal?.totalDescendientes || 0}</strong></article>
                    </div>
                    {(descendenciaAnimal?.hijos || []).length > 0 && (
                      <div className="chips-lista">
                        {descendenciaAnimal.hijos.map((hijo) => (
                          <span key={hijo._id}>{etiquetaAnimal(hijo)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>

            <section className="historial-pesajes-animal">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">Crecimiento</p>
                  <h2>Historial de Pesajes</h2>
                </div>
              </div>

              {errorPesajes && <div className="alerta-formulario">{errorPesajes}</div>}
              {cargandoPesajes && <span className="reporte-vacio">Cargando pesajes...</span>}

              {!cargandoPesajes && pesajesConDiferencia.length === 0 && (
                <div className="bitacora-vacia">
                  <strong>Sin pesajes históricos todavía.</strong>
                  <span>Cuando registres pesajes, aquí se verá la evolución de peso del animal.</span>
                </div>
              )}

              {pesajesConDiferencia.length > 0 && (
                <div className="tabla-scroll tabla-dinamica historial-pesajes-tabla">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Peso</th>
                        <th>Diferencia</th>
                        <th>Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pesajesConDiferencia.map((pesaje) => (
                        <tr key={pesaje._id}>
                          <td>{formatearFecha(pesaje.fecha)}</td>
                          <td>{formatearPeso(pesaje.peso)}</td>
                          <td>
                            <span className={pesaje.diferencia >= 0 ? 'peso-diferencia positiva' : 'peso-diferencia negativa'}>
                              {formatearDiferenciaPeso(pesaje.diferencia)}
                            </span>
                          </td>
                          <td>{pesaje.observaciones || '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="bitacora-animal">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">Historial</p>
                  <h2>Bitácora</h2>
                </div>
              </div>

              {!soloLectura && (
                <form className="bitacora-form" onSubmit={crearObservacionManual}>
                  <label>
                    Nueva observación
                    <textarea
                      rows="3"
                      value={observacionManual}
                      onChange={(evento) => setObservacionManual(evento.target.value)}
                      placeholder="Agregar una nota manual al historial del animal"
                    />
                  </label>
                  <button className="boton-primario compacto" type="submit" disabled={guardandoEvento || !observacionManual.trim()}>
                    {guardandoEvento ? 'Guardando...' : 'Agregar observación'}
                  </button>
                </form>
              )}

              {errorEventos && <div className="alerta-formulario">{errorEventos}</div>}
              {cargandoEventos && <span className="reporte-vacio">Cargando bitácora...</span>}

              {!cargandoEventos && eventosAnimal.length === 0 && (
                <div className="bitacora-vacia">
                  <strong>Sin eventos registrados todavía.</strong>
                  <span>
                    Los próximos registros de nacimiento, compra, venta, muerte, pesaje, sanidad,
                    reproducción u observaciones aparecerán aquí automáticamente.
                  </span>
                </div>
              )}

              <div className="bitacora-timeline">
                {eventosAnimal.map((evento) => (
                  <article className="bitacora-evento" key={evento._id}>
                    <div className="bitacora-fecha">
                      <strong>{formatearFecha(evento.fecha)}</strong>
                      <span>{evento.moduloOrigen || 'Manual'}</span>
                    </div>
                    <div className="bitacora-contenido">
                      <span className="estado-badge estado-Gestante">{evento.tipoEvento}</span>
                      <h3>{evento.titulo}</h3>
                      {evento.descripcion && <p>{evento.descripcion}</p>}
                      {evento.referenciaId && (
                        <button
                          className="boton-link bitacora-referencia"
                          type="button"
                          onClick={() => window.alert(`${evento.moduloOrigen}: ${evento.referenciaId}`)}
                        >
                          Ver detalle
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>
        </div>
      )}
    </>
  );
};

export default Animales;
