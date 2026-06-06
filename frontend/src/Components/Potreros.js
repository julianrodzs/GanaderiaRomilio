import React, { useEffect, useState } from 'react';
import {
  actualizarPotrero,
  actualizarRotacion,
  crearPotrero,
  crearRotacion,
  eliminarPotrero,
  eliminarRotacion,
  obtenerPotreros,
  obtenerRotaciones
} from '../services/api';
import FormularioPotrero from './FormularioPotrero';
import FormularioRotacion from './FormularioRotacion';
import TablaDinamica from './TablaDinamica';

const formatearFecha = (fecha) => {
  if (!fecha) return '--';
  return new Date(fecha).toLocaleDateString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const columnas = [
  { id: 'codigo', label: 'Codigo', accessor: (potrero) => potrero.codigo },
  { id: 'nombre', label: 'Nombre', accessor: (potrero) => potrero.nombre },
  { id: 'area', label: 'Area', accessor: (potrero) => potrero.area },
  { id: 'ultimaAplicacionHerbicida', label: 'Ult. herbicida', accessor: (potrero) => formatearFecha(potrero.ultimaAplicacionHerbicida) },
  { id: 'ultimaChapia', label: 'Ult. chapia', accessor: (potrero) => formatearFecha(potrero.ultimaChapia) },
  { id: 'ultimaFertilizacion', label: 'Ult. fertilizacion', accessor: (potrero) => formatearFecha(potrero.ultimaFertilizacion) },
  { id: 'estado', label: 'Estado', accessor: (potrero) => potrero.estado }
];

const filtros = [
  { id: 'estado', accessor: (potrero) => potrero.estado }
];

const obtenerNombrePotrero = (rotacion) => {
  if (!rotacion.potrero) return '--';
  if (typeof rotacion.potrero === 'string') return rotacion.potrero;
  return `${rotacion.potrero.codigo || ''} ${rotacion.potrero.nombre || ''}`.trim();
};

const columnasRotaciones = [
  { id: 'potrero', label: 'Potrero', accessor: obtenerNombrePotrero },
  { id: 'fechaEntrada', label: 'Entrada', accessor: (rotacion) => formatearFecha(rotacion.fechaEntrada) },
  { id: 'fechaSalida', label: 'Salida', accessor: (rotacion) => formatearFecha(rotacion.fechaSalida) },
  { id: 'diasOcupado', label: 'Dias ocupado', accessor: (rotacion) => rotacion.diasOcupado },
  { id: 'diasDescansoPrevio', label: 'Descanso previo', accessor: (rotacion) => rotacion.diasDescansoPrevio },
  { id: 'numeroAnimales', label: 'Animales', accessor: (rotacion) => rotacion.numeroAnimales },
  { id: 'estado', label: 'Estado', accessor: (rotacion) => rotacion.estado }
];

const filtrosRotaciones = [
  { id: 'potrero', accessor: obtenerNombrePotrero },
  { id: 'estado', accessor: (rotacion) => rotacion.estado }
];

const Potreros = () => {
  const [potreros, setPotreros] = useState([]);
  const [rotaciones, setRotaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [modoFormulario, setModoFormulario] = useState(false);
  const [tipoFormulario, setTipoFormulario] = useState('potrero');
  const [potreroSeleccionado, setPotreroSeleccionado] = useState(null);
  const [rotacionSeleccionada, setRotacionSeleccionada] = useState(null);

  const cargarDatos = async () => {
    try {
      setError('');
      const [potrerosData, rotacionesData] = await Promise.all([
        obtenerPotreros(),
        obtenerRotaciones()
      ]);
      setPotreros(potrerosData);
      setRotaciones(rotacionesData);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const guardarPotrero = async (potrero) => {
    try {
      setGuardando(true);
      setErrorFormulario('');
      if (potreroSeleccionado?._id) {
        await actualizarPotrero(potreroSeleccionado._id, potrero);
      } else {
        await crearPotrero(potrero);
      }
      setPotreroSeleccionado(null);
      setModoFormulario(false);
      setCargando(true);
      await cargarDatos();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrarPotrero = async (potrero) => {
    const confirmar = window.confirm(`¿Eliminar el potrero ${potrero.codigo || potrero.nombre || ''}? Esta accion no se puede deshacer.`);
    if (!confirmar) return;

    try {
      await eliminarPotrero(potrero._id);
      window.alert('Potrero eliminado correctamente.');
      setCargando(true);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const abrirNuevoPotrero = () => {
    setPotreroSeleccionado(null);
    setRotacionSeleccionada(null);
    setErrorFormulario('');
    setTipoFormulario('potrero');
    setModoFormulario(true);
  };

  const abrirEdicionPotrero = (potrero) => {
    setPotreroSeleccionado(potrero);
    setRotacionSeleccionada(null);
    setErrorFormulario('');
    setTipoFormulario('potrero');
    setModoFormulario(true);
  };

  const guardarRotacion = async (rotacion) => {
    try {
      setGuardando(true);
      setErrorFormulario('');
      if (rotacionSeleccionada?._id) {
        await actualizarRotacion(rotacionSeleccionada._id, rotacion);
      } else {
        await crearRotacion(rotacion);
      }
      setRotacionSeleccionada(null);
      setModoFormulario(false);
      setCargando(true);
      await cargarDatos();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrarRotacion = async (rotacion) => {
    const confirmar = window.confirm(`¿Eliminar la rotacion ${rotacion.lote || obtenerNombrePotrero(rotacion)}? Esta accion no se puede deshacer.`);
    if (!confirmar) return;

    try {
      await eliminarRotacion(rotacion._id);
      window.alert('Rotacion eliminada correctamente.');
      setCargando(true);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const abrirNuevaRotacion = () => {
    setPotreroSeleccionado(null);
    setRotacionSeleccionada(null);
    setErrorFormulario('');
    setTipoFormulario('rotacion');
    setModoFormulario(true);
  };

  const abrirEdicionRotacion = (rotacion) => {
    setPotreroSeleccionado(null);
    setRotacionSeleccionada(rotacion);
    setErrorFormulario('');
    setTipoFormulario('rotacion');
    setModoFormulario(true);
  };

  const cancelarFormulario = () => {
    setPotreroSeleccionado(null);
    setRotacionSeleccionada(null);
    setModoFormulario(false);
  };

  if (modoFormulario) {
    if (tipoFormulario === 'rotacion') {
      return (
        <FormularioRotacion
          rotacionInicial={rotacionSeleccionada}
          potreros={potreros}
          modo={rotacionSeleccionada ? 'editar' : 'crear'}
          onCancelar={cancelarFormulario}
          onGuardar={guardarRotacion}
          guardando={guardando}
          error={errorFormulario}
        />
      );
    }

    return (
      <FormularioPotrero
        potreroInicial={potreroSeleccionado}
        modo={potreroSeleccionado ? 'editar' : 'crear'}
        onCancelar={cancelarFormulario}
        onGuardar={guardarPotrero}
        guardando={guardando}
        error={errorFormulario}
      />
    );
  }

  return (
    <section className="potreros-page">
      <article className="mapa-potreros-panel">
        <div>
          <p className="eyebrow">Mapa de referencia</p>
          <h2>Rotacion de potreros</h2>
        </div>
        <img src="/assests/mapa-potreros.png" alt="Mapa de potreros de la finca" />
      </article>

      <TablaDinamica
        titulo="Potreros"
        subtitulo="Rotacion"
        columnas={columnas}
        datos={potreros}
        cargando={cargando}
        error={error}
        filtros={filtros}
        textoAgregar="Nuevo potrero"
        onAgregar={abrirNuevoPotrero}
        onEditar={abrirEdicionPotrero}
        onEliminar={borrarPotrero}
      />

      <TablaDinamica
        titulo="Rotaciones"
        subtitulo="Movimientos de potreros"
        columnas={columnasRotaciones}
        datos={rotaciones}
        cargando={cargando}
        error={error}
        filtros={filtrosRotaciones}
        textoAgregar="Nueva rotacion"
        onAgregar={abrirNuevaRotacion}
        onEditar={abrirEdicionRotacion}
        onEliminar={borrarRotacion}
      />
    </section>
  );
};

export default Potreros;
