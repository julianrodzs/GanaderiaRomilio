import React, { useRef, useState } from 'react';
import {
  confirmarImportacionExcel,
  descargarPlantillaImportacion,
  previsualizarExcel
} from '../services/api';

const MODELOS = [
  { id: 'Potrero', nombre: 'Potreros', campos: ['codigo', 'nombre', 'estado'] },
  { id: 'Animal', nombre: 'Inventario', campos: ['diio', 'especie', 'sexo', 'categoria', 'nombre'] },
  { id: 'MovimientoFinanciero', nombre: 'Finanzas', campos: ['fecha', 'naturaleza', 'tipoMovimiento', 'categoria', 'descripcion', 'monto'] },
  { id: 'Pesaje', nombre: 'Pesajes', campos: ['diio', 'fecha', 'peso'] }
];

const ETIQUETAS = {
  codigo: 'Código',
  nombre: 'Nombre',
  estado: 'Estado',
  diio: 'DIIO',
  especie: 'Especie',
  sexo: 'Sexo',
  categoria: 'Categoría',
  fecha: 'Fecha',
  naturaleza: 'Naturaleza',
  tipoMovimiento: 'Tipo',
  descripcion: 'Descripción',
  monto: 'Monto',
  peso: 'Peso kg'
};

const formatearValor = (valor, campo) => {
  if (valor === undefined || valor === null || valor === '') return '--';
  if (campo === 'fecha' && typeof valor === 'string') {
    const fecha = new Date(valor);
    if (!Number.isNaN(fecha.getTime())) return fecha.toLocaleDateString('es-CR');
  }
  return String(valor);
};

const ImportarExcel = () => {
  const inputRef = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [modo, setModo] = useState('crear_actualizar');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState('');
  const [arrastrando, setArrastrando] = useState(false);

  const validarArchivo = async (archivoSeleccionado) => {
    if (!archivoSeleccionado) return;
    if (!archivoSeleccionado.name.toLowerCase().endsWith('.xlsx')) {
      setError('Selecciona un archivo con extensión .xlsx.');
      return;
    }

    setArchivo(archivoSeleccionado);
    setPreview(null);
    setResultado(null);
    setError('');
    setCargando('validando');
    try {
      setPreview(await previsualizarExcel(archivoSeleccionado));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando('');
    }
  };

  const descargarPlantilla = async () => {
    setError('');
    setCargando('descargando');
    try {
      const blob = await descargarPlantillaImportacion();
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = 'plantilla-importacion-ganaderia.xlsx';
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando('');
    }
  };

  const confirmar = async () => {
    if (!preview?.importacionId || !preview?.puedeConfirmar) return;
    setError('');
    setCargando('importando');
    try {
      setResultado(await confirmarImportacionExcel(preview.importacionId, modo));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando('');
    }
  };

  const totalResultado = (campo) => MODELOS.reduce(
    (total, modelo) => total + (resultado?.resultado?.[modelo.id]?.[campo] || 0),
    0
  );

  return (
    <section className="importar-page">
      <div className="panel-title importar-title">
        <div>
          <p className="eyebrow">Importación</p>
          <h2>Importar datos de la finca</h2>
        </div>
        <button className="boton-secundario" type="button" onClick={descargarPlantilla} disabled={Boolean(cargando)}>
          Descargar plantilla
        </button>
      </div>

      <section className="importador-estandar">
        <div>
          <p className="eyebrow">Formato estándar</p>
          <h3>Un libro, cuatro hojas definidas</h3>
        </div>
        <div className="importador-estandar-grid">
          <article><strong>POTREROS</strong><span>Código, nombre y datos físicos.</span></article>
          <article><strong>INVENTARIO</strong><span>DIIO, especie, sexo y categoría.</span></article>
          <article><strong>FINANZAS</strong><span>Movimientos con categorías activas.</span></article>
          <article><strong>PESAJES</strong><span>Opcional, relacionado por DIIO.</span></article>
        </div>
      </section>

      <div
        className={arrastrando ? 'dropzone activo' : 'dropzone'}
        onDragOver={(evento) => { evento.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(evento) => {
          evento.preventDefault();
          setArrastrando(false);
          validarArchivo(evento.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter' || evento.key === ' ') inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(evento) => {
            validarArchivo(evento.target.files[0]);
            evento.target.value = '';
          }}
        />
        <span className="drop-icon">XLSX</span>
        <strong>{archivo ? archivo.name : 'Suelta aquí la plantilla completada'}</strong>
        <small>Primero se valida todo el libro. Ningún dato se guarda hasta que confirmes la vista previa.</small>
      </div>

      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && (
        <div className="estado-importacion">
          {cargando === 'validando' && 'Validando columnas, valores y relaciones...'}
          {cargando === 'importando' && 'Guardando el lote validado...'}
          {cargando === 'descargando' && 'Generando plantilla con los catálogos actuales...'}
        </div>
      )}

      {preview && !resultado && (
        <section className="confirmacion-panel">
          <div className="preview-encabezado">
            <div>
              <p className="eyebrow">Vista previa</p>
              <h2>{preview.valido ? 'Archivo listo para importar' : 'El archivo necesita correcciones'}</h2>
            </div>
            <span className={preview.valido ? 'importacion-estado valido' : 'importacion-estado invalido'}>
              {preview.valido ? 'Válido' : `${preview.errores?.length || 0} errores`}
            </span>
          </div>

          <div className="importar-resumen">
            {MODELOS.map((modelo) => (
              <article key={modelo.id}>
                <span>{modelo.nombre}</span>
                <strong>{preview.resumen?.[modelo.id] || 0}</strong>
                <small>filas válidas</small>
              </article>
            ))}
          </div>

          {preview.errores?.length > 0 && (
            <section className="errores-importacion">
              <p className="eyebrow">Errores por corregir</p>
              <div className="tabla-scroll">
                <table>
                  <thead><tr><th>Hoja</th><th>Fila</th><th>Campo</th><th>Detalle</th></tr></thead>
                  <tbody>
                    {preview.errores.map((item, indice) => (
                      <tr key={`${item.hoja}-${item.fila}-${item.campo}-${indice}`}>
                        <td>{item.hoja}</td><td>{item.fila || '--'}</td><td>{item.campo}</td><td>{item.mensaje}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {preview.advertencias?.length > 0 && (
            <section className="advertencias-importacion">
              <p className="eyebrow">Advertencias</p>
              {preview.advertencias.map((item, indice) => (
                <div key={`${item.hoja}-${indice}`}><strong>{item.hoja}</strong><span>{item.mensaje}</span></div>
              ))}
            </section>
          )}

          {MODELOS.map((modelo) => {
            const filas = preview.muestras?.[modelo.id] || [];
            if (!filas.length) return null;
            return (
              <section className="tabla-panel preview-modelo" key={modelo.id}>
                <div><p className="eyebrow">Muestra</p><h3>{modelo.nombre}</h3></div>
                <div className="tabla-scroll">
                  <table>
                    <thead><tr>{modelo.campos.map((campo) => <th key={campo}>{ETIQUETAS[campo] || campo}</th>)}</tr></thead>
                    <tbody>
                      {filas.map((fila, indice) => (
                        <tr key={`${modelo.id}-${indice}`}>
                          {modelo.campos.map((campo) => <td key={campo}>{formatearValor(fila[campo], campo)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          {preview.puedeConfirmar && (
            <div className="confirmar-importacion">
              <label>
                Si el DIIO, código de potrero o pesaje ya existe
                <select value={modo} onChange={(evento) => setModo(evento.target.value)}>
                  <option value="crear_actualizar">Actualizar sin borrar campos vacíos</option>
                  <option value="solo_crear">Omitir existentes y crear solo nuevos</option>
                </select>
              </label>
              <button className="boton-primario" type="button" onClick={confirmar} disabled={Boolean(cargando)}>
                Confirmar importación
              </button>
            </div>
          )}
        </section>
      )}

      {resultado && (
        <section className="confirmacion-panel resultado-importacion">
          <p className="eyebrow">Importación finalizada</p>
          <h2>{resultado.mensaje}</h2>
          <div className="importar-resumen">
            <article><span>Creados</span><strong>{totalResultado('creados')}</strong></article>
            <article><span>Actualizados</span><strong>{totalResultado('actualizados')}</strong></article>
            <article><span>Existentes omitidos</span><strong>{totalResultado('duplicados')}</strong></article>
            <article><span>Errores al guardar</span><strong>{totalResultado('omitidos')}</strong></article>
          </div>
          <button className="boton-secundario" type="button" onClick={() => { setArchivo(null); setPreview(null); setResultado(null); }}>
            Importar otro archivo
          </button>
        </section>
      )}
    </section>
  );
};

export default ImportarExcel;
