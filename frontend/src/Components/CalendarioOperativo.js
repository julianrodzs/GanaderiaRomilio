import React, { useEffect, useMemo, useState } from 'react';
import { puedeGestionarModulo } from '../constants/permisosRoles';
import { obtenerMisTareas, obtenerTareas } from '../services/api';
import {
  guardarTareasOffline,
  obtenerTareasOffline
} from '../services/offlineStorage';
import {
  formatearFechaISOEnZona,
  mostrarInformacionLunarActual,
  obtenerInfoLunar,
  obtenerZonaHorariaActual
} from '../services/calendarioLunarService.mjs';
import { esTareaConInfoLunar } from '../utils/tareasLuna.mjs';
import InfoLunarFecha from './InfoLunarFecha';
import ProximasFasesLunares from './ProximasFasesLunares';

const sumarDias = (fechaIso, dias) => {
  const fecha = new Date(`${fechaIso}T12:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
};

const formatearFecha = (fecha, zonaHoraria, opciones = {}) => {
  const fechaRepresentativa = obtenerInfoLunar(fecha, zonaHoraria)?.fecha;
  if (!fechaRepresentativa) return '--';
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: zonaHoraria,
    day: 'numeric',
    month: 'short',
    ...opciones
  }).format(fechaRepresentativa);
};

const referenciaTarea = (tarea) => {
  if (tarea.animal) return tarea.animal.diio || tarea.animal.identificadorFinca || tarea.animal.nombre || '';
  if (tarea.potrero) {
    const potrero = [tarea.potrero.codigo, tarea.potrero.nombre].filter(Boolean).join(' · ');
    const pasto = tarea.potrero.pastoPrincipal?.nombre;
    return [potrero, pasto ? `Pasto: ${pasto}` : ''].filter(Boolean).join(' · ');
  }
  return '';
};

const CalendarioOperativo = ({ usuario, onAbrirTarea }) => {
  const [rangoDias, setRangoDias] = useState(7);
  const [tareas, setTareas] = useState([]);
  const [error, setError] = useState('');
  const zonaHoraria = obtenerZonaHorariaActual();
  const hoy = formatearFechaISOEnZona(new Date(), zonaHoraria);
  const filtros = useMemo(() => ({
    fechaInicio: hoy,
    fechaFin: sumarDias(hoy, rangoDias - 1)
  }), [hoy, rangoDias]);
  const mostrarLuna = mostrarInformacionLunarActual();
  const infoHoy = useMemo(() => obtenerInfoLunar(hoy, zonaHoraria), [hoy, zonaHoraria]);

  useEffect(() => {
    let vigente = true;
    const cargar = async () => {
      try {
        setError('');
        const obtener = puedeGestionarModulo(usuario?.rol, 'Tareas') ? obtenerTareas : obtenerMisTareas;
        const datos = await obtener(filtros);
        const activas = datos
          .filter((tarea) => !['Completada', 'Cancelada'].includes(tarea.estado))
          .sort((a, b) => new Date(a.fechaProgramada) - new Date(b.fechaProgramada));
        if (!vigente) return;
        setTareas(activas);
        await guardarTareasOffline(activas, { filtros }).catch(() => {});
      } catch (err) {
        const datosOffline = await obtenerTareasOffline({ filtros }).catch(() => []);
        if (!vigente) return;
        setTareas(datosOffline.filter((tarea) => !['Completada', 'Cancelada'].includes(tarea.estado)));
        setError(datosOffline.length ? 'Mostrando actividades guardadas en este dispositivo.' : 'No fue posible cargar las próximas actividades.');
      }
    };
    cargar();
    return () => { vigente = false; };
  }, [filtros, usuario?.rol]);

  const tareasVisibles = tareas.slice(0, 8);

  return (
    <section className="calendario-operativo">
      <header className="calendario-operativo-header">
        <div><p className="eyebrow">Planificación</p><h2>Calendario operativo</h2></div>
        <div className="selector-rango-calendario" aria-label="Rango de próximas actividades">
          {[7, 30].map((dias) => <button className={rangoDias === dias ? 'activo' : ''} type="button" key={dias} onClick={() => setRangoDias(dias)}>{dias} días</button>)}
        </div>
      </header>

      <div className="calendario-operativo-contenido">
        <div className="calendario-luna-resumen">
          <div className="calendario-hoy">
            <span>Hoy · {formatearFecha(infoHoy.fecha, zonaHoraria, { year: 'numeric' })}</span>
            {mostrarLuna && <InfoLunarFecha fecha={hoy} />}
          </div>
          {mostrarLuna && (
            <div>
              <h3>Próximas fases</h3>
              <ProximasFasesLunares fechaBase={hoy} />
            </div>
          )}
        </div>

        <div className="calendario-actividades">
          <div className="calendario-actividades-titulo"><h3>Próximas actividades</h3><span>{tareas.length}</span></div>
          {error && <small className="calendario-error">{error}</small>}
          {tareasVisibles.map((tarea) => (
            <button type="button" className="calendario-actividad" key={tarea._id} onClick={() => onAbrirTarea?.(tarea._id)}>
              <time>{formatearFecha(tarea.fechaProgramada, zonaHoraria)}</time>
              <span><strong>{tarea.titulo}</strong><small>{referenciaTarea(tarea)}</small></span>
              {esTareaConInfoLunar(tarea) && <InfoLunarFecha fecha={tarea.fechaProgramada} compacta mostrarIluminacion={false} />}
            </button>
          ))}
          {!tareasVisibles.length && <p className="reporte-vacio">No hay actividades pendientes en los próximos {rangoDias} días.</p>}
          {tareas.length > tareasVisibles.length && (
            <button className="boton-link calendario-ver-todas" type="button" onClick={() => onAbrirTarea?.('')}>Ver {tareas.length - tareasVisibles.length} actividades más en Tareas</button>
          )}
        </div>
      </div>
    </section>
  );
};

export default CalendarioOperativo;
