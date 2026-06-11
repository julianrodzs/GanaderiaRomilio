import React, { useRef, useState } from 'react';
import { importarExcel } from '../services/api';

const MODULOS_IMPORTACION = [
  { id: 'inventario', nombre: 'Inventario', descripcion: 'Animales con DIIO y datos opcionales' },
  { id: 'potreros', nombre: 'Potreros', descripcion: 'Potreros detectados o inferidos' },
  { id: 'pesajes', nombre: 'Pesajes', descripcion: 'Historial de pesos con animal por DIIO' },
  { id: 'finanzas', nombre: 'Finanzas', descripcion: 'Planillas, inversiones y compras' },
  { id: 'rotaciones', nombre: 'Rotaciones', descripcion: 'Histórico y planificación de potreros' }
];

const ImportarExcel = () => {
  const inputRef = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [archivoPendiente, setArchivoPendiente] = useState(null);
  const [modulosSeleccionados, setModulosSeleccionados] = useState(['inventario', 'potreros', 'pesajes', 'finanzas', 'rotaciones']);
  const [filtroFinanzas, setFiltroFinanzas] = useState({
    fechaInicio: '',
    fechaFin: ''
  });
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
      const data = await importarExcel(archivoSeleccionado, modulosSeleccionados, {
        finanzasFechaInicio: filtroFinanzas.fechaInicio,
        finanzasFechaFin: filtroFinanzas.fechaFin
      });
      setResultado(data);
      setModal('exito');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const alternarModulo = (modulo) => {
    setModulosSeleccionados((actual) => {
      if (actual.includes(modulo)) {
        return actual.filter((item) => item !== modulo);
      }

      return [...actual, modulo];
    });
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
        <small>Selecciona los módulos que quieres procesar. Los campos opcionales vacíos no borran datos existentes.</small>
      </div>

      <section className="modulos-importacion">
        <div>
          <p className="eyebrow">Módulos</p>
          <h3>Qué se va a importar</h3>
        </div>
        <div className="modulos-importacion-grid">
          {MODULOS_IMPORTACION.map((modulo) => (
            <label key={modulo.id} className={modulosSeleccionados.includes(modulo.id) ? 'modulo-importacion activo' : 'modulo-importacion'}>
              <input
                type="checkbox"
                checked={modulosSeleccionados.includes(modulo.id)}
                onChange={() => alternarModulo(modulo.id)}
              />
              <span>
                <strong>{modulo.nombre}</strong>
                <small>{modulo.descripcion}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="filtro-finanzas-importacion">
        <div>
          <p className="eyebrow">Filtro opcional de finanzas</p>
          <h3>Importar movimientos por fecha</h3>
          <small>Si dejas estas fechas vacías, Finanzas leerá todo el Excel. Si usas el filtro, los movimientos financieros sin fecha real se omiten.</small>
        </div>
        <div className="filtro-finanzas-grid">
          <label>
            Desde
            <input
              type="date"
              value={filtroFinanzas.fechaInicio}
              onChange={(evento) => setFiltroFinanzas((actual) => ({ ...actual, fechaInicio: evento.target.value }))}
              disabled={!modulosSeleccionados.includes('finanzas')}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={filtroFinanzas.fechaFin}
              onChange={(evento) => setFiltroFinanzas((actual) => ({ ...actual, fechaFin: evento.target.value }))}
              disabled={!modulosSeleccionados.includes('finanzas')}
            />
          </label>
        </div>
      </section>

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
              <span>Animales actualizados</span>
              <strong>{resultado.resultado?.Animal?.actualizados || 0}</strong>
            </article>
            <article>
              <span>Potreros creados</span>
              <strong>{resultado.resultado?.Potrero?.creados || 0}</strong>
            </article>
            <article>
              <span>Potreros actualizados</span>
              <strong>{resultado.resultado?.Potrero?.actualizados || 0}</strong>
            </article>
            <article>
              <span>Pesajes creados</span>
              <strong>{resultado.resultado?.Pesaje?.creados || 0}</strong>
            </article>
            <article>
              <span>Rotaciones creadas</span>
              <strong>{resultado.resultado?.RotacionPotrero?.creados || 0}</strong>
            </article>
            <article>
              <span>Movimientos financieros</span>
              <strong>{resultado.resultado?.MovimientoFinanciero?.creados || 0}</strong>
            </article>
            <article>
              <span>Registros omitidos</span>
              <strong>
                {(resultado.resultado?.Animal?.omitidos || 0)
                  + (resultado.resultado?.Potrero?.omitidos || 0)
                  + (resultado.resultado?.Pesaje?.omitidos || 0)
                  + (resultado.resultado?.RotacionPotrero?.omitidos || 0)
                  + (resultado.resultado?.MovimientoFinanciero?.omitidos || 0)}
              </strong>
            </article>
          </section>

          {resultado.hojasDetectadas?.length > 0 && (
            <section className="advertencias-importacion">
              <p className="eyebrow">Hojas detectadas</p>
              {resultado.hojasDetectadas.map((hoja, indice) => (
                <div key={`${hoja.nombre}-${indice}`}>
                  <strong>{hoja.nombre}</strong>
                  <span>
                    {hoja.omitidaPorModulo
                      ? 'Detectada, pero omitida porque el módulo no estaba seleccionado.'
                      : hoja.reconocida
                        ? `Módulo: ${hoja.modulo || 'sin clasificar'}`
                        : 'No se encontró un mapeo confiable.'}
                  </span>
                </div>
              ))}
            </section>
          )}

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
            <p>Se procesarán estos módulos: {modulosSeleccionados.map((modulo) => MODULOS_IMPORTACION.find((item) => item.id === modulo)?.nombre || modulo).join(', ') || 'ninguno'}.</p>
            {modulosSeleccionados.includes('finanzas') && (filtroFinanzas.fechaInicio || filtroFinanzas.fechaFin) && (
              <p>
                Finanzas se importará
                {filtroFinanzas.fechaInicio ? ` desde ${filtroFinanzas.fechaInicio}` : ''}
                {filtroFinanzas.fechaFin ? ` hasta ${filtroFinanzas.fechaFin}` : ''}.
              </p>
            )}
            <div className="modal-actions">
              <button className="boton-link" type="button" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button className="boton-primario compacto" type="button" onClick={procesarArchivo} disabled={modulosSeleccionados.length === 0}>
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
