import React, { useEffect, useMemo, useState } from 'react';
import {
  actualizarCoberturaPotrero,
  actualizarPotrero,
  actualizarRotacion,
  crearCoberturaPotrero,
  crearPotrero,
  crearRotacion,
  eliminarPotrero,
  eliminarRotacion,
  obtenerPotreros,
  obtenerRotaciones
} from '../services/api';
import { guardarPotrerosOffline, obtenerPotrerosOffline } from '../services/offlineStorage';
import FormularioPotrero from './FormularioPotrero';
import FormularioRotacion from './FormularioRotacion';
import RendimientoPotreros, { DetallePotrero } from './RendimientoPotreros';
import TablaDinamica from './TablaDinamica';
import { fechaEnRango, obtenerRangoMesActual } from '../utils/fechas';
import FeatureGate from './FeatureGate';
import BancosForrajeros from './BancosForrajeros';
import { useApariencia } from '../context/AparienciaContext';

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
  { id: 'pastoPrincipal', label: 'Pasto principal', accessor: (potrero) => potrero.pastoPrincipal?.nombre || potrero.descripcionCobertura || '--' },
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

const Potreros = ({ soloLectura = false }) => {
  const { potreros: imagenPotreros } = useApariencia();
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
  const [potreroDetalle, setPotreroDetalle] = useState(null);
  const [filtroRotacionesFecha, setFiltroRotacionesFecha] = useState(obtenerRangoMesActual);
  const [vistaArea, setVistaArea] = useState('PASTOREO');

  const cargarDatos = async () => {
    try {
      setError('');
      const [potrerosData, rotacionesData] = await Promise.all([
        obtenerPotreros(),
        obtenerRotaciones()
      ]);
      setPotreros(potrerosData);
      setRotaciones(rotacionesData);
      await guardarPotrerosOffline(potrerosData).catch(() => {});
    } catch (err) {
      if (soloLectura) {
        const potrerosOffline = await obtenerPotrerosOffline().catch(() => []);
        setPotreros(potrerosOffline);
        setRotaciones([]);
        setError(potrerosOffline.length ? 'Sin conexion. Mostrando potreros guardados en este dispositivo.' : err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const rotacionesFiltradas = useMemo(() => {
    return rotaciones.filter((rotacion) => fechaEnRango(rotacion.fechaEntrada, filtroRotacionesFecha));
  }, [filtroRotacionesFecha, rotaciones]);
  const potrerosPastoreo = useMemo(() => potreros.filter((item) => (item.tipoArea || 'PASTOREO') === 'PASTOREO'), [potreros]);
  const bancosForrajeros = useMemo(() => potreros.filter((item) => item.tipoArea === 'BANCO_FORRAJERO'), [potreros]);

  const guardarPotrero = async ({ potrero, cobertura, coberturaCambiada, tieneCoberturaVigente }) => {
    try {
      setGuardando(true);
      setErrorFormulario('');
      if (potreroSeleccionado?._id) {
        await actualizarPotrero(potreroSeleccionado._id, potrero);
        if (coberturaCambiada) {
          if (tieneCoberturaVigente) await actualizarCoberturaPotrero(potreroSeleccionado._id, cobertura);
          else await crearCoberturaPotrero(potreroSeleccionado._id, cobertura);
        }
      } else {
        const creado = await crearPotrero(potrero);
        if (coberturaCambiada) await crearCoberturaPotrero(creado._id, cobertura);
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

  const abrirNuevoBanco = () => {
    setPotreroSeleccionado({ tipoArea: 'BANCO_FORRAJERO' });
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
        modo={potreroSeleccionado?._id ? 'editar' : 'crear'}
        onCancelar={cancelarFormulario}
        onGuardar={guardarPotrero}
        guardando={guardando}
        error={errorFormulario}
      />
    );
  }

  return (
    <section className="potreros-page">
      <div className="potrero-tabs areas-tabs" role="tablist" aria-label="Tipo de área"><button type="button" className={vistaArea === 'PASTOREO' ? 'activo' : ''} onClick={() => setVistaArea('PASTOREO')}>Pastoreo</button><button type="button" className={vistaArea === 'BANCO_FORRAJERO' ? 'activo' : ''} onClick={() => setVistaArea('BANCO_FORRAJERO')}>Bancos forrajeros</button></div>
      {vistaArea === 'BANCO_FORRAJERO' ? <BancosForrajeros bancos={bancosForrajeros} cargando={cargando} error={error} soloLectura={soloLectura} onNuevo={abrirNuevoBanco} onEditar={abrirEdicionPotrero} onEliminar={borrarPotrero} onRecargar={cargarDatos} /> : <>
      <article className="mapa-potreros-panel">
        <div>
          <p className="eyebrow">Mapa de referencia</p>
          <h2>Rotacion de potreros</h2>
        </div>
        <img src={imagenPotreros} alt="Mapa o imagen de potreros de la finca" onError={(evento) => { evento.currentTarget.onerror = null; evento.currentTarget.src = '/assests/mapa-potreros.png'; }} />
      </article>

      <TablaDinamica
        titulo="Potreros"
        subtitulo="Rotacion"
        columnas={columnas}
        datos={potrerosPastoreo}
        cargando={cargando}
        error={error}
        filtros={filtros}
        textoAgregar="Nuevo potrero"
        onAgregar={soloLectura ? undefined : abrirNuevoPotrero}
        onEditar={soloLectura ? undefined : abrirEdicionPotrero}
        onEliminar={soloLectura ? undefined : borrarPotrero}
        accionesExtra={(potrero) => (
          <button type="button" aria-label="Ver detalle y rendimiento" title="Ver detalle y rendimiento" onClick={() => setPotreroDetalle(potrero)}>◉</button>
        )}
        mostrarAcciones
      />

      <FeatureGate feature="analiticaProductiva" titulo="Rendimiento de potreros" pregunta="¿Cómo se comparan la ocupación, los descansos y los animal-días entre potreros?" etiqueta="Analítica de potreros">
        <RendimientoPotreros />
      </FeatureGate>

      <section className="finanzas-panel">
        <div className="finanzas-rango-fechas">
          <label>
            Desde
            <input
              type="date"
              value={filtroRotacionesFecha.fechaInicio}
              onChange={(evento) => setFiltroRotacionesFecha((actual) => ({ ...actual, fechaInicio: evento.target.value }))}
              max={filtroRotacionesFecha.fechaFin || undefined}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={filtroRotacionesFecha.fechaFin}
              onChange={(evento) => setFiltroRotacionesFecha((actual) => ({ ...actual, fechaFin: evento.target.value }))}
              min={filtroRotacionesFecha.fechaInicio || undefined}
            />
          </label>
        </div>

        <TablaDinamica
          titulo="Rotaciones"
          subtitulo="Movimientos de potreros"
          columnas={columnasRotaciones}
          datos={rotacionesFiltradas}
          cargando={cargando}
          error={error}
          filtros={filtrosRotaciones}
          textoAgregar="Nueva rotacion"
          onAgregar={soloLectura ? undefined : abrirNuevaRotacion}
          onEditar={soloLectura ? undefined : abrirEdicionRotacion}
          onEliminar={soloLectura ? undefined : borrarRotacion}
          mostrarAcciones={!soloLectura}
        />
      </section>

      {potreroDetalle && (
        <DetallePotrero
          potrero={potreroDetalle}
          rotaciones={rotaciones}
          onCerrar={() => setPotreroDetalle(null)}
        />
      )}
      </>}
    </section>
  );
};

export default Potreros;
