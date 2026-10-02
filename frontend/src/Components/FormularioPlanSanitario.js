import React, { useState } from 'react';
import SelectorAnimalesSanidad from './SelectorAnimalesSanidad';
import { etiquetaUsuarioConRol } from '../utils/usuarios';

const estadoInicial = {
  grupoGanado: 'Todo el ganado',
  especie: 'Bovino',
  lote: '',
  animales: [],
  animalDiio: '',
  actividad: '',
  producto: '',
  marca: '',
  dosis: '',
  viaAplicacion: '',
  criterioPeso: '',
  fechaAplicacion: '',
  frecuenciaCantidad: 1,
  frecuenciaUnidad: 'meses',
  asignadoA: '',
  responsable: '',
  observaciones: ''
};

const grupos = [
  'Terneros',
  'Novillos',
  'Toros',
  'Vacas preñadas',
  'Vacas paridas',
  'Lote completo',
  'Animales seleccionados',
  'Todo el ganado'
];


const formatearFechaInput = (fecha) => {
  if (!fecha) return '';
  return new Date(fecha).toISOString().slice(0, 10);
};

const normalizarPlan = (plan) => ({
  ...estadoInicial,
  ...plan,
  grupoGanado: plan?.lote ? 'Lote completo' : plan?.grupoGanado || estadoInicial.grupoGanado,
  animales: (plan?.animales || []).map((animal) => animal?._id || animal),
  lote: plan?.lote?._id || plan?.lote || '',
  asignadoA: plan?.asignadoA?._id || plan?.asignadoA || '',
  fechaAplicacion: formatearFechaInput(plan?.fechaAplicacion),
  frecuenciaCantidad: plan?.frecuenciaCantidad ?? 1
});

const FormularioPlanSanitario = ({ onCancelar, onGuardar, onRegistrarAplicacion, guardando, error, planInicial, modo = 'crear', especie = 'Bovino', animalesOpciones = [], lotes = [], usuariosAsignables = [] }) => {
  const [formulario, setFormulario] = useState(() => ({
    ...normalizarPlan(planInicial),
    especie: planInicial?.especie || especie
  }));
  const etiquetaId = 'DIIO';
  const mostrarSeleccionAnimales = !['Todo el ganado', 'Lote completo'].includes(formulario.grupoGanado);
  const mostrarSeleccionLote = formulario.grupoGanado === 'Lote completo' || Boolean(formulario.lote);

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => {
      if (name === 'grupoGanado' && value === 'Todo el ganado') {
        return { ...actual, grupoGanado: value, lote: '', animales: [], animalDiio: '' };
      }
      if (name === 'grupoGanado' && value === 'Lote completo') {
        return { ...actual, grupoGanado: value, animales: [], animalDiio: '' };
      }
      if (name === 'grupoGanado') {
        return { ...actual, grupoGanado: value, lote: '' };
      }
      return { ...actual, [name]: value };
    });
  };

  const enviarFormulario = (evento) => {
    evento.preventDefault();
    onGuardar({
      ...formulario,
      frecuenciaCantidad: Number(formulario.frecuenciaCantidad)
    });
  };

  return (
    <section className="form-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Sanidad</p>
          <h2>{modo === 'editar' ? 'Editar plan sanitario' : 'Nuevo plan sanitario'}</h2>
        </div>
        <button className="boton-link" type="button" onClick={onCancelar}>Volver</button>
      </div>

      <form className="form-card" onSubmit={enviarFormulario}>
        {error && <div className="alerta-formulario">{error}</div>}

        <div className="form-grid">
          <label>
            Especie
            <select name="especie" value={formulario.especie} onChange={actualizarCampo} required disabled>
              <option value="Bovino">Bovino</option>
              <option value="Porcino">Porcino</option>
            </select>
          </label>

          <label>
            Grupo de ganado
            <select name="grupoGanado" value={formulario.grupoGanado} onChange={actualizarCampo} required>
              {grupos.map((grupo) => (
                <option key={grupo} value={grupo}>{grupo}</option>
              ))}
            </select>
          </label>

          <label>
            Actividad
            <input
              name="actividad"
              value={formulario.actividad}
              onChange={actualizarCampo}
              placeholder="Desparasitante interno"
              required
            />
          </label>
        </div>

        {mostrarSeleccionLote && (
          <label>
            Lote
            <select name="lote" value={formulario.lote} onChange={actualizarCampo} required>
              <option value="">Seleccionar lote activo</option>
              {lotes.map((lote) => (
                <option key={lote._id} value={lote._id}>
                  {lote.codigo} · {lote.nombre} · {lote.cantidadAnimales || 0} animales
                </option>
              ))}
            </select>
            <small>Los animales se resolverán desde la pertenencia activa al registrar cada aplicación.</small>
          </label>
        )}

        {mostrarSeleccionAnimales && (
          <label>
            Animales del plan
            <SelectorAnimalesSanidad
              animales={animalesOpciones}
              seleccionados={formulario.animales}
              onChange={(seleccionados) => setFormulario((actual) => ({
                ...actual,
                animales: seleccionados,
                grupoGanado: seleccionados.length ? 'Animales seleccionados' : actual.grupoGanado,
                animalDiio: seleccionados.length ? '' : actual.animalDiio
              }))}
            />
          </label>
        )}

        {mostrarSeleccionAnimales && formulario.animales.length === 0 && (
          <label>
            {etiquetaId} individual
            <input
              name="animalDiio"
              value={formulario.animalDiio}
              onChange={actualizarCampo}
              placeholder="Compatibilidad con planes existentes"
            />
          </label>
        )}

        <div className="form-grid">
          <label>
            Producto
            <input
              name="producto"
              value={formulario.producto}
              onChange={actualizarCampo}
              placeholder="Bimectin 3.5%"
              required
            />
          </label>

          <label>
            Marca
            <input
              name="marca"
              value={formulario.marca}
              onChange={actualizarCampo}
              placeholder="Bimectin"
            />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Dosis
            <input
              name="dosis"
              value={formulario.dosis}
              onChange={actualizarCampo}
              placeholder="1 cc"
            />
          </label>

          <label>
            Criterio de peso
            <input
              name="criterioPeso"
              value={formulario.criterioPeso}
              onChange={actualizarCampo}
              placeholder="Por cada 50 kg"
            />
          </label>

          <label>
            Vía de aplicación
            <input
              name="viaAplicacion"
              value={formulario.viaAplicacion}
              onChange={actualizarCampo}
              placeholder="Intramuscular"
            />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Responsable de las tareas
            <select name="asignadoA" value={formulario.asignadoA} onChange={actualizarCampo} required>
              <option value="">Seleccionar responsable</option>
              {usuariosAsignables.map((usuario) => (
                <option key={usuario._id} value={usuario._id}>
                  {etiquetaUsuarioConRol(usuario)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Fecha de aplicacion
            <input
              name="fechaAplicacion"
              type="date"
              value={formulario.fechaAplicacion}
              onChange={actualizarCampo}
              required
            />
          </label>

          <label>
            Responsable externo / referencia
            <input
              name="responsable"
              value={formulario.responsable}
              onChange={actualizarCampo}
              placeholder="Encargado de finca"
            />
          </label>
        </div>

        <div className="form-grid frecuencia-grid">
          <label>
            Frecuencia
            <input
              name="frecuenciaCantidad"
              type="number"
              min="1"
              value={formulario.frecuenciaCantidad}
              onChange={actualizarCampo}
              required
            />
          </label>

          <label>
            Unidad
            <select name="frecuenciaUnidad" value={formulario.frecuenciaUnidad} onChange={actualizarCampo} required>
              <option value="dias">dias</option>
              <option value="semanas">semanas</option>
              <option value="meses">meses</option>
              <option value="años">años</option>
            </select>
          </label>
        </div>

        <label>
          Observaciones
          <textarea
            name="observaciones"
            value={formulario.observaciones}
            onChange={actualizarCampo}
            placeholder="Notas del plan sanitario"
            rows="4"
          />
        </label>

        <div className="form-actions">
          {onRegistrarAplicacion && (
            <button
              className="boton-secundario compacto"
              type="button"
              onClick={() => onRegistrarAplicacion(planInicial)}
              disabled={guardando}
            >
              Registrar aplicación
            </button>
          )}
          <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
          <button className="boton-primario compacto" type="submit" disabled={guardando || (mostrarSeleccionLote && !formulario.lote)}>
            {guardando ? 'Guardando...' : modo === 'editar' ? 'Actualizar plan' : 'Guardar plan'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default FormularioPlanSanitario;
