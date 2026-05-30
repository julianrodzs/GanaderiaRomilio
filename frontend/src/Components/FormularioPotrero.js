import React, { useState } from 'react';

const estadoInicial = {
  codigo: '',
  nombre: '',
  capacidadMaxima: '',
  ubicacion: '',
  estado: 'Disponible',
  observaciones: ''
};

const normalizarPotrero = (potrero) => ({
  ...estadoInicial,
  ...potrero,
  capacidadMaxima: potrero?.capacidadMaxima ?? ''
});

const FormularioPotrero = ({ onCancelar, onGuardar, guardando, error, potreroInicial, modo = 'crear' }) => {
  const [formulario, setFormulario] = useState(() => normalizarPotrero(potreroInicial));

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const enviarFormulario = (evento) => {
    evento.preventDefault();
    onGuardar({
      ...formulario,
      capacidadMaxima: formulario.capacidadMaxima ? Number(formulario.capacidadMaxima) : undefined
    });
  };

  return (
    <section className="form-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Potreros</p>
          <h2>{modo === 'editar' ? 'Editar potrero' : 'Nuevo potrero'}</h2>
        </div>
        <button className="boton-link" type="button" onClick={onCancelar}>Volver</button>
      </div>

      <form className="form-card" onSubmit={enviarFormulario}>
        {error && <div className="alerta-formulario">{error}</div>}

        <div className="form-grid">
          <label>
            Codigo
            <input name="codigo" value={formulario.codigo} onChange={actualizarCampo} placeholder="POT-01" required />
          </label>

          <label>
            Nombre
            <input name="nombre" value={formulario.nombre} onChange={actualizarCampo} required />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Capacidad maxima
            <input name="capacidadMaxima" type="number" min="0" value={formulario.capacidadMaxima} onChange={actualizarCampo} />
          </label>

          <label>
            Estado
            <select name="estado" value={formulario.estado} onChange={actualizarCampo}>
              <option value="Disponible">Disponible</option>
              <option value="Ocupado">Ocupado</option>
              <option value="Descanso">Descanso</option>
              <option value="Mantenimiento">Mantenimiento</option>
            </select>
          </label>
        </div>

        <label>
          Ubicacion
          <input name="ubicacion" value={formulario.ubicacion} onChange={actualizarCampo} />
        </label>

        <label>
          Observaciones
          <textarea name="observaciones" rows="4" value={formulario.observaciones} onChange={actualizarCampo} />
        </label>

        <div className="form-actions">
          <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
          <button className="boton-primario compacto" type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : modo === 'editar' ? 'Actualizar potrero' : 'Guardar potrero'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default FormularioPotrero;
