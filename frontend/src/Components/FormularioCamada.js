import React, { useState } from 'react';

const estadoInicial = {
  madre: '',
  registroReproductivo: '',
  codigoCamada: '',
  fechaNacimiento: '',
  fechaDesteteEstimada: '',
  nacidosTotales: '',
  nacidosVivos: '',
  nacidosMuertos: '',
  momias: '',
  destetados: '',
  muertosPreDestete: '',
  destino: 'No definido',
  estado: 'Activa',
  pesoPromedioNacimiento: '',
  pesoPromedioDestete: '',
  pesoTotalDestete: '',
  observaciones: ''
};

const formatearFechaInput = (fecha) => {
  if (!fecha) return '';
  const fechaObj = new Date(fecha);
  if (Number.isNaN(fechaObj.getTime())) return '';
  return fechaObj.toISOString().slice(0, 10);
};

const obtenerId = (valor) => {
  if (!valor) return '';
  if (typeof valor === 'object') return valor._id || '';
  return valor;
};

const normalizarCamada = (camada) => ({
  ...estadoInicial,
  ...camada,
  madre: obtenerId(camada?.madre),
  registroReproductivo: obtenerId(camada?.registroReproductivo),
  fechaNacimiento: formatearFechaInput(camada?.fechaNacimiento),
  fechaDesteteEstimada: formatearFechaInput(camada?.fechaDesteteEstimada),
  nacidosTotales: camada?.nacidosTotales ?? '',
  nacidosVivos: camada?.nacidosVivos ?? '',
  nacidosMuertos: camada?.nacidosMuertos ?? '',
  momias: camada?.momias ?? '',
  destetados: camada?.destetados ?? '',
  muertosPreDestete: camada?.muertosPreDestete ?? '',
  pesoPromedioNacimiento: camada?.pesoPromedioNacimiento ?? '',
  pesoPromedioDestete: camada?.pesoPromedioDestete ?? '',
  pesoTotalDestete: camada?.pesoTotalDestete ?? ''
});

const numeroOpcional = (valor) => (valor === '' || valor === null || valor === undefined ? null : Number(valor));
const fechaOpcional = (valor) => (valor ? valor : null);

const etiquetaAnimal = (animal) => {
  if (!animal) return '--';
  return `${animal.diio || animal.identificadorFinca || 'Sin DIIO'}${animal.nombre ? ` - ${animal.nombre}` : ''}`;
};

const FormularioCamada = ({
  madres = [],
  camadaInicial,
  registroReproductivo,
  madreFija,
  modo = 'crear',
  onCancelar,
  onGuardar,
  guardando,
  error
}) => {
  const [formulario, setFormulario] = useState(() => ({
    ...normalizarCamada(camadaInicial),
    madre: madreFija?._id || obtenerId(camadaInicial?.madre) || '',
    registroReproductivo: registroReproductivo?._id || obtenerId(camadaInicial?.registroReproductivo) || '',
    fechaNacimiento: formatearFechaInput(camadaInicial?.fechaNacimiento || registroReproductivo?.fechaPartoReal || registroReproductivo?.fechaPartoEstimada),
    destino: camadaInicial?.destino || registroReproductivo?.destinoCrias || 'No definido'
  }));

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const enviarFormulario = (evento) => {
    evento.preventDefault();
    onGuardar({
      ...formulario,
      fechaNacimiento: fechaOpcional(formulario.fechaNacimiento),
      fechaDesteteEstimada: fechaOpcional(formulario.fechaDesteteEstimada),
      nacidosTotales: numeroOpcional(formulario.nacidosTotales),
      nacidosVivos: numeroOpcional(formulario.nacidosVivos),
      nacidosMuertos: numeroOpcional(formulario.nacidosMuertos),
      momias: numeroOpcional(formulario.momias),
      destetados: numeroOpcional(formulario.destetados),
      muertosPreDestete: numeroOpcional(formulario.muertosPreDestete),
      pesoPromedioNacimiento: numeroOpcional(formulario.pesoPromedioNacimiento),
      pesoPromedioDestete: numeroOpcional(formulario.pesoPromedioDestete),
      pesoTotalDestete: numeroOpcional(formulario.pesoTotalDestete),
      registroReproductivo: formulario.registroReproductivo || null,
      codigoCamada: formulario.codigoCamada || undefined
    });
  };

  return (
    <form className="form-card camada-form" onSubmit={enviarFormulario}>
      {error && <div className="alerta-formulario">{error}</div>}

      <div className="form-grid">
        <label>
          Madre
          <select name="madre" value={formulario.madre} onChange={actualizarCampo} required disabled={Boolean(madreFija)}>
            <option value="">Seleccionar chancha</option>
            {madreFija ? (
              <option value={madreFija._id}>{etiquetaAnimal(madreFija)}</option>
            ) : madres.map((madre) => (
              <option key={madre._id} value={madre._id}>{etiquetaAnimal(madre)}</option>
            ))}
          </select>
        </label>

        <label>
          Código camada
          <input name="codigoCamada" value={formulario.codigoCamada} onChange={actualizarCampo} placeholder="Se genera automático si se deja vacío" />
        </label>
      </div>

      <div className="form-grid">
        <label>
          Fecha nacimiento
          <input name="fechaNacimiento" type="date" value={formulario.fechaNacimiento} onChange={actualizarCampo} required />
        </label>

        <label>
          Destino
          <select name="destino" value={formulario.destino} onChange={actualizarCampo}>
            <option value="No definido">No definido</option>
            <option value="Se quedan">Se quedan</option>
            <option value="Se venden">Se venden</option>
            <option value="Engorde">Engorde</option>
            <option value="Mixto">Mixto</option>
          </select>
        </label>
      </div>

      <div className="form-grid">
        <label>Nacidos totales<input name="nacidosTotales" type="number" min="0" value={formulario.nacidosTotales} onChange={actualizarCampo} /></label>
        <label>Nacidos vivos<input name="nacidosVivos" type="number" min="0" value={formulario.nacidosVivos} onChange={actualizarCampo} /></label>
        <label>Nacidos muertos<input name="nacidosMuertos" type="number" min="0" value={formulario.nacidosMuertos} onChange={actualizarCampo} /></label>
        <label>Momias<input name="momias" type="number" min="0" value={formulario.momias} onChange={actualizarCampo} /></label>
      </div>

      <div className="form-grid">
        <label>Destete estimado<input name="fechaDesteteEstimada" type="date" value={formulario.fechaDesteteEstimada} onChange={actualizarCampo} /></label>
        <label>Destetados<input name="destetados" type="number" min="0" value={formulario.destetados} onChange={actualizarCampo} /></label>
        <label>Muertos pre-destete<input name="muertosPreDestete" type="number" min="0" value={formulario.muertosPreDestete} onChange={actualizarCampo} /></label>
      </div>

      <div className="form-grid">
        <label>Peso prom. nacimiento<input name="pesoPromedioNacimiento" type="number" min="0" step="0.01" value={formulario.pesoPromedioNacimiento} onChange={actualizarCampo} /></label>
        <label>Peso prom. destete<input name="pesoPromedioDestete" type="number" min="0" step="0.01" value={formulario.pesoPromedioDestete} onChange={actualizarCampo} /></label>
        <label>Peso total destete<input name="pesoTotalDestete" type="number" min="0" step="0.01" value={formulario.pesoTotalDestete} onChange={actualizarCampo} /></label>
      </div>

      <label>
        Observaciones
        <textarea name="observaciones" rows="3" value={formulario.observaciones} onChange={actualizarCampo} />
      </label>

      <div className="form-actions">
        <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
        <button className="boton-primario compacto" type="submit" disabled={guardando}>
          {guardando ? 'Guardando...' : modo === 'editar' ? 'Actualizar camada' : 'Guardar camada'}
        </button>
      </div>
    </form>
  );
};

export default FormularioCamada;
