import React, { useEffect, useMemo, useState } from 'react';
import { obtenerDetalleMultiFinca, obtenerFincas, obtenerReporteMultiFinca } from '../services/api';
import GestionConsolidacionPremium from './GestionConsolidacionPremium';

const moneda = (valor) => new Intl.NumberFormat('es-CR', {
  style: 'currency', currency: 'CRC', maximumFractionDigits: 0
}).format(valor || 0);
const monedaUSD = (valor) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2
}).format(valor || 0);
const numero = (valor, decimales = 0) => new Intl.NumberFormat('es-CR', {
  maximumFractionDigits: decimales
}).format(valor || 0);

const ReporteMultiFinca = ({ fechaInicio, fechaFin, especie, puedeConfigurar = false }) => {
  const [fincas, setFincas] = useState([]);
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  useEffect(() => {
    obtenerFincas()
      .then((items) => {
        const activas = items.filter((finca) => finca.estado === 'Activa');
        setFincas(activas);
        setSeleccionadas(activas.map((finca) => finca._id));
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!seleccionadas.length) {
      setDatos(null);
      setCargando(false);
      return undefined;
    }
    let vigente = true;
    setCargando(true);
    setError('');
    obtenerReporteMultiFinca({
      fechaInicio,
      fechaFin,
      especie: especie === 'Todos' ? '' : especie,
      fincaIds: seleccionadas.join(',')
    })
      .then((respuesta) => { if (vigente) setDatos(respuesta); })
      .catch((err) => { if (vigente) setError(err.message); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [fechaInicio, fechaFin, especie, seleccionadas.join(','), version]);

  const maxAnimales = useMemo(() => Math.max(...(datos?.fincas || []).map((item) => item.inventario.activos), 1), [datos]);
  const alternarFinca = (id) => setSeleccionadas((actuales) => (
    actuales.includes(id) ? actuales.filter((item) => item !== id) : [...actuales, id]
  ));

  const abrirDetalle = async (finca, metrica = 'animales') => {
    try {
      setCargandoDetalle(true); setError('');
      const respuesta = await obtenerDetalleMultiFinca({ fincaId: finca._id, metrica, fechaInicio, fechaFin, especie: especie === 'Todos' ? '' : especie });
      setDetalle({ ...respuesta, metrica });
    } catch (err) { setError(err.message); } finally { setCargandoDetalle(false); }
  };

  const valorDetalle = (valor) => {
    if (valor == null || valor === '') return '--';
    if (Array.isArray(valor)) return `${valor.length} elemento(s)`;
    if (typeof valor === 'object') return valor.diio || valor.nombre || valor._id || '--';
    if (String(valor).match(/^\d{4}-\d{2}-\d{2}T/)) return new Date(valor).toLocaleDateString('es-CR');
    return String(valor);
  };

  return (
    <section className="reporte-panel reporte-panel-amplio multi-finca-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Premium · Multi-finca</p>
          <h3>Comparativo y consolidado de fincas</h3>
          <p>¿Cómo se comparan el inventario, las finanzas, la reproducción y la sanidad entre fincas?</p>
        </div>
      </div>
      <div className="multi-finca-selector" aria-label="Fincas incluidas en el reporte">
        <button type="button" onClick={() => setSeleccionadas(fincas.map((finca) => finca._id))}>Todas</button>
        {fincas.map((finca) => (
          <label key={finca._id}>
            <input type="checkbox" checked={seleccionadas.includes(finca._id)} onChange={() => alternarFinca(finca._id)} />
            {finca.codigo} · {finca.nombre}
          </label>
        ))}
      </div>
      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && <div className="estado-importacion">Calculando comparación...</div>}
      {!cargando && !seleccionadas.length && <p className="reporte-vacio">Selecciona al menos una finca.</p>}
      {datos && !cargando && (
        <>
          <div className="reportes-metricas multi-finca-metricas">
            <article><span>Fincas incluidas</span><strong>{datos.consolidado.fincas}</strong></article>
            <article><span>Animales activos</span><strong>{numero(datos.consolidado.animalesActivos)}</strong><small>{datos.consolidado.bovinos} bovinos · {datos.consolidado.porcinos} porcinos</small></article>
            <article><span>Ingresos</span><strong>{moneda(datos.consolidado.monedas?.CRC?.ingresos)}</strong><small>{monedaUSD(datos.consolidado.monedas?.USD?.ingresos)}</small></article>
            <article><span>Egresos</span><strong>{moneda(datos.consolidado.monedas?.CRC?.egresos)}</strong><small>{monedaUSD(datos.consolidado.monedas?.USD?.egresos)}</small></article>
            <article><span>Balance</span><strong>{moneda(datos.consolidado.monedas?.CRC?.balance)}</strong><small>{monedaUSD(datos.consolidado.monedas?.USD?.balance)}</small></article>
            <article><span>Partos / destetes</span><strong>{datos.consolidado.partos} / {datos.consolidado.destetes}</strong></article>
            <article><span>Traslados internos</span><strong>{numero(datos.consolidado.traslados)}</strong><small>{moneda(datos.consolidado.monedas?.CRC?.transferenciasInternas)} · {monedaUSD(datos.consolidado.monedas?.USD?.transferenciasInternas)} sin afectar el consolidado</small></article>
            <article><span>Gasto compartido</span><strong>{moneda(datos.consolidado.monedas?.CRC?.gastosCompartidos)}</strong><small>{monedaUSD(datos.consolidado.monedas?.USD?.gastosCompartidos)}</small></article>
          </div>
          <div className="multi-finca-barras">
            {datos.fincas.map((item) => (
              <article key={item.finca._id}>
                <div><strong>{item.finca.nombre}</strong><span>{numero(item.inventario.activos)} activos</span></div>
                <div className="barra-base"><span style={{ width: `${Math.max((item.inventario.activos / maxAnimales) * 100, 3)}%` }} /></div>
              </article>
            ))}
          </div>
          <div className="tabla-scroll tabla-dinamica">
            <table>
              <thead><tr><th>Finca</th><th>Activos</th><th>Participación</th><th>Peso promedio</th><th>Ingresos</th><th>Egresos</th><th>Balance</th><th>Transferencia interna</th><th>Gasto compartido</th><th>Partos</th><th>Destetes</th><th>Aplicaciones</th><th>Tratamientos activos</th><th>Traslados</th><th>Detalle</th></tr></thead>
              <tbody>{datos.fincas.map((item) => (
                <tr key={item.finca._id}>
                  <td>{item.finca.codigo}<small>{item.finca.nombre}</small></td>
                  <td>{numero(item.inventario.activos)}</td>
                  <td>{numero(item.participacion.inventarioPct, 1)}%</td>
                  <td>{item.inventario.pesoPromedio == null ? '--' : `${numero(item.inventario.pesoPromedio, 1)} kg`}</td>
                  <td>{moneda(item.finanzas.monedas?.CRC?.ingresos)}<small>{monedaUSD(item.finanzas.monedas?.USD?.ingresos)}</small></td><td>{moneda(item.finanzas.monedas?.CRC?.egresos)}<small>{monedaUSD(item.finanzas.monedas?.USD?.egresos)}</small></td><td>{moneda(item.finanzas.monedas?.CRC?.ingresos - item.finanzas.monedas?.CRC?.egresos)}<small>{monedaUSD((item.finanzas.monedas?.USD?.ingresos || 0) - (item.finanzas.monedas?.USD?.egresos || 0))}</small></td>
                  <td>{moneda((item.finanzas.monedas?.CRC?.transferenciasEntrantes || 0) - (item.finanzas.monedas?.CRC?.transferenciasSalientes || 0))}<small>{monedaUSD((item.finanzas.monedas?.USD?.transferenciasEntrantes || 0) - (item.finanzas.monedas?.USD?.transferenciasSalientes || 0))}</small></td><td>{moneda(item.finanzas.monedas?.CRC?.gastosCompartidos)}<small>{monedaUSD(item.finanzas.monedas?.USD?.gastosCompartidos)}</small></td>
                  <td>{item.reproduccion.partos}</td><td>{item.reproduccion.destetes}</td><td>{item.sanidad.aplicaciones}</td><td>{item.sanidad.tratamientosActivos}</td>
                  <td>{item.traslados.entradas} / {item.traslados.salidas}</td>
                  <td><button className="boton-secundario compacto" type="button" onClick={() => abrirDetalle(item.finca)}>Ver</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <GestionConsolidacionPremium
            fincas={fincas}
            seleccionadas={seleccionadas}
            fechaInicio={fechaInicio}
            fechaFin={fechaFin}
            especie={especie}
            datos={datos}
            puedeConfigurar={puedeConfigurar}
            onActualizar={() => setVersion((actual) => actual + 1)}
          />
        </>
      )}
      {cargandoDetalle && <div className="estado-importacion">Cargando detalle...</div>}
      {detalle && (
        <div className="modal-backdrop"><section className="modal-panel detalle-consolidacion-modal">
          <div className="panel-title"><div><p className="eyebrow">Trazabilidad</p><h2>{detalle.finca.nombre}</h2></div><button className="boton-link" type="button" onClick={() => setDetalle(null)}>Cerrar</button></div>
          <label>Métrica<select value={detalle.metrica} onChange={(e) => abrirDetalle(detalle.finca, e.target.value)}><option value="animales">Animales activos</option><option value="finanzas">Finanzas</option><option value="partos">Partos</option><option value="destetes">Destetes</option><option value="sanidad">Aplicaciones sanitarias</option><option value="tratamientos">Tratamientos activos</option></select></label>
          {!detalle.datos.length ? <p className="reporte-vacio">Sin registros para este criterio.</p> : <div className="tabla-scroll tabla-dinamica"><table><thead><tr>{Object.keys(detalle.datos[0]).filter((campo) => !campo.startsWith('_')).slice(0, 8).map((campo) => <th key={campo}>{campo}</th>)}</tr></thead><tbody>{detalle.datos.map((item) => <tr key={item._id}>{Object.keys(detalle.datos[0]).filter((campo) => !campo.startsWith('_')).slice(0, 8).map((campo) => <td key={campo}>{valorDetalle(item[campo])}</td>)}</tr>)}</tbody></table></div>}
        </section></div>
      )}
    </section>
  );
};

export default ReporteMultiFinca;
