import React, { useEffect, useMemo, useState } from 'react';
import {
  actualizarMovimientoFinanciero,
  crearMovimientoFinanciero,
  eliminarMovimientoFinanciero,
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
  return `${cantidad}${unidad ? ` ${unidad}` : ''}`;
};

const detalleOperativo = (movimiento) => {
  if (movimiento.tipoMovimiento === 'Planilla') {
    return movimiento.tipoTrabajo || movimiento.empleado || 'Mano de obra';
  }

  if (movimiento.tipoMovimiento === 'Inversion') {
    return [movimiento.tipoInversion, movimiento.activoAsociado].filter(Boolean).join(' · ') || movimiento.categoria;
  }

  return movimiento.producto || movimiento.proveedor || '--';
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
  { id: 'naturaleza', label: 'Naturaleza', accessor: (movimiento) => movimiento.naturaleza },
  { id: 'categoria', label: 'Categoria', accessor: (movimiento) => movimiento.categoria },
  { id: 'detalleOperativo', label: 'Detalle operativo', accessor: detalleOperativo },
  { id: 'producto', label: 'Producto', accessor: (movimiento) => movimiento.producto },
  {
    id: 'cantidad',
    label: 'Cantidad',
    accessor: (movimiento) => formatearCantidad(movimiento.cantidad, movimiento.unidad),
    sortAccessor: (movimiento) => movimiento.cantidad ?? null,
    searchAccessor: (movimiento) => `${movimiento.cantidad ?? ''} ${movimiento.unidad || ''}`
  },
  { id: 'descripcion', label: 'Descripcion', accessor: (movimiento) => movimiento.descripcion },
  {
    id: 'monto',
    label: 'Monto',
    accessor: formatearMonto,
    sortAccessor: (movimiento) => movimiento.monto ?? null,
    searchAccessor: (movimiento) => `${formatearMonto(movimiento)} ${movimiento.monto ?? ''}`
  },
  { id: 'moneda', label: 'Moneda', accessor: (movimiento) => movimiento.moneda || 'CRC' },
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
  { id: 'categoria', accessor: (movimiento) => movimiento.categoria },
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
    if (tipoActivo === 'Todos') return movimientos;
    return movimientos.filter((movimiento) => movimiento.tipoMovimiento === tipoActivo);
  }, [movimientos, tipoActivo]);

  const totalPorMoneda = useMemo(() => {
    return movimientosFiltrados.reduce((acumulado, movimiento) => {
      const moneda = movimiento.moneda || 'CRC';
      acumulado[moneda] = (acumulado[moneda] || 0) + (movimiento.monto || 0);
      return acumulado;
    }, {});
  }, [movimientosFiltrados]);

  const totalesPorTipo = useMemo(() => sumarPorTipoYMoneda(movimientos), [movimientos]);

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

  return (
    <section className="finanzas-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Costos y finanzas</p>
          <h2>Movimientos financieros</h2>
        </div>
        <button className="boton-primario compacto" type="button" onClick={cargarFinanzas} disabled={cargando}>
          {cargando ? 'Actualizando...' : 'Actualizar'}
        </button>
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
