import React, { useEffect, useMemo, useRef, useState } from 'react';
import { API_URL, obtenerAnimales, obtenerPotreros, procesarConteoDrone } from '../services/api';

const API_BASE = API_URL.replace('/api', '');

const ConteoDrone = () => {
  const inputRef = useRef(null);
  const [potreros, setPotreros] = useState([]);
  const [totalFinca, setTotalFinca] = useState(0);
  const [formulario, setFormulario] = useState({
    potrero: '',
    cantidadEsperada: '',
    observaciones: ''
  });
  const [imagen, setImagen] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [potrerosData, animalesData] = await Promise.all([
          obtenerPotreros(),
          obtenerAnimales()
        ]);
        setPotreros(potrerosData);
        setTotalFinca(animalesData.length);
        setFormulario((actual) => ({ ...actual, potrero: potrerosData[0]?._id || '' }));
      } catch (err) {
        setError(err.message);
      }
    };

    cargarDatos();
  }, []);

  const sugerencia = useMemo(() => {
    if (!resultado) return '';

    if (resultado.diferencia === 0) {
      return 'El conteo coincide con lo esperado. Mantener registro y continuar monitoreo normal.';
    }

    if (resultado.diferencia > 0) {
      return `Hay ${resultado.diferencia} animales mas de lo esperado. Revisar si ingresaron animales de otro potrero o si la cantidad esperada esta desactualizada.`;
    }

    return `Faltan ${Math.abs(resultado.diferencia)} animales respecto a lo esperado. Revisar cercas, portones y ultimo movimiento registrado.`;
  }, [resultado]);

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const seleccionarImagen = (archivo) => {
    if (!archivo) return;
    setImagen(archivo);
    setPreviewUrl(URL.createObjectURL(archivo));
    setResultado(null);
    setError('');
  };

  const enviarConteo = async (evento) => {
    evento.preventDefault();
    setError('');

    if (!imagen) {
      setError('Debes seleccionar una imagen tomada por drone');
      return;
    }

    try {
      setProcesando(true);
      const data = await procesarConteoDrone({
        imagen,
        potrero: formulario.potrero,
        cantidadEsperada: formulario.cantidadEsperada,
        observaciones: formulario.observaciones
      });
      setResultado(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <section className="conteo-drone-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Conteo por drone</p>
          <h2>Subir imagen y contar ganado</h2>
        </div>
        <span>{totalFinca} cabezas en finca</span>
      </div>

      <section className="conteo-drone-grid">
        <form className="conteo-form form-card" onSubmit={enviarConteo}>
          <div
            className={arrastrando ? 'dropzone drone-drop activo' : 'dropzone drone-drop'}
            onDragOver={(evento) => {
              evento.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(evento) => {
              evento.preventDefault();
              setArrastrando(false);
              seleccionarImagen(evento.dataTransfer.files[0]);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(evento) => seleccionarImagen(evento.target.files[0])}
            />
            <span className="drop-icon">IMG</span>
            <strong>{imagen ? imagen.name : 'Suelta la imagen del drone aqui'}</strong>
            <small>La IA esta simulada por ahora; luego se conectara FastAPI + YOLO.</small>
          </div>

          <div className="form-grid">
            <label>
              Potrero
              <select name="potrero" value={formulario.potrero} onChange={actualizarCampo} required>
                {potreros.map((potrero) => (
                  <option key={potrero._id} value={potrero._id}>
                    {potrero.codigo} - {potrero.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Cantidad esperada
              <input
                name="cantidadEsperada"
                type="number"
                min="0"
                value={formulario.cantidadEsperada}
                onChange={actualizarCampo}
                required
              />
            </label>
          </div>

          <label>
            Observaciones
            <textarea
              name="observaciones"
              rows="3"
              value={formulario.observaciones}
              onChange={actualizarCampo}
              placeholder="Altura de vuelo, clima, zona cubierta..."
            />
          </label>

          {error && <div className="alerta-formulario">{error}</div>}

          <div className="form-actions">
            <button className="boton-primario compacto" type="submit" disabled={procesando}>
              {procesando ? 'Procesando...' : 'Procesar conteo'}
            </button>
          </div>
        </form>

        <article className="conteo-preview">
          {previewUrl ? (
            <img src={previewUrl} alt="Vista previa de imagen drone" />
          ) : (
            <div className="preview-vacio">Imagen pendiente</div>
          )}
        </article>
      </section>

      {resultado && (
        <section className="conteo-resultado">
          <article>
            <span>Detectadas</span>
            <strong>{resultado.cantidadDetectada}</strong>
          </article>
          <article>
            <span>Esperadas</span>
            <strong>{resultado.cantidadEsperada}</strong>
          </article>
          <article>
            <span>Diferencia</span>
            <strong>{resultado.diferencia}</strong>
          </article>
          <article>
            <span>Confianza</span>
            <strong>{Math.round((resultado.confianzaPromedio || 0) * 100)}%</strong>
          </article>

          <div className={`conteo-sugerencia estado-${resultado.estado}`}>
            <p className="eyebrow">{resultado.estado}</p>
            <h2>{sugerencia}</h2>
            <small>Total de finca registrado: {totalFinca} cabezas.</small>
          </div>

          {resultado.imagenProcesadaUrl && (
            <div className="conteo-procesada">
              <div className="panel-title">
                <h2>Imagen procesada</h2>
                <span>{resultado.detecciones?.length || 0} detecciones</span>
              </div>
              <img src={`${API_BASE}${resultado.imagenProcesadaUrl}`} alt="Imagen procesada por IA" />
            </div>
          )}
        </section>
      )}
    </section>
  );
};

export default ConteoDrone;
