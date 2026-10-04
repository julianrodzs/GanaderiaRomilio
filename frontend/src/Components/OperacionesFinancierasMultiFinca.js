import React, { useEffect, useMemo, useState } from 'react';
import {
  crearGastoCompartido,
  crearTransferenciaFinancieraInterna,
  obtenerCatalogosFinancieros,
  obtenerFincas,
  obtenerOperacionesFinancierasMultiFinca
} from '../services/api';
import { ContenidoPaginado } from './PaginacionTabla';

const fechaHoy = () => new Date().toISOString().slice(0, 10);
const baseTransferencia = { fincaDestino: '', fecha: fechaHoy(), monto: '', moneda: 'CRC', descripcion: '', metodoPago: '', observaciones: '' };
const baseGasto = { fecha: fechaHoy(), montoTotal: '', moneda: 'CRC', categoria: '', producto: '', descripcion: '', proveedor: '', destinoUso: '', metodoPago: '', modo: 'IGUAL' };
const dinero = (valor, moneda = 'CRC') => new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-CR', { style: 'currency', currency: moneda, maximumFractionDigits: moneda === 'USD' ? 2 : 0 }).format(valor || 0);

const OperacionesFinancierasMultiFinca = ({ onCerrar, onActualizado }) => {
  const [fincas, setFincas] = useState([]);
  const [catalogos, setCatalogos] = useState({ categorias: [], destinosUso: [] });
  const [movimientos, setMovimientos] = useState([]);
  const [transferencia, setTransferencia] = useState(baseTransferencia);
  const [gasto, setGasto] = useState(baseGasto);
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [valores, setValores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const cargar = async () => {
    try {
      const [fincasData, catalogosData, movimientosData] = await Promise.all([
        obtenerFincas(), obtenerCatalogosFinancieros(), obtenerOperacionesFinancierasMultiFinca()
      ]);
      setFincas(fincasData.filter((item) => item.estado === 'Activa'));
      setCatalogos(catalogosData);
      setMovimientos(movimientosData);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { cargar(); }, []);
  const fincaActiva = useMemo(() => fincas.find((item) => item.esActiva), [fincas]);

  const registrarTransferencia = async (evento) => {
    evento.preventDefault();
    try {
      setGuardando(true); setError(''); setMensaje('');
      await crearTransferenciaFinancieraInterna(transferencia);
      setTransferencia(baseTransferencia);
      setMensaje('Transferencia registrada como salida y entrada enlazadas.');
      await cargar(); await onActualizado?.();
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  };

  const alternarFinca = (id) => setSeleccionadas((actuales) => actuales.includes(id) ? actuales.filter((item) => item !== id) : [...actuales, id]);

  const registrarGasto = async (evento) => {
    evento.preventDefault();
    if (!seleccionadas.length) return setError('Selecciona al menos una finca.');
    const distribucion = seleccionadas.map((fincaId) => ({
      fincaId,
      ...(gasto.modo === 'PORCENTAJE' ? { porcentaje: valores[fincaId] } : {}),
      ...(gasto.modo === 'MONTO' ? { monto: valores[fincaId] } : {})
    }));
    try {
      setGuardando(true); setError(''); setMensaje('');
      await crearGastoCompartido({ ...gasto, distribucion });
      setGasto(baseGasto); setSeleccionadas([]); setValores({});
      setMensaje('El gasto quedó distribuido sin duplicar el monto consolidado.');
      await cargar(); await onActualizado?.();
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  };

  return (
    <section className="finanzas-page operaciones-multifinca-page">
      <div className="panel-title"><div><p className="eyebrow">Multi-finca</p><h2>Operaciones financieras internas</h2></div><button className="boton-link" type="button" onClick={onCerrar}>Volver</button></div>
      {error && <div className="alerta-formulario">{error}</div>}
      {mensaje && <p className="form-message">{mensaje}</p>}
      <div className="operaciones-multifinca-grid">
        <form className="finanzas-panel" onSubmit={registrarTransferencia}>
          <div className="panel-title compacto"><div><p className="eyebrow">Movimiento interno</p><h3>Transferencia entre fincas</h3></div></div>
          <p className="texto-ayuda">La salida y la entrada quedan visibles por finca, pero se eliminan del resultado consolidado.</p>
          <div className="form-grid">
            <label>Origen<input disabled value={fincaActiva ? `${fincaActiva.codigo} · ${fincaActiva.nombre}` : 'Finca activa'} /></label>
            <label>Destino<select required value={transferencia.fincaDestino} onChange={(e) => setTransferencia((actual) => ({ ...actual, fincaDestino: e.target.value }))}><option value="">Seleccionar</option>{fincas.filter((item) => !item.esActiva).map((item) => <option key={item._id} value={item._id}>{item.codigo} · {item.nombre}</option>)}</select></label>
            <label>Fecha<input required type="date" value={transferencia.fecha} onChange={(e) => setTransferencia((actual) => ({ ...actual, fecha: e.target.value }))} /></label>
            <label>Monto<input required min="0.01" step="0.01" type="number" value={transferencia.monto} onChange={(e) => setTransferencia((actual) => ({ ...actual, monto: e.target.value }))} /></label>
            <label>Moneda<select value={transferencia.moneda} onChange={(e) => setTransferencia((actual) => ({ ...actual, moneda: e.target.value }))}><option>CRC</option><option>USD</option></select></label>
            <label>Método de pago<input value={transferencia.metodoPago} onChange={(e) => setTransferencia((actual) => ({ ...actual, metodoPago: e.target.value }))} /></label>
          </div>
          <label>Descripción<input required value={transferencia.descripcion} onChange={(e) => setTransferencia((actual) => ({ ...actual, descripcion: e.target.value }))} /></label>
          <button className="boton-primario" disabled={guardando} type="submit">Registrar transferencia</button>
        </form>

        <form className="finanzas-panel" onSubmit={registrarGasto}>
          <div className="panel-title compacto"><div><p className="eyebrow">Distribución</p><h3>Gasto compartido</h3></div></div>
          <div className="form-grid">
            <label>Fecha<input required type="date" value={gasto.fecha} onChange={(e) => setGasto((actual) => ({ ...actual, fecha: e.target.value }))} /></label>
            <label>Monto total<input required min="0.01" step="0.01" type="number" value={gasto.montoTotal} onChange={(e) => setGasto((actual) => ({ ...actual, montoTotal: e.target.value }))} /></label>
            <label>Categoría<select required value={gasto.categoria} onChange={(e) => setGasto((actual) => ({ ...actual, categoria: e.target.value }))}><option value="">Seleccionar</option>{(catalogos.categorias || []).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Destino de uso<select value={gasto.destinoUso} onChange={(e) => setGasto((actual) => ({ ...actual, destinoUso: e.target.value }))}><option value="">Sin destino</option>{(catalogos.destinosUso || []).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Producto<input value={gasto.producto} onChange={(e) => setGasto((actual) => ({ ...actual, producto: e.target.value }))} /></label>
            <label>Proveedor<input value={gasto.proveedor} onChange={(e) => setGasto((actual) => ({ ...actual, proveedor: e.target.value }))} /></label>
            <label>Distribución<select value={gasto.modo} onChange={(e) => setGasto((actual) => ({ ...actual, modo: e.target.value }))}><option value="IGUAL">Partes iguales</option><option value="PORCENTAJE">Por porcentaje</option><option value="MONTO">Por monto</option></select></label>
            <label>Moneda<select value={gasto.moneda} onChange={(e) => setGasto((actual) => ({ ...actual, moneda: e.target.value }))}><option>CRC</option><option>USD</option></select></label>
          </div>
          <label>Descripción<input required value={gasto.descripcion} onChange={(e) => setGasto((actual) => ({ ...actual, descripcion: e.target.value }))} /></label>
          <fieldset className="distribucion-fincas"><legend>Fincas participantes</legend>{fincas.map((finca) => <label key={finca._id}><input type="checkbox" checked={seleccionadas.includes(finca._id)} onChange={() => alternarFinca(finca._id)} /><span>{finca.codigo} · {finca.nombre}</span>{seleccionadas.includes(finca._id) && gasto.modo !== 'IGUAL' && <input required min="0.01" step="0.01" type="number" value={valores[finca._id] || ''} onChange={(e) => setValores((actual) => ({ ...actual, [finca._id]: e.target.value }))} placeholder={gasto.modo === 'PORCENTAJE' ? '%' : 'Monto'} />}</label>)}</fieldset>
          <button className="boton-primario" disabled={guardando} type="submit">Distribuir gasto</button>
        </form>
      </div>

      <section className="finanzas-panel"><div className="panel-title compacto"><div><p className="eyebrow">Trazabilidad</p><h3>Operaciones multi-finca recientes</h3></div></div>
        <ContenidoPaginado datos={movimientos} clavePaginacion="finanzas-multifinca">
          {(pagina) => <div className="tabla-scroll tabla-dinamica"><table><thead><tr><th>Fecha</th><th>Finca</th><th>Tipo</th><th>Naturaleza</th><th>Descripción</th><th>Monto</th></tr></thead><tbody>{pagina.map((item) => <tr key={item._id}><td>{new Date(item.fecha).toLocaleDateString('es-CR')}</td><td>{item.fincaId?.codigo || '--'}</td><td>{item.alcanceFinanciero === 'TRANSFERENCIA_INTERNA' ? 'Transferencia interna' : 'Gasto compartido'}</td><td>{item.naturaleza}</td><td>{item.descripcion}</td><td>{dinero(item.monto, item.moneda)}</td></tr>)}</tbody></table></div>}
        </ContenidoPaginado>
      </section>
    </section>
  );
};

export default OperacionesFinancierasMultiFinca;
