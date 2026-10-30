import React, { useEffect, useMemo, useState } from 'react';
import { obtenerAnimales, obtenerBancoSemen, obtenerFichaSemen, registrarEntradaSemen, trasladarSemen, ajustarSemen, obtenerVentasPajillas, obtenerResumenPajillas, crearVentaPajillas, anularVentaPajillas, asignarSemenCampana, devolverSemenCampana, crearClaveIdempotencia } from '../services/api';
import { ContenidoPaginado } from './PaginacionTabla';
import './BancoSemen.css';

const hoy = () => new Date().toISOString().slice(0, 10);
const clave = crearClaveIdempotencia;
const numero = (n) => new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(n || 0);
const importe = (n, moneda) => `${moneda} ${numero(n)}`;
const etiqueta = (f) => `${f.nombreSemental} · DIIO ${f.diio || '--'} · ${f.raza || '--'}`;
const entradaInicial = () => ({ esExterno: true, toroId: '', fichaSemenId: '', nombreSemental: '', diio: '', raza: '', especie: 'Bovino', tipoSemen: 'CONVENCIONAL', origen: 'COMPRA', fecha: hoy(), cantidad: '', destino: 'TODO_REPRODUCTIVO', cantidadReproductiva: '', cantidadComercial: '', costoUnitario: '', moneda: 'CRC', loteProveedor: '', canastillaTermo: '', movimientoFinancieroId: '', claveIdempotencia: clave() });

export const AsignarSemenCampana = ({ campana, onCerrar, onGuardado, puedeAgregar = false }) => {
  const [fichas, setFichas] = useState([]), [seleccion, setSeleccion] = useState({});
  const [error, setError] = useState(''), [guardando, setGuardando] = useState(false), [entrada, setEntrada] = useState(false);
  const [claveAsignacion] = useState(clave);
  const cargar = () => obtenerBancoSemen().then(setFichas).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);
  const enviar = async (e) => {
    e.preventDefault(); setGuardando(true); setError('');
    try {
      const asignaciones = Object.entries(seleccion).filter(([, n]) => Number(n) > 0).map(([key, n]) => { const [fichaSemenId, moneda] = key.split('|'); return { fichaSemenId, moneda, cantidad: Number(n) }; });
      if (!asignaciones.length) throw new Error('Selecciona al menos un semental.');
      await asignarSemenCampana(campana._id, { asignaciones, claveIdempotencia: claveAsignacion });
      await onGuardado(); onCerrar();
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  };
  if (entrada) return <BancoSemen onCerrar={async () => { setEntrada(false); await cargar(); }} permitirEdicion />;
  return <section className="semen-panel"><div className="panel-title"><h3>Asignar semen a {campana.nombre}</h3><button type="button" className="boton-link" onClick={onCerrar}>Volver</button></div>
    {error && <div role="alert" className="alerta-formulario">{error}</div>}
    {puedeAgregar && <button type="button" className="boton-secundario compacto" onClick={() => setEntrada(true)}>Agregar semen al banco</button>}
    <form onSubmit={enviar}><div className="tabla-scroll"><table><thead><tr><th>Semental</th><th>Moneda de costo</th><th>Disponible reproductivo</th><th>Asignar</th></tr></thead><tbody>
      {fichas.filter((f) => f.especie === 'Bovino').flatMap((f) => ['CRC', 'USD'].filter((m) => f.saldos[m].reproductivo > 0).map((m) => { const key = `${f._id}|${m}`; return <tr key={key}><td>{etiqueta(f)}</td><td>{m}</td><td>{numero(f.saldos[m].reproductivo)}</td><td><input aria-label={`Asignar ${f.nombreSemental} ${m}`} type="number" min="0" max={f.saldos[m].reproductivo} step="1" value={seleccion[key] || ''} onChange={(e) => setSeleccion({ ...seleccion, [key]: e.target.value })} disabled={guardando} /></td></tr>; }))}
    </tbody></table></div><div className="form-actions"><button className="boton-primario" disabled={guardando}>{guardando ? 'Asignando...' : 'Asignar seleccion'}</button><button type="button" className="boton-secundario" disabled={guardando} onClick={async () => { if (!window.confirm('Devolver todo el semen no utilizado a la gaveta reproductiva?')) return; setGuardando(true); try { await devolverSemenCampana(campana._id); await onGuardado(); onCerrar(); } catch (e) { setError(e.message); } finally { setGuardando(false); } }}>Devolver sobrantes</button></div></form>
  </section>;
};

const BancoSemen = ({ comercial = false, permitirEdicion = false, onCerrar }) => {
  const [fichas, setFichas] = useState([]), [ventas, setVentas] = useState([]), [animales, setAnimales] = useState([]);
  const [cargando, setCargando] = useState(true), [guardando, setGuardando] = useState(false), [error, setError] = useState(''), [aviso, setAviso] = useState('');
  const [modo, setModo] = useState(''), [ficha, setFicha] = useState(null), [detalle, setDetalle] = useState(null), [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState(entradaInicial);
  const [ingresos, setIngresos] = useState({ CRC: 0, USD: 0 });
  const cargar = async () => {
    setCargando(true);
    try {
      const [b, v, resumen] = await Promise.all([obtenerBancoSemen(comercial), comercial ? obtenerVentasPajillas() : Promise.resolve([]), comercial ? obtenerResumenPajillas() : Promise.resolve({ CRC: 0, USD: 0 })]);
      setFichas(b); setVentas(v); setIngresos(resumen);
    } catch (e) { setError(e.message); } finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, [comercial]);
  const filas = useMemo(() => fichas.filter((f) => `${f.nombreSemental} ${f.diio || ''} ${f.raza || ''}`.toLowerCase().includes(busqueda.toLowerCase())), [fichas, busqueda]);
  const campo = (nombre, valor) => setForm((f) => ({ ...f, [nombre]: valor }));
  const abrir = async (accion, f = null) => {
    setError(''); setAviso(''); setFicha(f); setModo(accion); setDetalle(null);
    setForm({ ...entradaInicial(), fichaSemenId: f?._id || '', comprador: '', precioUnitario: '', motivo: '', direccion: comercial ? 'COMERCIAL_A_REPRODUCTIVO' : 'REPRODUCTIVO_A_COMERCIAL', gaveta: comercial ? 'COMERCIAL' : 'REPRODUCTIVO', operacion: 'MERMA', monedaStock: ['CRC', 'USD'].find((m) => f?.saldos[m]?.comercial > 0) || 'CRC' });
    if (accion === 'entrada') {
      try { setAnimales((await obtenerAnimales()).filter((a) => a.sexo === 'Macho' && a.estado === 'Activo')); } catch (e) { setError(e.message); }
    }
  };
  const guardar = async (e) => {
    e.preventDefault(); setGuardando(true); setError('');
    try {
      if (modo === 'entrada') {
        const { comprador, precioUnitario, motivo, direccion, gaveta, operacion, monedaStock, ...datos } = form;
        if (!datos.fichaSemenId) delete datos.fichaSemenId;
        if (!datos.toroId || datos.esExterno) delete datos.toroId;
        if (!datos.movimientoFinancieroId) delete datos.movimientoFinancieroId;
        await registrarEntradaSemen(datos);
      } else if (modo === 'venta') await crearVentaPajillas({ fichaSemenId: ficha._id, comprador: form.comprador, cantidad: form.cantidad, precioUnitario: form.precioUnitario, moneda: form.moneda, monedaStock: form.monedaStock, fecha: form.fecha, claveIdempotencia: form.claveIdempotencia });
      else if (modo === 'traslado') await trasladarSemen(ficha._id, { direccion: form.direccion, cantidad: form.cantidad, moneda: form.moneda, motivo: form.motivo, claveIdempotencia: form.claveIdempotencia }, comercial);
      else await ajustarSemen(ficha._id, { gaveta: form.gaveta, operacion: form.operacion, cantidad: form.cantidad, moneda: form.moneda, costoUnitario: form.costoUnitario, motivo: form.motivo, claveIdempotencia: form.claveIdempotencia }, comercial);
      setModo(''); setAviso('Operacion registrada.'); await cargar();
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  };
  const limite = modo === 'venta' ? ficha?.saldos[form.monedaStock]?.comercial : modo === 'traslado' ? ficha?.saldos[form.moneda]?.[form.direccion === 'REPRODUCTIVO_A_COMERCIAL' ? 'reproductivo' : 'comercial'] : undefined;
  return <section className="semen-panel" aria-busy={guardando || cargando}>
    <div className="panel-title"><div><p className="eyebrow">{comercial ? 'Ventas' : 'Reproduccion'}</p><h2>{comercial ? 'Pajillas' : 'Banco de semen'}</h2></div><div className="panel-actions">{onCerrar && <button type="button" className="boton-link" onClick={onCerrar}>Volver</button>}{!comercial && permitirEdicion && !modo && <button className="boton-primario" type="button" onClick={() => abrir('entrada')}>Nueva entrada</button>}</div></div>
    {error && <div className="alerta-formulario" role="alert">{error}</div>}{aviso && <p role="status">{aviso}</p>}
    {modo ? <form className="semen-form" onSubmit={guardar}><h3>{({ entrada: 'Entrada al banco', venta: 'Venta de pajillas', traslado: 'Traslado entre gavetas', ajuste: 'Ajuste de existencias' })[modo]}</h3>
      {ficha && <p>{etiqueta(ficha)}</p>}
      <div className="form-grid">
      {modo === 'entrada' && <>
        <label>Ficha existente<select value={form.fichaSemenId} onChange={(e) => campo('fichaSemenId', e.target.value)}><option value="">Nuevo semental</option>{fichas.map((f) => <option key={f._id} value={f._id}>{etiqueta(f)}</option>)}</select></label>
        {!form.fichaSemenId && <><label>Origen del semental<select value={form.esExterno ? 'EXTERNO' : 'FINCA'} onChange={(e) => campo('esExterno', e.target.value === 'EXTERNO')}><option value="EXTERNO">Semental externo</option><option value="FINCA">Macho de la finca</option></select></label>{form.esExterno ? <><label>Nombre del semental<input required value={form.nombreSemental} onChange={(e) => campo('nombreSemental', e.target.value)} /></label><label>DIIO<input value={form.diio} onChange={(e) => campo('diio', e.target.value)} /></label><label>Raza<input value={form.raza} onChange={(e) => campo('raza', e.target.value)} /></label><label>Especie<select value={form.especie} onChange={(e) => campo('especie', e.target.value)}><option>Bovino</option><option>Porcino</option></select></label></> : <label>Semental de la finca<select required value={form.toroId} onChange={(e) => { const a = animales.find((x) => x._id === e.target.value); setForm({ ...form, toroId: e.target.value, nombreSemental: a?.nombre || '', diio: a?.diio || a?.identificadorFinca || '', raza: a?.raza || '', especie: a?.especie || 'Bovino' }); }}><option value="">Seleccionar</option>{animales.map((a) => <option key={a._id} value={a._id}>{a.nombre || '--'} · DIIO {a.diio || a.identificadorFinca}</option>)}</select></label>}<label>Tipo de semen<select value={form.tipoSemen} onChange={(e) => campo('tipoSemen', e.target.value)}><option>CONVENCIONAL</option><option>SEXADO</option><option>OTRO</option></select></label>{!form.esExterno && form.toroId && <p className="semen-datos-semental">DIIO {form.diio} · {form.raza || '--'} · {form.especie}</p>}</>}
        <label>Origen de entrada<select value={form.origen} onChange={(e) => campo('origen', e.target.value)}><option value="COMPRA">Compra</option><option value="COLECTA_PROPIA">Colecta propia</option></select></label>
        <label>Destino<select value={form.destino} onChange={(e) => campo('destino', e.target.value)}><option value="TODO_REPRODUCTIVO">Todo reproductivo / IATF</option><option value="TODO_COMERCIAL">Todo venta</option><option value="DIVIDIR">Dividir</option></select></label>
        {form.destino === 'DIVIDIR' && <><label>Reproductiva<input type="number" required min="0" step="1" value={form.cantidadReproductiva} onChange={(e) => campo('cantidadReproductiva', e.target.value)} /></label><label>Comercial<input type="number" required min="0" step="1" value={form.cantidadComercial} onChange={(e) => campo('cantidadComercial', e.target.value)} /></label></>}
        <label>Lote del proveedor<input value={form.loteProveedor} onChange={(e) => campo('loteProveedor', e.target.value)} /></label><label>Canastilla / termo<input value={form.canastillaTermo} onChange={(e) => campo('canastillaTermo', e.target.value)} /></label>
      </>}
      {modo === 'venta' && <><label>Comprador<input required value={form.comprador} onChange={(e) => campo('comprador', e.target.value)} /></label><label>Precio unitario<input type="number" min="0" step="0.01" required value={form.precioUnitario} onChange={(e) => campo('precioUnitario', e.target.value)} /></label><label>Moneda de costo del stock<select value={form.monedaStock} onChange={(e) => campo('monedaStock', e.target.value)}>{['CRC', 'USD'].map((m) => <option key={m}>{m}</option>)}</select></label></>}
      {modo === 'traslado' && <label>Direccion<select value={form.direccion} onChange={(e) => campo('direccion', e.target.value)}><option value="REPRODUCTIVO_A_COMERCIAL">Reproductiva a comercial</option><option value="COMERCIAL_A_REPRODUCTIVO">Comercial a reproductiva</option></select></label>}
      {modo === 'ajuste' && <><label>Gaveta<select value={form.gaveta} onChange={(e) => campo('gaveta', e.target.value)}><option value="REPRODUCTIVO">Reproductiva</option><option value="COMERCIAL">Comercial</option></select></label><label>Operacion<select value={form.operacion} onChange={(e) => campo('operacion', e.target.value)}><option value="MERMA">Merma / salida justificada</option><option value="ENTRADA">Entrada por ajuste</option></select></label></>}
      <label>Cantidad<input type="number" min="1" step="1" required max={limite} value={form.cantidad} onChange={(e) => campo('cantidad', e.target.value)} />{limite != null && <small>Disponible: {numero(limite)}</small>}</label>
      <label>{modo === 'venta' ? 'Moneda de venta' : 'Moneda de costo'}<select value={form.moneda} onChange={(e) => campo('moneda', e.target.value)}><option>CRC</option><option>USD</option></select></label>
      {(modo === 'entrada' || modo === 'ajuste' && form.operacion === 'ENTRADA') && <label>Costo unitario<input type="number" min="0" step="0.01" value={form.costoUnitario} onChange={(e) => campo('costoUnitario', e.target.value)} /></label>}
      {['entrada', 'venta'].includes(modo) && <label>Fecha<input type="date" required value={form.fecha} onChange={(e) => campo('fecha', e.target.value)} /></label>}
      {['traslado', 'ajuste'].includes(modo) && <label>Motivo<textarea required value={form.motivo} onChange={(e) => campo('motivo', e.target.value)} /></label>}
      </div><div className="form-actions"><button className="boton-link" type="button" disabled={guardando} onClick={() => setModo('')}>Cancelar</button><button className="boton-primario" disabled={guardando}>{guardando ? 'Guardando...' : 'Registrar'}</button></div></form> : <>
      {comercial && <dl className="semen-resumen"><div><dt>Ingresos del mes CRC</dt><dd>{importe(ingresos.CRC, 'CRC')}</dd></div><div><dt>Ingresos del mes USD</dt><dd>{importe(ingresos.USD, 'USD')}</dd></div></dl>}
      <label className="semen-buscador">Semental / DIIO / raza<input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></label>
      {cargando && <p role="status">Cargando existencias...</p>}
      {!cargando && <TablaBanco filas={filas} comercial={comercial} permitirEdicion={permitirEdicion} abrir={abrir} ver={async (f) => { try { setDetalle(await obtenerFichaSemen(f._id, comercial)); } catch (e) { setError(e.message); } }} />}
      {detalle && <section className="semen-detalle"><div className="panel-title"><h3>{etiqueta(detalle.ficha)}</h3><button className="boton-link" type="button" onClick={() => setDetalle(null)}>Cerrar detalle</button></div><dl className="semen-resumen">{[['Ingresadas','totalIngresado'], ['Reproductiva','stockReproductivo'], ['Comercial','stockComercial'], ['En campanas','asignadoCampanas'], ['Usadas','totalUsadasIATF'], ['Vendidas','totalVendidas'], ['Mermas','totalMermas']].map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{numero(detalle.ficha[key])}</dd></div>)}</dl><ContenidoPaginado datos={detalle.movimientos} clavePaginacion={`semen-movimientos-${detalle.ficha._id}`}>{(pagina) => <div className="tabla-scroll"><table><thead><tr><th>Fecha</th><th>Movimiento</th><th>Origen / destino</th><th>Cantidad</th><th>Moneda</th><th>Motivo</th></tr></thead><tbody>{pagina.map((m) => <tr key={m._id}><td>{new Date(m.createdAt).toLocaleDateString('es-CR')}</td><td>{m.tipo}</td><td>{m.origen} / {m.destino}</td><td>{numero(m.cantidad)}</td><td>{m.moneda}</td><td>{m.motivo || '--'}</td></tr>)}</tbody></table></div>}</ContenidoPaginado></section>}
      {comercial && <section className="semen-historial"><h3>Historial de ventas</h3><ContenidoPaginado datos={ventas} clavePaginacion="ventas-pajillas">{(pagina) => <div className="tabla-scroll"><table><thead><tr><th>Fecha</th><th>Semental / DIIO</th><th>Comprador</th><th>Cantidad</th><th>Monto</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{pagina.map((v) => <tr key={v._id}><td>{new Date(v.fecha).toLocaleDateString('es-CR')}</td><td>{v.nombreSemental} · {v.diio || '--'}</td><td>{v.comprador}</td><td>{numero(v.cantidad)}</td><td>{importe(v.montoTotal, v.moneda)}</td><td>{v.estado}</td><td>{permitirEdicion && v.estado === 'Completada' && <button type="button" title="Anular venta" aria-label="Anular venta" disabled={guardando} onClick={async () => { const motivo = window.prompt('Motivo de anulacion'); if (!motivo?.trim()) return; setGuardando(true); try { await anularVentaPajillas(v._id, motivo); await cargar(); } catch (e) { setError(e.message); } finally { setGuardando(false); } }}>&#10005;</button>}</td></tr>)}</tbody></table></div>}</ContenidoPaginado></section>}
    </>}
  </section>;
};

const TablaBanco = ({ filas, comercial, permitirEdicion, abrir, ver }) => <ContenidoPaginado datos={filas} clavePaginacion={`banco-semen-${comercial ? 'venta' : 'reproductivo'}`}>{(pagina) => <div className="tabla-scroll"><table><thead><tr><th>Semental</th><th>DIIO</th><th>Especie</th><th>Raza</th><th>Reproductiva</th><th>Comercial</th><th>En campanas</th><th>Acciones</th></tr></thead><tbody>{pagina.map((f) => <tr key={f._id}><td>{f.nombreSemental}</td><td>{f.diio || '--'}</td><td>{f.especie}</td><td>{f.raza || '--'}</td><td>{numero(f.stockReproductivo)}</td><td>{numero(f.stockComercial)}</td><td>{numero(f.asignadoCampanas)}</td><td><div className="acciones-tabla"><button type="button" title="Ver ficha y movimientos" onClick={() => ver(f)}>Ver</button>{permitirEdicion && <>{comercial && <button type="button" title="Vender pajillas" aria-label="Vender pajillas" disabled={!f.stockComercial} onClick={() => abrir('venta', f)}>$</button>}<button type="button" title="Trasladar entre gavetas" aria-label="Trasladar entre gavetas" onClick={() => abrir('traslado', f)}>&#8644;</button><button type="button" title="Ajustar existencias" aria-label="Ajustar existencias" onClick={() => abrir('ajuste', f)}>&#177;</button></>}</div></td></tr>)}{!pagina.length && <tr><td colSpan="8">Sin existencias registradas.</td></tr>}</tbody></table></div>}</ContenidoPaginado>;

export default BancoSemen;
