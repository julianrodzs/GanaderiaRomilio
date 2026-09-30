import React, { useEffect, useMemo, useState } from 'react';

export const usePaginacionTabla = (datos = [], tamanoInicial = 10) => {
  const [pagina, setPagina] = useState(1);
  const [tamanoPagina, setTamanoPagina] = useState(tamanoInicial);
  const total = datos.length;
  const totalPaginas = Math.max(Math.ceil(total / tamanoPagina), 1);

  useEffect(() => {
    setPagina((actual) => Math.min(actual, totalPaginas));
  }, [totalPaginas]);

  const datosPagina = useMemo(() => {
    const inicio = (pagina - 1) * tamanoPagina;
    return datos.slice(inicio, inicio + tamanoPagina);
  }, [datos, pagina, tamanoPagina]);

  return {
    datosPagina,
    pagina,
    tamanoPagina,
    total,
    totalPaginas,
    setPagina,
    setTamanoPagina
  };
};

const PaginacionTabla = ({
  pagina,
  tamanoPagina,
  total,
  totalPaginas,
  onPagina,
  onTamanoPagina
}) => {
  if (!total || total <= 10) return null;

  const inicio = (pagina - 1) * tamanoPagina + 1;
  const fin = Math.min(pagina * tamanoPagina, total);

  return (
    <div className="paginacion-tabla" aria-label="Paginación de tabla">
      <span>{inicio}-{fin} de {total}</span>
      <label>
        Filas
        <select
          value={tamanoPagina}
          onChange={(evento) => onTamanoPagina(Number(evento.target.value))}
        >
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
        </select>
      </label>
      <div>
        <button
          type="button"
          title="Página anterior"
          aria-label="Página anterior"
          onClick={() => onPagina(pagina - 1)}
          disabled={pagina <= 1}
        >
          ‹
        </button>
        <span>Página {pagina} de {totalPaginas}</span>
        <button
          type="button"
          title="Página siguiente"
          aria-label="Página siguiente"
          onClick={() => onPagina(pagina + 1)}
          disabled={pagina >= totalPaginas}
        >
          ›
        </button>
      </div>
    </div>
  );
};

export const ContenidoPaginado = ({ datos = [], children, tamanoInicial = 10 }) => {
  const paginacion = usePaginacionTabla(datos, tamanoInicial);

  return (
    <>
      {children(paginacion.datosPagina)}
      <PaginacionTabla
        pagina={paginacion.pagina}
        tamanoPagina={paginacion.tamanoPagina}
        total={paginacion.total}
        totalPaginas={paginacion.totalPaginas}
        onPagina={paginacion.setPagina}
        onTamanoPagina={(tamano) => {
          paginacion.setTamanoPagina(tamano);
          paginacion.setPagina(1);
        }}
      />
    </>
  );
};

export default PaginacionTabla;
