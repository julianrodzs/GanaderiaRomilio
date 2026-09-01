import React, { useEffect, useMemo, useState } from 'react';
import {
  activarCatalogoFinanciero,
  actualizarMovimientoFinanciero,
  actualizarCatalogoFinanciero,
  crearCatalogoFinanciero,
  crearMovimientoFinanciero,
  desactivarCatalogoFinanciero,
  eliminarCatalogoFinanciero,
  eliminarMovimientoFinanciero,
  obtenerCatalogosFinancierosAdmin,
  obtenerMovimientosFinancieros,
  obtenerResumenConsumoFinanciero,
  obtenerResumenFinanciero,
  obtenerResumenInversionesFinancieras,
  obtenerResumenPlanillaFinanciera
} from '../services/api';
import FormularioMovimientoFinanciero from './FormularioMovimientoFinanciero';
import TablaDinamica from './TablaDinamica';

const tipos = ['Todos', 'Planilla', 'Inversion', 'Compra'];

const formatearFecha = (fecha) => {
  if (!fecha) return '--';
  return new Date(fecha).toLocaleDateString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const formatearMonto = (movimiento) => {
  const moneda = movimiento.moneda || 'CRC';
  const locale = moneda === 'USD' ? 'en-US' : 'es-CR';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: moneda,
    maximumFractionDigits: moneda === 'USD' ? 2 : 0
  }).format(movimiento.monto || 0);
};

const formatearNumero = (valor, moneda = 'CRC') => {
  const locale = moneda === 'USD' ? 'en-US' : 'es-CR';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: moneda,
    maximumFractionDigits: moneda === 'USD' ? 2 : 0
  }).format(valor || 0);
};

const formatearCantidad = (valor, unidad) => {
  if (valor === null || valor === undefined || valor === '') return '--';
  const cantidad = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(valor || 0);
  return unidad ? `${cantidad} x ${unidad}` : cantidad;
};

const rangoMesActual = () => {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  const ultimoDia = new Date(anio, mes + 1, 0).getDate();
  const mesTexto = String(mes + 1).padStart(2, '0');

  return {
    fechaInicio: `${anio}-${mesTexto}-01`,
    fechaFin: `${anio}-${mesTexto}-${String(ultimoDia).padStart(2, '0')}`
  };
};

const columnas = [
  {
    id: 'fecha',
    label: 'Fecha',
    accessor: (movimiento) => formatearFecha(movimiento.fecha),
    sortAccessor: (movimiento) => (movimiento.fecha ? new Date(movimiento.fecha).getTime() : null),
    searchAccessor: (movimiento) => [
      formatearFecha(movimiento.fecha),
      movimiento.fecha ? new Date(movimiento.fecha).toISOString().slice(0, 10) : ''
    ].join(' ')
  },
  { id: 'tipoMovimiento', label: 'Tipo', accessor: (movimiento) => movimiento.tipoMovimiento },
  {
    id: 'categoria',
    label: 'Categoria',
    accessor: (movimiento) => movimiento.categoriaNormalizada || movimiento.categoria,
    searchAccessor: (movimiento) => `${movimiento.categoriaNormalizada || ''} ${movimiento.categoria || ''}`
  },
  {
    id: 'producto',
    label: 'Producto',
    accessor: (movimiento) => movimiento.producto,
    className: 'columna-producto-finanzas',
    render: (movimiento) => (
      <span title={movimiento.producto || '--'}>{movimiento.producto || '--'}</span>
    )
  },
  {
    id: 'cantidad',
    label: 'Cantidad',
    accessor: (movimiento) => formatearCantidad(movimiento.cantidad, movimiento.unidad),
    sortAccessor: (movimiento) => movimiento.cantidad ?? null,
    searchAccessor: (movimiento) => `${movimiento.cantidad ?? ''} ${movimiento.unidad || ''}`
  },
  {
    id: 'monto',
    label: 'Monto',
    accessor: formatearMonto,
    sortAccessor: (movimiento) => movimiento.monto ?? null,
    searchAccessor: (movimiento) => `${formatearMonto(movimiento)} ${movimiento.monto ?? ''}`
  },
  {
    id: 'precioUnitario',
    label: 'Precio unit.',
    accessor: (movimiento) => movimiento.precioUnitario ? formatearNumero(movimiento.precioUnitario, movimiento.moneda || 'CRC') : '--',
    sortAccessor: (movimiento) => movimiento.precioUnitario ?? null
  },
  { id: 'proveedor', label: 'Proveedor/Lugar', accessor: (movimiento) => movimiento.proveedor },
  { id: 'observaciones', label: 'Observaciones', accessor: (movimiento) => movimiento.observaciones }
];

const filtros = [
  { id: 'naturaleza', accessor: (movimiento) => movimiento.naturaleza },
  { id: 'categoria', accessor: (movimiento) => movimiento.categoriaNormalizada || movimiento.categoria },
  { id: 'moneda', accessor: (movimiento) => movimiento.moneda || 'CRC' },
  { id: 'proveedor', accessor: (movimiento) => movimiento.proveedor }
];

const sumarPorTipoYMoneda = (movimientos) => {
  return movimientos.reduce((acumulado, movimiento) => {
    const tipo = movimiento.tipoMovimiento || 'Sin tipo';
    const moneda = movimiento.moneda || 'CRC';

    if (!acumulado[tipo]) {
      acumulado[tipo] = { cantidad: 0, CRC: 0, USD: 0 };
    }

    acumulado[tipo].cantidad += 1;
    acumulado[tipo][moneda] = (acumulado[tipo][moneda] || 0) + (movimiento.monto || 0);

    return acumulado;
  }, {});
};

const estaVacio = (valor) => valor === null || valor === undefined || String(valor).trim() === '';

const formatearTotalesMoneda = (totales = {}) => {
  const partes = Object.entries(totales)
    .filter(([, total]) => total > 0)
    .map(([moneda, total]) => formatearNumero(total, moneda));

  return partes.length ? partes.join(' / ') : '--';
};

const reglasRevisionFinanciera = [
  {
    id: 'sinDestinoUso',
    label: 'Sin destino de uso',
    evaluar: (movimiento) => estaVacio(movimiento.destinoUso)
  },
  {
    id: 'categoriaGeneralOtros',
    label: 'Categoria general/otros',
    evaluar: (movimiento) => ['General', 'Otros'].includes(movimiento.categoriaNormalizada || movimiento.categoria)
  },
  {
    id: 'comprasSinProducto',
    label: 'Compra sin producto',
    evaluar: (movimiento) => movimiento.tipoMovimiento === 'Compra' && estaVacio(movimiento.producto)
  },
  {
    id: 'comprasSinCantidadUnidad',
    label: 'Compra sin cantidad/unidad',
    evaluar: (movimiento) => movimiento.tipoMovimiento === 'Compra' && (!movimiento.cantidad || estaVacio(movimiento.unidad))
  }
];

const EditorCatalogosFinancieros = ({ onCerrar }) => {
  const [catalogoActivo, setCatalogoActivo] = useState('categorias');
  const [items, setItems] = useState([]);
  const [nuevoValor, setNuevoValor] = useState('');
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true);
  const [guardandoCatalogo, setGuardandoCatalogo] = useState(false);
  const [errorCatalogo, setErrorCatalogo] = useState('');

  const catalogos = {
    categorias: {
      titulo: 'Categorías financieras',
      descripcion: 'Definen qué tipo de ingreso, gasto o inversión es el movimiento.',
      tipo: 'categoria'
    },
    destinosUso: {
      titulo: 'Destinos de uso',
      descripcion: 'Definen dónde o para qué se usó el movimiento financiero.',
      tipo: 'destinoUso'
    }
  };

  const catalogo = catalogos[catalogoActivo];

  const cargarCatalogos = async () => {
    try {
      setCargandoCatalogos(true);
      setErrorCatalogo('');
      const datos = await obtenerCatalogosFinancierosAdmin(catalogo.tipo);
      setItems(datos);
    } catch (err) {
      setErrorCatalogo(err.message);
    } finally {
      setCargandoCatalogos(false);
    }
  };

  useEffect(() => {
    cargarCatalogos();
  }, [catalogoActivo]);

  const agregarValor = async (evento) => {
    evento.preventDefault();
    const valor = nuevoValor.trim();
    if (!valor) return;

    try {
      setGuardandoCatalogo(true);
      setErrorCatalogo('');
      await crearCatalogoFinanciero({ tipo: catalogo.tipo, nombre: valor });
      setNuevoValor('');
      await cargarCatalogos();
    } catch (err) {
      setErrorCatalogo(err.message);
    } finally {
      setGuardandoCatalogo(false);
    }
  };

  const renombrarCatalogo = async (item) => {
    const nuevoNombre = window.prompt(`Nuevo nombre para "${item.nombre}"`, item.nombre);
    if (!nuevoNombre || nuevoNombre.trim() === item.nombre) return;

    const actualizarMovimientos = item.usos > 0
      ? window.confirm(`"${item.nombre}" tiene ${item.usos} movimiento(s). ¿Quieres actualizar también esos movimientos al nuevo nombre?`)
      : false;

    try {
      setErrorCatalogo('');
      await actualizarCatalogoFinanciero(item._id, {
        nombre: nuevoNombre.trim(),
        actualizarMovimientos
      });
      await cargarCatalogos();
    } catch (err) {
      setErrorCatalogo(err.message);
    }
  };

  const cambiarEstadoCatalogo = async (item) => {
    const accion = item.activo ? 'desactivar' : 'activar';
    const mensaje = item.activo
      ? `Desactivar "${item.nombre}" hará que no aparezca para nuevos movimientos. Los ${item.usos} movimiento(s) existentes conservarán el valor.`
      : `Activar "${item.nombre}" hará que vuelva a aparecer en los formularios.`;

    if (!window.confirm(mensaje)) return;

    try {
      setErrorCatalogo('');
      if (item.activo) {
        await desactivarCatalogoFinanciero(item._id);
      } else {
        await activarCatalogoFinanciero(item._id);
      }
      await cargarCatalogos();
    } catch (err) {
      setErrorCatalogo(err.message);
    }
  };

  const eliminarCatalogo = async (item) => {
    if (item.usos > 0) {
      window.alert(`No se puede eliminar porque hay ${item.usos} movimiento(s) usando este valor. Puedes desactivarlo.`);
      return;
    }

    if (!window.confirm(`Eliminar "${item.nombre}" del catálogo. Esta acción no afecta movimientos porque no tiene usos.`)) return;

    try {
      setErrorCatalogo('');
      await eliminarCatalogoFinanciero(item._id);
      await cargarCatalogos();
    } catch (err) {
      setErrorCatalogo(err.message);
    }
  };

  return (
    <section className="catalogos-financieros-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h2>Catálogos financieros</h2>
        </div>
        <button className="boton-link" type="button" onClick={onCerrar}>Volver</button>
      </div>

      <div className="catalogos-aviso">
        <strong>Catálogo protegido</strong>
        <span>
          Puedes agregar, renombrar y desactivar valores. Eliminar solo está permitido cuando ningún movimiento financiero
          usa ese valor, para no romper reportes históricos.
        </span>
      </div>

      <section className="finanzas-panel catalogos-panel">
        <div className="finanzas-tabs" role="tablist" aria-label="Catálogos financieros">
          <button
            className={catalogoActivo === 'categorias' ? 'finanza-tab activo' : 'finanza-tab'}
            type="button"
            onClick={() => setCatalogoActivo('categorias')}
          >
            Categorías
          </button>
          <button
            className={catalogoActivo === 'destinosUso' ? 'finanza-tab activo' : 'finanza-tab'}
            type="button"
            onClick={() => setCatalogoActivo('destinosUso')}
          >
            Destinos de uso
          </button>
        </div>

        <div className="panel-title compacto">
          <div>
            <p className="eyebrow">{catalogoActivo === 'categorias' ? 'Clasificación' : 'Uso operativo'}</p>
            <h3>{catalogo.titulo}</h3>
          </div>
        </div>
        <p className="catalogos-descripcion">{catalogo.descripcion}</p>

        <form className="catalogos-form" onSubmit={agregarValor}>
          <label>
            Nuevo valor
            <input
              value={nuevoValor}
              onChange={(evento) => setNuevoValor(evento.target.value.toUpperCase())}
              placeholder={catalogoActivo === 'categorias' ? 'Ej. SERVICIOS' : 'Ej. BODEGA'}
            />
          </label>
          <button className="boton-primario compacto" type="submit" disabled={guardandoCatalogo}>
            {guardandoCatalogo ? 'Agregando...' : 'Agregar'}
          </button>
        </form>

        {errorCatalogo && <div className="alerta-formulario">{errorCatalogo}</div>}

        <div className="catalogos-lista">
          {cargandoCatalogos && <p className="catalogos-descripcion">Cargando catálogo...</p>}
          {!cargandoCatalogos && items.map((item) => (
            <article key={item._id} className={item.activo ? 'catalogo-item' : 'catalogo-item inactivo'}>
              <div className="catalogo-item-info">
                <span>{item.nombre}</span>
                <small>
                  {item.usos} movimiento(s) · {item.activo ? 'Activo' : 'Inactivo'}
                </small>
              </div>
              <div>
                <button className="boton-secundario compacto" type="button" onClick={() => renombrarCatalogo(item)}>
                  Renombrar
                </button>
                <button className="boton-secundario compacto" type="button" onClick={() => cambiarEstadoCatalogo(item)}>
                  {item.activo ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  className="boton-secundario compacto peligro"
                  type="button"
                  onClick={() => eliminarCatalogo(item)}
                  disabled={!item.puedeEliminar}
                  title={item.puedeEliminar ? 'Eliminar catálogo' : 'Tiene movimientos asociados'}
                >
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
};

const Finanzas = () => {
  const [movimientos, setMovimientos] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [consumo, setConsumo] = useState([]);
  const [resumenPlanilla, setResumenPlanilla] = useState(null);
  const [resumenInversiones, setResumenInversiones] = useState(null);
  const [tipoActivo, setTipoActivo] = useState('Todos');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [movimientoSeleccionado, setMovimientoSeleccionado] = useState(null);
  const [modoFormulario, setModoFormulario] = useState(false);
  const [modoCatalogos, setModoCatalogos] = useState(false);
  const [rangoFechas, setRangoFechas] = useState(rangoMesActual);

  const cargarFinanzas = async () => {
    try {
      setCargando(true);
      setError('');
      const [movimientosData, resumenData, consumoData, planillaData, inversionesData] = await Promise.all([
        obtenerMovimientosFinancieros(),
        obtenerResumenFinanciero(),
        obtenerResumenConsumoFinanciero(),
        obtenerResumenPlanillaFinanciera(),
        obtenerResumenInversionesFinancieras()
      ]);

      setMovimientos(movimientosData);
      setResumen(resumenData);
      setConsumo(consumoData);
      setResumenPlanilla(planillaData);
      setResumenInversiones(inversionesData);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarFinanzas();
  }, []);

  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter((movimiento) => {
      if (tipoActivo !== 'Todos' && movimiento.tipoMovimiento !== tipoActivo) return false;

      const fecha = movimiento.fecha ? new Date(movimiento.fecha).toISOString().slice(0, 10) : '';
      if (!fecha) return false;
      if (rangoFechas.fechaInicio && fecha < rangoFechas.fechaInicio) return false;
      if (rangoFechas.fechaFin && fecha > rangoFechas.fechaFin) return false;

      return true;
    });
  }, [movimientos, rangoFechas, tipoActivo]);

  const totalPorMoneda = useMemo(() => {
    return movimientosFiltrados.reduce((acumulado, movimiento) => {
      const moneda = movimiento.moneda || 'CRC';
      acumulado[moneda] = (acumulado[moneda] || 0) + (movimiento.monto || 0);
      return acumulado;
    }, {});
  }, [movimientosFiltrados]);

  const totalesPorTipo = useMemo(() => sumarPorTipoYMoneda(movimientos), [movimientos]);

  const resumenPorDestino = useMemo(() => {
    const destinos = movimientosFiltrados.reduce((acumulado, movimiento) => {
      const destinoUso = movimiento.destinoUso || 'Sin destino';
      const moneda = movimiento.moneda || 'CRC';

      if (!acumulado[destinoUso]) {
        acumulado[destinoUso] = {
          destinoUso,
          registros: 0,
          totales: {},
          productos: new Set()
        };
      }

      acumulado[destinoUso].registros += 1;
      acumulado[destinoUso].totales[moneda] = (acumulado[destinoUso].totales[moneda] || 0) + (movimiento.monto || 0);
      if (movimiento.producto) acumulado[destinoUso].productos.add(movimiento.producto);

      return acumulado;
    }, {});

    return Object.values(destinos)
      .map((destino) => ({
        ...destino,
        productos: Array.from(destino.productos).slice(0, 4)
      }))
      .sort((a, b) => (b.totales.CRC || 0) - (a.totales.CRC || 0) || b.registros - a.registros);
  }, [movimientosFiltrados]);

  const revisionDatos = useMemo(() => {
    const resumenRevision = reglasRevisionFinanciera.map((regla) => ({
      ...regla,
      cantidad: movimientosFiltrados.filter(regla.evaluar).length
    }));

    const muestras = movimientosFiltrados
      .map((movimiento) => ({
        movimiento,
        problemas: reglasRevisionFinanciera
          .filter((regla) => regla.evaluar(movimiento))
          .map((regla) => regla.label)
      }))
      .filter((item) => item.problemas.length > 0)
      .slice(0, 8);

    return { resumen: resumenRevision, muestras };
  }, [movimientosFiltrados]);

  const renderizarDetalleTipo = (tipo) => {
    const total = totalesPorTipo[tipo] || { cantidad: 0, CRC: 0, USD: 0 };

    return (
      <>
        <strong>{total.cantidad}</strong>
        <small>
          {formatearNumero(total.CRC, 'CRC')} / {formatearNumero(total.USD, 'USD')}
        </small>
      </>
    );
  };

  const abrirEdicion = (movimiento) => {
    setMovimientoSeleccionado(movimiento);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const abrirNuevoMovimiento = () => {
    setMovimientoSeleccionado(null);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const cancelarFormulario = () => {
    setMovimientoSeleccionado(null);
    setErrorFormulario('');
    setModoFormulario(false);
  };

  const guardarMovimiento = async (movimiento) => {
    try {
      setGuardando(true);
      setErrorFormulario('');

      if (movimientoSeleccionado?._id) {
        await actualizarMovimientoFinanciero(movimientoSeleccionado._id, movimiento);
      } else {
        await crearMovimientoFinanciero(movimiento);
      }

      setMovimientoSeleccionado(null);
      setModoFormulario(false);
      await cargarFinanzas();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminarMovimiento = async (movimiento) => {
    const confirmar = window.confirm(`¿Eliminar el movimiento "${movimiento.descripcion || movimiento.tipoMovimiento}"? Esta accion no se puede deshacer.`);
    if (!confirmar) return;

    try {
      setError('');
      await eliminarMovimientoFinanciero(movimiento._id);
      window.alert('Movimiento financiero eliminado correctamente.');
      await cargarFinanzas();
    } catch (err) {
      setError(err.message);
    }
  };

  if (modoFormulario) {
    return (
      <FormularioMovimientoFinanciero
        movimientoInicial={movimientoSeleccionado}
        modo={movimientoSeleccionado ? 'editar' : 'crear'}
        onCancelar={cancelarFormulario}
        onGuardar={guardarMovimiento}
        guardando={guardando}
        error={errorFormulario}
      />
    );
  }

  if (modoCatalogos) {
    return <EditorCatalogosFinancieros onCerrar={() => setModoCatalogos(false)} />;
  }

  return (
    <section className="finanzas-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Costos y finanzas</p>
          <h2>Movimientos financieros</h2>
        </div>
        <div className="acciones-encabezado">
          <button className="boton-secundario compacto boton-catalogos-finanzas" type="button" onClick={() => setModoCatalogos(true)}>
            Catálogos
          </button>
          <button className="boton-primario compacto boton-actualizar-finanzas" type="button" onClick={cargarFinanzas} disabled={cargando}>
            {cargando ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      <section className="finanzas-resumen">
        <article>
          <span>Registros totales</span>
          <strong>{movimientos.length}</strong>
          <small>{formatearNumero(resumen?.totalEgresos, 'CRC')} en egresos</small>
        </article>
        <article>
          <span>Ingresos</span>
          <strong>{formatearNumero(resumen?.totalIngresos, 'CRC')}</strong>
          <small>Aportes u otros movimientos de entrada</small>
        </article>
        <article>
          <span>Compras</span>
          {renderizarDetalleTipo('Compra')}
        </article>
        <article>
          <span>Inversiones</span>
          {renderizarDetalleTipo('Inversion')}
        </article>
        <article>
          <span>Planillas</span>
          {renderizarDetalleTipo('Planilla')}
        </article>
      </section>

      {consumo.length > 0 && (
        <section className="finanzas-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Consumo físico</p>
              <h2>Productos comprados</h2>
            </div>
          </div>
          <div className="finanzas-consumo-grid">
            {consumo.slice(0, 6).map((item) => (
              <article key={`${item.producto}-${item.unidad}-${item.categoria}`}>
                <span>{item.categoria || 'Sin categoría'}</span>
                <strong>{item.producto}</strong>
                <small>
                  {formatearCantidad(item.cantidadTotal, item.unidad)} · {formatearNumero(item.montoTotal, 'CRC')}
                </small>
              </article>
            ))}
          </div>
        </section>
      )}

      {(resumenPlanilla?.registros > 0 || resumenInversiones?.registros > 0) && (
        <section className="finanzas-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Control interno</p>
              <h2>Planilla e inversiones</h2>
            </div>
          </div>
          <div className="finanzas-consumo-grid">
            <article>
              <span>Planilla registrada</span>
              <strong>{formatearNumero(resumenPlanilla?.total, 'CRC')}</strong>
              <small>
                {resumenPlanilla?.registros || 0} registros · {resumenPlanilla?.totalDias || 0} dias · {resumenPlanilla?.totalHoras || 0} horas
              </small>
            </article>
            <article>
              <span>Principal tipo de trabajo</span>
              <strong>{resumenPlanilla?.porTipoTrabajo?.[0]?.tipoTrabajo || '--'}</strong>
              <small>{formatearNumero(resumenPlanilla?.porTipoTrabajo?.[0]?.total, 'CRC')}</small>
            </article>
            <article>
              <span>Inversion acumulada</span>
              <strong>{formatearNumero(resumenInversiones?.total, 'CRC')}</strong>
              <small>{resumenInversiones?.registros || 0} registros de inversion</small>
            </article>
            <article>
              <span>Depreciacion mensual</span>
              <strong>{formatearNumero(resumenInversiones?.depreciacionMensual, 'CRC')}</strong>
              <small>{resumenInversiones?.depreciables?.registros || 0} activos depreciables</small>
            </article>
          </div>
        </section>
      )}

      <section className="finanzas-panel">
        <div className="finanzas-tabs" role="tablist" aria-label="Tipos de movimiento financiero">
          {tipos.map((tipo) => (
            <button
              key={tipo}
              className={tipo === tipoActivo ? 'finanza-tab activo' : 'finanza-tab'}
              type="button"
              onClick={() => setTipoActivo(tipo)}
            >
              {tipo === 'Inversion' ? 'Inversiones' : tipo}
            </button>
          ))}
        </div>

        <div className="finanzas-rango-fechas">
          <label>
            Desde
            <input
              type="date"
              value={rangoFechas.fechaInicio}
              onChange={(evento) => setRangoFechas((actual) => ({ ...actual, fechaInicio: evento.target.value }))}
              max={rangoFechas.fechaFin || undefined}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={rangoFechas.fechaFin}
              onChange={(evento) => setRangoFechas((actual) => ({ ...actual, fechaFin: evento.target.value }))}
              min={rangoFechas.fechaInicio || undefined}
            />
          </label>
        </div>

        <div className="finanzas-subresumen">
          <article>
            <span>Registros visibles</span>
            <strong>{movimientosFiltrados.length}</strong>
          </article>
          <article>
            <span>Total CRC</span>
            <strong>{formatearNumero(totalPorMoneda.CRC, 'CRC')}</strong>
          </article>
          <article>
            <span>Total USD</span>
            <strong>{formatearNumero(totalPorMoneda.USD, 'USD')}</strong>
          </article>
        </div>

        {resumenPorDestino.length > 0 && (
          <section className="finanzas-bloque-interno">
            <div className="panel-title compacto">
              <div>
                <p className="eyebrow">Destino de uso</p>
                <h3>Resumen del periodo visible</h3>
              </div>
            </div>
            <div className="finanzas-consumo-grid">
              {resumenPorDestino.slice(0, 6).map((destino) => (
                <article key={destino.destinoUso}>
                  <span>{destino.destinoUso}</span>
                  <strong>{formatearTotalesMoneda(destino.totales)}</strong>
                  <small>
                    {destino.registros} registros
                    {destino.productos.length ? ` · ${destino.productos.join(', ')}` : ''}
                  </small>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="finanzas-bloque-interno">
          <div className="panel-title compacto">
            <div>
              <p className="eyebrow">Revision de datos</p>
              <h3>Movimientos por completar</h3>
            </div>
          </div>
          <div className="finanzas-consumo-grid">
            {revisionDatos.resumen.map((item) => (
              <article key={item.id}>
                <span>{item.label}</span>
                <strong>{item.cantidad}</strong>
                <small>En el periodo visible</small>
              </article>
            ))}
          </div>

          {revisionDatos.muestras.length > 0 && (
            <div className="tabla-scroll tabla-dinamica finanzas-revision-tabla">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Categoria</th>
                    <th>Producto</th>
                    <th>Problema</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {revisionDatos.muestras.map(({ movimiento, problemas }) => (
                    <tr key={movimiento._id}>
                      <td>{formatearFecha(movimiento.fecha)}</td>
                      <td>{movimiento.tipoMovimiento}</td>
                      <td>{movimiento.categoriaNormalizada || movimiento.categoria || '--'}</td>
                      <td>{movimiento.producto || '--'}</td>
                      <td>{problemas.join(', ')}</td>
                      <td>
                        <button className="boton-secundario compacto" type="button" onClick={() => abrirEdicion(movimiento)}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <TablaDinamica
          titulo={tipoActivo === 'Todos' ? 'Todos los movimientos' : `Movimientos: ${tipoActivo}`}
          subtitulo="Tabla financiera"
          columnas={columnas}
          datos={movimientosFiltrados}
          cargando={cargando}
          error={error}
          filtros={filtros}
          textoAgregar="Nuevo movimiento"
          onAgregar={abrirNuevoMovimiento}
          onEditar={abrirEdicion}
          onEliminar={eliminarMovimiento}
        />
      </section>
    </section>
  );
};

export default Finanzas;
