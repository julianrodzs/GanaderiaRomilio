import React, { useRef, useState } from 'react';
import { importarExcel } from '../services/api';

const ImportarExcel = () => {
  const inputRef = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [archivoPendiente, setArchivoPendiente] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  const seleccionarArchivo = (archivoSeleccionado) => {
    if (!archivoSeleccionado) return;
    setArchivoPendiente(archivoSeleccionado);
    setModal('confirmar');
  };

  const procesarArchivo = async () => {
    const archivoSeleccionado = archivoPendiente;
    if (!archivoSeleccionado) return;

    setModal(null);
    setArchivo(archivoSeleccionado);
    setArchivoPendiente(null);
    setResultado(null);
    setError('');
    setCargando(true);

    try {
      const data = await importarExcel(archivoSeleccionado);
      setResultado(data);
      setModal('exito');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <section className="importar-page">
      <div className="panel-title importar-title">
        <div>
          <p className="eyebrow">Importacion</p>
          <h2>Cargar Excel ganadero</h2>
        </div>
      </div>

      <div
        className={arrastrando ? 'dropzone activo' : 'dropzone'}
        onDragOver={(evento) => {
          evento.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(evento) => {
          evento.preventDefault();
          setArrastrando(false);
          seleccionarArchivo(evento.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(evento) => seleccionarArchivo(evento.target.files[0])}
        />
        <span className="drop-icon">XLSX</span>
        <strong>{archivo ? archivo.name : 'Suelta el archivo Excel aqui'}</strong>
        <small>Al soltarlo se importa directo. Luego revisa Animales, Potreros y Finanzas en sus tablas.</small>
      </div>

      {error && <div className="alerta-formulario">{error}</div>}

      {cargando && <div className="estado-importacion">Importando archivo...</div>}

      {resultado && (
        <section className="confirmacion-panel">
          <p className="eyebrow">Resultado</p>
          <h2>{resultado.mensaje}</h2>
          <section className="importar-resumen">
            <article>
              <span>Animales creados</span>
              <strong>{resultado.resultado?.Animal?.creados || 0}</strong>
            </article>
            <article>
              <span>Animales duplicados</span>
              <strong>{resultado.resultado?.Animal?.duplicados || 0}</strong>
            </article>
            <article>
              <span>Potreros creados</span>
              <strong>{resultado.resultado?.Potrero?.creados || 0}</strong>
            </article>
            <article>
              <span>Potreros duplicados</span>
              <strong>{resultado.resultado?.Potrero?.duplicados || 0}</strong>
            </article>
            <article>
              <span>Movimientos financieros</span>
              <strong>{resultado.resultado?.MovimientoFinanciero?.creados || 0}</strong>
            </article>
            <article>
              <span>Finanzas duplicadas</span>
              <strong>{resultado.resultado?.MovimientoFinanciero?.duplicados || 0}</strong>
            </article>
          </section>

          {resultado.advertencias?.length > 0 && (
            <section className="advertencias-importacion">
              <p className="eyebrow">Advertencias</p>
              {resultado.advertencias.map((advertencia, indice) => (
                <div key={`${advertencia.hoja}-${indice}`}>
                  <strong>{advertencia.hoja}</strong>
                  <span>{advertencia.mensaje}</span>
                </div>
              ))}
            </section>
          )}
        </section>
      )}

      {modal === 'confirmar' && (
        <div className="modal-backdrop">
          <section className="modal-panel">
            <p className="eyebrow">Confirmar importacion</p>
            <h2>Subir este Excel</h2>
            <p>{archivoPendiente?.name}</p>
            <div className="modal-actions">
              <button className="boton-link" type="button" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button className="boton-primario compacto" type="button" onClick={procesarArchivo}>
                Importar
              </button>
            </div>
          </section>
        </div>
      )}

      {modal === 'exito' && (
        <div className="modal-backdrop">
          <section className="modal-panel">
            <p className="eyebrow">Importacion exitosa</p>
            <h2>Archivo subido correctamente</h2>
            <p>Ya puedes revisar los datos en Inventario, Potreros y Finanzas.</p>
            <div className="modal-actions">
              <button className="boton-primario compacto" type="button" onClick={() => setModal(null)}>
                Entendido
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

export default ImportarExcel;
