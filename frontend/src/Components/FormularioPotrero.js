import React, { useState } from 'react';

const estadoInicial = {
  codigo: '',
  nombre: '',
  area: '',
  capacidadMaxima: '',
  ubicacion: '',
  ultimaAplicacionHerbicida: '',
  ultimaChapia: '',
  ultimaFertilizacion: '',
  estado: 'Disponible',
  observaciones: ''
};

const formatearFechaInput = (fecha) => {
  if (!fecha) return '';
  return new Date(fecha).toISOString().slice(0, 10);
};

const normalizarPotrero = (potrero) => ({
  ...estadoInicial,
  ...potrero,
  area: potrero?.area ?? '',
  capacidadMaxima: potrero?.capacidadMaxima ?? '',
  ultimaAplicacionHerbicida: formatearFechaInput(potrero?.ultimaAplicacionHerbicida),
  ultimaChapia: formatearFechaInput(potrero?.ultimaChapia),
  ultimaFertilizacion: formatearFechaInput(potrero?.ultimaFertilizacion)
});

const numeroOpcional = (valor) => (valor === '' || valor === null || valor === undefined ? null : Number(valor));
const fechaOpcional = (valor) => (valor ? valor : null);

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
      area: numeroOpcional(formulario.area),
      capacidadMaxima: numeroOpcional(formulario.capacidadMaxima),
      ultimaAplicacionHerbicida: fechaOpcional(formulario.ultimaAplicacionHerbicida),
      ultimaChapia: fechaOpcional(formulario.ultimaChapia),
      ultimaFertilizacion: fechaOpcional(formulario.ultimaFertilizacion)
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
            Area
            <input name="area" type="number" min="0" step="0.01" value={formulario.area} onChange={actualizarCampo} />
          </label>

          <label>
            Capacidad maxima
            <input name="capacidadMaxima" type="number" min="0" value={formulario.capacidadMaxima} onChange={actualizarCampo} />
          </label>
        </div>

        <div className="form-grid">
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

        <div className="form-grid">
          <label>
            Ultima aplicacion de herbicida
            <input
              name="ultimaAplicacionHerbicida"
              type="date"
              value={formulario.ultimaAplicacionHerbicida}
              onChange={actualizarCampo}
            />
          </label>

          <label>
            Ultima chapia
            <input name="ultimaChapia" type="date" value={formulario.ultimaChapia} onChange={actualizarCampo} />
          </label>
        </div>

        <label>
          Ultima fertilizacion
          <input
            name="ultimaFertilizacion"
            type="date"
            value={formulario.ultimaFertilizacion}
            onChange={actualizarCampo}
          />
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
