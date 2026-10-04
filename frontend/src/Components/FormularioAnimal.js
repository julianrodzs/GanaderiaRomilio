import React, { useEffect, useMemo, useState } from 'react';
import { obtenerFincas } from '../services/api';
import CamposRazaBovina from './CamposRazaBovina';
import SelectorAnimalBuscable from './SelectorAnimalBuscable';
import { obtenerCategoriaAnimal } from '../utils/categoriasAnimales';
import { etiquetaObjetivoProductivo, normalizarObjetivoProductivo, OBJETIVOS_PRODUCTIVOS } from '../constants/objetivosProductivos';
import { usePlan } from '../context/PlanContext';

const estadoInicial = {
  identificadorFinca: '',
  diio: '',
  especie: 'Bovino',
  categoria: '',
  objetivoProductivo: 'SIN_DEFINIR',
  etapaProductiva: '',
  nombre: '',
  sexo: 'Hembra',
  raza: '',
  razaPrincipal: '',
  razaSecundaria: '',
  grupoRacial: '',
  gradoRacial: '',
  variedadRacial: '',
  descripcionRacial: '',
  composicionRacial: '',
  fraccionRazaPrincipal: '',
  fraccionRazaSecundaria: '',
  madreDiio: '',
  padreDiio: '',
  padre: '',
  madre: '',
  origenGenealogico: 'Desconocido',
  padreExternoNombre: '',
  madreExternaNombre: '',
  registroGenealogico: '',
  observacionesGenealogicas: '',
  fechaNacimiento: '',
  fechaDesteteEstimada: '',
  fechaDestete: '',
  pesoNacimiento: '',
  pesoDestete: '',
  pesoActual: '',
  pesoCompra: '',
  pesoVenta: '',
  precioCompraPorKg: '',
  precioVentaPorKg: '',
  montoCompra: '',
  montoVenta: '',
  fechaCompra: '',
  fechaVenta: '',
  fechaMuerte: '',
  camadaOrigen: '',
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
  objetivoProductivo: normalizarObjetivoProductivo(animal?.objetivoProductivo) || 'SIN_DEFINIR',
  estado: animal?.estado === 'En tratamiento' ? 'Activo' : animal?.estado || 'Activo',
  padre: animal?.padre?._id || animal?.padre || '',
  madre: animal?.madre?._id || animal?.madre || '',
  camadaOrigen: animal?.camadaOrigen?._id || animal?.camadaOrigen || '',
  fechaNacimiento: formatearFechaInput(animal?.fechaNacimiento),
  fechaDesteteEstimada: formatearFechaInput(animal?.fechaDesteteEstimada),
  fechaDestete: formatearFechaInput(animal?.fechaDestete),
  pesoNacimiento: animal?.pesoNacimiento ?? '',
  pesoDestete: animal?.pesoDestete ?? '',
  pesoActual: animal?.pesoActual ?? '',
  pesoCompra: animal?.pesoCompra ?? '',
  pesoVenta: animal?.pesoVenta ?? '',
  precioCompraPorKg: animal?.precioCompraPorKg ?? '',
  precioVentaPorKg: animal?.precioVentaPorKg ?? '',
  montoCompra: animal?.montoCompra ?? '',
  montoVenta: animal?.montoVenta ?? '',
  fechaCompra: formatearFechaInput(animal?.fechaCompra),
  fechaVenta: formatearFechaInput(animal?.fechaVenta),
  fechaMuerte: formatearFechaInput(animal?.fechaMuerte)
});

const numeroOpcional = (valor) => (valor === '' || valor === null || valor === undefined ? null : Number(valor));
const fechaOpcional = (valor) => (valor ? valor : null);

const FormularioAnimal = ({ onCancelar, onGuardar, guardando, error, animalInicial, modo = 'crear', animales = [], camadas = [] }) => {
  const { capacidadDisponible } = usePlan();
  const [formulario, setFormulario] = useState(() => normalizarAnimal(animalInicial));
  const [lineasProductivas, setLineasProductivas] = useState(null);
  const etiquetaId = 'DIIO';
  const categoriaCalculada = obtenerCategoriaAnimal(formulario);
  const cuotaAnimales = capacidadDisponible('animales');
  const creacionBloqueada = modo === 'crear' && !cuotaAnimales.permitido;
  const especiesDisponibles = useMemo(() => {
    if (!lineasProductivas) return ['Bovino', 'Porcino'];
    const especies = lineasProductivas.map((linea) => linea.especie);
    if (animalInicial?.especie && !especies.includes(animalInicial.especie)) especies.push(animalInicial.especie);
    return especies;
  }, [animalInicial?.especie, lineasProductivas]);
  const objetivosDisponibles = useMemo(() => {
    if (!lineasProductivas) return OBJETIVOS_PRODUCTIVOS;
    const objetivos = lineasProductivas.find((linea) => linea.especie === formulario.especie)?.objetivos || [];
    if (formulario.objetivoProductivo && !objetivos.includes(formulario.objetivoProductivo)) {
      return [...objetivos, formulario.objetivoProductivo];
    }
    return objetivos;
  }, [formulario.especie, formulario.objetivoProductivo, lineasProductivas]);

  useEffect(() => {
    obtenerFincas()
      .then((fincas) => {
        const principal = fincas.find((finca) => finca.esPrincipal) || fincas[0];
        setLineasProductivas(principal?.lineasProductivas || []);
      })
      .catch(() => setLineasProductivas(null));
  }, []);

  useEffect(() => {
    setFormulario((actual) => ({ ...actual, categoria: obtenerCategoriaAnimal(actual) }));
  }, [formulario.especie, formulario.sexo, formulario.fechaNacimiento]);

  useEffect(() => {
    if (formulario.madre || !formulario.madreDiio) return;
    const referencia = String(formulario.madreDiio).trim().toLowerCase();
    const coincidencias = animales.filter((animal) => animal.sexo === 'Hembra'
      && (animal.especie || 'Bovino') === formulario.especie
      && [animal.diio, animal.identificadorFinca].some((valor) => String(valor || '').trim().toLowerCase() === referencia));
    if (coincidencias.length !== 1) return;
    setFormulario((actual) => ({
      ...actual,
      madre: coincidencias[0]._id,
      madreExternaNombre: '',
      origenGenealogico: 'Interno'
    }));
  }, [animales, formulario.especie, formulario.madre, formulario.madreDiio]);

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({
      ...actual,
      [name]: value,
      ...(name === 'especie' ? {
        categoria: '',
        etapaProductiva: value === 'Porcino' ? actual.etapaProductiva : '',
        raza: '',
        razaPrincipal: '',
        razaSecundaria: '',
        grupoRacial: '',
        gradoRacial: '',
        variedadRacial: '',
        descripcionRacial: '',
        composicionRacial: '',
        fraccionRazaPrincipal: '',
        fraccionRazaSecundaria: ''
      } : {})
    }));
  };

  const enviarFormulario = (evento) => {
    evento.preventDefault();
    if (creacionBloqueada) return;
    const identificador = formulario.identificadorFinca || formulario.diio;

    onGuardar({
      ...formulario,
      identificadorFinca: identificador,
      objetivoProductivo: formulario.objetivoProductivo || 'SIN_DEFINIR',
      etapaProductiva: formulario.especie === 'Porcino' ? formulario.etapaProductiva || null : null,
      fechaNacimiento: fechaOpcional(formulario.fechaNacimiento),
      fechaDesteteEstimada: fechaOpcional(formulario.fechaDesteteEstimada),
      fechaDestete: fechaOpcional(formulario.fechaDestete),
      pesoNacimiento: numeroOpcional(formulario.pesoNacimiento),
      pesoDestete: numeroOpcional(formulario.pesoDestete),
      pesoActual: numeroOpcional(formulario.pesoActual),
      pesoCompra: numeroOpcional(formulario.pesoCompra),
      pesoVenta: numeroOpcional(formulario.pesoVenta),
      precioCompraPorKg: numeroOpcional(formulario.precioCompraPorKg),
      precioVentaPorKg: numeroOpcional(formulario.precioVentaPorKg),
      montoCompra: numeroOpcional(formulario.montoCompra),
      montoVenta: numeroOpcional(formulario.montoVenta),
      fechaCompra: fechaOpcional(formulario.fechaCompra),
      fechaVenta: fechaOpcional(formulario.fechaVenta),
      fechaMuerte: fechaOpcional(formulario.fechaMuerte),
      padre: formulario.padre || null,
      madre: formulario.madre || null,
      padreExternoNombre: formulario.padreExternoNombre || '',
      madreExternaNombre: formulario.madreExternaNombre || '',
      camadaOrigen: formulario.especie === 'Porcino' ? formulario.camadaOrigen || null : null,
      origenGenealogico: formulario.origenGenealogico,
      registroGenealogico: formulario.registroGenealogico || '',
      observacionesGenealogicas: formulario.observacionesGenealogicas || ''
    });
  };

  const machos = animales.filter((animal) => animal.sexo === 'Macho' && (animal.especie || 'Bovino') === formulario.especie && animal._id !== animalInicial?._id);
  const hembras = animales.filter((animal) => animal.sexo === 'Hembra' && (animal.especie || 'Bovino') === formulario.especie && animal._id !== animalInicial?._id);
  const camadasPorcinas = camadas.filter((camada) => camada.estado !== 'Cancelada');

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
            Especie
            <select name="especie" value={formulario.especie} onChange={actualizarCampo} required>
              {especiesDisponibles.map((especie) => <option key={especie} value={especie}>{especie}</option>)}
            </select>
          </label>

          <label>
            {etiquetaId}
            <input name="diio" value={formulario.diio} onChange={actualizarCampo} required />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Objetivo productivo
            <select name="objetivoProductivo" value={formulario.objetivoProductivo || ''} onChange={actualizarCampo}>
              {objetivosDisponibles.map((objetivo) => <option key={objetivo} value={objetivo}>{etiquetaObjetivoProductivo(objetivo)}</option>)}
            </select>
          </label>

          {formulario.especie === 'Porcino' ? (
            <label>
              Etapa productiva
              <select name="etapaProductiva" value={formulario.etapaProductiva || ''} onChange={actualizarCampo}>
                <option value="">Sin definir</option>
                {['Fase 1', 'Fase 2', 'Fase 3', 'Desarrollo', 'Engorde'].map((etapa) => (
                  <option key={etapa} value={etapa}>{etapa}</option>
                ))}
              </select>
            </label>
          ) : <span />}
        </div>

        <div className="form-grid">
          <label>
            Nombre
            <input name="nombre" value={formulario.nombre} onChange={actualizarCampo} />
          </label>

          <label>
            Categoría
            <input value={categoriaCalculada || 'Ingresa sexo y fecha de nacimiento'} disabled />
            <small>Se calcula automáticamente según especie, sexo y edad.</small>
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

          <span />
        </div>

        <CamposRazaBovina formulario={formulario} setFormulario={setFormulario} especie={formulario.especie} />

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

        {formulario.especie === 'Porcino' && (
          <section className="form-section">
            <div>
              <p className="eyebrow">Camada</p>
              <h3>Origen productivo</h3>
            </div>

            <label>
              Camada origen
              <select name="camadaOrigen" value={formulario.camadaOrigen} onChange={actualizarCampo}>
                <option value="">Sin camada origen</option>
                {camadasPorcinas.map((camada) => (
                  <option key={camada._id} value={camada._id}>
                    {camada.codigoCamada} · {camada.madre?.diio || camada.madre?.nombre || 'Madre sin codigo'}
                  </option>
                ))}
              </select>
            </label>

            <p className="form-help">El destino de la cría se controla mediante el objetivo productivo; la categoría solo representa edad y sexo.</p>
          </section>
        )}

        <section className="form-section">
          <div>
            <p className="eyebrow">Genealogía</p>
            <h3>Padres y registro familiar</h3>
          </div>

          <div className="form-grid">
            <SelectorAnimalBuscable titulo="Padre registrado en finca" name="padre" value={formulario.padre} onChange={actualizarCampo} animales={machos} textoVacio="Sin padre registrado" />

            <SelectorAnimalBuscable titulo="Madre registrada en finca" name="madre" value={formulario.madre} onChange={actualizarCampo} animales={hembras} textoVacio="Sin madre registrada" />
          </div>

          <div className="form-grid">
            <label>
              Padre externo
              <input name="padreExternoNombre" value={formulario.padreExternoNombre} onChange={actualizarCampo} placeholder="Nombre, codigo o referencia" />
            </label>

            <label>
              Madre externa
              <input name="madreExternaNombre" value={formulario.madreExternaNombre} onChange={actualizarCampo} placeholder="Nombre, codigo o referencia" />
            </label>
          </div>

          <div className="form-grid">
            <label>
              Padre {etiquetaId} anterior
              <input name="padreDiio" value={formulario.padreDiio} onChange={actualizarCampo} placeholder="Dato historico si existe" />
            </label>

            <label>
              Madre {etiquetaId} anterior
              <input name="madreDiio" value={formulario.madreDiio} onChange={actualizarCampo} placeholder="Dato historico si existe" />
            </label>
          </div>

          <label>
            Registro genealógico
            <input name="registroGenealogico" value={formulario.registroGenealogico} onChange={actualizarCampo} placeholder="Registro, lote familiar o linea" />
          </label>

          <label>
            Observaciones genealógicas
            <textarea name="observacionesGenealogicas" rows="3" value={formulario.observacionesGenealogicas} onChange={actualizarCampo} />
          </label>
        </section>

        <div className="form-grid">
          <label>
            Peso al nacer
            <input name="pesoNacimiento" type="number" min="0" value={formulario.pesoNacimiento} onChange={actualizarCampo} />
          </label>

          <label>
            Fecha destete estimada
            <input name="fechaDesteteEstimada" type="date" value={formulario.fechaDesteteEstimada} onChange={actualizarCampo} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Fecha destete real
            <input name="fechaDestete" type="date" value={formulario.fechaDestete} onChange={actualizarCampo} />
          </label>

          <label>
            Peso al destete
            <input name="pesoDestete" type="number" min="0" value={formulario.pesoDestete} onChange={actualizarCampo} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Monto compra
            <input name="montoCompra" type="number" min="0" step="0.01" value={formulario.montoCompra} onChange={actualizarCampo} />
          </label>

          <label>
            Monto venta
            <input name="montoVenta" type="number" min="0" step="0.01" value={formulario.montoVenta} onChange={actualizarCampo} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Precio compra por kg
            <input name="precioCompraPorKg" type="number" min="0" step="0.01" value={formulario.precioCompraPorKg} onChange={actualizarCampo} />
          </label>

          <label>
            Peso compra
            <input name="pesoCompra" type="number" min="0" step="0.01" value={formulario.pesoCompra} onChange={actualizarCampo} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Precio venta por kg
            <input name="precioVentaPorKg" type="number" min="0" step="0.01" value={formulario.precioVentaPorKg} onChange={actualizarCampo} />
          </label>

          <label>
            Peso venta
            <input name="pesoVenta" type="number" min="0" step="0.01" value={formulario.pesoVenta} onChange={actualizarCampo} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Fecha compra
            <input name="fechaCompra" type="date" value={formulario.fechaCompra} onChange={actualizarCampo} />
          </label>

          <label>
            Fecha venta
            <input name="fechaVenta" type="date" value={formulario.fechaVenta} onChange={actualizarCampo} />
          </label>
        </div>

        <label>
          Fecha muerte
          <input name="fechaMuerte" type="date" value={formulario.fechaMuerte} onChange={actualizarCampo} />
        </label>

        <div className="form-grid">
          <label>
            Estado
            <select name="estado" value={formulario.estado} onChange={actualizarCampo}>
              <option value="Activo">Activo</option>
              <option value="Vendido">Vendido</option>
              <option value="Muerto">Muerto</option>
            </select>
          </label>

          <label>
            Identificador finca
            <input
              name="identificadorFinca"
              value={formulario.identificadorFinca}
              onChange={actualizarCampo}
              placeholder={`Si se deja vacio usa el ${etiquetaId.toLowerCase()}`}
            />
          </label>
        </div>

        <label>
          Observaciones
          <textarea name="observaciones" rows="4" value={formulario.observaciones} onChange={actualizarCampo} />
        </label>

        <div className="form-actions">
          {creacionBloqueada && <span className="texto-ayuda limite-plan-aviso">{cuotaAnimales.mensaje} Revisa Mi plan para ampliar la capacidad.</span>}
          <button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button>
          <button className="boton-primario compacto" type="submit" disabled={guardando || creacionBloqueada} title={creacionBloqueada ? cuotaAnimales.mensaje : ''}>
            {guardando ? 'Guardando...' : modo === 'editar' ? 'Actualizar animal' : 'Guardar animal'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default FormularioAnimal;
