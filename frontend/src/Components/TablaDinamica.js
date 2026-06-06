import React, { useMemo, useState } from 'react';

const obtenerValor = (fila, columna) => {
  const valor = columna.accessor(fila);
  if (valor === null || valor === undefined || valor === '') return '--';
  return valor;
};

const obtenerValorBusqueda = (fila, columna) => {
  if (columna.searchAccessor) {
    const valor = columna.searchAccessor(fila);
    if (valor === null || valor === undefined || valor === '') return '--';
    return valor;
  }

  return obtenerValor(fila, columna);
};

const obtenerValorOrden = (fila, columna) => {
  if (columna.sortAccessor) {
    return columna.sortAccessor(fila);
  }

  return obtenerValor(fila, columna);
};

const renderizarValor = (fila, columna) => {
  if (columna.render) {
    return columna.render(fila);
  }

  return obtenerValor(fila, columna);
};

const TablaDinamica = ({
  titulo,
  subtitulo,
  columnas,
  datos,
  cargando,
  error,
  filtros = [],
  textoAgregar = 'Nuevo registro',
  onAgregar,
  onEditar,
  onEliminar,
  mostrarAcciones = true
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [filtrosActivos, setFiltrosActivos] = useState({});
  const [orden, setOrden] = useState({ campo: columnas[0]?.id, direccion: 'asc' });

  const datosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const porTexto = texto
      ? datos.filter((fila) => columnas.some((columna) => String(obtenerValorBusqueda(fila, columna)).toLowerCase().includes(texto)))
      : datos;
    const filtrados = porTexto.filter((fila) => filtros.every((filtro) => {
      const valorActivo = filtrosActivos[filtro.id];
      if (!valorActivo || valorActivo === 'Todos') return true;
      return String(filtro.accessor(fila)) === valorActivo;
    }));

    const columnaOrden = columnas.find((columna) => columna.id === orden.campo);
    if (!columnaOrden) return filtrados;

    return [...filtrados].sort((a, b) => {
      const valorA = obtenerValorOrden(a, columnaOrden);
      const valorB = obtenerValorOrden(b, columnaOrden);

      if (valorA === null || valorA === undefined || valorA === '') return orden.direccion === 'asc' ? 1 : -1;
      if (valorB === null || valorB === undefined || valorB === '') return orden.direccion === 'asc' ? -1 : 1;

      const numeroA = Number(valorA);
      const numeroB = Number(valorB);
      const ambosNumericos = Number.isFinite(numeroA) && Number.isFinite(numeroB);
      const resultado = ambosNumericos
        ? numeroA - numeroB
        : String(valorA).localeCompare(String(valorB), 'es', { numeric: true });

      return orden.direccion === 'asc' ? resultado : -resultado;
    });
  }, [busqueda, columnas, datos, filtros, filtrosActivos, orden]);

  const opcionesFiltros = useMemo(() => {
    return Object.fromEntries(filtros.map((filtro) => [
      filtro.id,
      ['Todos', ...Array.from(new Set(datos.map((fila) => filtro.accessor(fila)).filter(Boolean))).sort()]
    ]));
  }, [datos, filtros]);

  const cambiarOrden = (campo) => {
    setOrden((actual) => ({
      campo,
      direccion: actual.campo === campo && actual.direccion === 'asc' ? 'desc' : 'asc'
    }));
  };

  return (
    <section className="vista-tabla">
      <div className="panel-title">
        <div>
          <p className="eyebrow">{subtitulo}</p>
          <h2>{titulo}</h2>
        </div>
        {onAgregar && (
          <button className="boton-primario compacto" type="button" onClick={onAgregar}>+ {textoAgregar}</button>
        )}
      </div>

      <div className="tabla-toolbar">
        <input
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar..."
        />
        {filtros.map((filtro) => (
          <select
            key={filtro.id}
            value={filtrosActivos[filtro.id] || 'Todos'}
            onChange={(evento) => setFiltrosActivos((actual) => ({ ...actual, [filtro.id]: evento.target.value }))}
          >
            {opcionesFiltros[filtro.id]?.map((opcion) => (
              <option key={opcion} value={opcion}>{opcion}</option>
            ))}
          </select>
        ))}
        <span>{datosFiltrados.length} registros</span>
      </div>

      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && <div className="estado-importacion">Cargando datos...</div>}

      <div className="tabla-scroll tabla-dinamica">
        <table>
          <thead>
            <tr>
              {columnas.map((columna) => (
                <th key={columna.id}>
                  <button type="button" onClick={() => cambiarOrden(columna.id)}>
                    {columna.label}
                    {orden.campo === columna.id ? (orden.direccion === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
              {mostrarAcciones && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {datosFiltrados.map((fila) => (
              <tr key={fila._id || fila.id}>
                {columnas.map((columna) => (
                  <td key={columna.id}>{renderizarValor(fila, columna)}</td>
                ))}
                {mostrarAcciones && (
                  <td>
                    <div className="acciones-tabla">
                      <button type="button" aria-label="Editar" title="Editar" onClick={() => onEditar?.(fila)}>✎</button>
                      <button type="button" aria-label="Eliminar" title="Eliminar" onClick={() => onEliminar?.(fila)}>⌫</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default TablaDinamica;
