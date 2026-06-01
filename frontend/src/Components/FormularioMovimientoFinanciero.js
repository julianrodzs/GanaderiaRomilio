import React, { useState } from 'react';

const estadoInicial = {
  fecha: new Date().toISOString().slice(0, 10),
  tipoMovimiento: 'Compra',
  naturaleza: 'Egreso',
  categoria: '',
  descripcion: '',
  monto: '',
  moneda: 'CRC',
  metodoPago: '',
  proveedor: '',
  empleado: '',
  finca: '',
  comprobante: '',
  observaciones: ''
};

const formatearFechaInput = (fecha) => {
  if (!fecha) return '';
  return new Date(fecha).toISOString().slice(0, 10);
};

const normalizarMovimiento = (movimiento) => ({
  ...estadoInicial,
  ...movimiento,
  fecha: formatearFechaInput(movimiento?.fecha),
  monto: movimiento?.monto ?? ''
});

const FormularioMovimientoFinanciero = ({
  movimientoInicial,
  modo = 'crear',
  onCancelar,
  onGuardar,
  guardando,
  error
}) => {
  const [formulario, setFormulario] = useState(() => normalizarMovimiento(movimientoInicial));

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const enviarFormulario = (evento) => {
    evento.preventDefault();

    onGuardar({
      ...formulario,
      monto: Number(formulario.monto)
    });
  };

  return (
    <section className="form-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Costos y finanzas</p>
          <h2>{modo === 'editar' ? 'Editar movimiento financiero' : 'Nuevo movimiento financiero'}</h2>
        </div>
        <button className="boton-link" type="button" onClick={onCancelar}>Volver</button>
      </div>

      <form className="form-card" onSubmit={enviarFormulario}>
        {error && <div className="alerta-formulario">{error}</div>}

        <div className="form-grid">
          <label>
            Fecha
            <input name="fecha" type="date" value={formulario.fecha} onChange={actualizarCampo} required />
          </label>

          <label>
            Tipo
            <select name="tipoMovimiento" value={formulario.tipoMovimiento} onChange={actualizarCampo} required>
              <option value="Planilla">Planilla</option>
              <option value="Inversion">Inversion</option>
              <option value="Compra">Compra</option>
            </select>
          </label>
        </div>

        <div className="form-grid">
          <label>
            Naturaleza
            <select name="naturaleza" value={formulario.naturaleza} onChange={actualizarCampo} required>
              <option value="Egreso">Egreso</option>
              <option value="Ingreso">Ingreso</option>
            </select>
          </label>

          <label>
            Categoria
            <input name="categoria" value={formulario.categoria} onChange={actualizarCampo} required />
          </label>
        </div>

        <label>
          Descripcion
          <input name="descripcion" value={formulario.descripcion} onChange={actualizarCampo} required />
        </label>

        <div className="form-grid">
          <label>
            Monto
            <input name="monto" type="number" min="0" step="0.01" value={formulario.monto} onChange={actualizarCampo} required />
          </label>

          <label>
            Moneda
            <select name="moneda" value={formulario.moneda} onChange={actualizarCampo}>
              <option value="CRC">CRC</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>

        <div className="form-grid">
          <label>
            Proveedor/Lugar
            <input name="proveedor" value={formulario.proveedor} onChange={actualizarCampo} />
          </label>

          <label>
            Empleado
            <input name="empleado" value={formulario.empleado} onChange={actualizarCampo} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Finca
            <input name="finca" value={formulario.finca} onChange={actualizarCampo} />
          </label>

          <label>
            Metodo de pago
            <input name="metodoPago" value={formulario.metodoPago} onChange={actualizarCampo} />
          </label>
        </div>

        <label>
          Comprobante
          <input name="comprobante" value={formulario.comprobante} onChange={actualizarCampo} />
        </label>

        <label>
          Observaciones
          <textarea name="observaciones" rows="4" value={formulario.observaciones} onChange={actualizarCampo} />
        </label>

        <div className="form-actions">
          <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
          <button className="boton-primario compacto" type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : modo === 'editar' ? 'Actualizar movimiento' : 'Guardar movimiento'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default FormularioMovimientoFinanciero;
