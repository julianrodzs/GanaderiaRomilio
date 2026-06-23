import React, { useEffect, useMemo, useState } from 'react';
import {
  actualizarCompraAnimal,
  anularCompraAnimal,
  crearCompraAnimal,
  eliminarCompraAnimal,
  obtenerCompras,
  obtenerResumenCompras,
  API_URL
} from '../services/api';
import { obtenerRangoMesActual } from '../utils/fechas';

const fechaHoy = () => new Date().toISOString().slice(0, 10);

const animalInicial = {
  identificadorFinca: '',
  diio: '',
  nombre: '',
  sexo: 'Hembra',
  raza: '',
  fechaNacimiento: '',
  pesoCompraKg: '',
  precioKg: '',
  observaciones: ''
};

const estadoInicial = {
  fechaCompra: fechaHoy(),
  proveedor: '',
  identificacionProveedor: '',
  telefonoProveedor: '',
  observaciones: '',
  montoFinal: '',
  animales: [{ ...animalInicial }],
  comprobante: null
};

const formatearFecha = (fecha) => {
  if (!fecha) return '--';
  return new Date(fecha).toLocaleDateString('es-CR', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const formatearMoneda = (valor) => new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  maximumFractionDigits: 0
}).format(valor || 0);

const formatearNumero = (valor) => new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(valor || 0);

const normalizarCompraFormulario = (compra) => ({
  fechaCompra: compra.fechaCompra ? new Date(compra.fechaCompra).toISOString().slice(0, 10) : fechaHoy(),
  proveedor: compra.proveedor || '',
  identificacionProveedor: compra.identificacionProveedor || '',
  telefonoProveedor: compra.telefonoProveedor || '',
  observaciones: compra.observaciones || '',
  montoFinal: compra.montoFinal ?? '',
  animales: (compra.animales || []).map((item) => ({
    identificadorFinca: item.identificadorFinca || item.animal?.identificadorFinca || '',
    diio: item.diio || item.animal?.diio || '',
    nombre: item.nombre || item.animal?.nombre || '',
    sexo: item.sexo || item.animal?.sexo || 'Hembra',
    raza: item.raza || item.animal?.raza || '',
    fechaNacimiento: item.fechaNacimiento ? new Date(item.fechaNacimiento).toISOString().slice(0, 10) : '',
    pesoCompraKg: item.pesoCompraKg || '',
    precioKg: item.precioKg || '',
    observaciones: item.observaciones || ''
  })),
  comprobante: null
});

const Compras = () => {
  const [compras, setCompras] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [filtros, setFiltros] = useState({ ...obtenerRangoMesActual(), proveedor: '', estado: '' });
  const [formulario, setFormulario] = useState(estadoInicial);
  const [compraSeleccionada, setCompraSeleccionada] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [modoFormulario, setModoFormulario] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');

  const cargarDatos = async () => {
    try {
      setCargando(true);
      setError('');
      const [comprasData, resumenData] = await Promise.all([
        obtenerCompras(filtros),
        obtenerResumenCompras({ fechaInicio: filtros.fechaInicio, fechaFin: filtros.fechaFin })
      ]);
      setCompras(comprasData);
      setResumen(resumenData);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [filtros.fechaInicio, filtros.fechaFin, filtros.proveedor, filtros.estado]);

  const totalCalculadoFormulario = useMemo(() => {
    return formulario.animales.reduce((total, item) => total + (Number(item.pesoCompraKg || 0) * Number(item.precioKg || 0)), 0);
  }, [formulario.animales]);

  const totalFormulario = useMemo(() => {
    if (formulario.montoFinal !== '' && formulario.montoFinal !== null && formulario.montoFinal !== undefined) {
      return Number(formulario.montoFinal || 0);
    }

    return totalCalculadoFormulario;
  }, [formulario.montoFinal, totalCalculadoFormulario]);

  const pesoFormulario = useMemo(() => {
    return formulario.animales.reduce((total, item) => total + Number(item.pesoCompraKg || 0), 0);
  }, [formulario.animales]);

  const abrirNuevo = () => {
    setCompraSeleccionada(null);
    setFormulario(estadoInicial);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const abrirEdicion = (compra) => {
    setCompraSeleccionada(compra);
    setFormulario(normalizarCompraFormulario(compra));
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const actualizarCampo = (evento) => {
    const { name, value, files } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: files ? files[0] : value }));
  };

  const actualizarAnimal = (indice, campo, valor) => {
    setFormulario((actual) => ({
      ...actual,
      animales: actual.animales.map((item, itemIndice) => (
        itemIndice === indice ? { ...item, [campo]: valor } : item
      ))
    }));
  };

  const agregarAnimal = () => {
    setFormulario((actual) => ({ ...actual, animales: [...actual.animales, { ...animalInicial }] }));
  };

  const quitarAnimal = (indice) => {
    setFormulario((actual) => ({
      ...actual,
      animales: actual.animales.filter((_, itemIndice) => itemIndice !== indice)
    }));
  };

  const guardarCompra = async (evento) => {
    evento.preventDefault();
    try {
      setGuardando(true);
      setErrorFormulario('');
      const payload = {
        ...formulario,
        animales: formulario.animales.map((item) => ({
          ...item,
          identificadorFinca: item.identificadorFinca || item.diio,
          fechaNacimiento: item.fechaNacimiento || null,
          pesoCompraKg: Number(item.pesoCompraKg),
          precioKg: Number(item.precioKg)
        })),
        montoFinal: formulario.montoFinal === '' || formulario.montoFinal === null || formulario.montoFinal === undefined
          ? undefined
          : Number(formulario.montoFinal)
      };

      if (compraSeleccionada?._id) {
        await actualizarCompraAnimal(compraSeleccionada._id, payload);
      } else {
        await crearCompraAnimal(payload);
      }
      setModoFormulario(false);
      setCompraSeleccionada(null);
      await cargarDatos();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const anularCompra = async (compra) => {
    const motivo = window.prompt(`Motivo para anular la compra a ${compra.proveedor}:`, '');
    if (motivo === null) return;
    try {
      await anularCompraAnimal(compra._id, motivo);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const borrarCompra = async (compra) => {
    const confirmar = window.confirm(`¿Eliminar la compra a ${compra.proveedor}? Esto revierte inventario, bitácora y finanzas si los animales no tienen movimientos posteriores.`);
    if (!confirmar) return;
    try {
      await eliminarCompraAnimal(compra._id);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const comprobanteUrl = (url) => {
    if (!url) return '';
    return `${API_URL.replace('/api', '')}${url}`;
  };

  if (modoFormulario) {
    return (
      <section className="vista-tabla ventas-page">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Compras</p>
            <h2>{compraSeleccionada ? 'Editar compra' : 'Nueva compra de animales'}</h2>
          </div>
          <button className="boton-link" type="button" onClick={() => setModoFormulario(false)}>Volver</button>
        </div>

        <form className="form-card venta-form" onSubmit={guardarCompra}>
          {errorFormulario && <div className="alerta-formulario">{errorFormulario}</div>}
          <div className="form-grid">
            <label>Fecha<input type="date" name="fechaCompra" value={formulario.fechaCompra} onChange={actualizarCampo} required /></label>
            <label>Proveedor<input name="proveedor" value={formulario.proveedor} onChange={actualizarCampo} required /></label>
          </div>
          <div className="form-grid">
            <label>Identificación<input name="identificacionProveedor" value={formulario.identificacionProveedor} onChange={actualizarCampo} /></label>
            <label>Teléfono<input name="telefonoProveedor" value={formulario.telefonoProveedor} onChange={actualizarCampo} /></label>
          </div>
          <label>Observaciones<textarea rows="3" name="observaciones" value={formulario.observaciones} onChange={actualizarCampo} /></label>
          <label>Comprobante<input type="file" name="comprobante" accept="image/*,.pdf" onChange={actualizarCampo} /></label>

          <section className="venta-selector">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Animales</p>
                <h2>Ingreso a inventario</h2>
              </div>
              <button className="boton-primario compacto" type="button" onClick={agregarAnimal}>+ Animal</button>
            </div>

            <div className="tabla-scroll tabla-dinamica venta-detalle-tabla">
              <table>
                <thead>
                  <tr>
                    <th>Identificador</th>
                    <th>DIIO</th>
                    <th>Nombre</th>
                    <th>Sexo</th>
                    <th>Raza</th>
                    <th>Nacimiento</th>
                    <th>Peso compra</th>
                    <th>Precio/kg</th>
                    <th>Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {formulario.animales.map((item, indice) => {
                    const subtotal = Number(item.pesoCompraKg || 0) * Number(item.precioKg || 0);
                    return (
                      <tr key={`${indice}-${item.identificadorFinca}`}>
                        <td><input value={item.identificadorFinca} onChange={(evento) => actualizarAnimal(indice, 'identificadorFinca', evento.target.value)} placeholder="Provisional" required /></td>
                        <td><input value={item.diio} onChange={(evento) => actualizarAnimal(indice, 'diio', evento.target.value)} /></td>
                        <td><input value={item.nombre} onChange={(evento) => actualizarAnimal(indice, 'nombre', evento.target.value)} /></td>
                        <td>
                          <select value={item.sexo} onChange={(evento) => actualizarAnimal(indice, 'sexo', evento.target.value)} required>
                            <option value="Hembra">Hembra</option>
                            <option value="Macho">Macho</option>
                          </select>
                        </td>
                        <td><input value={item.raza} onChange={(evento) => actualizarAnimal(indice, 'raza', evento.target.value)} /></td>
                        <td><input type="date" value={item.fechaNacimiento} onChange={(evento) => actualizarAnimal(indice, 'fechaNacimiento', evento.target.value)} /></td>
                        <td><input type="number" min="0.01" step="0.01" value={item.pesoCompraKg} onChange={(evento) => actualizarAnimal(indice, 'pesoCompraKg', evento.target.value)} required /></td>
                        <td><input type="number" min="0.01" step="0.01" value={item.precioKg} onChange={(evento) => actualizarAnimal(indice, 'precioKg', evento.target.value)} required /></td>
                        <td>{formatearMoneda(subtotal)}</td>
                        <td><button className="boton-link" type="button" onClick={() => quitarAnimal(indice)} disabled={formulario.animales.length === 1}>Quitar</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="venta-totales">
              <article><span>Animales</span><strong>{formulario.animales.length}</strong></article>
              <article><span>Peso total</span><strong>{formatearNumero(pesoFormulario)} kg</strong></article>
              <article><span>Total calculado</span><strong>{formatearMoneda(totalCalculadoFormulario)}</strong></article>
              <article>
                <span>Monto final</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formulario.montoFinal}
                  onChange={(evento) => setFormulario((actual) => ({ ...actual, montoFinal: evento.target.value }))}
                  placeholder={String(Math.round(totalCalculadoFormulario || 0))}
                />
              </article>
              <article><span>Total oficial</span><strong>{formatearMoneda(totalFormulario)}</strong></article>
              <article><span>Ajuste</span><strong>{formatearMoneda(totalFormulario - totalCalculadoFormulario)}</strong></article>
            </div>
          </section>

          <div className="form-actions">
            <button className="boton-link" type="button" onClick={() => setModoFormulario(false)}>Cancelar</button>
            <button className="boton-primario compacto" type="submit" disabled={guardando || formulario.animales.length === 0}>
              {guardando ? 'Guardando...' : 'Guardar compra'}
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="vista-tabla ventas-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Compras</p>
          <h2>Compras de animales</h2>
        </div>
        <button className="boton-primario compacto" type="button" onClick={abrirNuevo}>+ Nueva compra</button>
      </div>

      <section className="reportes-metricas">
        <article><span>Total comprado</span><strong>{formatearMoneda(resumen?.totalComprado)}</strong></article>
        <article><span>Kg comprados</span><strong>{formatearNumero(resumen?.totalKgComprados)} kg</strong></article>
        <article><span>Precio prom/kg</span><strong>{formatearMoneda(resumen?.precioPromedioKg)}</strong></article>
        <article><span>Animales comprados</span><strong>{formatearNumero(resumen?.totalAnimalesComprados)}</strong></article>
      </section>

      <div className="tabla-toolbar">
        <input type="date" value={filtros.fechaInicio} onChange={(evento) => setFiltros((actual) => ({ ...actual, fechaInicio: evento.target.value }))} />
        <input type="date" value={filtros.fechaFin} onChange={(evento) => setFiltros((actual) => ({ ...actual, fechaFin: evento.target.value }))} />
        <input value={filtros.proveedor} onChange={(evento) => setFiltros((actual) => ({ ...actual, proveedor: evento.target.value }))} placeholder="Proveedor..." />
        <select value={filtros.estado} onChange={(evento) => setFiltros((actual) => ({ ...actual, estado: evento.target.value }))}>
          <option value="">Todos</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Confirmada">Confirmada</option>
          <option value="Anulada">Anulada</option>
        </select>
        <span>{compras.length} registros</span>
      </div>

      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && <div className="estado-importacion">Cargando compras...</div>}

      <div className="tabla-scroll tabla-dinamica">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Cantidad animales</th>
              <th>Peso total</th>
              <th>Monto total</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {compras.map((compra) => (
              <tr key={compra._id}>
                <td>{formatearFecha(compra.fechaCompra)}</td>
                <td>{compra.proveedor}</td>
                <td>{compra.totalAnimales}</td>
                <td>{formatearNumero(compra.pesoTotalKg)} kg</td>
                <td>{formatearMoneda(compra.montoTotal)}</td>
                <td><span className={`estado-badge estado-${compra.estado}`}>{compra.estado}</span></td>
                <td>
                  <div className="acciones-tabla acciones-tabla-amplia">
                    <button type="button" title="Ver detalle" onClick={() => setDetalle(compra)}>⊙</button>
                    {compra.estado !== 'Anulada' && <button type="button" title="Editar" onClick={() => abrirEdicion(compra)}>✎</button>}
                    {compra.estado !== 'Anulada' && <button type="button" title="Anular" onClick={() => anularCompra(compra)}>↺</button>}
                    <button type="button" title="Eliminar" onClick={() => borrarCompra(compra)}>⌫</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div className="modal-backdrop">
          <section className="modal-panel usuario-modal">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Detalle de compra</p>
                <h2>{detalle.proveedor}</h2>
              </div>
              <button className="boton-link" type="button" onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
            <div className="detalle-animal-grid">
              <article><span>Fecha</span><strong>{formatearFecha(detalle.fechaCompra)}</strong></article>
              <article><span>Estado</span><strong>{detalle.estado}</strong></article>
              <article><span>Teléfono</span><strong>{detalle.telefonoProveedor || '--'}</strong></article>
              <article><span>Identificación</span><strong>{detalle.identificacionProveedor || '--'}</strong></article>
              <article><span>Peso total</span><strong>{formatearNumero(detalle.pesoTotalKg)} kg</strong></article>
              <article><span>Total calculado</span><strong>{formatearMoneda(detalle.montoCalculado)}</strong></article>
              <article><span>Total final</span><strong>{formatearMoneda(detalle.montoTotal)}</strong></article>
              <article><span>Ajuste</span><strong>{formatearMoneda(detalle.ajusteMonto)}</strong></article>
            </div>
            {detalle.observaciones && <div className="detalle-observaciones"><span>Observaciones</span><p>{detalle.observaciones}</p></div>}
            {detalle.comprobanteUrl && (
              <a className="boton-primario compacto venta-comprobante-link" href={comprobanteUrl(detalle.comprobanteUrl)} target="_blank" rel="noreferrer">
                Ver comprobante
              </a>
            )}
            <div className="tabla-scroll tabla-dinamica venta-detalle-tabla">
              <table>
                <thead>
                  <tr><th>DIIO</th><th>Animal</th><th>Sexo</th><th>Peso</th><th>Precio/kg</th><th>Subtotal</th></tr>
                </thead>
                <tbody>
                  {detalle.animales?.map((item, indice) => (
                    <tr key={item.animal?._id || `${item.identificadorFinca}-${indice}`}>
                      <td>{item.animal?.diio || item.diio || item.identificadorFinca || '--'}</td>
                      <td>{item.animal?.nombre || item.nombre || '--'}</td>
                      <td>{item.animal?.sexo || item.sexo || '--'}</td>
                      <td>{formatearNumero(item.pesoCompraKg)} kg</td>
                      <td>{formatearMoneda(item.precioKg)}</td>
                      <td>{formatearMoneda(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

export default Compras;
