import React, { useState } from 'react';
import { solicitarRecuperacionPassword } from '../services/api';

const MENSAJE_CONFIRMACION = 'Si el correo existe, recibirás instrucciones para recuperar tu contraseña.';

const OlvideContrasena = ({ onVolver }) => {
  const [correo, setCorreo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const enviarFormulario = async (evento) => {
    evento.preventDefault();
    setMensaje('');
    setError('');
    setCargando(true);

    try {
      const respuesta = await solicitarRecuperacionPassword(correo);
      setMensaje(respuesta.message || MENSAJE_CONFIRMACION);
      setCorreo('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <section className="auth-panel">
      <div className="auth-copy">
        <img className="login-logo" src="/assests/logo-romilio.png" alt="Logo Ganaderia Romilio" />
        <p className="eyebrow">GanaderiaRomilio</p>
        <h1>Recupera el acceso sin comprometer la cuenta</h1>
        <p>Te enviaremos un enlace temporal para crear una nueva contraseña.</p>
      </div>

      <form className="auth-card" onSubmit={enviarFormulario}>
        <div>
          <p className="eyebrow">Recuperación</p>
          <h2>Olvidé mi contraseña</h2>
        </div>

        {mensaje && <div className="exito-formulario">{mensaje}</div>}
        {error && <div className="alerta-formulario">{error}</div>}

        <label>
          Correo electrónico
          <input
            type="email"
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
            placeholder="usuario@correo.com"
            required
          />
        </label>

        <button className="boton-primario" type="submit" disabled={cargando}>
          {cargando ? 'Enviando...' : 'Enviar instrucciones'}
        </button>

        <button className="boton-link auth-link" type="button" onClick={onVolver}>
          Volver a iniciar sesión
        </button>
      </form>
    </section>
  );
};

export default OlvideContrasena;
