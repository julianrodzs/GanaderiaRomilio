import React, { useEffect, useState } from 'react';
import { crearPlanSanitario, obtenerPlanesSanitarios } from '../services/api';
import FormularioPlanSanitario from './FormularioPlanSanitario';
import TablaDinamica from './TablaDinamica';

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

  const cargarPlanes = async () => {
    try {
      setError('');
      const data = await obtenerPlanesSanitarios();
      setPlanes(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarPlanes();
  }, []);

  const guardarPlan = async (plan) => {
    try {
      setGuardando(true);
      setErrorFormulario('');
      await crearPlanSanitario(plan);
      setModoFormulario(false);
      setCargando(true);
      await cargarPlanes();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  if (modoFormulario) {
    return (
      <FormularioPlanSanitario
        onCancelar={() => setModoFormulario(false)}
        onGuardar={guardarPlan}
        guardando={guardando}
        error={errorFormulario}
      />
    );
  }

  return (
    <TablaDinamica
      titulo="Plan Sanitario"
      subtitulo="Sanidad"
      columnas={columnas}
      datos={planes}
      cargando={cargando}
      error={error}
      filtros={filtros}
      textoAgregar="Nuevo plan"
      onAgregar={() => setModoFormulario(true)}
    />
  );
};

export default PlanSanitario;
