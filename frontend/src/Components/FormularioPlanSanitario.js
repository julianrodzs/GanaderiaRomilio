import React, { useState } from 'react';

const estadoInicial = {
  grupoGanado: 'Todo el ganado',
  actividad: '',
  producto: '',
  marca: '',
  dosis: '',
  criterioPeso: '',
  fechaAplicacion: '',
  frecuenciaCantidad: 1,
  frecuenciaUnidad: 'meses',
  responsable: '',
  observaciones: ''
};

const grupos = [
  'Terneros',
  'Novillos',
  'Toros',
  'Vacas preñadas',
  'Vacas paridas',
  'Todo el ganado'
];

const FormularioPlanSanitario = ({ onCancelar, onGuardar, guardando, error }) => {
  const [formulario, setFormulario] = useState(estadoInicial);

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
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
          <h2>Nuevo plan sanitario</h2>
        </div>
        <button className="boton-link" type="button" onClick={onCancelar}>Volver</button>
      </div>

      <form className="form-card" onSubmit={enviarFormulario}>
        {error && <div className="alerta-formulario">{error}</div>}

        <div className="form-grid">
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
        </div>

        <div className="form-grid">
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
            Responsable
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
          <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
          <button className="boton-primario compacto" type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar plan'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default FormularioPlanSanitario;
