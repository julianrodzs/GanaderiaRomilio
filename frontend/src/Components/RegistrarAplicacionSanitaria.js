import React, { useState } from 'react';

const fechaHoy = () => new Date().toISOString().slice(0, 10);

const RegistrarAplicacionSanitaria = ({ plan, onCancelar, onRegistrar, guardando, error }) => {
  const [formulario, setFormulario] = useState({
    fechaAplicacion: fechaHoy(),
    responsable: plan?.responsable || '',
    observaciones: ''
  });

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const enviarFormulario = (evento) => {
    evento.preventDefault();
    onRegistrar(formulario);
  };

  return (
    <div className="modal-backdrop">
      <section className="modal-panel aplicacion-sanitaria-modal">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Sanidad</p>
            <h2>Registrar aplicación</h2>
          </div>
          <button className="boton-link" type="button" onClick={onCancelar}>Cerrar</button>
        </div>

        <div className="aplicacion-sanitaria-resumen">
          <span>{plan?.grupoGanado || '--'}</span>
          <strong>{plan?.actividad || '--'} / {plan?.producto || '--'}</strong>
        </div>

        <form className="form-card" onSubmit={enviarFormulario}>
          {error && <div className="alerta-formulario">{error}</div>}

          <div className="form-grid">
            <label>
              Fecha real de aplicación
              <input
                name="fechaAplicacion"
                type="date"
                value={formulario.fechaAplicacion}
                onChange={actualizarCampo}
                required
              />
            </label>

            <label>
              Responsable
              <input
                name="responsable"
                value={formulario.responsable}
                onChange={actualizarCampo}
                placeholder="Encargado de finca"
              />
            </label>
          </div>

          <label>
            Observaciones
            <textarea
              name="observaciones"
              value={formulario.observaciones}
              onChange={actualizarCampo}
              placeholder="Notas de la aplicación realizada"
              rows="4"
            />
          </label>

          <div className="form-actions">
            <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
            <button className="boton-primario compacto" type="submit" disabled={guardando}>
              {guardando ? 'Registrando...' : 'Registrar aplicación'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default RegistrarAplicacionSanitaria;
