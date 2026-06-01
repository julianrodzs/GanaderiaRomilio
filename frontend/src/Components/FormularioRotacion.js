import React, { useState } from 'react';

const estadoInicial = {
  potrero: '',
  lote: '',
  fechaEntrada: new Date().toISOString().slice(0, 10),
  fechaSalida: '',
  numeroAnimales: '',
  estado: 'Activa',
  observaciones: ''
};

const formatearFechaInput = (fecha) => {
  if (!fecha) return '';
  return new Date(fecha).toISOString().slice(0, 10);
};

const obtenerPotreroId = (potrero) => {
  if (!potrero) return '';
  if (typeof potrero === 'string') return potrero;
  return potrero._id || '';
};

const normalizarRotacion = (rotacion) => ({
  ...estadoInicial,
  ...rotacion,
  potrero: obtenerPotreroId(rotacion?.potrero),
  fechaEntrada: formatearFechaInput(rotacion?.fechaEntrada) || estadoInicial.fechaEntrada,
  fechaSalida: formatearFechaInput(rotacion?.fechaSalida),
  numeroAnimales: rotacion?.numeroAnimales ?? ''
});

const FormularioRotacion = ({
  rotacionInicial,
  potreros,
  modo = 'crear',
  onCancelar,
  onGuardar,
  guardando,
  error
}) => {
  const [formulario, setFormulario] = useState(() => {
    const inicial = normalizarRotacion(rotacionInicial);
    return {
      ...inicial,
      potrero: inicial.potrero || potreros[0]?._id || ''
    };
  });

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const enviarFormulario = (evento) => {
    evento.preventDefault();

    onGuardar({
      ...formulario,
      fechaSalida: formulario.fechaSalida || undefined,
      numeroAnimales: formulario.numeroAnimales ? Number(formulario.numeroAnimales) : undefined
    });
  };

  return (
    <section className="form-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Potreros</p>
          <h2>{modo === 'editar' ? 'Editar rotacion' : 'Nueva rotacion'}</h2>
        </div>
        <button className="boton-link" type="button" onClick={onCancelar}>Volver</button>
      </div>

      <form className="form-card" onSubmit={enviarFormulario}>
        {error && <div className="alerta-formulario">{error}</div>}

        <div className="form-grid">
          <label>
            Potrero
            <select name="potrero" value={formulario.potrero} onChange={actualizarCampo} required>
              {potreros.map((potrero) => (
                <option key={potrero._id} value={potrero._id}>
                  {potrero.codigo} - {potrero.nombre}
                </option>
              ))}
            </select>
          </label>

          <label>
            Lote
            <input name="lote" value={formulario.lote} onChange={actualizarCampo} placeholder="Lote 01" />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Fecha entrada
            <input name="fechaEntrada" type="date" value={formulario.fechaEntrada} onChange={actualizarCampo} required />
          </label>

          <label>
            Fecha salida
            <input name="fechaSalida" type="date" value={formulario.fechaSalida} onChange={actualizarCampo} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Numero animales
            <input name="numeroAnimales" type="number" min="0" value={formulario.numeroAnimales} onChange={actualizarCampo} />
          </label>

          <label>
            Estado
            <select name="estado" value={formulario.estado} onChange={actualizarCampo}>
              <option value="Activa">Activa</option>
              <option value="Finalizada">Finalizada</option>
              <option value="Planificada">Planificada</option>
            </select>
          </label>
        </div>

        <label>
          Observaciones
          <textarea name="observaciones" rows="4" value={formulario.observaciones} onChange={actualizarCampo} />
        </label>

        <div className="form-actions">
          <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
          <button className="boton-primario compacto" type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : modo === 'editar' ? 'Actualizar rotacion' : 'Guardar rotacion'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default FormularioRotacion;
