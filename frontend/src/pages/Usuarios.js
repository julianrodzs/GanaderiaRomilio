import React, { useEffect, useMemo, useState } from 'react';
import {
  actualizarUsuario,
  cambiarEstadoUsuario,
  crearUsuario,
  eliminarUsuario,
  obtenerAuditorias,
  obtenerUsuarios
} from '../services/api';
import { ROLES } from '../constants/permisosRoles';
const estados = ['Activo', 'Inactivo'];
const estadosAuditoria = ['Exitoso', 'Fallido', 'Denegado'];
const accionesAuditoria = ['POST', 'PUT', 'PATCH', 'DELETE'];

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

const fechaInput = (fecha) => {
  if (!fecha) return '';
  return new Date(fecha).toISOString().slice(0, 10);
};

const obtenerRangoMesActual = () => {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  return {
    fechaInicio: fechaInput(inicio),
    fechaFin: fechaInput(fin)
  };
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
  const [vista, setVista] = useState('usuarios');
  const [auditorias, setAuditorias] = useState([]);
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false);
  const [detalleAuditoria, setDetalleAuditoria] = useState(null);
  const [filtrosAuditoria, setFiltrosAuditoria] = useState({
    ...obtenerRangoMesActual(),
    usuario: '',
    modulo: '',
    accion: '',
    estado: '',
    limite: '100'
  });

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

  const cargarAuditorias = async () => {
    try {
      setCargandoAuditoria(true);
      setError('');
      setAuditorias(await obtenerAuditorias(filtrosAuditoria));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargandoAuditoria(false);
    }
  };

  useEffect(() => {
    if (vista === 'auditoria') {
      cargarAuditorias();
    }
  }, [
    vista,
    filtrosAuditoria.fechaInicio,
    filtrosAuditoria.fechaFin,
    filtrosAuditoria.usuario,
    filtrosAuditoria.modulo,
    filtrosAuditoria.accion,
    filtrosAuditoria.estado,
    filtrosAuditoria.limite
  ]);

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

  const actualizarFiltroAuditoria = (evento) => {
    const { name, value } = evento.target;
    setFiltrosAuditoria((actual) => ({ ...actual, [name]: value }));
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
        {vista === 'usuarios' && <button className="boton-primario compacto" type="button" onClick={abrirNuevo}>+ Nuevo Usuario</button>}
      </div>

      <div className="inventario-tabs">
        <button className={vista === 'usuarios' ? 'activo' : ''} type="button" onClick={() => setVista('usuarios')}>
          Usuarios
        </button>
        <button className={vista === 'auditoria' ? 'activo' : ''} type="button" onClick={() => setVista('auditoria')}>
          Auditoría
        </button>
      </div>

      {vista === 'usuarios' && (
        <div className="tabla-toolbar">
          <input value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar usuario..." />
          <span>{usuariosFiltrados.length} usuarios</span>
        </div>
      )}

      {error && <div className="alerta-formulario">{error}</div>}
      {vista === 'usuarios' && cargando && <div className="estado-importacion">Cargando usuarios...</div>}

      {vista === 'usuarios' && (
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
      )}

      {vista === 'auditoria' && (
        <>
          <div className="tabla-toolbar">
            <input type="date" name="fechaInicio" value={filtrosAuditoria.fechaInicio} onChange={actualizarFiltroAuditoria} />
            <input type="date" name="fechaFin" value={filtrosAuditoria.fechaFin} onChange={actualizarFiltroAuditoria} />
            <select name="usuario" value={filtrosAuditoria.usuario} onChange={actualizarFiltroAuditoria}>
              <option value="">Todos los usuarios</option>
              {usuarios.map((usuario) => (
                <option key={usuario._id} value={usuario._id}>
                  {[usuario.nombre, usuario.apellido].filter(Boolean).join(' ') || usuario.correo}
                </option>
              ))}
            </select>
            <input name="modulo" value={filtrosAuditoria.modulo} onChange={actualizarFiltroAuditoria} placeholder="Módulo..." />
            <select name="accion" value={filtrosAuditoria.accion} onChange={actualizarFiltroAuditoria}>
              <option value="">Todas las acciones</option>
              {accionesAuditoria.map((accion) => <option key={accion} value={accion}>{accion}</option>)}
            </select>
            <select name="estado" value={filtrosAuditoria.estado} onChange={actualizarFiltroAuditoria}>
              <option value="">Todos los estados</option>
              {estadosAuditoria.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
            </select>
            <select name="limite" value={filtrosAuditoria.limite} onChange={actualizarFiltroAuditoria}>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="500">500</option>
            </select>
            <span>{auditorias.length} eventos</span>
          </div>

          {cargandoAuditoria && <div className="estado-importacion">Cargando auditoría...</div>}

          <div className="tabla-scroll tabla-dinamica">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Acción</th>
                  <th>Módulo</th>
                  <th>Ruta</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {auditorias.map((item) => (
                  <tr key={item._id}>
                    <td>{formatearFecha(item.createdAt)}</td>
                    <td>{item.usuarioNombre || item.usuarioCorreo || '--'}</td>
                    <td>{item.usuarioRol || '--'}</td>
                    <td>{item.accion}</td>
                    <td>{item.modulo}</td>
                    <td>{item.ruta}</td>
                    <td><span className={`estado-badge estado-${item.estado}`}>{item.estado}</span></td>
                    <td>
                      <div className="acciones-tabla">
                        <button type="button" title="Ver detalle" onClick={() => setDetalleAuditoria(item)}>⊙</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modoFormulario && (
        <div className="modal-backdrop">
          <form className="modal-panel usuario-modal usuario-form-modal" onSubmit={guardarUsuario}>
            <div className="panel-title">
              <div>
                <p className="eyebrow">Usuarios</p>
                <h2>{usuarioSeleccionado ? 'Editar usuario' : 'Nuevo usuario'}</h2>
              </div>
              <button className="boton-link" type="button" onClick={cancelarFormulario}>Cerrar</button>
            </div>

            {errorFormulario && <div className="alerta-formulario">{errorFormulario}</div>}

            <div className="usuario-form-grid">
              <label>
                Nombre
                <input name="nombre" value={formulario.nombre} onChange={actualizarCampo} required />
              </label>

              <label>
                Apellido
                <input name="apellido" value={formulario.apellido} onChange={actualizarCampo} />
              </label>

              <label>
                Correo
                <input name="correo" type="email" value={formulario.correo} onChange={actualizarCampo} required />
              </label>

              <label>
                Telefono
                <input name="telefono" value={formulario.telefono} onChange={actualizarCampo} />
              </label>

              <label>
                Rol
                <select name="rol" value={formulario.rol} onChange={actualizarCampo}>
                  {ROLES.map((rol) => <option key={rol} value={rol}>{rol}</option>)}
                </select>
              </label>

              <label>
                Estado
                <select name="estado" value={formulario.estado} onChange={actualizarCampo}>
                  {estados.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
                </select>
              </label>

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

      {detalleAuditoria && (
        <div className="modal-backdrop">
          <section className="modal-panel usuario-modal">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Auditoría</p>
                <h2>{detalleAuditoria.modulo}</h2>
              </div>
              <button className="boton-link" type="button" onClick={() => setDetalleAuditoria(null)}>Cerrar</button>
            </div>
            <div className="detalle-animal-grid">
              <article><span>Fecha</span><strong>{formatearFecha(detalleAuditoria.createdAt)}</strong></article>
              <article><span>Usuario</span><strong>{detalleAuditoria.usuarioNombre || detalleAuditoria.usuarioCorreo || '--'}</strong></article>
              <article><span>Rol</span><strong>{detalleAuditoria.usuarioRol || '--'}</strong></article>
              <article><span>Acción</span><strong>{detalleAuditoria.accion}</strong></article>
              <article><span>Estado</span><strong>{detalleAuditoria.estado}</strong></article>
              <article><span>Código</span><strong>{detalleAuditoria.codigoRespuesta || '--'}</strong></article>
              <article><span>IP</span><strong>{detalleAuditoria.ip || '--'}</strong></article>
              <article><span>Recurso</span><strong>{detalleAuditoria.recursoId || '--'}</strong></article>
            </div>
            <div className="detalle-observaciones">
              <span>Ruta</span>
              <p>{detalleAuditoria.ruta}</p>
            </div>
            <div className="detalle-observaciones">
              <span>Datos sanitizados</span>
              <pre className="auditoria-json">{JSON.stringify(detalleAuditoria.datos || {}, null, 2)}</pre>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

export default Usuarios;
