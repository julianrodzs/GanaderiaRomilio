import React, { useState } from 'react';
import { imagenRemota } from '../utils/apariencia.mjs';

const ImagenPersonalizada = ({ src, alt, className = '', vacio = 'Sin imagen' }) => {
  const [urlFallida, setUrlFallida] = useState('');
  const url = imagenRemota(src);
  if (!url || url === urlFallida) {
    return <div className={`${className} imagen-sin-configurar`} role="img" aria-label={alt}>{vacio}</div>;
  }
  return <img className={className} src={url} alt={alt} onError={() => setUrlFallida(url)} />;
};

export default ImagenPersonalizada;
