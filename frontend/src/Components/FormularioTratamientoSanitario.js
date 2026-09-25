import React, { useState } from 'react';
import SelectorAnimalesSanidad from './SelectorAnimalesSanidad';

const fechaHoy = () => new Date().toISOString().slice(0, 10);
const fechaInput = (fecha) => fecha ? new Date(fecha).toISOString().slice(0, 10) : '';

const crearEstado = (tratamiento, especie) => ({
  animales: (tratamiento?.animales || []).map((animal) => animal?._id || animal),
  especie: tratamiento?.especie || especie,
  motivo: tratamiento?.motivo || '',
  diagnostico: tratamiento?.diagnostico || '',
  producto: tratamiento?.producto || '',
  dosis: tratamiento?.dosis || '',
  viaAplicacion: tratamiento?.viaAplicacion || '',
  fechaInicio: fechaInput(tratamiento?.fechaInicio) || fechaHoy(),
  cantidadAplicaciones: tratamiento?.cantidadAplicaciones || 1,
  intervaloDias: tratamiento?.intervaloDias || '',
  asignadoA: tratamiento?.asignadoA?._id || tratamiento?.asignadoA || '',
  responsable: tratamiento?.responsable || '',
  veterinario: tratamiento?.veterinario || '',
  observaciones: tratamiento?.observaciones || '',
  registrarPrimeraAplicacion: false,
  fechaPrimeraAplicacion: fechaHoy(),
  actualizarEstadoSanitario: !tratamiento,
  estadoSanitario: 'Enfermo',
  motivoCambioEstadoSanitario: ''
});

const FormularioTratamientoSanitario = ({
  tratamientoInicial,
  especie,
  animales,
  usuariosAsignables = [],
  onGuardar,
  onCancelar,
  guardando,
  error
}) => {
  const [formulario, setFormulario] = useState(() => crearEstado(tratamientoInicial, especie));
  const editando = Boolean(tratamientoInicial?._id);
  const bloquearAnimales = editando && tratamientoInicial.aplicacionesRealizadas > 0;

  const actualizar = (evento) => {
    const { name, value, type, checked } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: type === 'checkbox' ? checked : value }));
  };

  const enviar = (evento) => {
    evento.preventDefault();
    onGuardar({
      ...formulario,
      cantidadAplicaciones: Number(formulario.cantidadAplicaciones),
      intervaloDias: formulario.intervaloDias ? Number(formulario.intervaloDias) : undefined
    });
  };

  return (
    <section className="form-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Sanidad · Tratamientos</p>
          <h2>{editando ? 'Editar tratamiento' : 'Nuevo tratamiento'}</h2>
        </div>
        <button className="boton-link" type="button" onClick={onCancelar}>Volver</button>
      </div>

      <form className="form-card tratamiento-form" onSubmit={enviar}>
        {error && <div className="alerta-formulario">{error}</div>}

        <label>
          Animales
          <SelectorAnimalesSanidad
            animales={animales}
            seleccionados={formulario.animales}
            onChange={(seleccionados) => setFormulario((actual) => ({ ...actual, animales: seleccionados }))}
            disabled={bloquearAnimales}
          />
          {bloquearAnimales && <small className="texto-ayuda-formulario">Los animales quedan fijos después de la primera aplicación.</small>}
        </label>

        <div className="form-grid">
          <label>
            Motivo
            <input name="motivo" value={formulario.motivo} onChange={actualizar} required placeholder="Infección, lesión o recuperación" />
          </label>
          <label>
            Diagnóstico
            <input name="diagnostico" value={formulario.diagnostico} onChange={actualizar} placeholder="Diagnóstico veterinario" />
          </label>
          <label>
            Producto
            <input name="producto" value={formulario.producto} onChange={actualizar} required placeholder="Oxytetraciclina" />
          </label>
          <label>
            Dosis
            <input name="dosis" value={formulario.dosis} onChange={actualizar} placeholder="20 ml" />
          </label>
          <label>
            Vía de aplicación
            <input name="viaAplicacion" value={formulario.viaAplicacion} onChange={actualizar} placeholder="Intramuscular" />
          </label>
          <label>
            Fecha de inicio
            <input name="fechaInicio" type="date" value={formulario.fechaInicio} onChange={actualizar} required />
          </label>
          <label>
            Cantidad de aplicaciones
            <input name="cantidadAplicaciones" type="number" min="1" value={formulario.cantidadAplicaciones} onChange={actualizar} required />
          </label>
          <label>
            Intervalo en días
            <input
              name="intervaloDias"
              type="number"
              min="1"
              value={formulario.intervaloDias}
              onChange={actualizar}
              required={Number(formulario.cantidadAplicaciones) > 1}
              placeholder="2"
            />
          </label>
          <label>
            Responsable de las tareas
            <select name="asignadoA" value={formulario.asignadoA} onChange={actualizar} required>
              <option value="">Seleccionar responsable</option>
              {usuariosAsignables.map((usuario) => (
                <option key={usuario._id} value={usuario._id}>
                  {[usuario.nombre, usuario.apellido].filter(Boolean).join(' ') || usuario.correo} - {usuario.rol}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsable externo / referencia
            <input name="responsable" value={formulario.responsable} onChange={actualizar} />
          </label>
          <label>
            Veterinario externo / referencia
            <input name="veterinario" value={formulario.veterinario} onChange={actualizar} />
          </label>
        </div>

        <label>
          Observaciones
          <textarea name="observaciones" value={formulario.observaciones} onChange={actualizar} rows="4" />
        </label>

        {!editando && (
          <>
            <div className="registro-inmediato-panel">
              <label className="campo-check">
                <input
                  name="actualizarEstadoSanitario"
                  type="checkbox"
                  checked={formulario.actualizarEstadoSanitario}
                  onChange={actualizar}
                />
                Cambiar estado sanitario de los animales seleccionados
              </label>
              {formulario.actualizarEstadoSanitario && (
                <label>
                  Estado sanitario
                  <select name="estadoSanitario" value={formulario.estadoSanitario} onChange={actualizar} required>
                    <option value="Sano">Sano</option>
                    <option value="En observación">En observación</option>
                    <option value="Enfermo">Enfermo</option>
                    <option value="Recuperación">Recuperación</option>
                  </select>
                </label>
              )}
            </div>

            {formulario.actualizarEstadoSanitario && (
              <label>
                Motivo del cambio sanitario
                <input
                  name="motivoCambioEstadoSanitario"
                  value={formulario.motivoCambioEstadoSanitario}
                  onChange={actualizar}
                  placeholder="Si se deja vacío se usará el motivo del tratamiento"
                />
              </label>
            )}

            <div className="registro-inmediato-panel">
              <label className="campo-check">
                <input
                  name="registrarPrimeraAplicacion"
                  type="checkbox"
                  checked={formulario.registrarPrimeraAplicacion}
                  onChange={actualizar}
                />
                Registrar primera aplicación ahora
              </label>
              {formulario.registrarPrimeraAplicacion && (
                <label>
                  Fecha real de la primera aplicación
                  <input name="fechaPrimeraAplicacion" type="date" value={formulario.fechaPrimeraAplicacion} onChange={actualizar} required />
                </label>
              )}
            </div>
          </>
        )}

        <div className="form-actions">
          <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
          <button className="boton-primario compacto" type="submit" disabled={guardando || formulario.animales.length === 0}>
            {guardando ? 'Guardando...' : editando ? 'Actualizar tratamiento' : 'Guardar tratamiento'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default FormularioTratamientoSanitario;
