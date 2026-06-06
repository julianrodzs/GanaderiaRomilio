import React, { useEffect, useMemo, useState } from 'react';
import {
  actualizarUsuario,
  cambiarEstadoUsuario,
  crearUsuario,
  eliminarUsuario,
  obtenerUsuarios
} from '../services/api';

const roles = ['Administrador', 'Encargado', 'Consulta'];
const estados = ['Activo', 'Inactivo'];

const estadoInicial = {
  nombre: '',
  apellido: '',
  correo: '',
  telefono: '',
  rol: 'Encargado',
  estado: 'Activo',
  contrasena: '',
  confirmarContrasena: ''
};

const formatearFecha = (fecha) => {
  if (!fecha) return '--';
  return new Date(fecha).toLocaleString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const normalizarUsuario = (usuario) => ({
  ...estadoInicial,
  ...usuario,
  contrasena: '',
  confirmarContrasena: ''
});

const Usuarios = ({ usuarioActual }) => {
  const [usuarios, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [modoFormulario, setModoFormulario] = useState(false);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);
  const [formulario, setFormulario] = useState(estadoInicial);

  const cargarUsuarios = async () => {
    try {
      setCargando(true);
      setError('');
      setUsuarios(await obtenerUsuarios());
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return usuarios;

    return usuarios.filter((usuario) => [
      usuario.nombre,
      usuario.apellido,
      usuario.correo,
      usuario.telefono,
      usuario.rol,
      usuario.estado
    ].filter(Boolean).join(' ').toLowerCase().includes(texto));
  }, [busqueda, usuarios]);

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const abrirNuevo = () => {
    setUsuarioSeleccionado(null);
    setFormulario(estadoInicial);
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const abrirEdicion = (usuario) => {
    setUsuarioSeleccionado(usuario);
    setFormulario(normalizarUsuario(usuario));
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const cancelarFormulario = () => {
    setModoFormulario(false);
    setUsuarioSeleccionado(null);
    setFormulario(estadoInicial);
  };

  const guardarUsuario = async (evento) => {
    evento.preventDefault();
    setErrorFormulario('');

    if (formulario.contrasena || formulario.confirmarContrasena) {
      if (formulario.contrasena !== formulario.confirmarContrasena) {
        setErrorFormulario('La contrasena y la confirmacion no coinciden');
        return;
      }
    }

    if (!usuarioSeleccionado && !formulario.contrasena) {
      setErrorFormulario('La contrasena es requerida para crear usuario');
      return;
    }

    const datos = {
      nombre: formulario.nombre,
      apellido: formulario.apellido,
      correo: formulario.correo,
      telefono: formulario.telefono,
      rol: formulario.rol,
      estado: formulario.estado
    };

    if (formulario.contrasena) {
      datos.contrasena = formulario.contrasena;
    }

    try {
      setGuardando(true);
      if (usuarioSeleccionado?._id) {
        await actualizarUsuario(usuarioSeleccionado._id, datos);
      } else {
        await crearUsuario(datos);
      }

      cancelarFormulario();
      await cargarUsuarios();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const alternarEstado = async (usuario) => {
    const nuevoEstado = usuario.estado === 'Activo' ? 'Inactivo' : 'Activo';
    const confirmar = window.confirm(`¿Cambiar estado de ${usuario.correo} a ${nuevoEstado}?`);
    if (!confirmar) return;

    try {
      await cambiarEstadoUsuario(usuario._id, nuevoEstado);
      await cargarUsuarios();
    } catch (err) {
      setError(err.message);
    }
  };

  const borrarUsuario = async (usuario) => {
    const confirmar = window.confirm(`¿Eliminar el usuario ${usuario.correo}? Esta accion no se puede deshacer.`);
    if (!confirmar) return;

    try {
      await eliminarUsuario(usuario._id);
      window.alert('Usuario eliminado correctamente.');
      await cargarUsuarios();
    } catch (err) {
      setError(err.message);
    }
  };

  if (usuarioActual?.rol !== 'Administrador') {
    return (
      <section className="vista-tabla">
        <div className="panel-alerta">
          <p className="eyebrow">Usuarios</p>
          <h2>Sin permisos</h2>
          <p>Solo un Administrador puede acceder a la administracion de usuarios.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="vista-tabla">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Seguridad</p>
          <h2>Administracion de Usuarios</h2>
        </div>
        <button className="boton-primario compacto" type="button" onClick={abrirNuevo}>+ Nuevo Usuario</button>
      </div>

      <div className="tabla-toolbar">
        <input value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar usuario..." />
        <span>{usuariosFiltrados.length} usuarios</span>
      </div>

      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && <div className="estado-importacion">Cargando usuarios...</div>}

      <div className="tabla-scroll tabla-dinamica">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Telefono</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Ultimo acceso</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuariosFiltrados.map((usuario) => (
              <tr key={usuario._id}>
                <td>{[usuario.nombre, usuario.apellido].filter(Boolean).join(' ') || '--'}</td>
                <td>{usuario.correo}</td>
                <td>{usuario.telefono || '--'}</td>
                <td>{usuario.rol}</td>
                <td>
                  <span className={usuario.estado === 'Activo' ? 'estado-badge estado-Vigente' : 'estado-badge estado-Aplicado'}>
                    {usuario.estado}
                  </span>
                </td>
                <td>{formatearFecha(usuario.ultimoAcceso)}</td>
                <td>
                  <div className="acciones-tabla acciones-tabla-amplia">
                    <button type="button" title="Editar" onClick={() => abrirEdicion(usuario)}>✎</button>
                    <button type="button" title={usuario.estado === 'Activo' ? 'Inactivar' : 'Activar'} onClick={() => alternarEstado(usuario)}>
                      {usuario.estado === 'Activo' ? '⏸' : '▶'}
                    </button>
                    <button type="button" title="Eliminar" onClick={() => borrarUsuario(usuario)}>⌫</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modoFormulario && (
        <div className="modal-backdrop">
          <form className="modal-panel usuario-modal" onSubmit={guardarUsuario}>
            <div className="panel-title">
              <div>
                <p className="eyebrow">Usuarios</p>
                <h2>{usuarioSeleccionado ? 'Editar usuario' : 'Nuevo usuario'}</h2>
              </div>
              <button className="boton-link" type="button" onClick={cancelarFormulario}>Cerrar</button>
            </div>

            {errorFormulario && <div className="alerta-formulario">{errorFormulario}</div>}

            <div className="form-grid">
              <label>
                Nombre
                <input name="nombre" value={formulario.nombre} onChange={actualizarCampo} required />
              </label>

              <label>
                Apellido
                <input name="apellido" value={formulario.apellido} onChange={actualizarCampo} />
              </label>
            </div>

            <label>
              Correo
              <input name="correo" type="email" value={formulario.correo} onChange={actualizarCampo} required />
            </label>

            <label>
              Telefono
              <input name="telefono" value={formulario.telefono} onChange={actualizarCampo} />
            </label>

            <div className="form-grid">
              <label>
                Rol
                <select name="rol" value={formulario.rol} onChange={actualizarCampo}>
                  {roles.map((rol) => <option key={rol} value={rol}>{rol}</option>)}
                </select>
              </label>

              <label>
                Estado
                <select name="estado" value={formulario.estado} onChange={actualizarCampo}>
                  {estados.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
                </select>
              </label>
            </div>

            <div className="form-grid">
              <label>
                Contrasena
                <input
                  name="contrasena"
                  type="password"
                  value={formulario.contrasena}
                  onChange={actualizarCampo}
                  required={!usuarioSeleccionado}
                  placeholder={usuarioSeleccionado ? 'Opcional al editar' : ''}
                />
              </label>

              <label>
                Confirmar contrasena
                <input
                  name="confirmarContrasena"
                  type="password"
                  value={formulario.confirmarContrasena}
                  onChange={actualizarCampo}
                  required={!usuarioSeleccionado}
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="boton-link" type="button" onClick={cancelarFormulario}>Cancelar</button>
              <button className="boton-primario compacto" type="submit" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar usuario'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};

export default Usuarios;
