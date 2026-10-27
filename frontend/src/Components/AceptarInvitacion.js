import React, { useState } from 'react';
import { aceptarInvitacionExistente, aceptarInvitacionNueva } from '../services/api';
import MarcaProducto, { estiloAcceso } from './MarcaProducto';

const AceptarInvitacion = ({ token, sesion, onVolver }) => {
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);

  const aceptarConSesion = async () => {
    try {
      setCargando(true); setMensaje('');
      const respuesta = await aceptarInvitacionExistente(token);
      setMensaje(respuesta.mensaje);
    } catch (error) { setMensaje(error.message); } finally { setCargando(false); }
  };

  const aceptarNueva = async (evento) => {
    evento.preventDefault();
    if (contrasena !== confirmacion) { setMensaje('Las contraseñas no coinciden.'); return; }
    try {
      setCargando(true); setMensaje('');
      const respuesta = await aceptarInvitacionNueva(token, contrasena);
      setMensaje(respuesta.mensaje);
    } catch (error) { setMensaje(error.message); } finally { setCargando(false); }
  };

  return <section className="auth-panel">
    <div className="auth-copy" style={estiloAcceso}><MarcaProducto /><p className="eyebrow">Invitación</p><h1>Acceso a una organización</h1><p>La invitación es personal, vence en 72 horas y solo puede utilizarse una vez.</p></div>
    <form className="auth-card" onSubmit={aceptarNueva}>
      <h2>Aceptar invitación</h2>
      {mensaje && <div className="alerta-formulario">{mensaje}</div>}
      {sesion ? <button className="boton-primario" type="button" disabled={cargando} onClick={aceptarConSesion}>Aceptar con {sesion.usuario?.correo}</button> : <>
        <label>Nueva contraseña<input type="password" minLength="10" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required /></label>
        <label>Confirmar contraseña<input type="password" minLength="10" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} required /></label>
        <button className="boton-primario" disabled={cargando}>Crear cuenta y aceptar</button>
        <button className="boton-secundario" type="button" onClick={() => { localStorage.setItem('ganaderiaInvitacionPendiente', token); onVolver(); }}>Ya tengo una cuenta</button>
      </>}
      <button className="boton-link auth-link" type="button" onClick={onVolver}>Volver</button>
    </form>
  </section>;
};

export default AceptarInvitacion;
