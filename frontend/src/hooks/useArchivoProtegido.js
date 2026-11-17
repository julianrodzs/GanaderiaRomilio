import { useEffect, useState } from 'react';
import { contextoArchivosProtegidos, obtenerUrlArchivoProtegido } from '../services/api';

const useArchivoProtegido = (ruta) => {
  const contexto = contextoArchivosProtegidos();
  const [estado, setEstado] = useState({ ruta: '', contexto: '', url: '' });

  useEffect(() => {
    let activa = true;
    let liberar = () => {};

    if (!ruta) {
      setEstado({ ruta, contexto, url: '' });
      return undefined;
    }

    obtenerUrlArchivoProtegido(ruta)
      .then((recurso) => {
        liberar = recurso.liberar;
        if (!activa) { liberar(); return; }
        setEstado({ ruta, contexto, url: recurso.url });
      })
      .catch(() => {
        if (activa) setEstado({ ruta, contexto, url: '' });
      });

    return () => {
      activa = false;
      liberar();
    };
  }, [ruta, contexto]);

  return estado.ruta === ruta && estado.contexto === contexto ? estado.url : '';
};

export default useArchivoProtegido;
