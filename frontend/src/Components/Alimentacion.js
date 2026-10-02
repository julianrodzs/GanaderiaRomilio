import React, { useEffect, useState } from 'react';
import {
  actualizarAlimento, actualizarPlanAlimentacion, actualizarRacion, actualizarSuministroAlimentacion, asignarRacionLote,
  crearAlimento, crearPlanAlimentacion, crearRacion, crearSuministroAlimentacion,
  obtenerAlimentos, obtenerLotes, obtenerPlanesAlimentacion, obtenerRacionLote,
  obtenerRaciones, obtenerSuministrosAlimentacion
} from '../services/api';
import SelectorEspecie from './SelectorEspecie';
import TablaDinamica from './TablaDinamica';
import FormularioAlimentacion from './FormularioAlimentacion';

const Alimentacion = ({ soloLectura = false, puedeRegistrar = false }) => {
  const [especie, setEspecie] = useState(localStorage.getItem('ganaderiaEspecie') || 'Bovino');
  const [tab, setTab] = useState('planes');
  const [datos, setDatos] = useState({ planes: [], raciones: [], alimentos: [], lotes: [], suministros: [] });
  const [formulario, setFormulario] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState('');

  const cargar = async () => {
    try {
      setError('');
      const [planes, raciones, alimentos, lotes, suministros] = await Promise.all([
        obtenerPlanesAlimentacion({ especie }), obtenerRaciones({ especie }), obtenerAlimentos(),
        obtenerLotes({ especie, estado: 'ACTIVO' }), obtenerSuministrosAlimentacion()
      ]);
      setDatos({ planes, raciones, alimentos, lotes, suministros: suministros.filter((x) => x.lote?.especie === especie) });
    } catch (err) { setError(err.message); }
  };

  useEffect(() => { cargar(); }, [especie]);
  useEffect(() => {
    const pendiente = JSON.parse(sessionStorage.getItem('ganaderiaAccionLote') || 'null');
    if (pendiente?.modulo !== 'Alimentacion') return;
    sessionStorage.removeItem('ganaderiaAccionLote');
    setEspecie(pendiente.especie || 'Bovino'); setTab('suministros');
    setFormulario({ tipo: 'suministro', loteId: pendiente.loteId });
  }, []);

  const cambiarEspecie = (valor) => { localStorage.setItem('ganaderiaEspecie', valor); setEspecie(valor); setDetalle(null); };
  const guardar = async (tipo, valor) => {
    if (tipo === 'plan') valor._id ? await actualizarPlanAlimentacion(valor._id, valor) : await crearPlanAlimentacion(valor);
    if (tipo === 'racion') valor._id ? await actualizarRacion(valor._id, valor) : await crearRacion(valor);
    if (tipo === 'alimento') valor._id ? await actualizarAlimento(valor._id, valor) : await crearAlimento(valor);
    if (tipo === 'suministro') valor._id ? await actualizarSuministroAlimentacion(valor._id, valor) : await crearSuministroAlimentacion(valor);
    if (tipo === 'asignacion') await asignarRacionLote(valor.lote, valor);
    setFormulario(null); await cargar();
  };

  const columnas = {
    planes: [
      { id: 'nombre', label: 'Plan', accessor: (x) => x.nombre },
      { id: 'proposito', label: 'Propósito', accessor: (x) => x.proposito },
      { id: 'manejo', label: 'Manejo', accessor: (x) => x.tipoManejoAlimenticio?.replaceAll('_', ' ') || 'Sin definir' },
      { id: 'etapa', label: 'Etapa', accessor: (x) => x.etapa },
      { id: 'lotes', label: 'Lotes activos', accessor: (x) => x.lotesActivos || 0 },
      { id: 'estado', label: 'Estado', accessor: (x) => x.activo ? 'Activo' : 'Inactivo' }
    ],
    raciones: [
      { id: 'nombre', label: 'Ración', accessor: (x) => x.nombre, render: (x) => <button className="tabla-link" type="button" onClick={() => setDetalle(x)}>{x.nombre}</button> },
      { id: 'proposito', label: 'Propósito', accessor: (x) => x.proposito },
      { id: 'etapa', label: 'Etapa', accessor: (x) => x.etapa },
      { id: 'componentes', label: 'Componentes', accessor: (x) => x.detalles?.length || 0 },
      { id: 'lotes', label: 'Lotes activos', accessor: (x) => x.lotesActivos || 0 },
      { id: 'estado', label: 'Estado', accessor: (x) => x.activo ? 'Activa' : 'Inactiva' }
    ],
    suministros: [
      { id: 'fecha', label: 'Fecha', accessor: (x) => new Date(x.fechaHora).toLocaleString('es-CR') },
      { id: 'lote', label: 'Lote', accessor: (x) => x.lote?.codigo || '—' },
      { id: 'racion', label: 'Ración', accessor: (x) => x.racionSnapshot?.nombre || 'Registro libre' },
      { id: 'kg', label: 'Suministrado', accessor: (x) => `${x.totalKgSuministrados} kg` },
      { id: 'medicion', label: 'Medición', accessor: (x) => [...new Set((x.detalles || []).map((d) => d.tipoMedicion))].join(', ') || '—' },
      { id: 'cabeza', label: 'Por animal', accessor: (x) => `${x.kgSuministradosPorCabeza} kg` },
      { id: 'responsable', label: 'Responsable', accessor: (x) => [x.responsable?.nombre, x.responsable?.apellido].filter(Boolean).join(' ') || '—' },
      { id: 'observaciones', label: 'Observaciones', accessor: (x) => x.observaciones || '—' }
    ]
  };

  if (formulario) return <FormularioAlimentacion
    configuracion={formulario} especie={especie} alimentos={datos.alimentos} lotes={datos.lotes} planes={datos.planes}
    raciones={datos.raciones} onGuardar={guardar} onCerrar={() => setFormulario(null)}
  />;

  const config = tab === 'planes'
    ? { titulo: 'Planes de alimentación', datos: datos.planes, agregar: 'Nuevo plan', tipo: 'plan' }
    : tab === 'raciones'
      ? { titulo: 'Raciones', datos: datos.raciones, agregar: 'Nueva ración', tipo: 'racion' }
      : { titulo: 'Suministros reales', datos: datos.suministros, agregar: 'Registrar alimentación', tipo: 'suministro' };
  const puedeAgregar = tab === 'suministros' ? puedeRegistrar : !soloLectura;

  return <>
    <SelectorEspecie valor={especie} onChange={cambiarEspecie} />
    <div className="inventario-tabs alimentacion-tabs">
      {['planes', 'raciones', 'suministros'].map((x) => <button key={x} className={tab === x ? 'activo' : ''} type="button" onClick={() => setTab(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}
    </div>
    {error && <p className="mensaje-error">{error}</p>}
    {tab === 'raciones' && !soloLectura && <div className="barra-acciones-alimentacion"><button className="boton-secundario" type="button" onClick={() => setFormulario({ tipo: 'alimento' })}>Catálogo de alimentos</button></div>}
    <TablaDinamica titulo={config.titulo} subtitulo="Alimentación" columnas={columnas[tab]} datos={config.datos}
      filtros={tab === 'suministros' ? [{ id: 'lote', accessor: (x) => x.lote?.codigo || 'Sin lote' }] : [{ id: 'proposito', accessor: (x) => x.proposito }, { id: 'etapa', accessor: (x) => x.etapa }]}
      textoAgregar={config.agregar} onAgregar={puedeAgregar ? () => setFormulario({ tipo: config.tipo }) : undefined}
      onEditar={!soloLectura ? (registro) => setFormulario({ tipo: config.tipo, registro }) : undefined}
      onVer={tab === 'suministros' ? setDetalle : undefined} mostrarAcciones={tab === 'suministros' || !soloLectura} />
    {tab === 'raciones' && <section className="catalogo-resumen"><div className="panel-title"><div><p className="eyebrow">Catálogo</p><h3>Alimentos disponibles</h3></div></div><div className="catalogo-alimentos-grid">{datos.alimentos.map((x) => <button type="button" key={x._id} disabled={soloLectura} onClick={() => setFormulario({ tipo: 'alimento', registro: x })}><strong>{x.nombre}</strong><span>{x.tipo} · {x.presentaciones?.length || 0} presentaciones · {x.activo ? 'Activo' : 'Inactivo'}</span></button>)}</div></section>}
    {detalle && <div className="modal-backdrop"><section className="modal-panel"><div className="panel-title"><div><p className="eyebrow">Alimentación</p><h2>{detalle.nombre || `Suministro · ${detalle.lote?.codigo}`}</h2></div><button className="boton-link" type="button" onClick={() => setDetalle(null)}>Cerrar</button></div><div className="lista-compacta">{detalle.detalles?.map((x) => <span key={x._id}>{x.alimentoNombreSnapshot || x.alimento?.nombre} · {x.cantidadKg ?? x.cantidad} {x.cantidadKg != null ? 'kg' : x.unidad}{x.sobranteKg != null ? ` · sobrante ${x.sobranteKg} kg` : ''}</span>)}</div>{detalle.proposito && !soloLectura && <button className="boton-primario" type="button" onClick={() => { setFormulario({ tipo: 'asignacion', registro: detalle }); setDetalle(null); }}>Asignar a lote</button>}</section></div>}
  </>;
};

export default Alimentacion;
