import React, { useEffect, useMemo, useState } from 'react';
import {
  actualizarVentaAnimal,
  anularVentaAnimal,
  crearVentaAnimal,
  eliminarVentaAnimal,
  obtenerAnimales,
  obtenerCamadas,
  obtenerResumenVentas,
  obtenerVentas,
  API_URL
} from '../services/api';
import { obtenerRangoMesActual } from '../utils/fechas';
import SelectorEspecie from './SelectorEspecie';

const obtenerEspecieInicial = () => localStorage.getItem('ganaderiaEspecie') || 'Bovino';

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

const obtenerCategoriaPorEspecie = (animal, especieActual) => {
  const especieAnimal = animal?.especie || especieActual || 'Bovino';
  if (especieAnimal !== 'Porcino') return obtenerCategoria(animal);

  const edadMeses = calcularEdadMeses(animal?.fechaNacimiento);
  if (edadMeses !== null && edadMeses < 2) return animal?.sexo === 'Macho' ? 'Lechón' : 'Lechona';
  if (animal?.sexo === 'Hembra') return edadMeses !== null && edadMeses >= 6 ? 'Cerda' : 'Cerda joven';
  if (animal?.sexo === 'Macho') return edadMeses !== null && edadMeses >= 6 ? 'Verraco' : 'Macho joven';
  return 'Porcino';
};

const textosPorEspecie = {
  Bovino: {
    titulo: 'Ventas de bovinos',
    formularioNuevo: 'Nueva venta de bovinos',
    formularioEditar: 'Editar venta de bovinos',
    selector: 'Selección de bovinos para venta',
    vendidos: 'Bovinos vendidos',
    etiquetaId: 'DIIO'
  },
  Porcino: {
    titulo: 'Ventas de porcinos',
    formularioNuevo: 'Nueva venta de porcinos',
    formularioEditar: 'Editar venta de porcinos',
    selector: 'Selección de porcinos para venta',
    vendidos: 'Porcinos vendidos',
    etiquetaId: 'DIIO porcino'
  }
};

const textoEspecie = (especie, clave) => textosPorEspecie[especie]?.[clave] || textosPorEspecie.Bovino[clave];

const nombreAnimal = (animal) => `${animal?.diio || animal?.identificadorFinca || 'Sin ID'}${animal?.nombre ? ` - ${animal.nombre}` : ''}`;

const normalizarBusqueda = (valor) => String(valor || '').toLowerCase().trim();

const coincideBusquedaAnimal = (animal, busqueda) => {
  const termino = normalizarBusqueda(busqueda);
  if (!termino) return false;

  const diio = normalizarBusqueda(animal?.diio);
  const identificador = normalizarBusqueda(animal?.identificadorFinca);
  const nombre = normalizarBusqueda(animal?.nombre);
  const ultimosCuatro = diio.slice(-4);

  return diio.includes(termino)
    || ultimosCuatro.includes(termino)
    || identificador.includes(termino)
    || nombre.includes(termino);
};

const estadoInicial = {
  fechaVenta: fechaHoy(),
  comprador: '',
  identificacionComprador: '',
  telefonoComprador: '',
  observaciones: '',
  animales: [],
  camadas: [],
  comprobante: null
};

const Ventas = () => {
  const [ventas, setVentas] = useState([]);
  const [animales, setAnimales] = useState([]);
  const [camadas, setCamadas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [filtros, setFiltros] = useState({ ...obtenerRangoMesActual(), comprador: '', estado: '' });
  const [formulario, setFormulario] = useState(estadoInicial);
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [modoFormulario, setModoFormulario] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [busquedaAnimal, setBusquedaAnimal] = useState('');
  const [modoVentaDetalle, setModoVentaDetalle] = useState('individual');
  const [especie, setEspecie] = useState(obtenerEspecieInicial);
  const etiquetaId = textoEspecie(especie, 'etiquetaId');

  const cambiarEspecie = (valor) => {
    localStorage.setItem('ganaderiaEspecie', valor);
    setEspecie(valor);
  };

  const cargarDatos = async () => {
    try {
      setCargando(true);
      setError('');
      const [ventasData, animalesData, resumenData, camadasData] = await Promise.all([
        obtenerVentas({ ...filtros, especie }),
        obtenerAnimales({ especie }),
        obtenerResumenVentas({ fechaInicio: filtros.fechaInicio, fechaFin: filtros.fechaFin, especie }),
        especie === 'Porcino' ? obtenerCamadas() : Promise.resolve([])
      ]);
      setVentas(ventasData);
      setAnimales(animalesData);
      setResumen(resumenData);
      setCamadas(camadasData);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [filtros.fechaInicio, filtros.fechaFin, filtros.comprador, filtros.estado, especie]);

  const animalesDisponibles = useMemo(() => {
    const seleccionados = new Set(formulario.animales.map((item) => item.animal));
    const especieFormulario = formulario.especie || especie;
    return animales.filter((animal) => {
      if (['Vendido', 'Muerto'].includes(animal.estado)) return false;
      if ((animal.especie || 'Bovino') !== especieFormulario) return false;
      return !seleccionados.has(animal._id);
    });
  }, [animales, formulario.animales, formulario.especie, especie]);

  const animalesSugeridos = useMemo(() => {
    const termino = normalizarBusqueda(busquedaAnimal);
    if (!termino) return [];

    return animalesDisponibles
      .filter((animal) => coincideBusquedaAnimal(animal, termino))
      .slice(0, 12);
  }, [animalesDisponibles, busquedaAnimal]);

  const camadasDisponibles = useMemo(() => {
    const seleccionadas = new Set((formulario.camadas || []).map((item) => item.camada));
    return camadas.filter((camada) => {
      if (camada.estado === 'Cancelada') return false;
      if (seleccionadas.has(camada._id)) return false;
      return Number(camada.pendientesVenta || 0) > 0;
    });
  }, [camadas, formulario.camadas]);

  const totalFormulario = useMemo(() => {
    const totalAnimales = formulario.animales.reduce((total, item) => total + (Number(item.pesoVentaKg || 0) * Number(item.precioKg || 0)), 0);
    const totalCamadas = (formulario.camadas || []).reduce((total, item) => total + (Number(item.pesoTotalKg || 0) * Number(item.precioKg || 0)), 0);
    return totalAnimales + totalCamadas;
  }, [formulario.animales, formulario.camadas]);

  const pesoFormulario = useMemo(() => {
    const pesoAnimales = formulario.animales.reduce((total, item) => total + Number(item.pesoVentaKg || 0), 0);
    const pesoCamadas = (formulario.camadas || []).reduce((total, item) => total + Number(item.pesoTotalKg || 0), 0);
    return pesoAnimales + pesoCamadas;
  }, [formulario.animales, formulario.camadas]);

  const unidadesFormulario = useMemo(() => {
    return formulario.animales.length + (formulario.camadas || []).reduce((total, item) => total + Number(item.cantidad || 0), 0);
  }, [formulario.animales, formulario.camadas]);

  const abrirNuevo = () => {
    setVentaSeleccionada(null);
    setFormulario({ ...estadoInicial, especie });
    setBusquedaAnimal('');
    setModoVentaDetalle('individual');
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const abrirEdicion = (venta) => {
    const especieVenta = venta.especie || especie;
    cambiarEspecie(especieVenta);
    setVentaSeleccionada(venta);
    setFormulario({
      fechaVenta: venta.fechaVenta ? new Date(venta.fechaVenta).toISOString().slice(0, 10) : fechaHoy(),
      comprador: venta.comprador || '',
      identificacionComprador: venta.identificacionComprador || '',
      telefonoComprador: venta.telefonoComprador || '',
      observaciones: venta.observaciones || '',
      especie: especieVenta,
      animales: (venta.animales || []).map((item) => ({
        animal: item.animal?._id || item.animal,
        pesoVentaKg: item.pesoVentaKg,
        precioKg: item.precioKg
      })),
      camadas: (venta.camadas || []).map((item) => ({
        camada: item.camada?._id || item.camada,
        cantidad: item.cantidad,
        cantidadOriginal: item.cantidad,
        pesoTotalKg: item.pesoTotalKg,
        precioKg: item.precioKg
      })),
      comprobante: null
    });
    setErrorFormulario('');
    setBusquedaAnimal('');
    setModoVentaDetalle((venta.camadas || []).length ? 'camada' : 'individual');
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
    setBusquedaAnimal('');
  };

  const agregarCamada = (camadaId) => {
    const camada = camadas.find((item) => item._id === camadaId);
    if (!camada) return;

    setFormulario((actual) => ({
      ...actual,
      camadas: [
        ...(actual.camadas || []),
        {
          camada: camadaId,
          cantidad: camada.pendientesVenta || '',
          cantidadOriginal: 0,
          pesoTotalKg: '',
          precioKg: ''
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

  const actualizarCamadaVenta = (indice, campo, valor) => {
    setFormulario((actual) => ({
      ...actual,
      camadas: (actual.camadas || []).map((item, itemIndice) => (
        itemIndice === indice ? { ...item, [campo]: valor } : item
      ))
    }));
  };

  const quitarCamada = (indice) => {
    setFormulario((actual) => ({
      ...actual,
      camadas: (actual.camadas || []).filter((_, itemIndice) => itemIndice !== indice)
    }));
  };

  const guardarVenta = async (evento) => {
    evento.preventDefault();
    try {
      setGuardando(true);
      setErrorFormulario('');
      const payload = { ...formulario, especie: formulario.especie || especie };
      if (ventaSeleccionada?._id) {
        await actualizarVentaAnimal(ventaSeleccionada._id, payload);
      } else {
        await crearVentaAnimal(payload);
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
            <h2>{ventaSeleccionada ? textoEspecie(formulario.especie || especie, 'formularioEditar') : textoEspecie(formulario.especie || especie, 'formularioNuevo')}</h2>
          </div>
          <button className="boton-link" type="button" onClick={() => setModoFormulario(false)}>Volver</button>
        </div>

        <form className="form-card venta-form" onSubmit={guardarVenta}>
          {errorFormulario && <div className="alerta-formulario">{errorFormulario}</div>}
          <SelectorEspecie
            valor={formulario.especie || especie}
            onChange={(valor) => {
              cambiarEspecie(valor);
              setFormulario((actual) => ({ ...actual, especie: valor, animales: [], camadas: [] }));
              setBusquedaAnimal('');
              setModoVentaDetalle('individual');
            }}
          />
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
            {formulario.especie === 'Porcino' && (
              <div className="inventario-tabs venta-tabs">
                <button className={modoVentaDetalle === 'individual' ? 'activo' : ''} type="button" onClick={() => setModoVentaDetalle('individual')}>
                  Por DIIO
                </button>
                <button className={modoVentaDetalle === 'camada' ? 'activo' : ''} type="button" onClick={() => setModoVentaDetalle('camada')}>
                  Por camada
                </button>
              </div>
            )}

            <div className="panel-title">
              <div>
                <p className="eyebrow">Animales</p>
                <h2>{modoVentaDetalle === 'camada' ? 'Selección de camadas para venta' : textoEspecie(formulario.especie || especie, 'selector')}</h2>
              </div>
              {modoVentaDetalle === 'individual' ? (
                <div className="venta-buscador-animal">
                <input
                  value={busquedaAnimal}
                  onChange={(evento) => setBusquedaAnimal(evento.target.value)}
                  placeholder={`Buscar por ${textoEspecie(formulario.especie || especie, 'etiquetaId')}, últimos 4 o nombre`}
                />
                {busquedaAnimal && (
                  <div className="venta-resultados-animal">
                    {animalesSugeridos.length ? animalesSugeridos.map((animal) => (
                      <button key={animal._id} type="button" onClick={() => agregarAnimal(animal._id)}>
                        <strong>{animal.diio || animal.identificadorFinca || '--'}</strong>
                        <span>{animal.nombre || '--'}</span>
                        <small>{animal.sexo || '--'} · {obtenerCategoriaPorEspecie(animal, formulario.especie || especie)} · {formatearNumero(animal.pesoActual)} kg</small>
                      </button>
                    )) : (
                      <p>No hay coincidencias disponibles</p>
                    )}
                  </div>
                )}
                </div>
              ) : (
                <select className="venta-selector-camada" value="" onChange={(evento) => agregarCamada(evento.target.value)}>
                  <option value="">Agregar camada</option>
                  {camadasDisponibles.map((camada) => (
                    <option key={camada._id} value={camada._id}>
                      {camada.codigoCamada} · disponibles {camada.pendientesVenta}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {modoVentaDetalle === 'individual' && (
              <div className="tabla-scroll tabla-dinamica venta-detalle-tabla">
              <table>
                <thead>
                  <tr>
                    <th>{etiquetaId}</th>
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
                        <td>{obtenerCategoriaPorEspecie(animal, formulario.especie || especie)}</td>
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
            )}

            {formulario.especie === 'Porcino' && modoVentaDetalle === 'camada' && (
              <div className="tabla-scroll tabla-dinamica venta-detalle-tabla">
                <table>
                  <thead>
                    <tr>
                      <th>Camada</th>
                      <th>Madre</th>
                      <th>Disponibles</th>
                      <th>Cantidad</th>
                      <th>Peso total</th>
                      <th>Precio/kg</th>
                      <th>Subtotal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formulario.camadas || []).map((item, indice) => {
                      const camada = camadas.find((camadaItem) => camadaItem._id === item.camada) || {};
                      const subtotal = Number(item.pesoTotalKg || 0) * Number(item.precioKg || 0);
                      const disponibleReal = Number(camada.pendientesVenta || 0) + Number(item.cantidadOriginal || 0);
                      return (
                        <tr key={item.camada}>
                          <td>{camada.codigoCamada || '--'}</td>
                          <td>{camada.madre?.diio || camada.madre?.nombre || '--'}</td>
                          <td>{disponibleReal || '--'}</td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              max={disponibleReal || undefined}
                              step="1"
                              value={item.cantidad}
                              onChange={(evento) => actualizarCamadaVenta(indice, 'cantidad', evento.target.value)}
                              required
                            />
                          </td>
                          <td><input type="number" min="0.01" step="0.01" value={item.pesoTotalKg} onChange={(evento) => actualizarCamadaVenta(indice, 'pesoTotalKg', evento.target.value)} required /></td>
                          <td><input type="number" min="0.01" step="0.01" value={item.precioKg} onChange={(evento) => actualizarCamadaVenta(indice, 'precioKg', evento.target.value)} required /></td>
                          <td>{formatearMoneda(subtotal)}</td>
                          <td><button className="boton-link" type="button" onClick={() => quitarCamada(indice)}>Quitar</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="venta-totales">
              <article><span>Animales</span><strong>{unidadesFormulario}</strong></article>
              <article><span>Peso total</span><strong>{formatearNumero(pesoFormulario)} kg</strong></article>
              <article><span>Total</span><strong>{formatearMoneda(totalFormulario)}</strong></article>
            </div>
          </section>

          <div className="form-actions">
            <button className="boton-link" type="button" onClick={() => setModoFormulario(false)}>Cancelar</button>
            <button className="boton-primario compacto" type="submit" disabled={guardando || (formulario.animales.length === 0 && (formulario.camadas || []).length === 0)}>
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
          <h2>{textoEspecie(especie, 'titulo')}</h2>
        </div>
        <button className="boton-primario compacto" type="button" onClick={abrirNuevo}>+ Nueva venta</button>
      </div>

      <SelectorEspecie valor={especie} onChange={cambiarEspecie} />

      <section className="reportes-metricas">
        <article><span>Total vendido</span><strong>{formatearMoneda(resumen?.totalVendido)}</strong></article>
        <article><span>Kg vendidos</span><strong>{formatearNumero(resumen?.totalKgVendidos)} kg</strong></article>
        <article><span>Precio prom/kg</span><strong>{formatearMoneda(resumen?.precioPromedioKg)}</strong></article>
        <article><span>{textoEspecie(especie, 'vendidos')}</span><strong>{formatearNumero(resumen?.totalAnimalesVendidos)}</strong></article>
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
              <th>{textoEspecie(especie, 'vendidos')}</th>
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
                  <tr><th>{etiquetaId}</th><th>Animal</th><th>Peso</th><th>Precio/kg</th><th>Subtotal</th></tr>
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
            {(detalle.camadas || []).length > 0 && (
              <div className="tabla-scroll tabla-dinamica venta-detalle-tabla">
                <table>
                  <thead>
                    <tr><th>Camada</th><th>Madre</th><th>Cantidad</th><th>Peso total</th><th>Precio/kg</th><th>Subtotal</th></tr>
                  </thead>
                  <tbody>
                    {detalle.camadas.map((item) => (
                      <tr key={item.camada?._id || item.camada}>
                        <td>{item.camada?.codigoCamada || '--'}</td>
                        <td>{item.camada?.madre?.diio || item.camada?.madre?.nombre || '--'}</td>
                        <td>{formatearNumero(item.cantidad)}</td>
                        <td>{formatearNumero(item.pesoTotalKg)} kg</td>
                        <td>{formatearMoneda(item.precioKg)}</td>
                        <td>{formatearMoneda(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
};

export default Ventas;
