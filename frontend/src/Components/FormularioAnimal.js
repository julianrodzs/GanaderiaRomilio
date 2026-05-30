import React, { useState } from 'react';

const estadoInicial = {
  identificadorFinca: '',
  diio: '',
  nombre: '',
  sexo: 'Hembra',
  raza: '',
  fechaNacimiento: '',
  pesoActual: '',
  estado: 'Activo',
  observaciones: ''
};

const formatearFechaInput = (fecha) => {
  if (!fecha) return '';
  return new Date(fecha).toISOString().slice(0, 10);
};

const normalizarAnimal = (animal) => ({
  ...estadoInicial,
  ...animal,
  fechaNacimiento: formatearFechaInput(animal?.fechaNacimiento),
  pesoActual: animal?.pesoActual ?? ''
});

const FormularioAnimal = ({ onCancelar, onGuardar, guardando, error, animalInicial, modo = 'crear' }) => {
  const [formulario, setFormulario] = useState(() => normalizarAnimal(animalInicial));

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const enviarFormulario = (evento) => {
    evento.preventDefault();
    const identificador = formulario.identificadorFinca || formulario.diio;

    onGuardar({
      ...formulario,
      identificadorFinca: identificador,
      pesoActual: formulario.pesoActual ? Number(formulario.pesoActual) : undefined
    });
  };

  return (
    <section className="form-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Inventario</p>
          <h2>{modo === 'editar' ? 'Editar animal' : 'Nuevo animal'}</h2>
        </div>
        <button className="boton-link" type="button" onClick={onCancelar}>Volver</button>
      </div>

      <form className="form-card" onSubmit={enviarFormulario}>
        {error && <div className="alerta-formulario">{error}</div>}

        <div className="form-grid">
          <label>
            DIIO
            <input name="diio" value={formulario.diio} onChange={actualizarCampo} required />
          </label>

          <label>
            Nombre
            <input name="nombre" value={formulario.nombre} onChange={actualizarCampo} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Sexo
            <select name="sexo" value={formulario.sexo} onChange={actualizarCampo} required>
              <option value="Hembra">Hembra</option>
              <option value="Macho">Macho</option>
            </select>
          </label>

          <label>
            Raza
            <input name="raza" value={formulario.raza} onChange={actualizarCampo} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Fecha nacimiento
            <input name="fechaNacimiento" type="date" value={formulario.fechaNacimiento} onChange={actualizarCampo} />
          </label>

          <label>
            Peso actual
            <input name="pesoActual" type="number" min="0" value={formulario.pesoActual} onChange={actualizarCampo} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Estado
            <select name="estado" value={formulario.estado} onChange={actualizarCampo}>
              <option value="Activo">Activo</option>
              <option value="Vendido">Vendido</option>
              <option value="Muerto">Muerto</option>
              <option value="En tratamiento">En tratamiento</option>
            </select>
          </label>

          <label>
            Identificador finca
            <input
              name="identificadorFinca"
              value={formulario.identificadorFinca}
              onChange={actualizarCampo}
              placeholder="Si se deja vacio usa el DIIO"
            />
          </label>
        </div>

        <label>
          Observaciones
          <textarea name="observaciones" rows="4" value={formulario.observaciones} onChange={actualizarCampo} />
        </label>

        <div className="form-actions">
          <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
          <button className="boton-primario compacto" type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : modo === 'editar' ? 'Actualizar animal' : 'Guardar animal'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default FormularioAnimal;
