import React, { useEffect, useMemo, useState } from 'react';
import {
  cambiarEstadoOrganizacionSaas,
  crearOrganizacionSaas,
  obtenerOrganizacionesSaas
} from '../services/api';
import { ContenidoPaginado } from '../Components/PaginacionTabla';

const PLANES = ['ESENCIAL', 'GESTION', 'PRO', 'PREMIUM'];
const OBJETIVOS = ['Cría', 'Engorde', 'Reemplazo', 'Reproducción', 'Otro'];

const crearEstadoInicial = () => ({
  organizacion: {
    nombre: '',
    razonSocial: '',
    slug: '',
    pais: 'Costa Rica',
    zonaHoraria: 'America/Costa_Rica'
  },
  plan: {
    codigo: 'ESENCIAL',
    especiePlan: 'Bovino',
    estado: 'Prueba',
    referenciaExterna: ''
  },
  finca: {
    nombre: '',
    codigo: 'PRINCIPAL',
    ubicacion: '',
    lineasProductivas: [
      { especie: 'Bovino', objetivos: ['Cría', 'Engorde'], activa: true }
    ]
  },
  administrador: {
    nombre: '',
    apellido: '',
    correo: '',
    telefono: ''
  }
});

const slugDesdeNombre = (valor = '') => valor
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const etiquetaPlan = (codigo) => ({
  ESENCIAL: 'Esencial',
  GESTION: 'Gestión',
  PRO: 'Pro',
  PREMIUM: 'Premium'
}[codigo] || codigo);

const AdministracionSaas = ({ onCerrar }) => {
  const [organizaciones, setOrganizaciones] = useState([]);
  const [formulario, setFormulario] = useState(crearEstadoInicial);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  const cargar = async () => {
    try {
      setCargando(true);
      setError('');
      setOrganizaciones(await obtenerOrganizacionesSaas());
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const estadisticas = useMemo(() => ({
    clientes: organizaciones.length,
    activos: organizaciones.filter((item) => item.estado === 'Activa').length,
    prueba: organizaciones.filter((item) => item.plan?.estado === 'Prueba').length
  }), [organizaciones]);

  const actualizarSeccion = (seccion, campo, valor) => {
    setFormulario((actual) => ({
      ...actual,
      [seccion]: { ...actual[seccion], [campo]: valor }
    }));
  };

  const actualizarNombreOrganizacion = (nombre) => {
    setFormulario((actual) => ({
      ...actual,
      organizacion: {
        ...actual.organizacion,
        nombre,
        slug: actual.organizacion.slug && actual.organizacion.slug !== slugDesdeNombre(actual.organizacion.nombre)
          ? actual.organizacion.slug
          : slugDesdeNombre(nombre)
      },
      finca: {
        ...actual.finca,
        nombre: actual.finca.nombre || nombre
      }
    }));
  };

  const cambiarPlan = (codigo) => {
    const especie = formulario.plan.especiePlan || 'Bovino';
    actualizarSeccion('plan', 'codigo', codigo);
    setFormulario((actual) => ({
      ...actual,
      plan: { ...actual.plan, codigo, especiePlan: codigo === 'ESENCIAL' ? especie : null },
      finca: {
        ...actual.finca,
        lineasProductivas: codigo === 'ESENCIAL'
          ? [{ especie, objetivos: ['Cría', 'Engorde'], activa: true }]
          : ['Bovino', 'Porcino'].map((item) => ({ especie: item, objetivos: ['Cría', 'Engorde'], activa: true }))
      }
    }));
  };

  const cambiarEspecieEsencial = (especie) => {
    setFormulario((actual) => ({
      ...actual,
      plan: { ...actual.plan, especiePlan: especie },
      finca: {
        ...actual.finca,
        lineasProductivas: [{ especie, objetivos: ['Cría', 'Engorde'], activa: true }]
      }
    }));
  };

  const alternarObjetivo = (especie, objetivo) => {
    setFormulario((actual) => ({
      ...actual,
      finca: {
        ...actual.finca,
        lineasProductivas: actual.finca.lineasProductivas.map((linea) => {
          if (linea.especie !== especie) return linea;
          const existe = linea.objetivos.includes(objetivo);
          return {
            ...linea,
            objetivos: existe
              ? linea.objetivos.filter((item) => item !== objetivo)
              : [...linea.objetivos, objetivo]
          };
        })
      }
    }));
  };

  const guardar = async (evento) => {
    evento.preventDefault();
    try {
      setGuardando(true);
      setError('');
      setResultado(null);
      const respuesta = await crearOrganizacionSaas(formulario);
      setResultado(respuesta);
      setFormulario(crearEstadoInicial());
      setMostrarFormulario(false);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const alternarEstado = async (organizacion) => {
    const estado = organizacion.estado === 'Activa' ? 'Suspendida' : 'Activa';
    const accion = estado === 'Activa' ? 'reactivar' : 'suspender';
    if (!window.confirm(`¿Deseas ${accion} ${organizacion.nombre}?`)) return;
    try {
      setError('');
      await cambiarEstadoOrganizacionSaas(organizacion._id, estado);
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="vista-tabla saas-admin">
      <div className="panel-title saas-admin-header">
        <div>
          <p className="eyebrow">Administración de plataforma</p>
          <h2>Clientes SaaS</h2>
          <p className="saas-admin-subtitulo">Organizaciones aisladas con su plan, finca principal y administrador.</p>
        </div>
        <div className="panel-actions">
          <button className="boton-link" type="button" onClick={onCerrar}>Cerrar</button>
          <button className="boton-primario compacto" type="button" onClick={() => setMostrarFormulario((actual) => !actual)}>
            {mostrarFormulario ? 'Cancelar alta' : '+ Nuevo cliente'}
          </button>
        </div>
      </div>

      <div className="saas-resumen" aria-label="Resumen de clientes">
        <article><span>Clientes</span><strong>{estadisticas.clientes}</strong></article>
        <article><span>Organizaciones activas</span><strong>{estadisticas.activos}</strong></article>
        <article><span>En prueba</span><strong>{estadisticas.prueba}</strong></article>
      </div>

      {error && <div className="alerta-formulario">{error}</div>}
      {resultado && (
        <div className="saas-resultado" role="status">
          <strong>{resultado.mensaje}</strong>
          <span>{resultado.invitacion?.mensaje}</span>
          {resultado.enlaceInvitacion && (
            <a href={resultado.enlaceInvitacion} target="_blank" rel="noreferrer">Abrir invitación de prueba</a>
          )}
        </div>
      )}

      {mostrarFormulario && (
        <form className="saas-formulario" onSubmit={guardar}>
          <header>
            <p className="eyebrow">Aprovisionamiento</p>
            <h3>Nuevo cliente</h3>
            <span>Todos los recursos se crean juntos. Si algo falla, no se guarda ningún dato parcial.</span>
          </header>

          <fieldset>
            <legend>Organización</legend>
            <div className="saas-form-grid">
              <label>Nombre<input value={formulario.organizacion.nombre} onChange={(e) => actualizarNombreOrganizacion(e.target.value)} required /></label>
              <label>Razón social<input value={formulario.organizacion.razonSocial} onChange={(e) => actualizarSeccion('organizacion', 'razonSocial', e.target.value)} /></label>
              <label>Identificador<input value={formulario.organizacion.slug} onChange={(e) => actualizarSeccion('organizacion', 'slug', e.target.value)} required /></label>
              <label>País<input value={formulario.organizacion.pais} onChange={(e) => actualizarSeccion('organizacion', 'pais', e.target.value)} required /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Plan inicial</legend>
            <div className="saas-form-grid">
              <label>Plan<select value={formulario.plan.codigo} onChange={(e) => cambiarPlan(e.target.value)}>{PLANES.map((plan) => <option key={plan} value={plan}>{etiquetaPlan(plan)}</option>)}</select></label>
              <label>Estado<select value={formulario.plan.estado} onChange={(e) => actualizarSeccion('plan', 'estado', e.target.value)}><option value="Prueba">Prueba</option><option value="Activo">Activo</option></select></label>
              {formulario.plan.codigo === 'ESENCIAL' && (
                <label>Especie<select value={formulario.plan.especiePlan} onChange={(e) => cambiarEspecieEsencial(e.target.value)}><option value="Bovino">Bovino</option><option value="Porcino">Porcino</option></select></label>
              )}
              <label>Referencia comercial<input value={formulario.plan.referenciaExterna} onChange={(e) => actualizarSeccion('plan', 'referenciaExterna', e.target.value)} placeholder="Contrato o suscripción" /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Finca principal</legend>
            <div className="saas-form-grid">
              <label>Nombre<input value={formulario.finca.nombre} onChange={(e) => actualizarSeccion('finca', 'nombre', e.target.value)} required /></label>
              <label>Código<input value={formulario.finca.codigo} onChange={(e) => actualizarSeccion('finca', 'codigo', e.target.value.toUpperCase())} required /></label>
              <label className="saas-campo-amplio">Ubicación<input value={formulario.finca.ubicacion} onChange={(e) => actualizarSeccion('finca', 'ubicacion', e.target.value)} /></label>
            </div>
            <div className="saas-lineas-productivas">
              {formulario.finca.lineasProductivas.map((linea) => (
                <section key={linea.especie}>
                  <strong>{linea.especie}</strong>
                  <div>
                    {OBJETIVOS.map((objetivo) => (
                      <label key={objetivo} className="saas-check">
                        <input type="checkbox" checked={linea.objetivos.includes(objetivo)} onChange={() => alternarObjetivo(linea.especie, objetivo)} />
                        <span>{objetivo}</span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Administrador del cliente</legend>
            <div className="saas-form-grid">
              <label>Nombre<input value={formulario.administrador.nombre} onChange={(e) => actualizarSeccion('administrador', 'nombre', e.target.value)} required /></label>
              <label>Apellido<input value={formulario.administrador.apellido} onChange={(e) => actualizarSeccion('administrador', 'apellido', e.target.value)} /></label>
              <label>Correo<input type="email" value={formulario.administrador.correo} onChange={(e) => actualizarSeccion('administrador', 'correo', e.target.value)} required /></label>
              <label>Teléfono<input value={formulario.administrador.telefono} onChange={(e) => actualizarSeccion('administrador', 'telefono', e.target.value)} /></label>
            </div>
          </fieldset>

          <div className="form-actions">
            <button className="boton-link" type="button" onClick={() => setMostrarFormulario(false)}>Cancelar</button>
            <button className="boton-primario compacto" type="submit" disabled={guardando}>{guardando ? 'Creando cliente...' : 'Crear cliente e invitar'}</button>
          </div>
        </form>
      )}

      <div className="saas-listado-encabezado">
        <div><p className="eyebrow">Suscripciones</p><h3>Organizaciones</h3></div>
        <button className="boton-secundario compacto" type="button" onClick={cargar} disabled={cargando}>Actualizar</button>
      </div>

      {cargando ? <div className="estado-importacion">Cargando clientes...</div> : (
        <ContenidoPaginado datos={organizaciones}>
          {(organizacionesPagina) => (
            <div className="tabla-scroll tabla-dinamica">
              <table className="saas-tabla">
                <thead><tr><th>Organización</th><th>Plan</th><th>Finca principal</th><th>Usuarios</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {organizacionesPagina.map((item) => (
                    <tr key={item._id}>
                      <td><strong>{item.nombre}</strong><small>{item.slug}</small></td>
                      <td>{etiquetaPlan(item.plan?.codigo)}<small>{item.plan?.estado || '--'}</small></td>
                      <td>{item.fincaPrincipal?.nombre || '--'}<small>{item.fincasActivas || 0} finca(s)</small></td>
                      <td>{item.usuariosActivos || 0}</td>
                      <td><span className={`saas-estado saas-estado-${item.estado?.toLowerCase()}`}>{item.estado}</span></td>
                      <td><div className="acciones-tabla"><button type="button" title={item.estado === 'Activa' ? 'Suspender organización' : 'Reactivar organización'} onClick={() => alternarEstado(item)}>{item.estado === 'Activa' ? '⏸' : '▶'}</button></div></td>
                    </tr>
                  ))}
                  {organizaciones.length === 0 && <tr><td colSpan="6">Todavía no hay organizaciones.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </ContenidoPaginado>
      )}
    </section>
  );
};

export default AdministracionSaas;
