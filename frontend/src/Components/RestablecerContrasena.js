import React, { useState } from 'react';
import { restablecerPassword } from '../services/api';

const RestablecerContrasena = ({ token, onVolver }) => {
  const [formulario, setFormulario] = useState({
    password: '',
    confirmarPassword: ''
  });
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const enviarFormulario = async (evento) => {
    evento.preventDefault();
    setMensaje('');
    setError('');

    if (formulario.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (formulario.password !== formulario.confirmarPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setCargando(true);

    try {
      const respuesta = await restablecerPassword({ token, password: formulario.password });
      setMensaje(respuesta.message || 'Contraseña actualizada correctamente.');
      setFormulario({ password: '', confirmarPassword: '' });
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
        <h1>Crea una nueva contraseña segura</h1>
        <p>Este enlace es temporal y queda invalidado después del primer uso.</p>
      </div>

      <form className="auth-card" onSubmit={enviarFormulario}>
        <div>
          <p className="eyebrow">Cuenta</p>
          <h2>Restablecer contraseña</h2>
        </div>

        {mensaje && <div className="exito-formulario">{mensaje}</div>}
        {error && <div className="alerta-formulario">{error}</div>}

        <label>
          Nueva contraseña
          <input
            name="password"
            type="password"
            value={formulario.password}
            onChange={actualizarCampo}
            placeholder="Mínimo 8 caracteres"
            minLength="8"
            required
          />
        </label>

        <label>
          Confirmar contraseña
          <input
            name="confirmarPassword"
            type="password"
            value={formulario.confirmarPassword}
            onChange={actualizarCampo}
            placeholder="Repite la contraseña"
            minLength="8"
            required
          />
        </label>

        <button className="boton-primario" type="submit" disabled={cargando || !token}>
          {cargando ? 'Actualizando...' : 'Actualizar contraseña'}
        </button>

        <button className="boton-link auth-link" type="button" onClick={onVolver}>
          Volver a iniciar sesión
        </button>
      </form>
    </section>
  );
};

export default RestablecerContrasena;
