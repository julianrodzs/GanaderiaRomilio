import React, { useEffect, useState } from 'react';
import {
  actualizarAnimal,
  crearAnimal,
  crearEventoAnimal,
  eliminarAnimal,
  obtenerAnimales,
  obtenerEventosAnimal,
  obtenerPesajesPorAnimal
} from '../services/api';
import { guardarInventarioOffline, obtenerInventarioOffline } from '../services/offlineStorage';
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
  const [eventosAnimal, setEventosAnimal] = useState([]);
  const [pesajesAnimal, setPesajesAnimal] = useState([]);
  const [cargandoEventos, setCargandoEventos] = useState(false);
  const [cargandoPesajes, setCargandoPesajes] = useState(false);
  const [errorEventos, setErrorEventos] = useState('');
  const [errorPesajes, setErrorPesajes] = useState('');
  const [observacionManual, setObservacionManual] = useState('');
  const [guardandoEvento, setGuardandoEvento] = useState(false);

  const cargarAnimales = async () => {
    try {
      setError('');
      const data = await obtenerAnimales();
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

  const abrirDetalleAnimal = async (animal) => {
    setAnimalDetalle(animal);
    setObservacionManual('');
    setEventosAnimal([]);
    setPesajesAnimal([]);
    await Promise.all([
      cargarEventosAnimal(animal._id),
      cargarPesajesAnimal(animal._id)
    ]);
  };

  const cerrarDetalleAnimal = () => {
    setAnimalDetalle(null);
    setEventosAnimal([]);
    setPesajesAnimal([]);
    setObservacionManual('');
    setErrorEventos('');
    setErrorPesajes('');
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
                <span>Edad</span>
                <strong>{formatearEdad(animalDetalle.fechaNacimiento)}</strong>
              </article>
              <article>
                <span>Edad reproductiva</span>
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
