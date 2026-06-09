import React, { useState } from 'react';
import { loginUsuario } from '../services/api';

const IniciarSesion = ({ onLogin, onOlvideContrasena }) => {
  const [formulario, setFormulario] = useState({
    correo: '',
    contrasena: ''
  });
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const enviarFormulario = async (evento) => {
    evento.preventDefault();
    setError('');
    setCargando(true);

    try {
      const data = await loginUsuario(formulario);
      onLogin(data);
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
        <h1>Gestion de finca clara desde el primer ingreso</h1>
        <p>
          Accede al panel para revisar inventario, potreros, costos y actividad reciente
          de la hacienda.
        </p>
      </div>

      <form className="auth-card" onSubmit={enviarFormulario}>
        <div>
          <p className="eyebrow">Acceso</p>
          <h2>Iniciar sesion</h2>
        </div>

        {error && <div className="alerta-formulario">{error}</div>}

        <label>
          Correo electronico
          <input
            name="correo"
            type="email"
            value={formulario.correo}
            onChange={actualizarCampo}
            placeholder="admin@ganaderiaromilio.com"
            required
          />
        </label>

        <label>
          Contrasena
          <input
            name="contrasena"
            type="password"
            value={formulario.contrasena}
            onChange={actualizarCampo}
            placeholder="Ingresa tu contrasena"
            required
          />
        </label>

        <button className="boton-primario" type="submit" disabled={cargando}>
          {cargando ? 'Ingresando...' : 'Entrar al panel'}
        </button>

        <button className="boton-link auth-link" type="button" onClick={onOlvideContrasena}>
          Olvidé mi contraseña
        </button>

      </form>
    </section>
  );
};

export default IniciarSesion;
