import React, { useState } from 'react';

const fechaHoy = () => new Date().toISOString().slice(0, 10);

const RegistrarAplicacionTratamiento = ({ tratamiento, onCancelar, onRegistrar, guardando, error }) => {
  const esUltimaAplicacion = Number(tratamiento?.aplicacionesRealizadas || 0) + 1 >= Number(tratamiento?.cantidadAplicaciones || 1);
  const [formulario, setFormulario] = useState({
    fechaAplicacion: fechaHoy(),
    dosis: tratamiento?.dosis || '',
    viaAplicacion: tratamiento?.viaAplicacion || '',
    responsable: tratamiento?.responsable || '',
    observaciones: '',
    estadoSanitarioFinal: 'No modificar',
    motivoCambioEstadoSanitario: ''
  });

  const actualizar = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  return (
    <div className="modal-backdrop">
      <section className="modal-panel aplicacion-sanitaria-modal">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Tratamiento</p>
            <h2>Registrar aplicación {Number(tratamiento.aplicacionesRealizadas || 0) + 1} de {tratamiento.cantidadAplicaciones}</h2>
          </div>
          <button className="boton-link" type="button" onClick={onCancelar}>Cerrar</button>
        </div>
        <div className="aplicacion-sanitaria-resumen">
          <span>{tratamiento.animales?.length || 0} animal(es)</span>
          <strong>{tratamiento.producto} · {tratamiento.motivo}</strong>
        </div>
        <form className="form-card" onSubmit={(evento) => { evento.preventDefault(); onRegistrar(formulario); }}>
          {error && <div className="alerta-formulario">{error}</div>}
          <div className="form-grid">
            <label>
              Fecha real de aplicación
              <input name="fechaAplicacion" type="date" value={formulario.fechaAplicacion} onChange={actualizar} required />
            </label>
            <label>
              Responsable
              <input name="responsable" value={formulario.responsable} onChange={actualizar} />
            </label>
            <label>
              Dosis
              <input name="dosis" value={formulario.dosis} onChange={actualizar} />
            </label>
            <label>
              Vía de aplicación
              <input name="viaAplicacion" value={formulario.viaAplicacion} onChange={actualizar} />
            </label>
          </div>
          <label>
            Observaciones de esta aplicación
            <textarea name="observaciones" value={formulario.observaciones} onChange={actualizar} rows="3" />
          </label>
          {esUltimaAplicacion && (
            <section className="form-section cierre-tratamiento-sanidad">
              <div>
                <p className="eyebrow">Cierre del tratamiento</p>
                <h3>Estado sanitario de los animales</h3>
              </div>
              <label>
                Estado al completar
                <select name="estadoSanitarioFinal" value={formulario.estadoSanitarioFinal} onChange={actualizar} required>
                  <option value="No modificar">No modificar</option>
                  <option value="Sano">Sano</option>
                  <option value="Recuperación">Recuperación</option>
                  <option value="Enfermo">Mantener Enfermo</option>
                </select>
              </label>
              {formulario.estadoSanitarioFinal !== 'No modificar' && (
                <label>
                  Motivo del estado sanitario
                  <textarea name="motivoCambioEstadoSanitario" value={formulario.motivoCambioEstadoSanitario} onChange={actualizar} rows="2" required />
                </label>
              )}
            </section>
          )}
          <div className="form-actions">
            <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
            <button className="boton-primario compacto" type="submit" disabled={guardando}>
              {guardando ? 'Registrando...' : 'Confirmar aplicación'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default RegistrarAplicacionTratamiento;
