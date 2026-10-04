import React, { useEffect, useMemo, useState } from 'react';
import { obtenerFincas, trasladarAnimalesFinca } from '../services/api';

const hoy = () => new Date().toISOString().slice(0, 10);

const FormularioTrasladoFinca = ({ animales, onCerrar, onGuardado }) => {
  const [fincas, setFincas] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [formulario, setFormulario] = useState({ fincaDestino: '', fecha: hoy(), motivo: '', observaciones: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    obtenerFincas()
      .then((items) => setFincas(items.filter((item) => item.estado === 'Activa' && !item.esActiva)))
      .catch((err) => setError(err.message));
  }, []);

  const activos = useMemo(() => animales.filter((animal) => animal.estado === 'Activo'), [animales]);
  const alternar = (id) => setSeleccionados((actuales) => (
    actuales.includes(id) ? actuales.filter((item) => item !== id) : [...actuales, id]
  ));

  const guardar = async (evento) => {
    evento.preventDefault();
    if (!seleccionados.length) return setError('Selecciona al menos un animal.');
    try {
      setGuardando(true);
      setError('');
      await trasladarAnimalesFinca({ ...formulario, animales: seleccionados });
      await onGuardado();
      onCerrar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="modal-panel traslado-finca-modal">
        <div className="panel-title">
          <div><p className="eyebrow">Multi-finca</p><h2>Trasladar animales</h2></div>
          <button className="boton-link" type="button" onClick={onCerrar}>Cerrar</button>
        </div>
        <p className="texto-ayuda">El traslado conserva el animal y su historial. El lote y potrero actuales se cierran para asignarlos nuevamente en la finca destino.</p>
        <form onSubmit={guardar}>
          <div className="form-grid">
            <label>Finca destino<select required value={formulario.fincaDestino} onChange={(e) => setFormulario((actual) => ({ ...actual, fincaDestino: e.target.value }))}><option value="">Seleccionar finca</option>{fincas.map((finca) => <option key={finca._id} value={finca._id}>{finca.codigo} · {finca.nombre}</option>)}</select></label>
            <label>Fecha<input required type="date" value={formulario.fecha} onChange={(e) => setFormulario((actual) => ({ ...actual, fecha: e.target.value }))} /></label>
          </div>
          <label>Motivo<input required value={formulario.motivo} onChange={(e) => setFormulario((actual) => ({ ...actual, motivo: e.target.value }))} placeholder="Ej. Reubicación de lote de engorde" /></label>
          <fieldset className="traslado-animales-selector">
            <legend>Animales activos · {seleccionados.length} seleccionados</legend>
            {activos.map((animal) => (
              <label key={animal._id}>
                <input type="checkbox" checked={seleccionados.includes(animal._id)} onChange={() => alternar(animal._id)} />
                <strong>{animal.diio || animal.identificadorFinca}</strong>
                <span>{animal.nombre || 'Sin nombre'} · {animal.categoria || animal.especie} · {animal.pesoActual != null ? `${animal.pesoActual} kg` : 'Sin peso'}</span>
              </label>
            ))}
          </fieldset>
          <label>Observaciones<textarea rows="3" value={formulario.observaciones} onChange={(e) => setFormulario((actual) => ({ ...actual, observaciones: e.target.value }))} /></label>
          {error && <div className="alerta-formulario">{error}</div>}
          <div className="form-actions"><button type="button" onClick={onCerrar}>Cancelar</button><button className="boton-primario" type="submit" disabled={guardando || !fincas.length}>{guardando ? 'Trasladando...' : 'Confirmar traslado'}</button></div>
        </form>
      </section>
    </div>
  );
};

export default FormularioTrasladoFinca;
