import React, { useEffect, useState } from 'react';
import UpgradeMessage from '../Components/UpgradeMessage';
import { usePlan } from '../context/PlanContext';
import { actualizarConfiguracionEmails, actualizarPerfilUsuario, obtenerConfiguracionEmails } from '../services/api';
import { puedeAccederModulo } from '../constants/permisosRoles';

const opcionesModulos = [
  ['resumenGanadero', 'Resumen ganadero'],
  ['finanzas', 'Finanzas'],
  ['tareasPendientes', 'Tareas pendientes']
];

const ConfiguracionCuenta = ({ usuario }) => {
  const { tieneFeature } = usePlan();
  const disponible = tieneFeature('configuracionEmailAvanzada');
  const puedeVerFinanzas = puedeAccederModulo(usuario?.rol, 'Finanzas');
  const opcionesModulosDisponibles = opcionesModulos.filter(([clave]) => clave !== 'finanzas' || puedeVerFinanzas);
  const [formulario, setFormulario] = useState({
    frecuencia: 'Desactivado', horaPreferida: '06:00', diaSemana: 1,
    modulos: { resumenGanadero: true, finanzas: puedeVerFinanzas, tareasPendientes: true }
  });
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [perfil, setPerfil] = useState({
    nombre: usuario?.nombre || '', apellido: usuario?.apellido || '', telefono: usuario?.telefono || '',
    contrasenaActual: '', contrasenaNueva: '', confirmarContrasena: ''
  });
  const [mensajePerfil, setMensajePerfil] = useState('');

  const guardarPerfil = async (evento) => {
    evento.preventDefault();
    setMensajePerfil('');
    if (perfil.contrasenaNueva && perfil.contrasenaNueva !== perfil.confirmarContrasena) {
      setMensajePerfil('Las contraseñas no coinciden.'); return;
    }
    try {
      setGuardando(true);
      const respuesta = await actualizarPerfilUsuario({
        nombre: perfil.nombre, apellido: perfil.apellido, telefono: perfil.telefono,
        ...(perfil.contrasenaNueva ? { contrasenaActual: perfil.contrasenaActual, contrasenaNueva: perfil.contrasenaNueva } : {})
      });
      setMensajePerfil(respuesta.mensaje);
      if (respuesta.requiereNuevoInicioSesion) {
        let sesionActual = null;
        try { sesionActual = JSON.parse(localStorage.getItem('ganaderiaSesion') || 'null'); } catch (error) { sesionActual = null; }
        localStorage.removeItem('ganaderiaSesion');
        window.dispatchEvent(new CustomEvent('ganaderiaSesionExpirada', { detail: { sesion: sesionActual } }));
      }
    } catch (error) { setMensajePerfil(error.message); } finally { setGuardando(false); }
  };

  useEffect(() => {
    if (!disponible) return;
    obtenerConfiguracionEmails().then((datos) => setFormulario((actual) => ({ ...actual, ...datos })))
      .catch((error) => setMensaje(error.message));
  }, [disponible]);

  const guardar = async (evento) => {
    evento.preventDefault(); setGuardando(true); setMensaje('');
    try {
      const respuesta = await actualizarConfiguracionEmails({
        ...formulario,
        modulos: {
          ...formulario.modulos,
          finanzas: puedeVerFinanzas && formulario.modulos?.finanzas === true
        }
      });
      setFormulario(respuesta.configuracion);
      setMensaje('Preferencias de correo actualizadas.');
    } catch (error) {
      setMensaje(error.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="vista-tabla configuracion-cuenta">
      <p className="eyebrow">Cuenta</p>
      <h1>Configuración</h1>
      <p className="configuracion-identidad">{usuario?.nombre} {usuario?.apellido || ''} · {usuario?.rol}</p>
      <section className="configuracion-email">
        <h2>Perfil y contraseña</h2>
        {usuario?.debeCambiarContrasena && <div className="alerta-formulario">Debes reemplazar la contraseña temporal antes de continuar.</div>}
        <form onSubmit={guardarPerfil} className="configuracion-email-form">
          <label>Nombre<input value={perfil.nombre} onChange={(e) => setPerfil({ ...perfil, nombre: e.target.value })} required /></label>
          <label>Apellido<input value={perfil.apellido} onChange={(e) => setPerfil({ ...perfil, apellido: e.target.value })} /></label>
          <label>Teléfono<input value={perfil.telefono} onChange={(e) => setPerfil({ ...perfil, telefono: e.target.value })} /></label>
          <label>Contraseña actual<input type="password" value={perfil.contrasenaActual} onChange={(e) => setPerfil({ ...perfil, contrasenaActual: e.target.value })} required={Boolean(perfil.contrasenaNueva || usuario?.debeCambiarContrasena)} /></label>
          <label>Nueva contraseña<input type="password" minLength="10" value={perfil.contrasenaNueva} onChange={(e) => setPerfil({ ...perfil, contrasenaNueva: e.target.value })} required={usuario?.debeCambiarContrasena} /></label>
          <label>Confirmar nueva contraseña<input type="password" minLength="10" value={perfil.confirmarContrasena} onChange={(e) => setPerfil({ ...perfil, confirmarContrasena: e.target.value })} required={Boolean(perfil.contrasenaNueva || usuario?.debeCambiarContrasena)} /></label>
          {mensajePerfil && <p className="form-message">{mensajePerfil}</p>}
          <button className="boton-primario" type="submit" disabled={guardando}>Guardar perfil</button>
        </form>
      </section>
      <section className="configuracion-email">
        <h2>Notificaciones y resumen</h2>
        {!disponible ? (
          <UpgradeMessage feature="configuracionEmailAvanzada" titulo="Resumen personalizado por correo" pregunta="¿Qué ocurrió en la finca sin abrir la aplicación?" etiqueta="Disponible en Premium" />
        ) : (
          <form onSubmit={guardar} className="configuracion-email-form">
            <label>Frecuencia<select value={formulario.frecuencia} onChange={(e) => setFormulario((actual) => ({ ...actual, frecuencia: e.target.value }))}><option>Desactivado</option><option>Diario</option><option>Semanal</option></select></label>
            <label>Hora preferida<input type="time" value={formulario.horaPreferida} onChange={(e) => setFormulario((actual) => ({ ...actual, horaPreferida: e.target.value }))} /></label>
            {formulario.frecuencia === 'Semanal' && <label>Día de envío<select value={formulario.diaSemana} onChange={(e) => setFormulario((actual) => ({ ...actual, diaSemana: Number(e.target.value) }))}><option value="1">Lunes</option><option value="2">Martes</option><option value="3">Miércoles</option><option value="4">Jueves</option><option value="5">Viernes</option><option value="6">Sábado</option><option value="0">Domingo</option></select></label>}
            <fieldset><legend>Contenido</legend>{opcionesModulosDisponibles.map(([clave, etiqueta]) => <label key={clave} className="checkbox-line"><input type="checkbox" checked={Boolean(formulario.modulos?.[clave])} onChange={(e) => setFormulario((actual) => ({ ...actual, modulos: { ...actual.modulos, [clave]: e.target.checked } }))} />{etiqueta}</label>)}</fieldset>
            {mensaje && <p className="form-message">{mensaje}</p>}
            <button className="boton-primario" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar preferencias'}</button>
          </form>
        )}
      </section>
    </section>
  );
};

export default ConfiguracionCuenta;
