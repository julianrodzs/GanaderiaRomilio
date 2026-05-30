import React, { useEffect, useState } from 'react';
import { actualizarPotrero, crearPotrero, eliminarPotrero, obtenerPotreros } from '../services/api';
import FormularioPotrero from './FormularioPotrero';
import TablaDinamica from './TablaDinamica';

const columnas = [
  { id: 'codigo', label: 'Codigo', accessor: (potrero) => potrero.codigo },
  { id: 'nombre', label: 'Nombre', accessor: (potrero) => potrero.nombre },
  { id: 'capacidadMaxima', label: 'Capacidad', accessor: (potrero) => potrero.capacidadMaxima },
  { id: 'ubicacion', label: 'Ubicacion', accessor: (potrero) => potrero.ubicacion },
  { id: 'estado', label: 'Estado', accessor: (potrero) => potrero.estado }
];

const filtros = [
  { id: 'estado', accessor: (potrero) => potrero.estado }
];

const Potreros = () => {
  const [potreros, setPotreros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [modoFormulario, setModoFormulario] = useState(false);
  const [potreroSeleccionado, setPotreroSeleccionado] = useState(null);

  const cargarPotreros = async () => {
    try {
      setError('');
      const data = await obtenerPotreros();
      setPotreros(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarPotreros();
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
      await cargarPotreros();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrarPotrero = async (potrero) => {
    const confirmar = window.confirm(`¿Eliminar el potrero ${potrero.codigo || potrero.nombre || ''}?`);
    if (!confirmar) return;

    try {
      await eliminarPotrero(potrero._id);
      setCargando(true);
      await cargarPotreros();
    } catch (err) {
      setError(err.message);
    }
  };

  const abrirNuevoPotrero = () => {
    setPotreroSeleccionado(null);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const abrirEdicionPotrero = (potrero) => {
    setPotreroSeleccionado(potrero);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const cancelarFormulario = () => {
    setPotreroSeleccionado(null);
    setModoFormulario(false);
  };

  if (modoFormulario) {
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
    </section>
  );
};

export default Potreros;
