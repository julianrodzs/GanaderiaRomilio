import React, { useEffect, useMemo, useState } from 'react';
import { obtenerCatalogoPastos, obtenerCoberturaPotrero, obtenerUsuariosAsignables } from '../services/api';
import { etiquetaUsuarioConRol } from '../utils/usuarios';
import InfoLunarFecha from './InfoLunarFecha';

const hoyInput = () => {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
};

const estadoInicial = {
  codigo: '', nombre: '', area: '', capacidadMaxima: '', ubicacion: '',
  ultimaAplicacionHerbicida: '', ultimaChapia: '', ultimaFertilizacion: '',
  estado: 'Disponible', observaciones: '', tipoArea: 'PASTOREO', responsableCorte: '',
  fechaPrimerCorte: '', fechaSiembra: ''
};

const coberturaInicial = {
  pastoPrincipal: '', pastosSecundarios: [], leguminosasAsociadas: [],
  fechaEstablecimientoPasto: '', diasDescansoObjetivo: '', observacionCobertura: '',
  descripcionCobertura: '', intervaloCorteObjetivoDias: '', fechaCambio: hoyInput()
};

const formatearFechaInput = (fecha) => (fecha ? new Date(fecha).toISOString().slice(0, 10) : '');
const obtenerId = (valor) => String(valor?._id || valor || '');

const normalizarPotrero = (potrero) => ({
  ...estadoInicial, ...potrero,
  area: potrero?.area ?? '', capacidadMaxima: potrero?.capacidadMaxima ?? '',
  ultimaAplicacionHerbicida: formatearFechaInput(potrero?.ultimaAplicacionHerbicida),
  ultimaChapia: formatearFechaInput(potrero?.ultimaChapia),
  ultimaFertilizacion: formatearFechaInput(potrero?.ultimaFertilizacion)
  ,responsableCorte: obtenerId(potrero?.responsableCorte)
});

const normalizarCobertura = (origen = {}) => ({
  ...coberturaInicial,
  pastoPrincipal: obtenerId(origen.pastoPrincipal),
  pastosSecundarios: (origen.pastosSecundarios || []).map(obtenerId),
  leguminosasAsociadas: (origen.leguminosasAsociadas || []).map(obtenerId),
  fechaEstablecimientoPasto: formatearFechaInput(origen.fechaEstablecimientoPasto),
  diasDescansoObjetivo: origen.diasDescansoObjetivo ?? '',
  intervaloCorteObjetivoDias: origen.intervaloCorteObjetivoDias ?? '',
  observacionCobertura: origen.observacionCobertura || '',
  descripcionCobertura: origen.descripcionCobertura || '',
  fechaCambio: hoyInput()
});

const firmaCobertura = (datos) => JSON.stringify({
  pastoPrincipal: datos.pastoPrincipal || '',
  pastosSecundarios: [...(datos.pastosSecundarios || [])].sort(),
  leguminosasAsociadas: [...(datos.leguminosasAsociadas || [])].sort(),
  fechaEstablecimientoPasto: datos.fechaEstablecimientoPasto || '',
  diasDescansoObjetivo: datos.diasDescansoObjetivo === '' ? '' : Number(datos.diasDescansoObjetivo),
  intervaloCorteObjetivoDias: datos.intervaloCorteObjetivoDias === '' ? '' : Number(datos.intervaloCorteObjetivoDias),
  observacionCobertura: datos.observacionCobertura?.trim() || '',
  descripcionCobertura: datos.descripcionCobertura?.trim() || ''
});

const numeroOpcional = (valor) => (valor === '' || valor === null || valor === undefined ? null : Number(valor));
const fechaOpcional = (valor) => (valor || null);

const SelectorCatalogo = ({ etiqueta, opciones, valor, onChange, multiple = false }) => {
  const [busqueda, setBusqueda] = useState('');
  const seleccionados = multiple ? valor : valor ? [valor] : [];
  const porId = useMemo(() => new Map(opciones.map((item) => [String(item._id), item])), [opciones]);
  const normalizar = (texto) => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtradas = opciones.filter((item) => normalizar(`${item.etiqueta} ${item.nombreCientifico || ''}`).includes(normalizar(busqueda)));
  const agregar = (id) => {
    if (!id) return;
    onChange(multiple ? [...new Set([...valor, id])] : id);
    setBusqueda('');
  };
  const quitar = (id) => onChange(multiple ? valor.filter((item) => item !== id) : '');

  return (
    <div className="cobertura-selector">
      <label>{etiqueta}<input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={`Buscar ${etiqueta.toLowerCase()}`} /></label>
      <select value="" onChange={(e) => agregar(e.target.value)}>
        <option value="">Seleccionar</option>
        {filtradas.filter((item) => !seleccionados.includes(String(item._id))).map((item) => <option key={item._id} value={item._id}>{item.etiqueta}</option>)}
      </select>
      <div className="cobertura-seleccionados">
        {seleccionados.map((id) => porId.get(id) && <span key={id}>{porId.get(id).nombre}<button type="button" aria-label={`Quitar ${porId.get(id).nombre}`} onClick={() => quitar(id)}>×</button></span>)}
      </div>
    </div>
  );
};

const FormularioPotrero = ({ onCancelar, onGuardar, guardando, error, potreroInicial, modo = 'crear' }) => {
  const [formulario, setFormulario] = useState(() => normalizarPotrero(potreroInicial));
  const [cobertura, setCobertura] = useState(() => normalizarCobertura(potreroInicial));
  const [firmaInicial, setFirmaInicial] = useState(() => firmaCobertura(normalizarCobertura(potreroInicial)));
  const [tieneCoberturaVigente, setTieneCoberturaVigente] = useState(false);
  const [catalogo, setCatalogo] = useState([]);
  const [errorCatalogo, setErrorCatalogo] = useState('');
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => { obtenerCatalogoPastos().then(setCatalogo).catch((err) => setErrorCatalogo(err.message)); }, []);
  useEffect(() => { obtenerUsuariosAsignables('Tareas').then(setUsuarios).catch((err) => setErrorCatalogo(err.message)); }, []);
  useEffect(() => {
    if (!potreroInicial?._id) return;
    obtenerCoberturaPotrero(potreroInicial._id).then((respuesta) => {
      setTieneCoberturaVigente(Boolean(respuesta.actual));
      const normalizada = normalizarCobertura(respuesta.actual || potreroInicial);
      setCobertura(normalizada);
      setFirmaInicial(firmaCobertura(normalizada));
    }).catch((err) => setErrorCatalogo(err.message));
  }, [potreroInicial?._id]);

  const esBanco = formulario.tipoArea === 'BANCO_FORRAJERO';
  const pastos = catalogo.filter((item) => item.usosPermitidos?.includes(esBanco ? 'CORTE' : 'PASTOREO'));
  const leguminosas = catalogo.filter((item) => item.categoria === 'Leguminosa/Forraje');
  const actualizarCampo = (evento) => setFormulario((actual) => ({ ...actual, [evento.target.name]: evento.target.value }));
  const actualizarCobertura = (campo, valor) => setCobertura((actual) => ({ ...actual, [campo]: valor }));

  const enviarFormulario = (evento) => {
    evento.preventDefault();
    if (esBanco && !cobertura.pastoPrincipal) {
      setErrorCatalogo('Debe seleccionar el forraje principal del banco.');
      return;
    }
    onGuardar({
      potrero: {
        codigo: formulario.codigo, nombre: formulario.nombre,
        tipoArea: formulario.tipoArea,
        area: numeroOpcional(formulario.area), capacidadMaxima: numeroOpcional(formulario.capacidadMaxima),
        ubicacion: formulario.ubicacion,
        ultimaAplicacionHerbicida: fechaOpcional(formulario.ultimaAplicacionHerbicida),
        ultimaChapia: fechaOpcional(formulario.ultimaChapia), ultimaFertilizacion: fechaOpcional(formulario.ultimaFertilizacion),
        estado: formulario.estado, observaciones: formulario.observaciones,
        responsableCorte: esBanco ? formulario.responsableCorte : null,
        fechaPrimerCorte: esBanco ? fechaOpcional(formulario.fechaPrimerCorte) : null,
        fechaSiembra: esBanco ? fechaOpcional(formulario.fechaSiembra) : null
      },
      cobertura: {
        ...cobertura,
        fechaCambio: modo === 'crear' ? (cobertura.fechaEstablecimientoPasto || cobertura.fechaCambio) : cobertura.fechaCambio,
        diasDescansoObjetivo: numeroOpcional(cobertura.diasDescansoObjetivo),
        intervaloCorteObjetivoDias: numeroOpcional(cobertura.intervaloCorteObjetivoDias),
        fechaEstablecimientoPasto: fechaOpcional(cobertura.fechaEstablecimientoPasto)
      },
      coberturaCambiada: firmaCobertura(cobertura) !== firmaInicial,
      tieneCoberturaVigente
    });
  };

  return (
    <section className="form-page">
      <div className="panel-title"><div><p className="eyebrow">Potreros</p><h2>{modo === 'editar' ? (esBanco ? 'Editar banco forrajero' : 'Editar potrero') : (esBanco ? 'Nuevo banco forrajero' : 'Nuevo potrero')}</h2></div><button className="boton-link" type="button" onClick={onCancelar}>Volver</button></div>
      <form className="form-card" onSubmit={enviarFormulario}>
        {(error || errorCatalogo) && <div className="alerta-formulario">{error || errorCatalogo}</div>}
        <div className="form-grid"><label>Código<input name="codigo" value={formulario.codigo} onChange={actualizarCampo} placeholder="POT-01" required /></label><label>Nombre<input name="nombre" value={formulario.nombre} onChange={actualizarCampo} required /></label></div>
        <label>Uso del área<select name="tipoArea" value={formulario.tipoArea} onChange={(evento) => { actualizarCampo(evento); setCobertura((actual) => ({ ...actual, pastoPrincipal: '', pastosSecundarios: [] })); }} disabled={modo === 'editar'}><option value="PASTOREO">Pastoreo</option><option value="BANCO_FORRAJERO">Banco forrajero</option></select></label>
        <div className="form-grid"><label>Área<input name="area" type="number" min="0" step="0.01" value={formulario.area} onChange={actualizarCampo} required={esBanco} /></label>{!esBanco && <label>Capacidad máxima<input name="capacidadMaxima" type="number" min="0" value={formulario.capacidadMaxima} onChange={actualizarCampo} /></label>}</div>
        <div className="form-grid"><label>Estado<select name="estado" value={formulario.estado} onChange={actualizarCampo}><option>Disponible</option><option>Ocupado</option><option>Descanso</option><option>Mantenimiento</option></select></label><label>Ubicación<input name="ubicacion" value={formulario.ubicacion} onChange={actualizarCampo} /></label></div>

        <section className="cobertura-form-section">
          <div><p className="eyebrow">Cobertura forrajera</p><h3>Composición actual</h3></div>
          <div className="form-grid cobertura-grid"><SelectorCatalogo etiqueta={esBanco ? 'Forraje principal' : 'Pasto principal'} opciones={pastos} valor={cobertura.pastoPrincipal} onChange={(valor) => setCobertura((actual) => ({ ...actual, pastoPrincipal: valor, ...(valor ? { descripcionCobertura: '' } : {}) }))} /><SelectorCatalogo etiqueta={esBanco ? 'Otros forrajes presentes' : 'Pastos secundarios'} opciones={pastos} valor={cobertura.pastosSecundarios} multiple onChange={(valor) => actualizarCobertura('pastosSecundarios', valor)} /></div>
          <SelectorCatalogo etiqueta="Leguminosas o forrajes asociados" opciones={leguminosas} valor={cobertura.leguminosasAsociadas} multiple onChange={(valor) => actualizarCobertura('leguminosasAsociadas', valor)} />
          <div className="form-grid"><label>Fecha de establecimiento<input type="date" value={cobertura.fechaEstablecimientoPasto} onChange={(e) => actualizarCobertura('fechaEstablecimientoPasto', e.target.value)} /></label>{esBanco ? <label>Intervalo de corte objetivo<input type="number" min="1" value={cobertura.intervaloCorteObjetivoDias} onChange={(e) => actualizarCobertura('intervaloCorteObjetivoDias', e.target.value)} required /></label> : <label>Días de descanso objetivo<input type="number" min="0" value={cobertura.diasDescansoObjetivo} onChange={(e) => actualizarCobertura('diasDescansoObjetivo', e.target.value)} /></label>}</div>
          {esBanco && <div className="form-grid"><label>Responsable de cortes<select name="responsableCorte" value={formulario.responsableCorte} onChange={actualizarCampo} required><option value="">Seleccionar</option>{usuarios.map((usuario) => <option key={usuario._id} value={usuario._id}>{etiquetaUsuarioConRol(usuario)}</option>)}</select></label><label>Primer corte programado<input name="fechaPrimerCorte" type="date" value={formulario.fechaPrimerCorte} onChange={actualizarCampo} /><InfoLunarFecha fecha={formulario.fechaPrimerCorte} compacta /></label></div>}
          {esBanco && <label>Fecha de siembra o renovación a programar<input name="fechaSiembra" type="date" value={formulario.fechaSiembra} onChange={actualizarCampo} /><InfoLunarFecha fecha={formulario.fechaSiembra} compacta /></label>}
          {modo === 'editar' && <label>Fecha del cambio<input type="date" value={cobertura.fechaCambio} onChange={(e) => actualizarCobertura('fechaCambio', e.target.value)} required /></label>}
          <label>Observación de cobertura<textarea rows="3" value={cobertura.observacionCobertura} onChange={(e) => actualizarCobertura('observacionCobertura', e.target.value)} /></label>
          {cobertura.descripcionCobertura && <label>Descripción pendiente de catálogo<input value={cobertura.descripcionCobertura} onChange={(e) => actualizarCobertura('descripcionCobertura', e.target.value)} /></label>}
        </section>

        <div className="form-grid"><label>Última aplicación de herbicida<input name="ultimaAplicacionHerbicida" type="date" value={formulario.ultimaAplicacionHerbicida} onChange={actualizarCampo} /></label><label>Última chapia<input name="ultimaChapia" type="date" value={formulario.ultimaChapia} onChange={actualizarCampo} /></label></div>
        <label>Última fertilización<input name="ultimaFertilizacion" type="date" value={formulario.ultimaFertilizacion} onChange={actualizarCampo} /></label>
        <label>Observaciones<textarea name="observaciones" rows="4" value={formulario.observaciones} onChange={actualizarCampo} /></label>
        <div className="form-actions"><button className="boton-link" type="button" onClick={onCancelar}>Cancelar</button><button className="boton-primario compacto" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : modo === 'editar' ? 'Actualizar' : esBanco ? 'Guardar banco' : 'Guardar potrero'}</button></div>
      </form>
    </section>
  );
};

export default FormularioPotrero;
