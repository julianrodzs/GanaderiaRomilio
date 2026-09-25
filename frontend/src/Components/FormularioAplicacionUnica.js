import React, { useState } from 'react';
import SelectorAnimalesSanidad from './SelectorAnimalesSanidad';

const fechaHoy = () => new Date().toISOString().slice(0, 10);

const FormularioAplicacionUnica = ({ especie, animales, onGuardar, onCancelar, guardando, error }) => {
  const [formulario, setFormulario] = useState({
    animales: [],
    especie,
    fechaAplicacion: fechaHoy(),
    producto: '',
    tipo: '',
    dosis: '',
    viaAplicacion: '',
    responsable: '',
    motivo: '',
    observaciones: ''
  });

  const actualizar = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  return (
    <section className="form-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Sanidad</p>
          <h2>Registrar aplicación única</h2>
        </div>
        <button className="boton-link" type="button" onClick={onCancelar}>Volver</button>
      </div>

      <form className="form-card" onSubmit={(evento) => { evento.preventDefault(); onGuardar(formulario); }}>
        {error && <div className="alerta-formulario">{error}</div>}
        <label>
          Animales
          <SelectorAnimalesSanidad
            animales={animales}
            seleccionados={formulario.animales}
            onChange={(seleccionados) => setFormulario((actual) => ({ ...actual, animales: seleccionados }))}
          />
        </label>

        <div className="form-grid">
          <label>
            Fecha real de aplicación
            <input name="fechaAplicacion" type="date" value={formulario.fechaAplicacion} onChange={actualizar} required />
          </label>
          <label>
            Producto
            <input name="producto" value={formulario.producto} onChange={actualizar} required />
          </label>
          <label>
            Tipo
            <input name="tipo" value={formulario.tipo} onChange={actualizar} placeholder="Vacunación, vitamina, medicamento" />
          </label>
          <label>
            Dosis
            <input name="dosis" value={formulario.dosis} onChange={actualizar} placeholder="20 ml" />
          </label>
          <label>
            Vía de aplicación
            <input name="viaAplicacion" value={formulario.viaAplicacion} onChange={actualizar} placeholder="Intramuscular" />
          </label>
          <label>
            Responsable
            <input name="responsable" value={formulario.responsable} onChange={actualizar} />
          </label>
          <label className="campo-completo">
            Motivo
            <input name="motivo" value={formulario.motivo} onChange={actualizar} />
          </label>
        </div>

        <label>
          Observaciones
          <textarea name="observaciones" value={formulario.observaciones} onChange={actualizar} rows="4" />
        </label>

        <div className="form-actions">
          <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
          <button className="boton-primario compacto" type="submit" disabled={guardando || formulario.animales.length === 0}>
            {guardando ? 'Registrando...' : 'Registrar aplicación'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default FormularioAplicacionUnica;
