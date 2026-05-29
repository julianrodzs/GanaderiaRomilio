import React, { useEffect, useState } from 'react';
import { obtenerPotreros } from '../services/api';
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
  const [error, setError] = useState('');

  useEffect(() => {
    const cargarPotreros = async () => {
      try {
        const data = await obtenerPotreros();
        setPotreros(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    };

    cargarPotreros();
  }, []);

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
      />
    </section>
  );
};

export default Potreros;
