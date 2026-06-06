import React, { useState } from 'react';

const estadoInicial = {
  animal: '',
  fechaMonta: '',
  fechaPartoEstimada: '',
  fechaPartoReal: '',
  fechaListaMonta: '',
  fechaDestete: '',
  observaciones: ''
};

const formatearFechaInput = (fecha) => {
  if (!fecha) return '';
  return new Date(fecha).toISOString().slice(0, 10);
};

const obtenerAnimalId = (animal) => {
  if (!animal) return '';
  if (typeof animal === 'string') return animal;
  return animal._id || '';
};

const normalizarRegistro = (registro) => ({
  ...estadoInicial,
  ...registro,
  animal: obtenerAnimalId(registro?.animal),
  fechaMonta: formatearFechaInput(registro?.fechaMonta),
  fechaPartoEstimada: formatearFechaInput(registro?.fechaPartoEstimada),
  fechaPartoReal: formatearFechaInput(registro?.fechaPartoReal),
  fechaListaMonta: formatearFechaInput(registro?.fechaListaMonta),
  fechaDestete: formatearFechaInput(registro?.fechaDestete)
});

const normalizarEnvio = (registro) => {
  const camposFecha = ['fechaMonta', 'fechaPartoEstimada', 'fechaPartoReal', 'fechaListaMonta', 'fechaDestete'];

  return Object.fromEntries(
    Object.entries(registro)
      .map(([campo, valor]) => [campo, camposFecha.includes(campo) && valor === '' ? null : valor])
      .filter(([campo, valor]) => campo === 'observaciones' || valor !== '')
  );
};

const FormularioReproduccion = ({
  animales,
  registroInicial,
  modo = 'crear',
  onCancelar,
  onGuardar,
  guardando,
  error
}) => {
  const hembras = animales.filter((animal) => animal.sexo === 'Hembra');
  const [formulario, setFormulario] = useState(() => {
    const inicial = normalizarRegistro(registroInicial);
    return {
      ...inicial,
      animal: inicial.animal || hembras[0]?._id || ''
    };
  });

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const enviarFormulario = (evento) => {
    evento.preventDefault();
    onGuardar(normalizarEnvio(formulario));
  };

  return (
    <section className="form-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Reproduccion</p>
          <h2>{modo === 'editar' ? 'Editar registro reproductivo' : 'Nuevo registro reproductivo'}</h2>
        </div>
        <button className="boton-link" type="button" onClick={onCancelar}>Volver</button>
      </div>

      <form className="form-card" onSubmit={enviarFormulario}>
        {error && <div className="alerta-formulario">{error}</div>}

        <label>
          Hembra
          <select name="animal" value={formulario.animal} onChange={actualizarCampo} required>
            {hembras.map((animal) => (
              <option key={animal._id} value={animal._id}>
                {animal.diio || animal.identificadorFinca} - {animal.nombre || 'Sin nombre'}
              </option>
            ))}
          </select>
        </label>

        <div className="form-grid">
          <label>
            Fecha monta
            <input name="fechaMonta" type="date" value={formulario.fechaMonta} onChange={actualizarCampo} />
          </label>

          <label>
            Parto estimado
            <input name="fechaPartoEstimada" type="date" value={formulario.fechaPartoEstimada} onChange={actualizarCampo} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Parto real
            <input name="fechaPartoReal" type="date" value={formulario.fechaPartoReal} onChange={actualizarCampo} />
          </label>

          <label>
            Lista para monta
            <input name="fechaListaMonta" type="date" value={formulario.fechaListaMonta} onChange={actualizarCampo} />
          </label>
        </div>

        <label>
          Fecha destete
          <input name="fechaDestete" type="date" value={formulario.fechaDestete} onChange={actualizarCampo} />
        </label>

        <label>
          Observaciones
          <textarea name="observaciones" rows="4" value={formulario.observaciones} onChange={actualizarCampo} />
        </label>

        <div className="form-actions">
          <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
          <button className="boton-primario compacto" type="submit" disabled={guardando || hembras.length === 0}>
            {guardando ? 'Guardando...' : modo === 'editar' ? 'Actualizar registro' : 'Guardar registro'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default FormularioReproduccion;
