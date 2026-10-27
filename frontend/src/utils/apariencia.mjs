export const APARIENCIA_VACIA = Object.freeze({ logo: '', dashboard: '', potreros: '' });

export const validarImagenApariencia = (archivo, maximoMb = 8) => {
  if (!archivo || !archivo.size) return 'Selecciona una imagen que no esté vacía.';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
    return 'La imagen debe estar en formato JPG, PNG o WebP.';
  }
  if (archivo.size > maximoMb * 1024 * 1024) return `La imagen no puede superar ${maximoMb} MB.`;
  return '';
};

export const imagenRemota = (valor) => {
  if (typeof valor !== 'string') return '';
  const url = valor.trim();
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol) ? url : '';
  } catch {
    return '';
  }
};

export const normalizarApariencia = (datos = {}) => ({
  logo: imagenRemota(datos?.logo),
  dashboard: imagenRemota(datos?.dashboard),
  potreros: imagenRemota(datos?.potreros),
  almacenamientoDisponible: datos?.almacenamientoDisponible === true,
  cargando: false
});
