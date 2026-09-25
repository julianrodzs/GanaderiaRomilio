import React, { useState } from 'react';

const CompletarTratamientoSanitario = ({ tratamiento, onGuardar, onCancelar, guardando, error }) => {
  const [estadoSanitarioFinal, setEstadoSanitarioFinal] = useState('No modificar');
  const [motivoCambioEstadoSanitario, setMotivoCambioEstadoSanitario] = useState('');
  const requiereMotivo = estadoSanitarioFinal !== 'No modificar';

  const enviar = (evento) => {
    evento.preventDefault();
    onGuardar({ estadoSanitarioFinal, motivoCambioEstadoSanitario: motivoCambioEstadoSanitario.trim() });
  };

  return (
    <div className="modal-backdrop">
      <section className="modal-panel completar-tratamiento-modal">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Tratamiento</p>
            <h2>Completar tratamiento</h2>
          </div>
          <button className="boton-link" type="button" onClick={onCancelar}>Cerrar</button>
        </div>

        <form className="form-card" onSubmit={enviar}>
          {error && <div className="alerta-formulario">{error}</div>}
          <div className="aplicacion-sanitaria-resumen">
            <span>{tratamiento.animales?.length || 0} animal(es)</span>
            <strong>{tratamiento.producto}</strong>
          </div>

          <label>
            Estado sanitario al finalizar
            <select value={estadoSanitarioFinal} onChange={(evento) => setEstadoSanitarioFinal(evento.target.value)} required>
              <option value="No modificar">No modificar</option>
              <option value="Sano">Sano</option>
              <option value="Recuperación">Recuperación</option>
              <option value="Enfermo">Mantener Enfermo</option>
            </select>
          </label>

          {requiereMotivo && (
            <label>
              Motivo del estado sanitario
              <textarea rows="3" value={motivoCambioEstadoSanitario} onChange={(evento) => setMotivoCambioEstadoSanitario(evento.target.value)} required />
            </label>
          )}

          <div className="form-actions">
            <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
            <button className="boton-primario compacto" type="submit" disabled={guardando || (requiereMotivo && !motivoCambioEstadoSanitario.trim())}>
              {guardando ? 'Completando...' : 'Completar tratamiento'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default CompletarTratamientoSanitario;
