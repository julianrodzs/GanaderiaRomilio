import React, { useEffect, useState } from 'react';
import ImagenPersonalizada from './ImagenPersonalizada';
import { validarImagenApariencia } from '../utils/apariencia.mjs';
import {
  obtenerConfiguracionApariencia,
  restaurarImagenApariencia,
  reutilizarImagenDashboard,
  subirImagenFinca,
  subirLogoOrganizacion
} from '../services/api';

const FORMATOS = 'image/jpeg,image/png,image/webp';

const ConfiguradorImagen = ({ titulo, descripcion, imagen, disponible, cargando, ocupado, resultado, onSeleccionar, onRestaurar, accionExtra }) => (
  <article className="apariencia-imagen-item" aria-busy={cargando}>
    <div className="apariencia-preview">
      <ImagenPersonalizada src={imagen.url} alt={`Vista previa de ${titulo.toLowerCase()}`} />
    </div>
    <div className="apariencia-imagen-info">
      <div>
        <h4>{titulo}</h4>
        <p>{descripcion}</p>
        <span className={`estado-badge ${imagen.personalizada ? 'activo' : ''}`}>
          {imagen.personalizada ? 'Personalizada' : 'Sin imagen'}
        </span>
      </div>
      <div className="apariencia-acciones">
        <label className={`boton-secundario compacto boton-archivo ${!disponible || ocupado ? 'deshabilitado' : ''}`} title={!disponible ? 'Disponible al configurar Cloudflare R2' : 'Seleccionar una imagen'}>
          {cargando ? 'Guardando...' : imagen.personalizada ? 'Reemplazar' : 'Subir imagen'}
          <input
            type="file"
            accept={FORMATOS}
            disabled={!disponible || ocupado}
            onChange={(evento) => {
              const archivo = evento.target.files?.[0];
              evento.target.value = '';
              if (archivo) onSeleccionar(archivo);
            }}
          />
        </label>
        {accionExtra}
        {imagen.personalizada && <button type="button" className="boton-link" disabled={ocupado} onClick={onRestaurar}>Quitar imagen</button>}
      </div>
      {resultado && (
        <p className={`mensaje-carga-imagen ${resultado.tipo}`} role={resultado.tipo === 'error' ? 'alert' : 'status'}>
          {resultado.mensaje}
        </p>
      )}
    </div>
  </article>
);

const ConfiguracionApariencia = () => {
  const [configuracion, setConfiguracion] = useState(null);
  const [cargando, setCargando] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [resultado, setResultado] = useState(null);

  const cargar = async () => {
    try {
      setConfiguracion(await obtenerConfiguracionApariencia());
    } catch (error) { setMensaje(error.message); }
  };

  useEffect(() => { cargar(); }, []);

  const ejecutar = async (clave, operacion, mensajeExito) => {
    try {
      setCargando(clave); setMensaje('');
      setResultado({ clave, tipo: 'cargando', mensaje: 'Guardando cambios...' });
      const configuracionActualizada = await operacion();
      setConfiguracion(configuracionActualizada);
      setResultado({ clave, tipo: 'exito', mensaje: mensajeExito });
      window.dispatchEvent(new CustomEvent('ganaderiaAparienciaActualizada'));
    } catch (error) {
      setResultado({ clave, tipo: 'error', mensaje: error.message || 'No se pudo guardar la imagen. Inténtalo nuevamente.' });
    } finally { setCargando(''); }
  };

  const cargarImagen = (clave, archivo, operacion, mensajeExito) => {
    const error = validarImagenApariencia(archivo, configuracion?.almacenamiento?.maximoMb || 8);
    if (error) {
      setResultado({ clave, tipo: 'error', mensaje: error });
      return;
    }
    ejecutar(clave, operacion, mensajeExito);
  };

  if (!configuracion) return <section className="apariencia-config"><p>{mensaje || 'Cargando apariencia...'}</p></section>;
  const disponible = configuracion.almacenamiento?.disponible === true;

  return (
    <section className="apariencia-config">
      <div className="panel-title">
        <div><p className="eyebrow">Identidad visual</p><h2>Imágenes de la organización y las fincas</h2></div>
        <span>Cloudflare R2</span>
      </div>
      {!disponible && (
        <div className="panel-alerta apariencia-aviso">
          <strong>Almacenamiento pendiente de configurar</strong>
          <p>La carga de imágenes se habilitará al agregar las credenciales de R2.</p>
        </div>
      )}
      {mensaje && <p className="form-message">{mensaje}</p>}
      <ConfiguradorImagen
        titulo="Logo de la organización"
        descripcion="Se muestra en el encabezado para todas las fincas de la organización."
        imagen={configuracion.organizacion.logo}
        disponible={disponible}
        cargando={cargando === 'logo'}
        ocupado={Boolean(cargando)}
        resultado={resultado?.clave === 'logo' ? resultado : null}
        onSeleccionar={(archivo) => cargarImagen('logo', archivo, () => subirLogoOrganizacion(archivo), 'Logo actualizado.')}
        onRestaurar={() => ejecutar('logo', () => restaurarImagenApariencia({ alcance: 'organizacion', tipo: 'logo' }), 'Logo quitado.')}
      />
      <div className="apariencia-fincas">
        {configuracion.fincas.map((finca) => (
          <section className="apariencia-finca" key={finca.id}>
            <header><div><h3>{finca.nombre}</h3><span>{finca.codigo}</span></div>{finca.comparteImagen && <span className="estado-badge activo">Imagen compartida</span>}</header>
            <div className="apariencia-finca-imagenes">
              <ConfiguradorImagen
                titulo="Dashboard"
                descripcion="Imagen principal que acompaña el resumen de la finca."
                imagen={finca.dashboard}
                disponible={disponible}
                cargando={cargando === `${finca.id}:dashboard`}
                ocupado={Boolean(cargando)}
                resultado={resultado?.clave === `${finca.id}:dashboard` ? resultado : null}
                onSeleccionar={(archivo) => cargarImagen(`${finca.id}:dashboard`, archivo, () => subirImagenFinca(finca.id, 'dashboard', archivo), `Dashboard de ${finca.nombre} actualizado.`)}
                onRestaurar={() => ejecutar(`${finca.id}:dashboard`, () => restaurarImagenApariencia({ alcance: 'finca', tipo: 'dashboard', fincaId: finca.id }), 'Imagen quitada.')}
              />
              <ConfiguradorImagen
                titulo="Potreros"
                descripcion="Mapa, plano o fotografía aérea utilizada en el módulo Potreros."
                imagen={finca.potreros}
                disponible={disponible}
                cargando={cargando === `${finca.id}:potreros`}
                ocupado={Boolean(cargando)}
                resultado={resultado?.clave === `${finca.id}:potreros` ? resultado : null}
                onSeleccionar={(archivo) => cargarImagen(`${finca.id}:potreros`, archivo, () => subirImagenFinca(finca.id, 'potreros', archivo), `Imagen de potreros de ${finca.nombre} actualizada.`)}
                onRestaurar={() => ejecutar(`${finca.id}:potreros`, () => restaurarImagenApariencia({ alcance: 'finca', tipo: 'potreros', fincaId: finca.id }), 'Imagen quitada.')}
                accionExtra={finca.dashboard.personalizada && !finca.comparteImagen ? (
                  <button type="button" className="boton-secundario compacto" disabled={Boolean(cargando)} onClick={() => ejecutar(`${finca.id}:potreros`, () => reutilizarImagenDashboard(finca.id), 'La misma imagen se utilizará en Dashboard y Potreros.')}>Usar la del dashboard</button>
                ) : null}
              />
            </div>
          </section>
        ))}
      </div>
      <p className="nota-monedas-reporte">Formatos permitidos: JPG, PNG y WebP. Tamaño máximo: {configuracion.almacenamiento?.maximoMb || 8} MB.</p>
    </section>
  );
};

export default ConfiguracionApariencia;
