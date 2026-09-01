import React, { useState } from 'react';

const estadoInicial = {
  animal: '',
  especie: 'Bovino',
  diasDestetePorcino: 28,
  diasCeloPostDestetePorcino: 5,
  tipoRegistro: 'Inseminación/Monta',
  destinoCrias: 'No definido',
  cantidadCriasEstimada: '',
  cantidadCrias: '',
  fechaInseminacion: '',
  fechaMonta: '',
  fechaPartoEstimada: '',
  fechaPartoReal: '',
  fechaProximoCelo: '',
  fechaDestete: '',
  observaciones: ''
};

const formatearFechaInput = (fecha) => {
  if (!fecha) return '';
  const fechaObj = new Date(fecha);
  if (Number.isNaN(fechaObj.getTime())) return '';
  return fechaObj.toISOString().slice(0, 10);
};

const sumarDiasInput = (fecha, dias) => {
  if (!fecha) return '';
  const fechaObj = new Date(`${fecha}T00:00:00.000Z`);
  fechaObj.setUTCDate(fechaObj.getUTCDate() + dias);
  return fechaObj.toISOString().slice(0, 10);
};

const restarDiasInput = (fecha, dias) => sumarDiasInput(fecha, -dias);

const calcularProximoCeloInput = (fechaPartoReal) => {
  if (!fechaPartoReal) return '';
  const hoy = new Date();
  const hoyUtc = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  const proximoCelo = new Date(`${fechaPartoReal}T00:00:00.000Z`);
  proximoCelo.setUTCDate(proximoCelo.getUTCDate() + 60);

  while (proximoCelo < hoyUtc) {
    proximoCelo.setUTCDate(proximoCelo.getUTCDate() + 21);
  }

  return proximoCelo.toISOString().slice(0, 10);
};

const calcularProximoCeloPorcinoInput = (fechaDestete, diasCeloPostDestete) => {
  if (!fechaDestete) return '';
  return sumarDiasInput(fechaDestete, Number(diasCeloPostDestete) || 5);
};

const sumarMesesInput = (fecha, meses) => {
  if (!fecha) return '';
  const fechaObj = new Date(`${fecha}T00:00:00.000Z`);
  fechaObj.setUTCMonth(fechaObj.getUTCMonth() + meses);
  return fechaObj.toISOString().slice(0, 10);
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
  fechaInseminacion: formatearFechaInput(registro?.fechaInseminacion || registro?.fechaMonta),
  fechaMonta: formatearFechaInput(registro?.fechaMonta),
  fechaPartoEstimada: formatearFechaInput(registro?.fechaPartoEstimada),
  fechaPartoReal: formatearFechaInput(registro?.fechaPartoReal),
  fechaProximoCelo: formatearFechaInput(registro?.fechaProximoCelo || registro?.fechaListaMonta),
  fechaDestete: formatearFechaInput(registro?.fechaDestete)
});

const normalizarEnvio = (registro) => {
  const camposFecha = [
    'fechaInseminacion',
    'fechaMonta',
    'fechaPartoEstimada',
    'fechaPartoReal',
    'fechaProximoCelo',
    'fechaDestete'
  ];
  const datos = Object.fromEntries(
    Object.entries(registro)
      .map(([campo, valor]) => [campo, camposFecha.includes(campo) && valor === '' ? null : valor])
      .filter(([campo, valor]) => campo === 'observaciones' || valor !== '')
  );

  if (registro.especie === 'Porcino') {
    datos.fechaInseminacion = registro.fechaInseminacion || registro.fechaMonta || null;
    datos.fechaMonta = datos.fechaInseminacion;
    datos.cantidadCriasEstimada = registro.cantidadCriasEstimada === '' ? null : Number(registro.cantidadCriasEstimada);
    datos.cantidadCrias = registro.cantidadCrias === '' ? null : Number(registro.cantidadCrias);
  }

  return datos;
};

const FormularioReproduccion = ({
  animales,
  registroInicial,
  modo = 'crear',
  onCancelar,
  onGuardar,
  guardando,
  error,
  especie = 'Bovino'
}) => {
  const hembras = animales.filter((animal) => animal.sexo === 'Hembra');
  const [formulario, setFormulario] = useState(() => {
    const inicial = normalizarRegistro(registroInicial);
    return {
      ...inicial,
      especie: registroInicial?.especie || especie,
      animal: inicial.animal || hembras[0]?._id || ''
    };
  });
  const esPorcino = formulario.especie === 'Porcino';
  const fechaBasePorcina = formulario.fechaInseminacion || formulario.fechaMonta;
  const fechasPorcinas = fechaBasePorcina ? {
    revisionCelo: sumarDiasInput(fechaBasePorcina, 21),
    parto: sumarDiasInput(fechaBasePorcina, 118),
    inicioVentana: restarDiasInput(sumarDiasInput(fechaBasePorcina, 118), 3),
    finVentana: sumarDiasInput(sumarDiasInput(fechaBasePorcina, 118), 3),
    desparasitar: restarDiasInput(sumarDiasInput(fechaBasePorcina, 118), 30),
    lactancia: restarDiasInput(sumarDiasInput(fechaBasePorcina, 118), 15),
    destete: sumarDiasInput(sumarDiasInput(fechaBasePorcina, 118), 31),
    nuevaInseminacion: sumarDiasInput(sumarDiasInput(sumarDiasInput(fechaBasePorcina, 118), 31), 5),
    revisionPosterior: sumarDiasInput(sumarDiasInput(sumarDiasInput(sumarDiasInput(fechaBasePorcina, 118), 31), 5), 21)
  } : null;

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => {
      const actualizado = { ...actual, [name]: value };

      if (name === 'fechaInseminacion' && actualizado.especie === 'Porcino') {
        actualizado.fechaMonta = value;
        actualizado.fechaPartoEstimada = value ? sumarDiasInput(value, 118) : '';
      }

      if (name === 'fechaMonta' && value && !actual.fechaPartoEstimada) {
        actualizado.fechaPartoEstimada = sumarDiasInput(value, actualizado.especie === 'Porcino' ? 118 : 283);
      }

      if (name === 'fechaPartoReal') {
        if (actualizado.especie === 'Porcino') {
          actualizado.fechaDestete = value ? sumarDiasInput(value, actualizado.diasDestetePorcino) : '';
          actualizado.fechaProximoCelo = value ? calcularProximoCeloPorcinoInput(actualizado.fechaDestete, actualizado.diasCeloPostDestetePorcino) : '';
        } else {
          actualizado.fechaProximoCelo = value ? calcularProximoCeloInput(value) : '';
          actualizado.fechaDestete = value ? sumarMesesInput(value, 7) : '';
        }
      }

      if (['diasDestetePorcino', 'diasCeloPostDestetePorcino'].includes(name) && actualizado.especie === 'Porcino' && actualizado.fechaPartoReal) {
        actualizado.fechaDestete = sumarDiasInput(actualizado.fechaPartoReal, actualizado.diasDestetePorcino);
        actualizado.fechaProximoCelo = calcularProximoCeloPorcinoInput(actualizado.fechaDestete, actualizado.diasCeloPostDestetePorcino);
      }

      return actualizado;
    });
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
          {esPorcino ? 'Chancha' : 'Hembra'}
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
            Especie
            <select name="especie" value={formulario.especie} onChange={actualizarCampo} required>
              <option value="Bovino">Bovino</option>
              <option value="Porcino">Porcino</option>
            </select>
          </label>

          {esPorcino && (
            <label>
              Tipo registro
              <select name="tipoRegistro" value={formulario.tipoRegistro} onChange={actualizarCampo}>
                <option value="Inseminación/Monta">Inseminación/Monta</option>
                <option value="Inseminación">Inseminación</option>
                <option value="Monta">Monta</option>
              </select>
            </label>
          )}
        </div>

        {esPorcino ? (
          <>
            <div className="form-grid">
              <label>
                Fecha inseminación/monta
                <input name="fechaInseminacion" type="date" value={formulario.fechaInseminacion} onChange={actualizarCampo} required />
              </label>

              <label>
                Destino de crías
                <select name="destinoCrias" value={formulario.destinoCrias} onChange={actualizarCampo}>
                  <option value="No definido">No definido</option>
                  <option value="Se quedan">Se quedan</option>
                  <option value="Se venden">Se venden</option>
                  <option value="Engorde">Engorde</option>
                </select>
              </label>
            </div>

            <div className="form-grid">
              <label>
                Cantidad estimada de crías
                <input name="cantidadCriasEstimada" type="number" min="0" value={formulario.cantidadCriasEstimada} onChange={actualizarCampo} />
              </label>

              <label>
                Cantidad real de crías
                <input name="cantidadCrias" type="number" min="0" value={formulario.cantidadCrias} onChange={actualizarCampo} />
              </label>
            </div>

            {fechasPorcinas && (
              <div className="resumen-fechas-porcinas">
                <article><span>Revisar celo</span><strong>{fechasPorcinas.revisionCelo}</strong></article>
                <article><span>Parto estimado</span><strong>{fechasPorcinas.parto}</strong></article>
                <article><span>Ventana probable</span><strong>{fechasPorcinas.inicioVentana} a {fechasPorcinas.finVentana}</strong></article>
                <article><span>Desparasitar</span><strong>{fechasPorcinas.desparasitar}</strong></article>
                <article><span>Alimento lactancia</span><strong>{fechasPorcinas.lactancia}</strong></article>
                <article><span>Destete</span><strong>{fechasPorcinas.destete}</strong></article>
                <article><span>Nueva inseminación</span><strong>{fechasPorcinas.nuevaInseminacion}</strong></article>
                <article><span>Revisión posterior</span><strong>{fechasPorcinas.revisionPosterior}</strong></article>
              </div>
            )}
          </>
        ) : (
          <>
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
                Próximo celo estimado
                <input name="fechaProximoCelo" type="date" value={formulario.fechaProximoCelo} readOnly />
              </label>
            </div>

            <label>
              Fecha destete
              <input name="fechaDestete" type="date" value={formulario.fechaDestete} onChange={actualizarCampo} />
            </label>
          </>
        )}

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
