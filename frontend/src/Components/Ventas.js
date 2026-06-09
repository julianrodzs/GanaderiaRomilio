import React, { useEffect, useMemo, useState } from 'react';
import {
  actualizarVentaAnimal,
  anularVentaAnimal,
  crearVentaAnimal,
  eliminarVentaAnimal,
  obtenerAnimales,
  obtenerResumenVentas,
  obtenerVentas,
  API_URL
} from '../services/api';

const fechaHoy = () => new Date().toISOString().slice(0, 10);

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

const calcularEdadMeses = (fechaNacimiento) => {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return null;
  const hoy = new Date();
  let meses = (hoy.getFullYear() - nacimiento.getFullYear()) * 12;
  meses += hoy.getMonth() - nacimiento.getMonth();
  if (hoy.getDate() < nacimiento.getDate()) meses -= 1;
  return Math.max(meses, 0);
};

const obtenerCategoria = (animal) => {
  const edadMeses = calcularEdadMeses(animal?.fechaNacimiento);
  if (edadMeses !== null && edadMeses < 12) return 'Ternero';
  if (animal?.sexo === 'Hembra') return edadMeses !== null && edadMeses >= 24 ? 'Vaca' : 'Novilla';
  if (animal?.sexo === 'Macho') return edadMeses !== null && edadMeses >= 24 ? 'Toro' : 'Novillo';
  return '--';
};

const nombreAnimal = (animal) => `${animal?.diio || animal?.identificadorFinca || 'Sin DIIO'}${animal?.nombre ? ` - ${animal.nombre}` : ''}`;

const estadoInicial = {
  fechaVenta: fechaHoy(),
  comprador: '',
  identificacionComprador: '',
  telefonoComprador: '',
  observaciones: '',
  animales: [],
  comprobante: null
};

const Ventas = () => {
  const [ventas, setVentas] = useState([]);
  const [animales, setAnimales] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [filtros, setFiltros] = useState({ fechaInicio: '', fechaFin: '', comprador: '', estado: '' });
  const [formulario, setFormulario] = useState(estadoInicial);
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
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
      const [ventasData, animalesData, resumenData] = await Promise.all([
        obtenerVentas(filtros),
        obtenerAnimales(),
        obtenerResumenVentas({ fechaInicio: filtros.fechaInicio, fechaFin: filtros.fechaFin })
      ]);
      setVentas(ventasData);
      setAnimales(animalesData);
      setResumen(resumenData);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [filtros.fechaInicio, filtros.fechaFin, filtros.comprador, filtros.estado]);

  const animalesDisponibles = useMemo(() => {
    const seleccionados = new Set(formulario.animales.map((item) => item.animal));
    return animales.filter((animal) => {
      if (['Vendido', 'Muerto'].includes(animal.estado)) return false;
      return !seleccionados.has(animal._id);
    });
  }, [animales, formulario.animales]);

  const totalFormulario = useMemo(() => {
    return formulario.animales.reduce((total, item) => total + (Number(item.pesoVentaKg || 0) * Number(item.precioKg || 0)), 0);
  }, [formulario.animales]);

  const pesoFormulario = useMemo(() => {
    return formulario.animales.reduce((total, item) => total + Number(item.pesoVentaKg || 0), 0);
  }, [formulario.animales]);

  const abrirNuevo = () => {
    setVentaSeleccionada(null);
    setFormulario(estadoInicial);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const abrirEdicion = (venta) => {
    setVentaSeleccionada(venta);
    setFormulario({
      fechaVenta: venta.fechaVenta ? new Date(venta.fechaVenta).toISOString().slice(0, 10) : fechaHoy(),
      comprador: venta.comprador || '',
      identificacionComprador: venta.identificacionComprador || '',
      telefonoComprador: venta.telefonoComprador || '',
      observaciones: venta.observaciones || '',
      animales: (venta.animales || []).map((item) => ({
        animal: item.animal?._id || item.animal,
        pesoVentaKg: item.pesoVentaKg,
        precioKg: item.precioKg
      })),
      comprobante: null
    });
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const actualizarCampo = (evento) => {
    const { name, value, files } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: files ? files[0] : value }));
  };

  const agregarAnimal = (animalId) => {
    const animal = animales.find((item) => item._id === animalId);
    if (!animal) return;
    setFormulario((actual) => ({
      ...actual,
      animales: [
        ...actual.animales,
        {
          animal: animalId,
          pesoVentaKg: animal.pesoActual || '',
          precioKg: animal.precioVentaPorKg || ''
        }
      ]
    }));
  };

  const actualizarAnimalVenta = (indice, campo, valor) => {
    setFormulario((actual) => ({
      ...actual,
      animales: actual.animales.map((item, itemIndice) => (
        itemIndice === indice ? { ...item, [campo]: valor } : item
      ))
    }));
  };

  const quitarAnimal = (indice) => {
    setFormulario((actual) => ({
      ...actual,
      animales: actual.animales.filter((_, itemIndice) => itemIndice !== indice)
    }));
  };

  const guardarVenta = async (evento) => {
    evento.preventDefault();
    try {
      setGuardando(true);
      setErrorFormulario('');
      if (ventaSeleccionada?._id) {
        await actualizarVentaAnimal(ventaSeleccionada._id, formulario);
      } else {
        await crearVentaAnimal(formulario);
      }
      setModoFormulario(false);
      setVentaSeleccionada(null);
      await cargarDatos();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const anularVenta = async (venta) => {
    const motivo = window.prompt(`Motivo para anular la venta de ${venta.comprador}:`, '');
    if (motivo === null) return;
    try {
      await anularVentaAnimal(venta._id, motivo);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const borrarVenta = async (venta) => {
    const confirmar = window.confirm(`¿Eliminar la venta de ${venta.comprador}? Esto revierte inventario, bitácora y finanzas.`);
    if (!confirmar) return;
    try {
      await eliminarVentaAnimal(venta._id);
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
            <p className="eyebrow">Ventas</p>
            <h2>{ventaSeleccionada ? 'Editar venta' : 'Nueva venta de animales'}</h2>
          </div>
          <button className="boton-link" type="button" onClick={() => setModoFormulario(false)}>Volver</button>
        </div>

        <form className="form-card venta-form" onSubmit={guardarVenta}>
          {errorFormulario && <div className="alerta-formulario">{errorFormulario}</div>}
          <div className="form-grid">
            <label>Fecha<input type="date" name="fechaVenta" value={formulario.fechaVenta} onChange={actualizarCampo} required /></label>
            <label>Comprador<input name="comprador" value={formulario.comprador} onChange={actualizarCampo} required /></label>
          </div>
          <div className="form-grid">
            <label>Identificación<input name="identificacionComprador" value={formulario.identificacionComprador} onChange={actualizarCampo} /></label>
            <label>Teléfono<input name="telefonoComprador" value={formulario.telefonoComprador} onChange={actualizarCampo} /></label>
          </div>
          <label>Observaciones<textarea rows="3" name="observaciones" value={formulario.observaciones} onChange={actualizarCampo} /></label>
          <label>Comprobante<input type="file" name="comprobante" accept="image/*,.pdf" onChange={actualizarCampo} /></label>

          <section className="venta-selector">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Animales</p>
                <h2>Selección de venta</h2>
              </div>
              <select value="" onChange={(evento) => agregarAnimal(evento.target.value)}>
                <option value="">Agregar animal</option>
                {animalesDisponibles.map((animal) => (
                  <option key={animal._id} value={animal._id}>
                    {nombreAnimal(animal)} · {animal.sexo} · {obtenerCategoria(animal)} · {animal.pesoActual || 0} kg
                  </option>
                ))}
              </select>
            </div>

            <div className="tabla-scroll tabla-dinamica venta-detalle-tabla">
              <table>
                <thead>
                  <tr>
                    <th>DIIO</th>
                    <th>Nombre</th>
                    <th>Sexo</th>
                    <th>Categoría</th>
                    <th>Peso actual</th>
                    <th>Peso venta</th>
                    <th>Precio/kg</th>
                    <th>Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {formulario.animales.map((item, indice) => {
                    const animal = animales.find((animalItem) => animalItem._id === item.animal) || {};
                    const subtotal = Number(item.pesoVentaKg || 0) * Number(item.precioKg || 0);
                    return (
                      <tr key={item.animal}>
                        <td>{animal.diio || animal.identificadorFinca}</td>
                        <td>{animal.nombre || '--'}</td>
                        <td>{animal.sexo || '--'}</td>
                        <td>{obtenerCategoria(animal)}</td>
                        <td>{formatearNumero(animal.pesoActual)} kg</td>
                        <td><input type="number" min="0.01" step="0.01" value={item.pesoVentaKg} onChange={(evento) => actualizarAnimalVenta(indice, 'pesoVentaKg', evento.target.value)} required /></td>
                        <td><input type="number" min="0.01" step="0.01" value={item.precioKg} onChange={(evento) => actualizarAnimalVenta(indice, 'precioKg', evento.target.value)} required /></td>
                        <td>{formatearMoneda(subtotal)}</td>
                        <td><button className="boton-link" type="button" onClick={() => quitarAnimal(indice)}>Quitar</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="venta-totales">
              <article><span>Animales</span><strong>{formulario.animales.length}</strong></article>
              <article><span>Peso total</span><strong>{formatearNumero(pesoFormulario)} kg</strong></article>
              <article><span>Total</span><strong>{formatearMoneda(totalFormulario)}</strong></article>
            </div>
          </section>

          <div className="form-actions">
            <button className="boton-link" type="button" onClick={() => setModoFormulario(false)}>Cancelar</button>
            <button className="boton-primario compacto" type="submit" disabled={guardando || formulario.animales.length === 0}>
              {guardando ? 'Guardando...' : 'Guardar venta'}
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
          <p className="eyebrow">Ventas</p>
          <h2>Ventas de animales</h2>
        </div>
        <button className="boton-primario compacto" type="button" onClick={abrirNuevo}>+ Nueva venta</button>
      </div>

      <section className="reportes-metricas">
        <article><span>Total vendido</span><strong>{formatearMoneda(resumen?.totalVendido)}</strong></article>
        <article><span>Kg vendidos</span><strong>{formatearNumero(resumen?.totalKgVendidos)} kg</strong></article>
        <article><span>Precio prom/kg</span><strong>{formatearMoneda(resumen?.precioPromedioKg)}</strong></article>
        <article><span>Animales vendidos</span><strong>{formatearNumero(resumen?.totalAnimalesVendidos)}</strong></article>
      </section>

      <div className="tabla-toolbar">
        <input type="date" value={filtros.fechaInicio} onChange={(evento) => setFiltros((actual) => ({ ...actual, fechaInicio: evento.target.value }))} />
        <input type="date" value={filtros.fechaFin} onChange={(evento) => setFiltros((actual) => ({ ...actual, fechaFin: evento.target.value }))} />
        <input value={filtros.comprador} onChange={(evento) => setFiltros((actual) => ({ ...actual, comprador: evento.target.value }))} placeholder="Comprador..." />
        <select value={filtros.estado} onChange={(evento) => setFiltros((actual) => ({ ...actual, estado: evento.target.value }))}>
          <option value="">Todos</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Confirmada">Confirmada</option>
          <option value="Anulada">Anulada</option>
        </select>
        <span>{ventas.length} registros</span>
      </div>

      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && <div className="estado-importacion">Cargando ventas...</div>}

      <div className="tabla-scroll tabla-dinamica">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Comprador</th>
              <th>Cantidad animales</th>
              <th>Peso total</th>
              <th>Monto total</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((venta) => (
              <tr key={venta._id}>
                <td>{formatearFecha(venta.fechaVenta)}</td>
                <td>{venta.comprador}</td>
                <td>{venta.totalAnimales}</td>
                <td>{formatearNumero(venta.pesoTotalKg)} kg</td>
                <td>{formatearMoneda(venta.montoTotal)}</td>
                <td><span className={`estado-badge estado-${venta.estado}`}>{venta.estado}</span></td>
                <td>
                  <div className="acciones-tabla acciones-tabla-amplia">
                    <button type="button" title="Ver detalle" onClick={() => setDetalle(venta)}>⊙</button>
                    {venta.estado !== 'Anulada' && <button type="button" title="Editar" onClick={() => abrirEdicion(venta)}>✎</button>}
                    {venta.estado !== 'Anulada' && <button type="button" title="Anular" onClick={() => anularVenta(venta)}>↺</button>}
                    <button type="button" title="Eliminar" onClick={() => borrarVenta(venta)}>⌫</button>
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
                <p className="eyebrow">Detalle de venta</p>
                <h2>{detalle.comprador}</h2>
              </div>
              <button className="boton-link" type="button" onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
            <div className="detalle-animal-grid">
              <article><span>Fecha</span><strong>{formatearFecha(detalle.fechaVenta)}</strong></article>
              <article><span>Estado</span><strong>{detalle.estado}</strong></article>
              <article><span>Teléfono</span><strong>{detalle.telefonoComprador || '--'}</strong></article>
              <article><span>Identificación</span><strong>{detalle.identificacionComprador || '--'}</strong></article>
              <article><span>Peso total</span><strong>{formatearNumero(detalle.pesoTotalKg)} kg</strong></article>
              <article><span>Total</span><strong>{formatearMoneda(detalle.montoTotal)}</strong></article>
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
                  <tr><th>DIIO</th><th>Animal</th><th>Peso</th><th>Precio/kg</th><th>Subtotal</th></tr>
                </thead>
                <tbody>
                  {detalle.animales?.map((item) => (
                    <tr key={item.animal?._id || item.animal}>
                      <td>{item.animal?.diio || item.animal?.identificadorFinca || '--'}</td>
                      <td>{item.animal?.nombre || '--'}</td>
                      <td>{formatearNumero(item.pesoVentaKg)} kg</td>
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

export default Ventas;
