import React, { useCallback, useEffect, useState } from 'react';
import {
  actualizarPlanSanitario,
  actualizarEstadoSanitarioAnimales,
  actualizarTratamientoSanitario,
  cancelarTratamientoSanitario,
  completarTratamientoSanitario,
  crearAplicacionSanitariaUnica,
  crearPlanSanitario,
  crearTratamientoSanitario,
  eliminarPlanSanitario,
  obtenerAplicacionesSanitarias,
  obtenerAnimales,
  obtenerPlanesSanitarios,
  obtenerTratamientoSanitario,
  obtenerTratamientosSanitarios,
  obtenerUsuariosAsignables,
  registrarAplicacionPlanSanitario,
  registrarAplicacionTratamiento
} from '../services/api';
import { obtenerRangoMesActual } from '../utils/fechas';
import FormularioAplicacionUnica from './FormularioAplicacionUnica';
import CompletarTratamientoSanitario from './CompletarTratamientoSanitario';
import FormularioEstadoSanitario from './FormularioEstadoSanitario';
import FormularioPlanSanitario from './FormularioPlanSanitario';
import FormularioTratamientoSanitario from './FormularioTratamientoSanitario';
import RegistrarAplicacionSanitaria from './RegistrarAplicacionSanitaria';
import RegistrarAplicacionTratamiento from './RegistrarAplicacionTratamiento';
import SelectorEspecie from './SelectorEspecie';

const obtenerEspecieInicial = () => localStorage.getItem('ganaderiaEspecie') || 'Bovino';

const formatearFecha = (fecha) => {
  if (!fecha) return '--';
  return new Date(fecha).toLocaleDateString('es-CR', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const identificadorAnimal = (animal) => animal?.diio || animal?.identificadorFinca || '--';
const nombreUsuario = (usuario) => [usuario?.nombre, usuario?.apellido].filter(Boolean).join(' ') || usuario?.correo || '--';

const nombresAnimales = (animales = []) => {
  if (!animales.length) return '--';
  const nombres = animales.map((animal) => identificadorAnimal(animal));
  if (nombres.length <= 3) return nombres.join(', ');
  return `${nombres.slice(0, 3).join(', ')} +${nombres.length - 3}`;
};

const etiquetaNaturaleza = (naturaleza) => naturaleza === 'Aplicacion unica' ? 'Aplicación única' : naturaleza;

const estadoVisualTratamiento = (tratamiento) => {
  if (tratamiento.estado !== 'Activo' || !tratamiento.proximaAplicacion) return tratamiento.estado;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const proxima = new Date(tratamiento.proximaAplicacion);
  proxima.setHours(0, 0, 0, 0);
  if (proxima < hoy) return 'Aplicación pendiente';
  if (proxima.getTime() === hoy.getTime()) return 'Próxima aplicación hoy';
  return tratamiento.estado;
};

const PlanSanitario = ({ soloLectura = false }) => {
  const [pestana, setPestana] = useState('planes');
  const [especie, setEspecie] = useState(obtenerEspecieInicial);
  const [planes, setPlanes] = useState([]);
  const [tratamientos, setTratamientos] = useState([]);
  const [aplicaciones, setAplicaciones] = useState([]);
  const [animales, setAnimales] = useState([]);
  const [usuariosAsignables, setUsuariosAsignables] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [vistaFormulario, setVistaFormulario] = useState(null);
  const [planSeleccionado, setPlanSeleccionado] = useState(null);
  const [tratamientoSeleccionado, setTratamientoSeleccionado] = useState(null);
  const [planAplicacion, setPlanAplicacion] = useState(null);
  const [tratamientoAplicacion, setTratamientoAplicacion] = useState(null);
  const [detalleTratamiento, setDetalleTratamiento] = useState(null);
  const [detalleAplicacion, setDetalleAplicacion] = useState(null);
  const [tratamientoCompletar, setTratamientoCompletar] = useState(null);
  const [mostrarCambioEstadoSanitario, setMostrarCambioEstadoSanitario] = useState(false);
  const [filtrosHistorial, setFiltrosHistorial] = useState(() => ({
    ...obtenerRangoMesActual(),
    animal: '',
    producto: '',
    naturaleza: '',
    responsable: ''
  }));
  const [filtrosAplicados, setFiltrosAplicados] = useState(filtrosHistorial);

  const cargarDatos = useCallback(async () => {
    try {
      setCargando(true);
      setError('');
      const [planesData, tratamientosData, aplicacionesData, animalesData, usuariosData] = await Promise.all([
        obtenerPlanesSanitarios({ especie }),
        obtenerTratamientosSanitarios({ especie }),
        obtenerAplicacionesSanitarias({ ...filtrosAplicados, especie }),
        obtenerAnimales({ especie }),
        soloLectura ? Promise.resolve([]) : obtenerUsuariosAsignables('Sanidad')
      ]);
      setPlanes(planesData || []);
      setTratamientos(tratamientosData || []);
      setAplicaciones(aplicacionesData || []);
      setAnimales(animalesData || []);
      setUsuariosAsignables(usuariosData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [especie, filtrosAplicados, soloLectura]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const cambiarEspecie = (valor) => {
    localStorage.setItem('ganaderiaEspecie', valor);
    setEspecie(valor);
    setVistaFormulario(null);
    setPlanSeleccionado(null);
    setTratamientoSeleccionado(null);
  };

  const cerrarFormulario = () => {
    setVistaFormulario(null);
    setPlanSeleccionado(null);
    setTratamientoSeleccionado(null);
    setErrorFormulario('');
  };

  const ejecutarGuardado = async (accion, mensaje) => {
    try {
      setGuardando(true);
      setErrorFormulario('');
      await accion();
      cerrarFormulario();
      await cargarDatos();
      if (mensaje) window.alert(mensaje);
      return true;
    } catch (err) {
      setErrorFormulario(err.message);
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const guardarPlan = (datos) => ejecutarGuardado(
    () => planSeleccionado?._id
      ? actualizarPlanSanitario(planSeleccionado._id, datos)
      : crearPlanSanitario(datos),
    planSeleccionado ? 'Plan actualizado correctamente.' : 'Plan creado correctamente.'
  );

  const guardarTratamiento = (datos) => ejecutarGuardado(
    () => tratamientoSeleccionado?._id
      ? actualizarTratamientoSanitario(tratamientoSeleccionado._id, datos)
      : crearTratamientoSanitario(datos),
    tratamientoSeleccionado ? 'Tratamiento actualizado correctamente.' : 'Tratamiento creado correctamente.'
  );

  const guardarAplicacionUnica = (datos) => ejecutarGuardado(
    () => crearAplicacionSanitariaUnica(datos),
    'Aplicación única registrada y agregada a la bitácora.'
  );

  const borrarPlan = async (plan) => {
    if (!window.confirm(`¿Eliminar el plan ${plan.actividad}? Las aplicaciones históricas se conservarán.`)) return;
    try {
      await eliminarPlanSanitario(plan._id);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const registrarPlan = async (datos) => {
    if (!planAplicacion?._id) return;
    const exito = await ejecutarGuardado(
      () => registrarAplicacionPlanSanitario(planAplicacion._id, datos),
      'Aplicación del plan registrada en el historial y las bitácoras.'
    );
    if (exito) setPlanAplicacion(null);
  };

  const registrarTratamiento = async (datos) => {
    if (!tratamientoAplicacion?._id) return;
    const exito = await ejecutarGuardado(
      () => registrarAplicacionTratamiento(tratamientoAplicacion._id, datos),
      'Aplicación del tratamiento registrada correctamente.'
    );
    if (exito) setTratamientoAplicacion(null);
  };

  const verTratamiento = async (tratamiento) => {
    try {
      setError('');
      setDetalleTratamiento(await obtenerTratamientoSanitario(tratamiento._id));
    } catch (err) {
      setError(err.message);
    }
  };

  const completarTratamiento = async (datos) => {
    if (!tratamientoCompletar?._id) return;
    const exito = await ejecutarGuardado(
      () => completarTratamientoSanitario(tratamientoCompletar._id, datos),
      'Tratamiento completado.'
    );
    if (exito) setTratamientoCompletar(null);
  };

  const guardarCambioEstadoSanitario = async (datos) => {
    const exito = await ejecutarGuardado(
      () => actualizarEstadoSanitarioAnimales(datos),
      'Estado sanitario actualizado y registrado en la bitácora.'
    );
    if (exito) setMostrarCambioEstadoSanitario(false);
  };

  const cancelarTratamiento = async (tratamiento) => {
    const motivo = window.prompt('Motivo de cancelación:');
    if (motivo === null) return;
    await ejecutarGuardado(() => cancelarTratamientoSanitario(tratamiento._id, { motivo }), 'Tratamiento cancelado.');
  };

  const animalesActivos = animales.filter((animal) => !['Muerto', 'Vendido'].includes(animal.estado));

  if (vistaFormulario === 'plan') {
    return (
      <>
        <FormularioPlanSanitario
          planInicial={planSeleccionado}
          modo={planSeleccionado ? 'editar' : 'crear'}
          onCancelar={cerrarFormulario}
          onGuardar={guardarPlan}
          onRegistrarAplicacion={planSeleccionado ? setPlanAplicacion : undefined}
          guardando={guardando}
          error={errorFormulario}
          especie={especie}
          animalesOpciones={animalesActivos}
          usuariosAsignables={usuariosAsignables}
        />
        {planAplicacion && <RegistrarAplicacionSanitaria plan={planAplicacion} onCancelar={() => setPlanAplicacion(null)} onRegistrar={registrarPlan} guardando={guardando} error={errorFormulario} />}
      </>
    );
  }

  if (vistaFormulario === 'tratamiento') {
    return (
      <FormularioTratamientoSanitario
        tratamientoInicial={tratamientoSeleccionado}
        especie={especie}
        animales={animalesActivos}
        usuariosAsignables={usuariosAsignables}
        onGuardar={guardarTratamiento}
        onCancelar={cerrarFormulario}
        guardando={guardando}
        error={errorFormulario}
      />
    );
  }

  if (vistaFormulario === 'unica') {
    return (
      <FormularioAplicacionUnica
        especie={especie}
        animales={animalesActivos}
        onGuardar={guardarAplicacionUnica}
        onCancelar={cerrarFormulario}
        guardando={guardando}
        error={errorFormulario}
      />
    );
  }

  return (
    <section className="sanidad-page">
      <div className="panel-title sanidad-header">
        <div><p className="eyebrow">Sanidad</p><h2>Gestión sanitaria</h2></div>
        {!soloLectura && (
          <div className="sanidad-acciones-principales">
            <button className="boton-secundario compacto" type="button" onClick={() => setMostrarCambioEstadoSanitario(true)}>Estado sanitario</button>
            {(pestana === 'planes' || pestana === 'tratamientos') && (
              <>
                <button className="boton-secundario compacto" type="button" onClick={() => setVistaFormulario('unica')}>Registrar aplicación única</button>
                <button
                  className="boton-primario compacto"
                  type="button"
                  onClick={() => {
                    if (pestana === 'planes') {
                      setPlanSeleccionado(null);
                      setVistaFormulario('plan');
                    } else {
                      setTratamientoSeleccionado(null);
                      setVistaFormulario('tratamiento');
                    }
                  }}
                >
                  + {pestana === 'planes' ? 'Nuevo plan' : 'Nuevo tratamiento'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <SelectorEspecie valor={especie} onChange={cambiarEspecie} />
      <div className="sanidad-tabs" role="tablist" aria-label="Secciones de sanidad">
        <button className={pestana === 'planes' ? 'activo' : ''} type="button" onClick={() => setPestana('planes')}>Planes</button>
        <button className={pestana === 'tratamientos' ? 'activo' : ''} type="button" onClick={() => setPestana('tratamientos')}>Tratamientos</button>
        <button className={pestana === 'historial' ? 'activo' : ''} type="button" onClick={() => setPestana('historial')}>Historial de aplicaciones</button>
      </div>

      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && <div className="estado-importacion">Cargando información sanitaria...</div>}

      {pestana === 'planes' && (
        <div className="tabla-scroll tabla-dinamica sanidad-tabla">
          <table>
            <thead><tr><th>Grupo</th><th>DIIO</th><th>Actividad</th><th>Producto</th><th>Responsable</th><th>Última aplicación</th><th>Frecuencia</th><th>Próxima aplicación</th><th>Estado</th>{!soloLectura && <th>Acciones</th>}</tr></thead>
            <tbody>{planes.map((plan) => (
              <tr key={plan._id}>
                <td>{plan.grupoGanado}</td><td>{plan.animales?.length ? nombresAnimales(plan.animales) : plan.animalDiio || '--'}</td><td>{plan.actividad}</td><td>{plan.producto}</td><td>{nombreUsuario(plan.asignadoA)}</td>
                <td>{formatearFecha(plan.ultimaAplicacionReal)}</td><td>{plan.frecuenciaCantidad} {plan.frecuenciaUnidad}</td><td>{formatearFecha(plan.proximaAplicacion)}</td>
                <td><span className={`estado-badge estado-${plan.estado}`}>{plan.estado}</span></td>
                {!soloLectura && (
                  <td>
                    <div className="acciones-tabla acciones-iconos-sanidad">
                      <button type="button" title="Registrar aplicación" aria-label="Registrar aplicación" onClick={() => setPlanAplicacion(plan)}>✓</button>
                      <button type="button" title="Editar plan" aria-label="Editar plan" onClick={() => { setPlanSeleccionado(plan); setVistaFormulario('plan'); }}>✎</button>
                      <button className="accion-peligro" type="button" title="Eliminar plan" aria-label="Eliminar plan" onClick={() => borrarPlan(plan)}>⌫</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {pestana === 'tratamientos' && (
        <div className="tabla-scroll tabla-dinamica sanidad-tabla">
          <table>
            <thead><tr><th>Motivo</th><th>Animales</th><th>Producto</th><th>Responsable</th><th>Fecha inicio</th><th>Aplicaciones</th><th>Próxima aplicación</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>{tratamientos.map((tratamiento) => {
              const visual = estadoVisualTratamiento(tratamiento);
              return (
                <tr key={tratamiento._id}>
                  <td>{tratamiento.motivo}</td><td title={nombresAnimales(tratamiento.animales)}>{tratamiento.animales?.length || 0} · {nombresAnimales(tratamiento.animales)}</td><td>{tratamiento.producto}</td><td>{nombreUsuario(tratamiento.asignadoA)}</td><td>{formatearFecha(tratamiento.fechaInicio)}</td><td>{tratamiento.aplicacionesRealizadas} / {tratamiento.cantidadAplicaciones}</td><td>{formatearFecha(tratamiento.proximaAplicacion)}</td>
                  <td><span className={`estado-badge estado-${tratamiento.estado} ${visual.includes('pendiente') || visual.includes('hoy') ? 'estado-atencion' : ''}`}>{visual}</span></td>
                  <td>
                    <div className="acciones-tabla acciones-iconos-sanidad">
                      <button type="button" title="Ver detalle" aria-label="Ver detalle" onClick={() => verTratamiento(tratamiento)}>⊙</button>
                      {!soloLectura && tratamiento.estado === 'Activo' && <button type="button" title="Registrar aplicación" aria-label="Registrar aplicación" onClick={() => setTratamientoAplicacion(tratamiento)}>▶</button>}
                      {!soloLectura && <button type="button" title="Editar tratamiento" aria-label="Editar tratamiento" onClick={() => { setTratamientoSeleccionado(tratamiento); setVistaFormulario('tratamiento'); }}>✎</button>}
                      {!soloLectura && tratamiento.estado === 'Activo' && <button type="button" title="Completar tratamiento" aria-label="Completar tratamiento" onClick={() => setTratamientoCompletar(tratamiento)}>✓</button>}
                      {!soloLectura && tratamiento.estado === 'Activo' && <button className="accion-peligro" type="button" title="Cancelar tratamiento" aria-label="Cancelar tratamiento" onClick={() => cancelarTratamiento(tratamiento)}>⌫</button>}
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      {pestana === 'historial' && (
        <>
          <form className="sanidad-filtros" onSubmit={(evento) => { evento.preventDefault(); setFiltrosAplicados(filtrosHistorial); }}>
            <label>Desde<input type="date" value={filtrosHistorial.fechaInicio} onChange={(evento) => setFiltrosHistorial((actual) => ({ ...actual, fechaInicio: evento.target.value }))} /></label>
            <label>Hasta<input type="date" value={filtrosHistorial.fechaFin} onChange={(evento) => setFiltrosHistorial((actual) => ({ ...actual, fechaFin: evento.target.value }))} /></label>
            <label>Animal<select value={filtrosHistorial.animal} onChange={(evento) => setFiltrosHistorial((actual) => ({ ...actual, animal: evento.target.value }))}><option value="">Todos</option>{animales.map((animal) => <option key={animal._id} value={animal._id}>{identificadorAnimal(animal)} {animal.nombre || ''}</option>)}</select></label>
            <label>Producto<input value={filtrosHistorial.producto} onChange={(evento) => setFiltrosHistorial((actual) => ({ ...actual, producto: evento.target.value }))} /></label>
            <label>Naturaleza<select value={filtrosHistorial.naturaleza} onChange={(evento) => setFiltrosHistorial((actual) => ({ ...actual, naturaleza: evento.target.value }))}><option value="">Todas</option><option value="Plan sanitario">Plan sanitario</option><option value="Tratamiento">Tratamiento</option><option value="Aplicacion unica">Aplicación única</option></select></label>
            <label>Responsable<input value={filtrosHistorial.responsable} onChange={(evento) => setFiltrosHistorial((actual) => ({ ...actual, responsable: evento.target.value }))} /></label>
            <button className="boton-secundario compacto" type="submit">Aplicar filtros</button>
          </form>
          <div className="tabla-scroll tabla-dinamica sanidad-tabla">
            <table>
              <thead><tr><th>Fecha</th><th>Animal(es)</th><th>Producto</th><th>Tipo</th><th>Dosis</th><th>Naturaleza</th><th>Responsable</th><th>Origen</th><th>Acciones</th></tr></thead>
              <tbody>{aplicaciones.map((aplicacion) => (
                <tr key={aplicacion._id}><td>{formatearFecha(aplicacion.fechaAplicacion)}</td><td title={nombresAnimales(aplicacion.animales)}>{nombresAnimales(aplicacion.animales)}</td><td>{aplicacion.producto}</td><td>{aplicacion.tipo || '--'}</td><td>{aplicacion.dosis || '--'}</td><td><span className="naturaleza-sanitaria-badge">{etiquetaNaturaleza(aplicacion.naturaleza)}</span></td><td>{aplicacion.responsable || '--'}</td><td>{aplicacion.planSanitario ? 'Plan sanitario' : aplicacion.tratamiento ? 'Tratamiento' : 'Registro directo'}</td><td><div className="acciones-tabla acciones-iconos-sanidad"><button type="button" title="Ver detalle" aria-label="Ver detalle" onClick={() => setDetalleAplicacion(aplicacion)}>⊙</button></div></td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}

      {planAplicacion && <RegistrarAplicacionSanitaria plan={planAplicacion} onCancelar={() => setPlanAplicacion(null)} onRegistrar={registrarPlan} guardando={guardando} error={errorFormulario} />}
      {tratamientoAplicacion && <RegistrarAplicacionTratamiento tratamiento={tratamientoAplicacion} onCancelar={() => setTratamientoAplicacion(null)} onRegistrar={registrarTratamiento} guardando={guardando} error={errorFormulario} />}
      {tratamientoCompletar && <CompletarTratamientoSanitario tratamiento={tratamientoCompletar} onCancelar={() => setTratamientoCompletar(null)} onGuardar={completarTratamiento} guardando={guardando} error={errorFormulario} />}
      {mostrarCambioEstadoSanitario && <FormularioEstadoSanitario animales={animalesActivos} onCancelar={() => setMostrarCambioEstadoSanitario(false)} onGuardar={guardarCambioEstadoSanitario} guardando={guardando} error={errorFormulario} />}
      {detalleTratamiento && (
        <div className="modal-backdrop"><section className="modal-panel detalle-sanidad-modal">
          <div className="panel-title"><div><p className="eyebrow">Tratamiento</p><h2>{detalleTratamiento.tratamiento.producto}</h2></div><button className="boton-link" type="button" onClick={() => setDetalleTratamiento(null)}>Cerrar</button></div>
          <div className="detalle-sanidad-grid"><article><span>Motivo</span><strong>{detalleTratamiento.tratamiento.motivo}</strong></article><article><span>Estado</span><strong>{detalleTratamiento.tratamiento.estado}</strong></article><article><span>Animales</span><strong>{nombresAnimales(detalleTratamiento.tratamiento.animales)}</strong></article><article><span>Progreso</span><strong>{detalleTratamiento.tratamiento.aplicacionesRealizadas} / {detalleTratamiento.tratamiento.cantidadAplicaciones}</strong></article></div>
          <div className="tabla-scroll tabla-dinamica detalle-aplicaciones-tabla"><table><thead><tr><th>Número</th><th>Fecha real</th><th>Dosis</th><th>Responsable</th></tr></thead><tbody>{detalleTratamiento.aplicaciones.map((aplicacion) => <tr key={aplicacion._id}><td>{aplicacion.numeroAplicacion}</td><td>{formatearFecha(aplicacion.fechaAplicacion)}</td><td>{aplicacion.dosis || '--'}</td><td>{aplicacion.responsable || '--'}</td></tr>)}</tbody></table></div>
        </section></div>
      )}
      {detalleAplicacion && (
        <div className="modal-backdrop"><section className="modal-panel detalle-sanidad-modal">
          <div className="panel-title"><div><p className="eyebrow">{etiquetaNaturaleza(detalleAplicacion.naturaleza)}</p><h2>{detalleAplicacion.producto}</h2></div><button className="boton-link" type="button" onClick={() => setDetalleAplicacion(null)}>Cerrar</button></div>
          <div className="detalle-sanidad-grid"><article><span>Fecha</span><strong>{formatearFecha(detalleAplicacion.fechaAplicacion)}</strong></article><article><span>Animales</span><strong>{nombresAnimales(detalleAplicacion.animales)}</strong></article><article><span>Dosis</span><strong>{detalleAplicacion.dosis || '--'}</strong></article><article><span>Vía</span><strong>{detalleAplicacion.viaAplicacion || '--'}</strong></article><article><span>Responsable</span><strong>{detalleAplicacion.responsable || '--'}</strong></article><article><span>Motivo</span><strong>{detalleAplicacion.motivo || '--'}</strong></article></div>
        </section></div>
      )}
    </section>
  );
};

export default PlanSanitario;
