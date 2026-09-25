import React, { useState } from 'react';
import SelectorAnimalesSanidad from './SelectorAnimalesSanidad';

const ESTADOS = ['Sano', 'En observación', 'Enfermo', 'Recuperación'];

const identificadorAnimal = (animal) => animal?.diio || animal?.identificadorFinca || animal?.nombre || 'Animal';

const FormularioEstadoSanitario = ({
  animales = [],
  animalInicial = null,
  onGuardar,
  onCancelar,
  guardando,
  error
}) => {
  const [seleccionados, setSeleccionados] = useState(animalInicial?._id ? [animalInicial._id] : []);
  const [estadoSanitario, setEstadoSanitario] = useState(animalInicial?.estadoSanitario || 'Sano');
  const [motivo, setMotivo] = useState('');

  const enviar = (evento) => {
    evento.preventDefault();
    onGuardar({ animales: seleccionados, estadoSanitario, motivo: motivo.trim() });
  };

  return (
    <div className="modal-backdrop">
      <section className="modal-panel estado-sanitario-modal">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Sanidad</p>
            <h2>Cambiar estado sanitario</h2>
          </div>
          <button className="boton-link" type="button" onClick={onCancelar}>Cerrar</button>
        </div>

        <form className="form-card" onSubmit={enviar}>
          {error && <div className="alerta-formulario">{error}</div>}

          {animalInicial ? (
            <div className="aplicacion-sanitaria-resumen">
              <span>Animal seleccionado</span>
              <strong>{identificadorAnimal(animalInicial)}{animalInicial.nombre ? ` · ${animalInicial.nombre}` : ''}</strong>
            </div>
          ) : (
            <label>
              Animales
              <SelectorAnimalesSanidad
                animales={animales}
                seleccionados={seleccionados}
                onChange={setSeleccionados}
              />
            </label>
          )}

          <label>
            Nuevo estado sanitario
            <select value={estadoSanitario} onChange={(evento) => setEstadoSanitario(evento.target.value)} required>
              {ESTADOS.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
            </select>
          </label>

          <label>
            Motivo del cambio
            <textarea
              rows="3"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Describa el hallazgo o la razón del cambio"
              required
            />
          </label>

          <div className="form-actions">
            <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
            <button className="boton-primario compacto" type="submit" disabled={guardando || !seleccionados.length || !motivo.trim()}>
              {guardando ? 'Guardando...' : 'Guardar estado'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default FormularioEstadoSanitario;
