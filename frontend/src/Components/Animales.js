import React, { useEffect, useState } from 'react';
import { actualizarAnimal, crearAnimal, eliminarAnimal, obtenerAnimales } from '../services/api';
import FormularioAnimal from './FormularioAnimal';
import TablaDinamica from './TablaDinamica';

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
  { id: 'sexo', label: 'Sexo', accessor: (animal) => animal.sexo },
  { id: 'edad', label: 'Edad', accessor: (animal) => formatearEdad(animal.fechaNacimiento) },
  {
    id: 'listaMontaEdad',
    label: 'Monta edad',
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
  { id: 'sexo', accessor: (animal) => animal.sexo },
  { id: 'estado', accessor: (animal) => animal.estado }
];

const Animales = ({ soloLectura = false }) => {
  const [animales, setAnimales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [modoFormulario, setModoFormulario] = useState(false);
  const [animalSeleccionado, setAnimalSeleccionado] = useState(null);
  const [animalDetalle, setAnimalDetalle] = useState(null);

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
    <>
      <TablaDinamica
        titulo="Animales"
        subtitulo="Inventario"
        columnas={columnas}
        datos={animales.map((animal) => ({ ...animal, abrirDetalle: setAnimalDetalle }))}
        cargando={cargando}
        error={error}
        filtros={filtros}
        textoAgregar="Nuevo animal"
        onAgregar={soloLectura ? undefined : abrirNuevoAnimal}
        onEditar={soloLectura ? undefined : abrirEdicionAnimal}
        onEliminar={soloLectura ? undefined : borrarAnimal}
        mostrarAcciones={!soloLectura}
      />

      {animalDetalle && (
        <div className="modal-backdrop">
          <section className="modal-panel detalle-animal-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Detalle animal</p>
                <h2>{animalDetalle.diio || animalDetalle.nombre || 'Animal'}</h2>
              </div>
              <button className="boton-link" type="button" onClick={() => setAnimalDetalle(null)}>Cerrar</button>
            </div>

            <div className="detalle-animal-grid">
              <article>
                <span>Edad</span>
                <strong>{formatearEdad(animalDetalle.fechaNacimiento)}</strong>
              </article>
              <article>
                <span>Lista por edad</span>
                <strong>{estaListaMontaPorEdad(animalDetalle) ? 'Sí' : 'No'}</strong>
              </article>
              <article>
                <span>Madre DIIO</span>
                <strong>{animalDetalle.madreDiio || '--'}</strong>
              </article>
              <article>
                <span>Padre DIIO</span>
                <strong>{animalDetalle.padreDiio || '--'}</strong>
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
            </div>

            {animalDetalle.observaciones && (
              <div className="detalle-observaciones">
                <span>Observaciones</span>
                <p>{animalDetalle.observaciones}</p>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
};

export default Animales;
