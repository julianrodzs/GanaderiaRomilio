export const ATRIBUCIONES = {
  CONFIRMADA: { texto: 'Confirmada', clase: 'confirmada' },
  PROBABLE: { texto: 'Probable', clase: 'probable' },
  INCIERTA: { texto: 'Incierta (requiere revisión)', clase: 'incierta' },
  SIN_SERVICIO: { texto: 'Sin servicio registrado', clase: 'sin-servicio' }
};
const etiquetas = {
  REPRODUCCION: 'Reproducción', ENGORDE: 'Engorde', CRIA: 'Cría', REEMPLAZO: 'Reemplazo',
  ADAPTACION: 'Adaptación', DESARROLLO: 'Desarrollo', FINALIZACION: 'Finalización', MIXTO: 'Mixto',
  IN_VIVO: 'In vivo', FIV: 'FIV', FRESCO: 'Fresco', CONGELADO: 'Congelado', VITRIFICADO: 'Vitrificado',
  ACTIVO: 'Activo', ACTIVA: 'Activa', COMPLETADO: 'Completado', CERRADO: 'Cerrado', CERRADA: 'Cerrada',
  CANCELADO: 'Cancelado', CANCELADA: 'Cancelada', PRENADA: 'Preñada', PENDIENTE: 'Pendiente'
};
export const etiquetaReporte = (valor) => {
  if (valor == null || valor === '') return 'Sin datos';
  return etiquetas[valor] || ATRIBUCIONES[valor]?.texto || (/^[A-Z][A-Z_0-9]+$/.test(String(valor)) && String(valor).includes('_') ? String(valor).toLowerCase().replaceAll('_', ' ').replace(/^./, (s) => s.toUpperCase()) : String(valor));
};
