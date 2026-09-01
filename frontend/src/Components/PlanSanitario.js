import React, { useEffect, useState } from 'react';
import {
  actualizarPlanSanitario,
  crearPlanSanitario,
  eliminarPlanSanitario,
  obtenerPlanesSanitarios,
  registrarAplicacionPlanSanitario
} from '../services/api';
import FormularioPlanSanitario from './FormularioPlanSanitario';
import RegistrarAplicacionSanitaria from './RegistrarAplicacionSanitaria';
import SelectorEspecie from './SelectorEspecie';
import TablaDinamica from './TablaDinamica';

const obtenerEspecieInicial = () => localStorage.getItem('ganaderiaEspecie') || 'Bovino';

const formatearFecha = (fecha) => {
  if (!fecha) return '--';
  return new Date(fecha).toLocaleDateString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const formatearFrecuencia = (plan) => {
  if (!plan.frecuenciaCantidad || !plan.frecuenciaUnidad) return '--';
  return `${plan.frecuenciaCantidad} ${plan.frecuenciaUnidad}`;
};

const columnas = [
  { id: 'grupoGanado', label: 'Grupo', accessor: (plan) => plan.grupoGanado },
  { id: 'animalDiio', label: 'DIIO', accessor: (plan) => plan.animalDiio },
  { id: 'actividad', label: 'Actividad', accessor: (plan) => plan.actividad },
  { id: 'producto', label: 'Producto', accessor: (plan) => plan.producto },
  {
    id: 'fechaAplicacion',
    label: 'Fecha aplicacion',
    accessor: (plan) => formatearFecha(plan.fechaAplicacion)
  },
  { id: 'frecuencia', label: 'Frecuencia', accessor: formatearFrecuencia },
  {
    id: 'proximaAplicacion',
    label: 'Proxima aplicacion',
    accessor: (plan) => formatearFecha(plan.proximaAplicacion)
  },
  {
    id: 'estado',
    label: 'Estado',
    accessor: (plan) => plan.estado,
    render: (plan) => <span className={`estado-badge estado-${plan.estado}`}>{plan.estado}</span>
  }
];

const filtros = [
  { id: 'grupoGanado', accessor: (plan) => plan.grupoGanado },
  { id: 'estado', accessor: (plan) => plan.estado }
];

const PlanSanitario = () => {
  const [planes, setPlanes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [modoFormulario, setModoFormulario] = useState(false);
  const [planSeleccionado, setPlanSeleccionado] = useState(null);
  const [planAplicacion, setPlanAplicacion] = useState(null);
  const [especie, setEspecie] = useState(obtenerEspecieInicial);
  const etiquetaId = 'DIIO';

  const cambiarEspecie = (valor) => {
    localStorage.setItem('ganaderiaEspecie', valor);
    setEspecie(valor);
  };

  const cargarPlanes = async () => {
    try {
      setError('');
      const data = await obtenerPlanesSanitarios({ especie });
      setPlanes(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    setCargando(true);
    cargarPlanes();
  }, [especie]);

  const guardarPlan = async (plan) => {
    try {
      setGuardando(true);
      setErrorFormulario('');
      if (planSeleccionado?._id) {
        await actualizarPlanSanitario(planSeleccionado._id, plan);
      } else {
        await crearPlanSanitario(plan);
      }
      setPlanSeleccionado(null);
      setModoFormulario(false);
      setCargando(true);
      await cargarPlanes();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrarPlan = async (plan) => {
    const confirmar = window.confirm(`¿Eliminar el plan ${plan.actividad || plan.producto || ''}? Esta accion no se puede deshacer.`);
    if (!confirmar) return;

    try {
      await eliminarPlanSanitario(plan._id);
      window.alert('Plan sanitario eliminado correctamente.');
      setCargando(true);
      await cargarPlanes();
    } catch (err) {
      setError(err.message);
    }
  };

  const abrirNuevoPlan = () => {
    setPlanSeleccionado(null);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const abrirEdicionPlan = (plan) => {
    setPlanSeleccionado(plan);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const cancelarFormulario = () => {
    setPlanSeleccionado(null);
    setModoFormulario(false);
  };

  const abrirRegistroAplicacion = (plan) => {
    setPlanAplicacion(plan);
    setErrorFormulario('');
  };

  const cerrarRegistroAplicacion = () => {
    setPlanAplicacion(null);
    setErrorFormulario('');
  };

  const registrarAplicacion = async (datos) => {
    if (!planAplicacion?._id) return;

    try {
      setGuardando(true);
      setErrorFormulario('');
      await registrarAplicacionPlanSanitario(planAplicacion._id, datos);
      setPlanAplicacion(null);
      setModoFormulario(false);
      setPlanSeleccionado(null);
      setCargando(true);
      await cargarPlanes();
      window.alert('Aplicación sanitaria registrada correctamente.');
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  if (modoFormulario) {
    return (
      <>
        <FormularioPlanSanitario
          planInicial={planSeleccionado}
          modo={planSeleccionado ? 'editar' : 'crear'}
          onCancelar={cancelarFormulario}
          onGuardar={guardarPlan}
          onRegistrarAplicacion={planSeleccionado ? abrirRegistroAplicacion : undefined}
          guardando={guardando}
          error={errorFormulario}
          especie={especie}
        />
        {planAplicacion && (
          <RegistrarAplicacionSanitaria
            plan={planAplicacion}
            onCancelar={cerrarRegistroAplicacion}
            onRegistrar={registrarAplicacion}
            guardando={guardando}
            error={errorFormulario}
          />
        )}
      </>
    );
  }

  return (
    <>
      <SelectorEspecie valor={especie} onChange={cambiarEspecie} />
      <TablaDinamica
        titulo="Plan Sanitario"
        subtitulo="Sanidad"
        columnas={columnas.map((columna) => columna.id === 'animalDiio' ? { ...columna, label: etiquetaId } : columna)}
        datos={planes}
        cargando={cargando}
        error={error}
        filtros={filtros}
        textoAgregar="Nuevo plan"
        onAgregar={abrirNuevoPlan}
        onEditar={abrirEdicionPlan}
        onEliminar={borrarPlan}
        accionesExtra={(plan) => (
          <button
            type="button"
            aria-label="Registrar aplicación"
            title="Registrar aplicación"
            onClick={() => abrirRegistroAplicacion(plan)}
          >
            ✓
          </button>
        )}
      />
      {planAplicacion && (
        <RegistrarAplicacionSanitaria
          plan={planAplicacion}
          onCancelar={cerrarRegistroAplicacion}
          onRegistrar={registrarAplicacion}
          guardando={guardando}
          error={errorFormulario}
        />
      )}
    </>
  );
};

export default PlanSanitario;
