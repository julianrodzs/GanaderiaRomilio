import { useEffect, useState } from 'react';
import { obtenerArchivoProtegido } from '../services/api';

const useArchivoProtegido = (ruta) => {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let activa = true;
    let urlTemporal = '';

    if (!ruta) {
      setUrl('');
      return undefined;
    }

    obtenerArchivoProtegido(ruta)
      .then((blob) => {
        if (!activa) return;
        urlTemporal = URL.createObjectURL(blob);
        setUrl(urlTemporal);
      })
      .catch(() => {
        if (activa) setUrl('');
      });

    return () => {
      activa = false;
      if (urlTemporal) URL.revokeObjectURL(urlTemporal);
    };
  }, [ruta]);

  return url;
};

export default useArchivoProtegido;
