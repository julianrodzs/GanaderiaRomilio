export const TIPOS_PESAJE = [
  { valor: 'REGULAR', etiqueta: 'Control / Regular', corto: 'Regular' },
  { valor: 'NACIMIENTO', etiqueta: 'Peso al nacimiento', corto: 'Nacimiento' },
  { valor: 'DESTETE', etiqueta: 'Peso al destete', corto: 'Destete' },
  { valor: 'ENTRADA_ENGORDE', etiqueta: 'Entrada a engorde / ceba', corto: 'Entrada a engorde' },
  { valor: 'SALIDA_VENTA', etiqueta: 'Salida / Pre-venta', corto: 'Salida / Venta' }
];
export const normalizarTipoPesaje = (valor) => TIPOS_PESAJE.some((t) => t.valor === valor) ? valor : 'REGULAR';
export const etiquetaTipoPesaje = (valor) => TIPOS_PESAJE.find((t) => t.valor === normalizarTipoPesaje(valor)).corto;
