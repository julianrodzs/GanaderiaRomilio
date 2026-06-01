import React, { useEffect, useState } from 'react';
import { actualizarAnimal, crearAnimal, eliminarAnimal, obtenerAnimales } from '../services/api';
import FormularioAnimal from './FormularioAnimal';
import TablaDinamica from './TablaDinamica';

const columnas = [
  { id: 'diio', label: 'DIIO', accessor: (animal) => animal.diio },
  { id: 'nombre', label: 'Nombre', accessor: (animal) => animal.nombre },
  { id: 'sexo', label: 'Sexo', accessor: (animal) => animal.sexo },
  { id: 'pesoActual', label: 'Peso actual', accessor: (animal) => animal.pesoActual },
  { id: 'estado', label: 'Estado', accessor: (animal) => animal.estado }
];

const filtros = [
  { id: 'sexo', accessor: (animal) => animal.sexo },
  { id: 'estado', accessor: (animal) => animal.estado }
];

const Animales = () => {
  const [animales, setAnimales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [modoFormulario, setModoFormulario] = useState(false);
  const [animalSeleccionado, setAnimalSeleccionado] = useState(null);

  const cargarAnimales = async () => {
    try {
      setError('');
      const data = await obtenerAnimales();
      setAnimales(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarAnimales();
  }, []);

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

  const abrirEdicionAnimal = (animal) => {
    setAnimalSeleccionado(animal);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const cancelarFormulario = () => {
    setAnimalSeleccionado(null);
    setModoFormulario(false);
  };

  if (modoFormulario) {
    return (
      <FormularioAnimal
        animalInicial={animalSeleccionado}
        modo={animalSeleccionado ? 'editar' : 'crear'}
        onCancelar={cancelarFormulario}
        onGuardar={guardarAnimal}
        guardando={guardando}
        error={errorFormulario}
      />
    );
  }

  return (
    <TablaDinamica
      titulo="Animales"
      subtitulo="Inventario"
      columnas={columnas}
      datos={animales}
      cargando={cargando}
      error={error}
      filtros={filtros}
      textoAgregar="Nuevo animal"
      onAgregar={abrirNuevoAnimal}
      onEditar={abrirEdicionAnimal}
      onEliminar={borrarAnimal}
    />
  );
};

export default Animales;
