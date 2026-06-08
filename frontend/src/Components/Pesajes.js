import React, { useEffect, useMemo, useState } from 'react';
import {
  actualizarPesaje,
  crearPesaje,
  eliminarPesaje,
  obtenerAnimales,
  obtenerPesajes,
  obtenerPotreros
} from '../services/api';

const fechaHoy = () => new Date().toISOString().slice(0, 10);

const formatearFecha = (fecha) => {
  if (!fecha) return '--';
  return new Date(fecha).toLocaleDateString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const obtenerId = (valor) => {
  if (!valor) return '';
  return typeof valor === 'object' ? valor._id : valor;
};

const calcularEdadMeses = (fechaNacimiento) => {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return null;

  const hoy = new Date();
  let meses = (hoy.getFullYear() - nacimiento.getFullYear()) * 12;
  meses += hoy.getMonth() - nacimiento.getMonth();
  if (hoy.getDate() < nacimiento.getDate()) meses -= 1;
  return Math.max(meses, 0);
};

const obtenerCategoriaAnimal = (animal) => {
  if (!animal) return '--';
  const meses = calcularEdadMeses(animal.fechaNacimiento);
  if (meses !== null && meses < 12) return 'Ternero';
  if (animal.sexo === 'Hembra') return meses !== null && meses >= 24 ? 'Vaca' : 'Novilla';
  if (animal.sexo === 'Macho') return meses !== null && meses >= 24 ? 'Toro' : 'Novillo';
  return '--';
};

const formatearAnimal = (animal) => {
  if (!animal) return '--';
  return `${animal.diio || 'Sin DIIO'}${animal.nombre ? ` - ${animal.nombre}` : ''}`;
};

const valorInicial = {
  animal: '',
  fecha: fechaHoy(),
  peso: '',
  observaciones: ''
};

const Pesajes = () => {
  const [pesajes, setPesajes] = useState([]);
  const [animales, setAnimales] = useState([]);
  const [potreros, setPotreros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [modoFormulario, setModoFormulario] = useState(false);
  const [pesajeSeleccionado, setPesajeSeleccionado] = useState(null);
  const [formulario, setFormulario] = useState(valorInicial);
  const [orden, setOrden] = useState({ campo: 'fecha', direccion: 'desc' });
  const [filtros, setFiltros] = useState({
    busqueda: '',
    fechaInicio: '',
    fechaFin: '',
    potrero: 'Todos',
    sexo: 'Todos',
    categoria: 'Todos'
  });

  const cargarDatos = async () => {
    try {
      setCargando(true);
      setError('');
      const [pesajesData, animalesData, potrerosData] = await Promise.all([
        obtenerPesajes(),
        obtenerAnimales(),
        obtenerPotreros()
      ]);
      setPesajes(pesajesData);
      setAnimales(animalesData);
      setPotreros(potrerosData);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const pesajesFiltrados = useMemo(() => {
    const texto = filtros.busqueda.trim().toLowerCase();

    const filtrados = pesajes.filter((pesaje) => {
      const animal = pesaje.animal;
      const fecha = pesaje.fecha ? new Date(pesaje.fecha) : null;
      const potreroAnimal = obtenerId(animal?.potreroActual);
      const categoria = obtenerCategoriaAnimal(animal);

      if (texto) {
        const valores = [
          animal?.diio,
          animal?.nombre,
          pesaje.observaciones,
          pesaje.peso
        ].join(' ').toLowerCase();
        if (!valores.includes(texto)) return false;
      }

      if (filtros.fechaInicio && fecha && fecha < new Date(`${filtros.fechaInicio}T00:00:00`)) return false;
      if (filtros.fechaFin && fecha && fecha > new Date(`${filtros.fechaFin}T23:59:59`)) return false;
      if (filtros.potrero !== 'Todos' && potreroAnimal !== filtros.potrero) return false;
      if (filtros.sexo !== 'Todos' && animal?.sexo !== filtros.sexo) return false;
      if (filtros.categoria !== 'Todos' && categoria !== filtros.categoria) return false;

      return true;
    });

    return [...filtrados].sort((a, b) => {
      let valorA = a[orden.campo];
      let valorB = b[orden.campo];

      if (orden.campo === 'animal') {
        valorA = formatearAnimal(a.animal);
        valorB = formatearAnimal(b.animal);
      }

      if (orden.campo === 'fecha') {
        valorA = new Date(a.fecha || 0).getTime();
        valorB = new Date(b.fecha || 0).getTime();
      }

      const numeroA = Number(valorA);
      const numeroB = Number(valorB);
      const resultado = Number.isFinite(numeroA) && Number.isFinite(numeroB)
        ? numeroA - numeroB
        : String(valorA || '').localeCompare(String(valorB || ''), 'es', { numeric: true });

      return orden.direccion === 'asc' ? resultado : -resultado;
    });
  }, [filtros, orden, pesajes]);

  const abrirNuevo = () => {
    setPesajeSeleccionado(null);
    setFormulario(valorInicial);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const abrirEditar = (pesaje) => {
    setPesajeSeleccionado(pesaje);
    setFormulario({
      animal: obtenerId(pesaje.animal),
      fecha: pesaje.fecha ? new Date(pesaje.fecha).toISOString().slice(0, 10) : fechaHoy(),
      peso: pesaje.peso || '',
      observaciones: pesaje.observaciones || ''
    });
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const cancelarFormulario = () => {
    setModoFormulario(false);
    setPesajeSeleccionado(null);
    setFormulario(valorInicial);
  };

  const guardarPesaje = async (evento) => {
    evento.preventDefault();

    try {
      setGuardando(true);
      setErrorFormulario('');
      const datos = {
        ...formulario,
        peso: Number(formulario.peso)
      };

      if (pesajeSeleccionado?._id) {
        await actualizarPesaje(pesajeSeleccionado._id, datos);
      } else {
        await crearPesaje(datos);
      }

      cancelarFormulario();
      await cargarDatos();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrarPesaje = async (pesaje) => {
    const confirmar = window.confirm(`¿Eliminar el pesaje de ${formatearAnimal(pesaje.animal)} del ${formatearFecha(pesaje.fecha)}?`);
    if (!confirmar) return;

    try {
      await eliminarPesaje(pesaje._id);
      window.alert('Pesaje eliminado correctamente.');
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const cambiarOrden = (campo) => {
    setOrden((actual) => ({
      campo,
      direccion: actual.campo === campo && actual.direccion === 'asc' ? 'desc' : 'asc'
    }));
  };

  const etiquetaOrden = (campo) => {
    if (orden.campo !== campo) return '';
    return orden.direccion === 'asc' ? ' ↑' : ' ↓';
  };

  if (modoFormulario) {
    return (
      <section className="vista-tabla pesajes-page">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Pesajes</p>
            <h2>{pesajeSeleccionado ? 'Editar pesaje' : 'Nuevo pesaje'}</h2>
          </div>
          <button className="boton-link" type="button" onClick={cancelarFormulario}>Volver</button>
        </div>

        <form className="formulario-panel pesaje-formulario" onSubmit={guardarPesaje}>
          {errorFormulario && <div className="alerta-formulario">{errorFormulario}</div>}
          <label>
            Animal
            <select
              value={formulario.animal}
              onChange={(evento) => setFormulario((actual) => ({ ...actual, animal: evento.target.value }))}
              required
            >
              <option value="">Seleccione un animal</option>
              {animales.map((animal) => (
                <option key={animal._id} value={animal._id}>{formatearAnimal(animal)}</option>
              ))}
            </select>
          </label>
          <label>
            Fecha
            <input
              type="date"
              value={formulario.fecha}
              onChange={(evento) => setFormulario((actual) => ({ ...actual, fecha: evento.target.value }))}
              required
            />
          </label>
          <label>
            Peso kg
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={formulario.peso}
              onChange={(evento) => setFormulario((actual) => ({ ...actual, peso: evento.target.value }))}
              required
            />
          </label>
          <label className="campo-completo">
            Observaciones
            <textarea
              rows="4"
              value={formulario.observaciones}
              onChange={(evento) => setFormulario((actual) => ({ ...actual, observaciones: evento.target.value }))}
              placeholder="Buen estado corporal, cambio de dieta, pesaje estimado..."
            />
          </label>
          <div className="form-actions">
            <button className="boton-link" type="button" onClick={cancelarFormulario}>Cancelar</button>
            <button className="boton-primario" type="submit" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar pesaje'}
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="vista-tabla pesajes-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Crecimiento</p>
          <h2>Pesajes Históricos</h2>
        </div>
        <button className="boton-primario compacto" type="button" onClick={abrirNuevo}>+ Nuevo pesaje</button>
      </div>

      <div className="tabla-toolbar pesajes-toolbar">
        <input
          value={filtros.busqueda}
          onChange={(evento) => setFiltros((actual) => ({ ...actual, busqueda: evento.target.value }))}
          placeholder="Buscar animal, DIIO u observación..."
        />
        <input
          type="date"
          value={filtros.fechaInicio}
          onChange={(evento) => setFiltros((actual) => ({ ...actual, fechaInicio: evento.target.value }))}
          title="Fecha inicial"
        />
        <input
          type="date"
          value={filtros.fechaFin}
          onChange={(evento) => setFiltros((actual) => ({ ...actual, fechaFin: evento.target.value }))}
          title="Fecha final"
        />
        <select
          value={filtros.potrero}
          onChange={(evento) => setFiltros((actual) => ({ ...actual, potrero: evento.target.value }))}
        >
          <option value="Todos">Todos los potreros</option>
          {potreros.map((potrero) => (
            <option key={potrero._id} value={potrero._id}>{potrero.codigo || potrero.nombre}</option>
          ))}
        </select>
        <select
          value={filtros.sexo}
          onChange={(evento) => setFiltros((actual) => ({ ...actual, sexo: evento.target.value }))}
        >
          <option value="Todos">Todos los sexos</option>
          <option value="Hembra">Hembras</option>
          <option value="Macho">Machos</option>
        </select>
        <select
          value={filtros.categoria}
          onChange={(evento) => setFiltros((actual) => ({ ...actual, categoria: evento.target.value }))}
        >
          <option value="Todos">Todas las categorías</option>
          <option value="Ternero">Terneros</option>
          <option value="Novilla">Novillas</option>
          <option value="Novillo">Novillos</option>
          <option value="Vaca">Vacas</option>
          <option value="Toro">Toros</option>
        </select>
        <span>{pesajesFiltrados.length} registros</span>
      </div>

      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && <div className="estado-importacion">Cargando pesajes...</div>}

      <div className="tabla-scroll tabla-dinamica">
        <table>
          <thead>
            <tr>
              <th><button type="button" onClick={() => cambiarOrden('animal')}>Animal{etiquetaOrden('animal')}</button></th>
              <th>DIIO</th>
              <th><button type="button" onClick={() => cambiarOrden('fecha')}>Fecha{etiquetaOrden('fecha')}</button></th>
              <th><button type="button" onClick={() => cambiarOrden('peso')}>Peso{etiquetaOrden('peso')}</button></th>
              <th>Observaciones</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pesajesFiltrados.map((pesaje) => (
              <tr key={pesaje._id}>
                <td>{pesaje.animal?.nombre || '--'}</td>
                <td>{pesaje.animal?.diio || '--'}</td>
                <td>{formatearFecha(pesaje.fecha)}</td>
                <td>{pesaje.peso} kg</td>
                <td>{pesaje.observaciones || '--'}</td>
                <td>
                  <div className="acciones-tabla">
                    <button type="button" aria-label="Editar" title="Editar" onClick={() => abrirEditar(pesaje)}>✎</button>
                    <button type="button" aria-label="Eliminar" title="Eliminar" onClick={() => borrarPesaje(pesaje)}>⌫</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default Pesajes;
