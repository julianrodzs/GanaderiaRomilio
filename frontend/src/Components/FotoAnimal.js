import React, { useEffect, useId, useRef, useState } from 'react';
import useArchivoProtegido from '../hooks/useArchivoProtegido';

const FotoAnimal = ({ animal, detalle = false }) => {
  const [imagenInvalida, setImagenInvalida] = useState(false);
  const visor = useRef(null);
  const tituloVisor = useId();
  const url = animal?.fotoPrincipal?.url;
  const urlProtegida = useArchivoProtegido(url?.startsWith('/api/archivos/') ? url : '');
  const imagen = url?.startsWith('/api/archivos/') ? urlProtegida : url;
  const identificador = animal?.nombre || animal?.diio || animal?.identificadorFinca || 'Animal';
  const titulo = [animal?.diio || animal?.identificadorFinca, animal?.nombre].filter(Boolean).join(' - ') || 'Animal';
  const inicial = identificador.trim().charAt(0).toUpperCase() || 'A';
  const disponible = Boolean(imagen && !imagenInvalida);

  useEffect(() => {
    setImagenInvalida(false);
    visor.current?.close();
  }, [url]);

  const marcarImagenInvalida = () => {
    visor.current?.close();
    setImagenInvalida(true);
  };
  const fotografia = disponible
    ? <img src={imagen} alt={`Fotografía de ${identificador}`} onError={marcarImagenInvalida} />
    : <span aria-label="Sin fotografía">{inicial}</span>;

  return (
    <>
      <div className={`foto-animal ${detalle ? 'foto-animal-detalle' : 'foto-animal-miniatura'}`}>
        {detalle && disponible ? (
          <button
            className="foto-animal-ampliar"
            type="button"
            title="Ver foto completa"
            aria-label={`Ver foto completa de ${identificador}`}
            aria-haspopup="dialog"
            onClick={() => visor.current?.showModal()}
          >
            {fotografia}
          </button>
        ) : fotografia}
      </div>
      {detalle && disponible && (
        <dialog
          ref={visor}
          className="visor-foto-animal"
          aria-labelledby={tituloVisor}
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) visor.current.close();
          }}
        >
          <div className="visor-foto-animal-contenido">
            <header>
              <h3 id={tituloVisor}>{titulo}</h3>
              <button className="boton-secundario compacto" type="button" onClick={() => visor.current.close()}>Cerrar</button>
            </header>
            <img src={imagen} alt={`Fotografía completa de ${identificador}`} onError={marcarImagenInvalida} />
          </div>
        </dialog>
      )}
    </>
  );
};

export default FotoAnimal;
