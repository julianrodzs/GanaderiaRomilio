import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

const PREFIJO_PAGINACION = 'ganaderia-romilio:paginacion:';
const TAMANOS_PERMITIDOS = [10, 25, 50];

const leerPaginacion = (clave, tamanoInicial) => {
  if (!clave || typeof window === 'undefined') return { pagina: 1, tamanoPagina: tamanoInicial };

  try {
    const guardado = JSON.parse(window.sessionStorage.getItem(`${PREFIJO_PAGINACION}${clave}`));
    const pagina = Number.isInteger(guardado?.pagina) && guardado.pagina > 0 ? guardado.pagina : 1;
    const tamanoPagina = TAMANOS_PERMITIDOS.includes(guardado?.tamanoPagina)
      ? guardado.tamanoPagina
      : tamanoInicial;
    return { pagina, tamanoPagina };
  } catch {
    return { pagina: 1, tamanoPagina: tamanoInicial };
  }
};

export const usePaginacionControlada = (clave, tamanoInicial = 10) => {
  const inicial = useMemo(() => leerPaginacion(clave, tamanoInicial), [clave, tamanoInicial]);
  const [pagina, setPagina] = useState(inicial.pagina);
  const [tamanoPagina, setTamanoPagina] = useState(inicial.tamanoPagina);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        `${PREFIJO_PAGINACION}${clave}`,
        JSON.stringify({ pagina, tamanoPagina })
      );
    } catch {
      // La navegación sigue funcionando aunque el navegador bloquee sessionStorage.
    }
  }, [clave, pagina, tamanoPagina]);

  return { pagina, setPagina, tamanoPagina, setTamanoPagina };
};

export const usePaginacionTabla = (datos = [], tamanoInicial = 10, clavePersistencia = '') => {
  const idAutomatico = useId();
  const rutaActual = typeof window === 'undefined' ? 'servidor' : window.location.pathname;
  const clave = clavePersistencia || `automatica:${rutaActual}:${idAutomatico}`;
  const estadoInicial = useMemo(() => leerPaginacion(clave, tamanoInicial), [clave, tamanoInicial]);
  const [pagina, setPagina] = useState(estadoInicial.pagina);
  const [tamanoPagina, setTamanoPagina] = useState(estadoInicial.tamanoPagina);
  const claveAnterior = useRef(clave);
  const total = datos.length;
  const totalPaginas = Math.max(Math.ceil(total / tamanoPagina), 1);

  useEffect(() => {
    if (total > 0) setPagina((actual) => Math.min(actual, totalPaginas));
  }, [total, totalPaginas]);

  useEffect(() => {
    if (claveAnterior.current !== clave) return;
    try {
      window.sessionStorage.setItem(
        `${PREFIJO_PAGINACION}${clave}`,
        JSON.stringify({ pagina, tamanoPagina })
      );
    } catch {
      // La navegación sigue funcionando aunque el navegador bloquee sessionStorage.
    }
  }, [clave, pagina, tamanoPagina]);

  useEffect(() => {
    if (claveAnterior.current === clave) return;
    const guardado = leerPaginacion(clave, tamanoInicial);
    claveAnterior.current = clave;
    setPagina(guardado.pagina);
    setTamanoPagina(guardado.tamanoPagina);
  }, [clave, tamanoInicial]);

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

export const ContenidoPaginado = ({ datos = [], children, tamanoInicial = 10, clavePaginacion = '' }) => {
  const paginacion = usePaginacionTabla(datos, tamanoInicial, clavePaginacion);

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
