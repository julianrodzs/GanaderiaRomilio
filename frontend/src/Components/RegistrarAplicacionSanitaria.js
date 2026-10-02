import React, { useState } from 'react';
import { etiquetaUsuarioConRol } from '../utils/usuarios';

const fechaHoy = () => new Date().toISOString().slice(0, 10);

const RegistrarAplicacionSanitaria = ({ plan, usuariosAsignables = [], onCancelar, onRegistrar, guardando, error }) => {
  const asignadoActual = plan?.asignadoA?._id || plan?.asignadoA || '';
  const responsableInicial = usuariosAsignables.some((usuario) => usuario._id === asignadoActual) ? asignadoActual : '';
  const [formulario, setFormulario] = useState({
    fechaAplicacion: fechaHoy(),
    responsableUsuario: responsableInicial,
    dosis: plan?.dosis || '',
    viaAplicacion: plan?.viaAplicacion || '',
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
          <span>{plan?.lote ? `Lote ${plan.lote.codigo} · miembros activos al aplicar` : plan?.grupoGanado || '--'}</span>
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
              <select name="responsableUsuario" value={formulario.responsableUsuario} onChange={actualizarCampo} required>
                <option value="">Seleccionar responsable</option>
                {usuariosAsignables.map((usuario) => (
                  <option key={usuario._id} value={usuario._id}>{etiquetaUsuarioConRol(usuario)}</option>
                ))}
              </select>
            </label>

            <label>
              Dosis aplicada
              <input
                name="dosis"
                value={formulario.dosis}
                onChange={actualizarCampo}
                placeholder="20 ml"
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
            <button className="boton-primario compacto" type="submit" disabled={guardando || !formulario.responsableUsuario}>
              {guardando ? 'Registrando...' : 'Registrar aplicación'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default RegistrarAplicacionSanitaria;
