export const OBJETIVOS_PRODUCTIVOS = ['ENGORDE', 'REPRODUCCION', 'REEMPLAZO', 'OTRO', 'SIN_DEFINIR'];
export const OBJETIVOS_LINEA_PRODUCTIVA = OBJETIVOS_PRODUCTIVOS.filter((objetivo) => objetivo !== 'SIN_DEFINIR');

export const ETIQUETAS_OBJETIVO_PRODUCTIVO = {
  ENGORDE: 'Engorde',
  REPRODUCCION: 'Reproducción',
  REEMPLAZO: 'Reemplazo',
  OTRO: 'Otro',
  SIN_DEFINIR: 'Sin definir'
};

export const PROPOSITOS_LOTE = ['ENGORDE', 'REPRODUCCION', 'REEMPLAZO', 'DESTETE', 'CUARENTENA', 'VENTA', 'OTRO'];

export const ETIQUETAS_PROPOSITO_LOTE = {
  ...ETIQUETAS_OBJETIVO_PRODUCTIVO,
  DESTETE: 'Destete',
  CUARENTENA: 'Cuarentena',
  VENTA: 'Venta'
};

const claveNormalizada = (valor) => String(valor || '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\s-]+/g, '_')
  .toUpperCase();

export const normalizarObjetivoProductivo = (valor) => {
  const clave = claveNormalizada(valor);
  if (!clave || clave === 'SIN_DEFINIR') return 'SIN_DEFINIR';
  if (clave === 'CRIA' || clave === 'REPRODUCCION') return 'REPRODUCCION';
  return OBJETIVOS_PRODUCTIVOS.includes(clave) ? clave : null;
};

export const etiquetaObjetivoProductivo = (valor) => ETIQUETAS_OBJETIVO_PRODUCTIVO[valor] || valor || 'Sin definir';
export const etiquetaPropositoLote = (valor) => ETIQUETAS_PROPOSITO_LOTE[valor] || valor || 'Sin definir';
