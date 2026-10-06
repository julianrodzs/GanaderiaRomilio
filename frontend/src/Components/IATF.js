import React, { useEffect, useMemo, useState } from 'react';
import {
  cancelarCampanaIATF,
  actualizarProtocoloIATF,
  crearCampanaIATF,
  crearInsumoIATF,
  crearProtocoloIATF,
  ejecutarPasoIATF,
  finalizarCampanaIATF,
  obtenerAnimales,
  obtenerCampanaIATF,
  obtenerCampanasIATF,
  obtenerConsolidadoIATF,
  obtenerInsumosIATF,
  obtenerLotes,
  obtenerProtocolosIATF,
  obtenerUsuariosAsignables,
  registrarDiagnosticosIATF,
  registrarInseminacionesIATF,
  reprogramarPasosIATF,
  retirarParticipanteIATF
} from '../services/api';
import { etiquetaUsuarioConRol } from '../utils/usuarios';
import { usePlan } from '../context/PlanContext';

const TIPOS_ACCION = [
  'INSERTAR_DISPOSITIVO', 'RETIRAR_DISPOSITIVO', 'APLICAR_PRODUCTO', 'IATF',
  'OBSERVAR_CELO', 'DIAGNOSTICO_GESTACION', 'RESINCRONIZACION',
  'MONTA_REPASO', 'CONTROL', 'OTRA'
];
const CATEGORIAS_INSUMO = ['HORMONA_REPRODUCTIVA', 'DISPOSITIVO_REPRODUCTIVO', 'SEMEN', 'INSUMO_REPRODUCTIVO', 'OTRO'];

const fechaLocalInput = (fecha = new Date()) => {
  const valor = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
  return valor.toISOString().slice(0, 16);
};
const formatoFechaHora = (fecha) => fecha ? new Date(fecha).toLocaleString('es-CR') : '--';
const formatoMoneda = (valor, moneda = 'CRC') => new Intl.NumberFormat('es-CR', { style: 'currency', currency: moneda }).format(Number(valor || 0));
const formatoCostoMetricas = (metricas) => {
  if (metricas?.monedaCosto && metricas?.costoTotal != null) return formatoMoneda(metricas.costoTotal, metricas.monedaCosto);
  const costos = Object.entries(metricas?.costosPorMoneda || {}).filter(([, monto]) => Number(monto) !== 0);
  return costos.length ? costos.map(([moneda, monto]) => formatoMoneda(monto, moneda)).join(' + ') : formatoMoneda(0);
};
const animalId = (animal) => String(animal?._id || animal || '');
const etiquetaAnimal = (animal) => `${animal?.diio || animal?.identificadorFinca || 'Sin código'}${animal?.nombre ? ` - ${animal.nombre}` : ''}`;

const pasoVacio = (indice = 0) => ({
  claveTemporal: `paso-${Date.now()}-${indice}`,
  nombre: '', tipoAccion: 'APLICAR_PRODUCTO', referenciaTemporal: 'DESDE_INICIO',
  pasoReferenciaClave: '', offsetHoras: 0, ventanaInicioHoras: '', ventanaFinHoras: '',
  generaTarea: true, rolResponsable: 'Veterinario', instrucciones: '', obligatorio: true, productos: []
});

const prepararProtocoloFormulario = (inicial) => inicial ? {
  nombre: inicial.nombre || '',
  descripcion: inicial.descripcion || '',
  alcance: inicial.alcance === 'SISTEMA' ? 'FINCA' : (inicial.alcance || 'FINCA'),
  escalaCondicionCorporal: inicial.escalaCondicionCorporal || '1-5',
  diasPostpartoMinimosRecomendados: inicial.diasPostpartoMinimosRecomendados ?? '',
  condicionCorporalMinima: inicial.condicionCorporalMinima ?? '',
  activo: inicial.activo !== false,
  pasos: (inicial.pasos || []).map((paso, indice) => ({
    ...paso,
    claveTemporal: String(paso._id || `paso-${Date.now()}-${indice}`),
    pasoReferenciaClave: paso.pasoReferenciaId ? String(paso.pasoReferenciaId) : '',
    producto: paso.productos?.[0]?.producto ? String(paso.productos[0].producto?._id || paso.productos[0].producto) : '',
    dosis: paso.productos?.[0]?.dosis || '',
    unidad: paso.productos?.[0]?.unidad || '',
    cantidadPorAnimal: paso.productos?.[0]?.cantidadPorAnimal ?? '',
    ventanaInicioHoras: paso.ventanaInicioHoras ?? '',
    ventanaFinHoras: paso.ventanaFinHoras ?? ''
  }))
} : { nombre: '', descripcion: '', alcance: 'FINCA', escalaCondicionCorporal: '1-5', diasPostpartoMinimosRecomendados: '', condicionCorporalMinima: '', activo: true, pasos: [pasoVacio()] };

const FormularioProtocolo = ({ insumos, inicial, esDuplicado = false, onGuardar, onCerrar, guardando }) => {
  const [form, setForm] = useState(() => prepararProtocoloFormulario(inicial));
  const actualizarPaso = (indice, campo, valor) => setForm((actual) => ({ ...actual, pasos: actual.pasos.map((paso, i) => i === indice ? { ...paso, [campo]: valor } : paso) }));
  const quitarPaso = (indice) => setForm((actual) => ({ ...actual, pasos: actual.pasos.filter((_, i) => i !== indice) }));

  const enviar = (evento) => {
    evento.preventDefault();
    onGuardar({
      ...form,
      diasPostpartoMinimosRecomendados: form.diasPostpartoMinimosRecomendados === '' ? undefined : Number(form.diasPostpartoMinimosRecomendados),
      condicionCorporalMinima: form.condicionCorporalMinima === '' ? undefined : Number(form.condicionCorporalMinima),
      pasos: form.pasos.map((paso) => ({
        ...paso,
        offsetHoras: Number(paso.offsetHoras),
        ventanaInicioHoras: paso.ventanaInicioHoras === '' ? undefined : Number(paso.ventanaInicioHoras),
        ventanaFinHoras: paso.ventanaFinHoras === '' ? undefined : Number(paso.ventanaFinHoras),
        pasoReferenciaId: undefined,
        pasoReferenciaClave: paso.referenciaTemporal === 'DESDE_PASO' ? paso.pasoReferenciaClave : undefined,
        productos: paso.producto ? [{ producto: paso.producto, dosis: paso.dosis, unidad: paso.unidad, cantidadPorAnimal: paso.cantidadPorAnimal === '' ? undefined : Number(paso.cantidadPorAnimal) }] : []
      }))
    });
  };

  return (
    <div className="modal-backdrop">
      <section className="modal-panel iatf-modal iatf-modal-amplio">
        <div className="panel-title"><div><p className="eyebrow">IATF</p><h2>{esDuplicado ? 'Duplicar protocolo' : inicial ? 'Editar protocolo' : 'Nuevo protocolo configurable'}</h2></div><button className="boton-link" type="button" onClick={onCerrar}>Cerrar</button></div>
        <form onSubmit={enviar} className="iatf-form">
          <div className="usuario-form-grid">
            <label>Nombre<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label>
            <label>Alcance<select value={form.alcance} onChange={(e) => setForm({ ...form, alcance: e.target.value })}><option value="FINCA">Finca</option><option value="ORGANIZACION">Organización</option></select></label>
            <label>Escala de condición corporal<select value={form.escalaCondicionCorporal} onChange={(e) => setForm({ ...form, escalaCondicionCorporal: e.target.value })}><option>1-5</option><option>1-9</option></select></label>
            <label>CC mínima recomendada<input type="number" step="0.1" value={form.condicionCorporalMinima} onChange={(e) => setForm({ ...form, condicionCorporalMinima: e.target.value })} /></label>
            <label>Días posparto recomendados<input type="number" min="0" value={form.diasPostpartoMinimosRecomendados} onChange={(e) => setForm({ ...form, diasPostpartoMinimosRecomendados: e.target.value })} /></label>
            <label className="check-line"><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Protocolo activo</label>
            <label className="campo-completo">Descripción<textarea rows="2" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></label>
          </div>
          <div className="iatf-editor-header"><h3>Pasos del protocolo</h3><button type="button" onClick={() => setForm((actual) => ({ ...actual, pasos: [...actual.pasos, pasoVacio(actual.pasos.length)] }))}>Agregar paso</button></div>
          <div className="iatf-pasos-editor">
            {form.pasos.map((paso, indice) => (
              <article className="iatf-paso-editor" key={paso.claveTemporal}>
                <header><strong>Paso {indice + 1}</strong><button type="button" className="boton-link peligro" onClick={() => quitarPaso(indice)} disabled={form.pasos.length === 1}>Quitar</button></header>
                <div className="usuario-form-grid">
                  <label>Nombre<input value={paso.nombre} onChange={(e) => actualizarPaso(indice, 'nombre', e.target.value)} required /></label>
                  <label>Acción<select value={paso.tipoAccion} onChange={(e) => actualizarPaso(indice, 'tipoAccion', e.target.value)}>{TIPOS_ACCION.map((tipo) => <option key={tipo}>{tipo}</option>)}</select></label>
                  <label>Referencia<select value={paso.referenciaTemporal} onChange={(e) => actualizarPaso(indice, 'referenciaTemporal', e.target.value)}><option value="DESDE_INICIO">Desde inicio</option><option value="DESDE_PASO">Desde otro paso</option></select></label>
                  {paso.referenciaTemporal === 'DESDE_PASO' && <label>Paso de referencia<select value={paso.pasoReferenciaClave} onChange={(e) => actualizarPaso(indice, 'pasoReferenciaClave', e.target.value)} required><option value="">Seleccionar</option>{form.pasos.slice(0, indice).map((otro) => <option key={otro.claveTemporal} value={otro.claveTemporal}>{otro.nombre || 'Paso sin nombre'}</option>)}</select></label>}
                  <label>Horas después<input type="number" step="0.25" value={paso.offsetHoras} onChange={(e) => actualizarPaso(indice, 'offsetHoras', e.target.value)} required /></label>
                  <label>Inicio ventana (+h)<input type="number" step="0.25" value={paso.ventanaInicioHoras} onChange={(e) => actualizarPaso(indice, 'ventanaInicioHoras', e.target.value)} /></label>
                  <label>Fin ventana (+h)<input type="number" step="0.25" value={paso.ventanaFinHoras} onChange={(e) => actualizarPaso(indice, 'ventanaFinHoras', e.target.value)} /></label>
                  <label>Rol responsable<select value={paso.rolResponsable} onChange={(e) => actualizarPaso(indice, 'rolResponsable', e.target.value)}><option>Veterinario</option><option>Encargado</option><option>Trabajador</option><option>Administrador</option></select></label>
                  <label>Insumo previsto<select value={paso.producto || ''} onChange={(e) => actualizarPaso(indice, 'producto', e.target.value)}><option value="">Sin insumo predefinido</option>{insumos.map((item) => <option key={item._id} value={item._id}>{item.nombre} · {item.cantidadDisponible} {item.unidad}</option>)}</select></label>
                  <label>Dosis indicada<input value={paso.dosis || ''} onChange={(e) => actualizarPaso(indice, 'dosis', e.target.value)} /></label>
                  <label>Cantidad/animal<input type="number" min="0" step="0.001" value={paso.cantidadPorAnimal || ''} onChange={(e) => actualizarPaso(indice, 'cantidadPorAnimal', e.target.value)} /></label>
                  <label>Unidad<input value={paso.unidad || ''} onChange={(e) => actualizarPaso(indice, 'unidad', e.target.value)} /></label>
                  <label className="campo-completo">Instrucciones<textarea rows="2" value={paso.instrucciones} onChange={(e) => actualizarPaso(indice, 'instrucciones', e.target.value)} /></label>
                  <label className="check-line"><input type="checkbox" checked={paso.generaTarea} onChange={(e) => actualizarPaso(indice, 'generaTarea', e.target.checked)} /> Generar tarea</label>
                  <label className="check-line"><input type="checkbox" checked={paso.obligatorio} onChange={(e) => actualizarPaso(indice, 'obligatorio', e.target.checked)} /> Paso obligatorio</label>
                </div>
              </article>
            ))}
          </div>
          <div className="modal-actions"><button type="button" className="boton-link" onClick={onCerrar}>Cancelar</button><button className="boton-primario" disabled={guardando}>{guardando ? 'Guardando...' : esDuplicado ? 'Crear copia' : inicial ? 'Guardar nueva versión' : 'Crear protocolo'}</button></div>
        </form>
      </section>
    </div>
  );
};

const FormularioCampana = ({ protocolos, lotes, animales, usuarios, onGuardar, onCerrar, guardando }) => {
  const [form, setForm] = useState({ nombre: '', protocolo: '', fechaHoraInicio: fechaLocalInput(), responsable: '', veterinario: '', responsablesPorRol: {}, loteOrigen: '', animales: [], condiciones: {} });
  const disponibles = animales.filter((animal) => animal.especie === 'Bovino' && animal.sexo === 'Hembra' && animal.estado === 'Activo' && animal.objetivoProductivo === 'REPRODUCCION');
  const alternar = (id) => setForm((actual) => ({ ...actual, animales: actual.animales.includes(id) ? actual.animales.filter((item) => item !== id) : [...actual.animales, id] }));
  const enviar = (e) => {
    e.preventDefault();
    onGuardar({ ...form, condicionesCorporales: form.animales.filter((id) => form.condiciones[id] !== '').map((id) => ({ animal: id, valor: Number(form.condiciones[id]), escala: protocolos.find((p) => p._id === form.protocolo)?.escalaCondicionCorporal || '1-5' })) });
  };
  return (
    <div className="modal-backdrop"><section className="modal-panel iatf-modal iatf-modal-amplio">
      <div className="panel-title"><div><p className="eyebrow">Campaña reproductiva</p><h2>Nueva campaña IATF</h2></div><button className="boton-link" type="button" onClick={onCerrar}>Cerrar</button></div>
      <form className="iatf-form" onSubmit={enviar}>
        <div className="usuario-form-grid">
          <label>Nombre<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label>
          <label>Protocolo<select value={form.protocolo} onChange={(e) => setForm({ ...form, protocolo: e.target.value })} required><option value="">Seleccionar</option>{protocolos.map((p) => <option key={p._id} value={p._id}>{p.nombre} · v{p.version}</option>)}</select></label>
          <label>Fecha y hora Día 0<input type="datetime-local" value={form.fechaHoraInicio} onChange={(e) => setForm({ ...form, fechaHoraInicio: e.target.value })} required /></label>
          <label>Responsable general<select value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} required><option value="">Seleccionar</option>{usuarios.filter((u) => ['Administrador', 'Encargado', 'Veterinario'].includes(u.rol)).map((u) => <option key={u._id} value={u._id}>{etiquetaUsuarioConRol(u)}</option>)}</select></label>
          <label>Veterinario<select value={form.veterinario} onChange={(e) => setForm({ ...form, veterinario: e.target.value })}><option value="">Sin asignar</option>{usuarios.filter((u) => ['Veterinario', 'Administrador'].includes(u.rol)).map((u) => <option key={u._id} value={u._id}>{etiquetaUsuarioConRol(u)}</option>)}</select></label>
          <label>Lote reproductivo<select value={form.loteOrigen} onChange={(e) => setForm({ ...form, loteOrigen: e.target.value })}><option value="">Selección manual</option>{lotes.filter((l) => l.especie === 'Bovino' && l.proposito === 'REPRODUCCION' && l.estado === 'ACTIVO').map((l) => <option key={l._id} value={l._id}>{l.codigo} - {l.nombre}</option>)}</select></label>
        </div>
        <div className="iatf-responsables-pasos">
          <h3>Responsables por rol del protocolo</h3>
          <div className="usuario-form-grid">
            {[...new Set((protocolos.find((p) => p._id === form.protocolo)?.pasos || []).map((p) => p.rolResponsable))].map((rol) => (
              <label key={rol}>{rol}<select value={form.responsablesPorRol[rol] || ''} onChange={(e) => setForm((actual) => ({ ...actual, responsablesPorRol: { ...actual.responsablesPorRol, [rol]: e.target.value } }))}><option value="">Usar responsable general</option>{usuarios.filter((u) => u.rol === rol || u.rol === 'Administrador').map((u) => <option key={u._id} value={u._id}>{etiquetaUsuarioConRol(u)}</option>)}</select></label>
            ))}
          </div>
        </div>
        <div className="iatf-seleccion-header"><h3>Selección manual y condición corporal</h3><span>{form.animales.length} seleccionadas</span></div>
        <div className="iatf-selector-animales">
          {disponibles.map((animal) => <label key={animal._id} className={form.animales.includes(animal._id) ? 'seleccionado' : ''}><input type="checkbox" checked={form.animales.includes(animal._id)} onChange={() => alternar(animal._id)} /><span><strong>{etiquetaAnimal(animal)}</strong><small>{animal.categoria} · {animal.raza || 'Raza no indicada'}</small></span>{form.animales.includes(animal._id) && <input aria-label={`Condición corporal de ${etiquetaAnimal(animal)}`} type="number" min="1" max="9" step="0.1" placeholder="CC" value={form.condiciones[animal._id] || ''} onChange={(e) => setForm((actual) => ({ ...actual, condiciones: { ...actual.condiciones, [animal._id]: e.target.value } }))} />}</label>)}
        </div>
        <p className="iatf-nota">Los criterios posparto y de condición corporal producen advertencias. La decisión de inclusión sigue siendo del profesional responsable.</p>
        <div className="modal-actions"><button type="button" className="boton-link" onClick={onCerrar}>Cancelar</button><button className="boton-primario" disabled={guardando || (!form.loteOrigen && !form.animales.length)}>{guardando ? 'Creando...' : 'Crear campaña y cronograma'}</button></div>
      </form>
    </section></div>
  );
};

const InventarioIATF = ({ insumos, onGuardar, onCerrar, guardando }) => {
  const [form, setForm] = useState({ nombre: '', categoria: 'HORMONA_REPRODUCTIVA', unidad: 'ML', cantidadDisponible: '', costoUnitario: '', moneda: 'CRC', lote: '', tipoDispositivo: 'DESECHABLE', tipoSemen: 'CONVENCIONAL', toro: '', codigoToro: '', razaToro: '' });
  const enviar = (e) => { e.preventDefault(); onGuardar({ ...form, cantidadDisponible: Number(form.cantidadDisponible), costoUnitario: Number(form.costoUnitario || 0) }); };
  return <div className="modal-backdrop"><section className="modal-panel iatf-modal iatf-modal-amplio">
    <div className="panel-title"><div><p className="eyebrow">Existencias</p><h2>Inventario reproductivo</h2></div><button className="boton-link" onClick={onCerrar}>Cerrar</button></div>
    <div className="iatf-inventario-layout"><form className="usuario-form-grid" onSubmit={enviar}>
      <label>Nombre<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label>
      <label>Categoría<select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>{CATEGORIAS_INSUMO.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label>Cantidad disponible<input type="number" min="0" step="0.001" value={form.cantidadDisponible} onChange={(e) => setForm({ ...form, cantidadDisponible: e.target.value })} required /></label>
      <label>Unidad<input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} required /></label>
      <label>Costo unitario<input type="number" min="0" step="0.01" value={form.costoUnitario} onChange={(e) => setForm({ ...form, costoUnitario: e.target.value })} /></label>
      <label>Moneda<select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}><option>CRC</option><option>USD</option></select></label>
      <label>Lote<input value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })} /></label>
      {form.categoria === 'DISPOSITIVO_REPRODUCTIVO' && <label>Tipo de dispositivo<select value={form.tipoDispositivo} onChange={(e) => setForm({ ...form, tipoDispositivo: e.target.value })}><option>DESECHABLE</option><option>REUTILIZABLE_CONTROLADO</option></select></label>}
      {form.categoria === 'SEMEN' && <><label>Tipo semen<select value={form.tipoSemen} onChange={(e) => setForm({ ...form, tipoSemen: e.target.value })}><option>CONVENCIONAL</option><option>SEXADO</option><option>OTRO</option></select></label><label>Toro<input value={form.toro} onChange={(e) => setForm({ ...form, toro: e.target.value })} /></label><label>Código toro<input value={form.codigoToro} onChange={(e) => setForm({ ...form, codigoToro: e.target.value })} /></label><label>Raza<input value={form.razaToro} onChange={(e) => setForm({ ...form, razaToro: e.target.value })} /></label></>}
      <div className="modal-actions campo-completo"><button className="boton-primario" disabled={guardando}>{guardando ? 'Guardando...' : 'Agregar existencia'}</button></div>
    </form><div className="table-scroll"><table><thead><tr><th>Insumo</th><th>Categoría</th><th>Disponible</th><th>En uso</th><th>Costo</th></tr></thead><tbody>{insumos.map((i) => <tr key={i._id}><td>{i.nombre}<small>{i.lote ? `Lote ${i.lote}` : ''}</small></td><td>{i.categoria}</td><td>{i.cantidadDisponible} {i.unidad}</td><td>{i.cantidadEnUso || 0}</td><td>{formatoMoneda(i.costoUnitario, i.moneda)}</td></tr>)}</tbody></table></div></div>
  </section></div>;
};

const DetalleCampana = ({ campana, insumos, permisos, onCerrar, onRecargar, setError }) => {
  const [accion, setAccion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const activos = campana.participantes.filter((p) => !['RETIRADA', 'CANCELADA'].includes(p.estadoParticipacion));
  const semen = insumos.filter((i) => i.categoria === 'SEMEN' && i.cantidadDisponible > 0);
  const pasoIatf = campana.pasos.find((paso) => paso.pasoSnapshot.tipoAccion === 'IATF');
  const animalesConPasoIatf = new Set((pasoIatf?.animalesAplicados || []).map(animalId));
  const pendientesInseminacion = activos.filter((participante) => (
    animalesConPasoIatf.has(animalId(participante.animal)) && !participante.fechaInseminacion
  ));
  const ejecutar = async (paso) => {
    const producto = paso.pasoSnapshot.productos?.[0]?.producto;
    const aplicados = new Set((paso.animalesAplicados || []).map(animalId));
    setAccion({ tipo: 'paso', paso, animales: activos.filter((p) => !aplicados.has(animalId(p.animal))).map((p) => animalId(p.animal)), retornosCelo: [], fechaHoraReal: fechaLocalInput(), producto: producto ? String(producto) : '', cantidad: '', dosis: paso.pasoSnapshot.productos?.[0]?.dosis || '', observaciones: '' });
  };
  const enviarAccion = async () => {
    try {
      setGuardando(true); setError('');
      if (accion.tipo === 'paso') {
        await ejecutarPasoIATF(campana._id, accion.paso.pasoPlantilla, { fechaHoraReal: accion.fechaHoraReal, animales: accion.animales, retornoCeloAnimales: accion.retornosCelo, productos: accion.producto && accion.cantidad ? [{ producto: accion.producto, cantidad: Number(accion.cantidad), dosis: accion.dosis }] : [], observaciones: accion.observaciones });
      } else if (accion.tipo === 'iatf') {
        await registrarInseminacionesIATF(campana._id, { fechaHoraReal: accion.fechaHoraReal, tecnico: accion.tecnico, inseminaciones: accion.animales.map((p) => ({ participanteId: p._id, semen: accion.semen, fechaHoraReal: accion.fechaHoraReal, tecnico: accion.tecnico })) });
      } else if (accion.tipo === 'diagnostico') {
        await registrarDiagnosticosIATF(campana._id, { fecha: accion.fecha, metodo: accion.metodo, responsable: accion.responsable, diagnosticos: accion.animales.map((p) => ({ participanteId: p._id, resultado: accion.resultados[p._id] || 'DUDOSA', fecha: accion.fecha, metodo: accion.metodo, responsable: accion.responsable })) });
      }
      setAccion(null); await onRecargar();
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  };
  return <section className="iatf-detalle">
    <div className="panel-title"><div><p className="eyebrow">Campaña IATF</p><h2>{campana.nombre}</h2><p>{campana.protocolo?.nombre || campana.protocoloSnapshot?.nombre} · versión {campana.protocoloVersion}</p></div><button className="boton-link" onClick={onCerrar}>Volver a campañas</button></div>
    <div className="iatf-kpis">
      {[['Inscritas', campana.metricas.inscritas], ['Completaron', campana.metricas.completaron], ['Inseminadas', campana.metricas.inseminadas], ['Preñadas', campana.metricas.prenadas], ['P/AI', `${campana.metricas.pAI}%`], ['Costo/preñez', campana.metricas.costoPorPrenez == null ? '--' : formatoMoneda(campana.metricas.costoPorPrenez, campana.metricas.monedaCosto)]].map(([k, v]) => <article key={k}><span>{k}</span><strong>{v}</strong></article>)}
    </div>
    <div className="iatf-detalle-grid">
      <section><div className="iatf-editor-header"><h3>Cronograma</h3><span className={`estado-badge iatf-estado-${campana.estado}`}>{campana.estado}</span></div><div className="iatf-timeline">{campana.pasos.map((paso) => <article key={paso._id} className={`iatf-timeline-item estado-${paso.estado}`}><span className="iatf-timeline-mark" /><div><strong>{paso.pasoSnapshot.nombre}</strong><small>Programado: {formatoFechaHora(paso.fechaHoraProgramada)}</small><small>Real: {formatoFechaHora(paso.fechaHoraReal)}</small>{paso.ventanaInicio && <small>Ventana: {formatoFechaHora(paso.ventanaInicio)} a {formatoFechaHora(paso.ventanaFin)}</small>}</div>{permisos.ejecutar && ['PENDIENTE', 'PARCIAL'].includes(paso.estado) && <button type="button" onClick={() => ejecutar(paso)}>{paso.estado === 'PARCIAL' ? 'Continuar' : 'Registrar'}</button>}{permisos.crear && paso.fechaHoraReal && campana.pasos.some((p) => p.estado === 'PENDIENTE') && <button type="button" className="boton-link" onClick={async () => { await reprogramarPasosIATF(campana._id, paso.pasoPlantilla, true); onRecargar(); }}>Recalcular dependientes</button>}</article>)}</div></section>
      <section><h3>Operaciones</h3><div className="iatf-acciones-principales">{permisos.ejecutar && <button disabled={!semen.length || !pendientesInseminacion.length} title={!pendientesInseminacion.length ? 'Primero registra la ejecución del paso IATF.' : ''} onClick={() => setAccion({ tipo: 'iatf', animales: pendientesInseminacion, semen: '', tecnico: '', fechaHoraReal: fechaLocalInput() })}>Registrar inseminaciones</button>}{permisos.diagnosticar && <button disabled={!activos.some((p) => p.estadoParticipacion === 'INSEMINADA')} onClick={() => { const diagnosticables = activos.filter((p) => p.estadoParticipacion === 'INSEMINADA'); setAccion({ tipo: 'diagnostico', animales: diagnosticables, fecha: fechaLocalInput().slice(0, 10), metodo: 'ECOGRAFIA', responsable: '', resultados: Object.fromEntries(diagnosticables.map((p) => [p._id, 'DUDOSA'])) }); }}>Registrar diagnósticos</button>}{permisos.crear && <button onClick={async () => { if (window.confirm('¿Finalizar esta campaña?')) { await finalizarCampanaIATF(campana._id); onRecargar(); } }}>Finalizar</button>}{permisos.crear && <button className="peligro" onClick={async () => { const motivo = window.prompt('Motivo de cancelación'); if (motivo) { await cancelarCampanaIATF(campana._id, motivo); onRecargar(); } }}>Cancelar</button>}</div><dl className="iatf-resumen"><div><dt>Inicio</dt><dd>{formatoFechaHora(campana.fechaHoraInicio)}</dd></div><div><dt>Responsable</dt><dd>{etiquetaUsuarioConRol(campana.responsable)}</dd></div><div><dt>Costo real</dt><dd>{formatoCostoMetricas(campana.metricas)}</dd></div></dl></section>
    </div>
    <section className="iatf-participantes"><h3>Animales de campaña</h3><div className="table-scroll"><table><thead><tr><th>Animal</th><th>CC</th><th>Estado protocolo</th><th>IATF</th><th>Semen</th><th>Resultado</th><th>Acción</th></tr></thead><tbody>{campana.participantes.map((p) => <tr key={p._id}><td>{etiquetaAnimal(p.animal)}{p.advertencias?.map((a) => <small className="iatf-advertencia" key={a}>{a}</small>)}</td><td>{p.condicionCorporal?.valor || '--'} {p.condicionCorporal?.escala || ''}</td><td>{p.estadoParticipacion}</td><td>{formatoFechaHora(p.fechaInseminacion)}</td><td>{p.semenSnapshot?.toro || p.semenSnapshot?.nombre || '--'}</td><td>{p.resultadoActual}</td><td>{permisos.ejecutar && !['RETIRADA', 'CANCELADA'].includes(p.estadoParticipacion) ? <button className="boton-link peligro" onClick={async () => { const motivo = window.prompt('Motivo del retiro'); if (motivo) { await retirarParticipanteIATF(campana._id, p._id, motivo); onRecargar(); } }}>Retirar</button> : '--'}</td></tr>)}</tbody></table></div></section>
    {accion && <div className="modal-backdrop"><section className="modal-panel iatf-modal"><div className="panel-title"><div><p className="eyebrow">Ejecución real</p><h2>{accion.tipo === 'paso' ? accion.paso.pasoSnapshot.nombre : accion.tipo === 'iatf' ? 'Registrar inseminaciones' : 'Diagnóstico masivo'}</h2></div><button className="boton-link" onClick={() => setAccion(null)}>Cerrar</button></div><div className="usuario-form-grid">
      {accion.tipo !== 'diagnostico' && <label>Fecha y hora real<input type="datetime-local" value={accion.fechaHoraReal} onChange={(e) => setAccion({ ...accion, fechaHoraReal: e.target.value })} /></label>}
      {accion.tipo === 'paso' && <><label>Insumo utilizado<select value={accion.producto} onChange={(e) => setAccion({ ...accion, producto: e.target.value })}><option value="">Sin consumo</option>{insumos.filter((i) => i.categoria !== 'SEMEN').map((i) => <option key={i._id} value={i._id}>{i.nombre} · {i.cantidadDisponible} {i.unidad}</option>)}</select></label><label>Cantidad total<input type="number" min="0" step="0.001" value={accion.cantidad} onChange={(e) => setAccion({ ...accion, cantidad: e.target.value })} /></label><label>Dosis aplicada<input value={accion.dosis} onChange={(e) => setAccion({ ...accion, dosis: e.target.value })} /></label><label className="campo-completo">Observaciones<textarea value={accion.observaciones} onChange={(e) => setAccion({ ...accion, observaciones: e.target.value })} /></label></>}
      {accion.tipo === 'iatf' && <><label>Pajuela/semen<select required value={accion.semen} onChange={(e) => setAccion({ ...accion, semen: e.target.value })}><option value="">Seleccionar</option>{semen.map((i) => <option key={i._id} value={i._id}>{i.toro || i.nombre} · {i.cantidadDisponible} pajuelas</option>)}</select></label><p className="campo-completo">Se descontará exactamente una pajuela por cada uno de los {accion.animales.length} animales seleccionados.</p></>}
      {accion.tipo === 'diagnostico' && <><label>Fecha<input type="date" value={accion.fecha} onChange={(e) => setAccion({ ...accion, fecha: e.target.value })} /></label><label>Método<select value={accion.metodo} onChange={(e) => setAccion({ ...accion, metodo: e.target.value })}><option>ECOGRAFIA</option><option>PALPACION</option><option>PAG</option><option>OTRO</option></select></label><div className="campo-completo iatf-resultados-masivos">{accion.animales.map((p) => <label key={p._id}><span>{etiquetaAnimal(p.animal)}</span><select value={accion.resultados[p._id]} onChange={(e) => setAccion({ ...accion, resultados: { ...accion.resultados, [p._id]: e.target.value } })}><option>PREÑADA</option><option>VACIA</option><option>DUDOSA</option><option>REQUIERE_RECONFIRMACION</option></select></label>)}</div></>}
      {accion.tipo === 'paso' && <div className="campo-completo iatf-aplicacion-selector"><strong>Animales aplicados ({accion.animales.length})</strong>{activos.filter((p) => !(accion.paso.animalesAplicados || []).map(animalId).includes(animalId(p.animal))).map((p) => { const id = animalId(p.animal); return <label key={p._id}><input type="checkbox" checked={accion.animales.includes(id)} onChange={() => setAccion((actual) => ({ ...actual, animales: actual.animales.includes(id) ? actual.animales.filter((item) => item !== id) : [...actual.animales, id] }))} /> {etiquetaAnimal(p.animal)}</label>; })}</div>}
      {accion.tipo === 'paso' && accion.paso.pasoSnapshot.tipoAccion === 'OBSERVAR_CELO' && <div className="campo-completo iatf-aplicacion-selector"><strong>Celo observado, sin diagnosticar vacía ({accion.retornosCelo.length})</strong>{activos.filter((p) => accion.animales.includes(animalId(p.animal))).map((p) => { const id = animalId(p.animal); return <label key={p._id}><input type="checkbox" checked={accion.retornosCelo.includes(id)} onChange={() => setAccion((actual) => ({ ...actual, retornosCelo: actual.retornosCelo.includes(id) ? actual.retornosCelo.filter((item) => item !== id) : [...actual.retornosCelo, id] }))} /> {etiquetaAnimal(p.animal)}</label>; })}</div>}
      {accion.tipo === 'iatf' && <div className="campo-completo iatf-aplicacion-selector"><strong>Animales a inseminar ({accion.animales.length})</strong>{pendientesInseminacion.map((p) => <label key={p._id}><input type="checkbox" checked={accion.animales.some((item) => item._id === p._id)} onChange={() => setAccion((actual) => ({ ...actual, animales: actual.animales.some((item) => item._id === p._id) ? actual.animales.filter((item) => item._id !== p._id) : [...actual.animales, p] }))} /> {etiquetaAnimal(p.animal)}</label>)}</div>}
    </div><div className="modal-actions"><button className="boton-link" onClick={() => setAccion(null)}>Cancelar</button><button className="boton-primario" disabled={guardando || accion.animales.length === 0 || (accion.tipo === 'iatf' && !accion.semen)} onClick={enviarAccion}>{guardando ? 'Registrando...' : 'Registrar ejecución real'}</button></div></section></div>}
  </section>;
};

const IATF = ({ soloLectura = false, rolUsuario = 'Consulta' }) => {
  const { tieneFeature } = usePlan();
  const permisos = {
    configurar: !soloLectura && ['Administrador', 'Veterinario'].includes(rolUsuario),
    crear: !soloLectura && ['Administrador', 'Veterinario'].includes(rolUsuario),
    ejecutar: !soloLectura && ['Administrador', 'Veterinario', 'Encargado'].includes(rolUsuario),
    diagnosticar: !soloLectura && ['Administrador', 'Veterinario'].includes(rolUsuario)
  };
  const [tab, setTab] = useState('campanas');
  const [datos, setDatos] = useState({ campanas: [], protocolos: [], insumos: [], lotes: [], animales: [], usuarios: [], consolidado: null });
  const [detalle, setDetalle] = useState(null);
  const [modal, setModal] = useState('');
  const [protocoloEdicion, setProtocoloEdicion] = useState(null);
  const [duplicandoProtocolo, setDuplicandoProtocolo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    try {
      setError('');
      const [campanas, protocolos, insumos, lotes, animales, usuarios, consolidado] = await Promise.all([obtenerCampanasIATF(), obtenerProtocolosIATF(), obtenerInsumosIATF(), obtenerLotes({ especie: 'Bovino', estado: 'ACTIVO' }), obtenerAnimales({ especie: 'Bovino' }), obtenerUsuariosAsignables('IATF'), tieneFeature('reportesMultiFinca') ? obtenerConsolidadoIATF() : Promise.resolve(null)]);
      setDatos({ campanas, protocolos, insumos, lotes, animales, usuarios, consolidado });
      if (detalle?._id) setDetalle(await obtenerCampanaIATF(detalle._id));
    } catch (e) { setError(e.message); } finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []);
  const guardar = async (fn) => { try { setGuardando(true); setError(''); await fn(); setModal(''); await cargar(); } catch (e) { setError(e.message); } finally { setGuardando(false); } };
  const campañasFilas = useMemo(() => datos.campanas.map((c) => ({ ...c, inseminadas: c.participantes?.filter((p) => Boolean(p.fechaInseminacion)).length || 0, prenadas: c.participantes?.filter((p) => p.resultadoActual === 'PREÑADA').length || 0 })), [datos.campanas]);

  if (detalle) return <DetalleCampana campana={detalle} insumos={datos.insumos} permisos={permisos} onCerrar={() => setDetalle(null)} setError={setError} onRecargar={async () => { const actualizado = await obtenerCampanaIATF(detalle._id); setDetalle(actualizado); await cargar(); }} />;
  return <section className="iatf-panel">
    <div className="panel-title"><div><p className="eyebrow">Reproducción avanzada</p><h2>IATF</h2><p>Protocolos veterinarios configurables y ejecución trazable.</p></div><div className="iatf-toolbar">{permisos.configurar && <button onClick={() => setModal('inventario')}>Inventario reproductivo</button>}{tab === 'campanas' ? permisos.crear && <button className="boton-primario" onClick={() => setModal('campana')}>Nueva campaña</button> : permisos.configurar && <button className="boton-primario" onClick={() => { setProtocoloEdicion(null); setDuplicandoProtocolo(false); setModal('protocolo'); }}>Nuevo protocolo</button>}</div></div>
    {error && <div className="alerta-formulario">{error}</div>}
    <nav className="sanidad-tabs iatf-tabs"><button className={tab === 'campanas' ? 'activo' : ''} onClick={() => setTab('campanas')}>Campañas</button><button className={tab === 'protocolos' ? 'activo' : ''} onClick={() => setTab('protocolos')}>Protocolos</button></nav>
    {cargando ? <p>Cargando IATF...</p> : tab === 'campanas' ? <><div className="table-scroll"><table><thead><tr><th>Campaña</th><th>Protocolo</th><th>Inicio</th><th>Animales</th><th>Inseminadas</th><th>Preñadas</th><th>P/AI</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{campañasFilas.map((c) => { const pai = c.inseminadas ? ((c.prenadas / c.inseminadas) * 100).toFixed(1) : '0.0'; return <tr key={c._id}><td>{c.nombre}</td><td>{c.protocolo?.nombre || c.protocoloSnapshot?.nombre}</td><td>{formatoFechaHora(c.fechaHoraInicio)}</td><td>{c.participantes?.length || 0}</td><td>{c.inseminadas}</td><td>{c.prenadas}</td><td>{pai}%</td><td><span className={`estado-badge iatf-estado-${c.estado}`}>{c.estado}</span></td><td><button onClick={async () => setDetalle(await obtenerCampanaIATF(c._id))}>Ver detalle</button></td></tr>; })}{!campañasFilas.length && <tr><td colSpan="9">Todavía no hay campañas IATF.</td></tr>}</tbody></table></div>{datos.consolidado && <section className="iatf-consolidado"><div><p className="eyebrow">Premium multi-finca</p><h3>Resultados observados consolidados</h3><p>P/AI ponderada: <strong>{datos.consolidado.pAI}%</strong> · {datos.consolidado.prenadas} preñadas / {datos.consolidado.inseminadas} inseminadas</p></div><div className="table-scroll"><table><thead><tr><th>Finca</th><th>Campañas</th><th>Inseminadas</th><th>Preñadas</th><th>P/AI</th><th>Costos por moneda</th></tr></thead><tbody>{datos.consolidado.porFinca.map((fila) => <tr key={fila.fincaId}><td>{fila.finca?.nombre || fila.fincaId}</td><td>{fila.campanas}</td><td>{fila.inseminadas}</td><td>{fila.prenadas}</td><td>{fila.pAI}%</td><td>{Object.entries(fila.costosPorMoneda || {}).map(([moneda, monto]) => formatoMoneda(monto, moneda)).join(' + ') || '--'}</td></tr>)}</tbody></table></div></section>}</> : <div className="iatf-protocolos-grid">{datos.protocolos.map((p) => <article key={p._id}><header><span>Versión {p.version}</span><span>{p.activo ? 'Activo' : 'Inactivo'}</span></header><h3>{p.nombre}</h3><p>{p.descripcion || 'Sin descripción'}</p><dl><div><dt>Pasos</dt><dd>{p.pasos.length}</dd></div><div><dt>CC</dt><dd>{p.escalaCondicionCorporal}</dd></div><div><dt>Posparto</dt><dd>{p.diasPostpartoMinimosRecomendados ?? '--'} días</dd></div></dl>{permisos.configurar && <div className="iatf-protocolo-acciones"><button type="button" onClick={() => { setProtocoloEdicion(p); setDuplicandoProtocolo(false); setModal('protocolo'); }} disabled={p.alcance === 'SISTEMA'}>Editar</button><button type="button" onClick={() => { setProtocoloEdicion({ ...p, nombre: `${p.nombre} - copia` }); setDuplicandoProtocolo(true); setModal('protocolo'); }}>Duplicar</button></div>}</article>)}{!datos.protocolos.length && <p>No hay protocolos configurados. Crea una estructura aprobada por el profesional responsable.</p>}</div>}
    {modal === 'protocolo' && <FormularioProtocolo key={`${protocoloEdicion?._id || 'nuevo'}-${duplicandoProtocolo}`} inicial={protocoloEdicion} esDuplicado={duplicandoProtocolo} insumos={datos.insumos} guardando={guardando} onCerrar={() => setModal('')} onGuardar={(form) => guardar(() => protocoloEdicion && !duplicandoProtocolo ? actualizarProtocoloIATF(protocoloEdicion._id, form) : crearProtocoloIATF(form))} />}
    {modal === 'campana' && <FormularioCampana {...datos} guardando={guardando} onCerrar={() => setModal('')} onGuardar={(form) => guardar(() => crearCampanaIATF(form))} />}
    {modal === 'inventario' && <InventarioIATF insumos={datos.insumos} guardando={guardando} onCerrar={() => setModal('')} onGuardar={(form) => guardar(() => crearInsumoIATF(form))} />}
  </section>;
};

export default IATF;
