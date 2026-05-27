import React, { useState } from 'react';
import { crearUsuario } from '../services/api';

const Crearusuario = ({ onUsuarioCreado, onCambiarVista }) => {
  const [formulario, setFormulario] = useState({
    nombre: '',
    apellido: '',
    correo: '',
    contrasena: '',
    telefono: ''
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
      const data = await crearUsuario({
        ...formulario,
        telefono: Number(formulario.telefono)
      });
      onUsuarioCreado(data.usuario);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <section className="auth-panel auth-panel-registro">
      <div className="auth-copy compacta">
        <span className="brand-mark">GR</span>
        <p className="eyebrow">Nuevo usuario</p>
        <h1>Registra al administrador de la finca</h1>
        <p>
          Crea la cuenta inicial para entrar al sistema y comenzar a conectar
          inventario, potreros y costos.
        </p>
      </div>

      <form className="auth-card registro-card" onSubmit={enviarFormulario}>
        <div>
          <p className="eyebrow">Cuenta</p>
          <h2>Crear usuario</h2>
        </div>

        {error && <div className="alerta-formulario">{error}</div>}

        <div className="form-grid">
          <label>
            Nombre
            <input name="nombre" value={formulario.nombre} onChange={actualizarCampo} required />
          </label>

          <label>
            Apellido
            <input name="apellido" value={formulario.apellido} onChange={actualizarCampo} required />
          </label>
        </div>

        <label>
          Correo electronico
          <input
            name="correo"
            type="email"
            value={formulario.correo}
            onChange={actualizarCampo}
            required
          />
        </label>

        <div className="form-grid">
          <label>
            Telefono
            <input
              name="telefono"
              type="number"
              value={formulario.telefono}
              onChange={actualizarCampo}
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
              required
            />
          </label>
        </div>

        <button className="boton-primario" type="submit" disabled={cargando}>
          {cargando ? 'Creando...' : 'Crear cuenta'}
        </button>

        <button className="boton-link" type="button" onClick={onCambiarVista}>
          Ya tengo una cuenta
        </button>
      </form>
    </section>
  );
};

export default Crearusuario;
