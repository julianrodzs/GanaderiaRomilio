import React, { useEffect, useState } from 'react';
import { obtenerAnimales } from '../services/api';
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
  const [error, setError] = useState('');

  useEffect(() => {
    const cargarAnimales = async () => {
      try {
        const data = await obtenerAnimales();
        setAnimales(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    };

    cargarAnimales();
  }, []);

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
    />
  );
};

export default Animales;
