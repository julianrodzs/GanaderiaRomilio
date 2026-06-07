import React, { useEffect, useState } from 'react';
import {
  actualizarRegistroReproductivo,
  crearRegistroReproductivo,
  eliminarRegistroReproductivo,
  obtenerAnimales,
  obtenerRegistrosReproductivos
} from '../services/api';
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
  { id: 'fechaDestete', label: 'Destete', accessor: (registro) => formatearFecha(registro.fechaDestete) }
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

  const cargarDatos = async () => {
    try {
      setError('');
      const [registrosData, animalesData] = await Promise.all([
        obtenerRegistrosReproductivos(),
        obtenerAnimales()
      ]);
      setRegistros(registrosData);
      setAnimales(animalesData);
    } catch (err) {
      setError(err.message);
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
    <TablaDinamica
      titulo="Gestión Reproductiva"
      subtitulo="Reproduccion"
      columnas={columnas}
      datos={registros}
      cargando={cargando}
      error={error}
      filtros={filtros}
      textoAgregar="Nuevo registro"
      onAgregar={soloLectura ? undefined : abrirNuevoRegistro}
      onEditar={soloLectura ? undefined : abrirEdicionRegistro}
      onEliminar={soloLectura ? undefined : borrarRegistro}
      mostrarAcciones={!soloLectura}
    />
  );
};

export default Reproduccion;
