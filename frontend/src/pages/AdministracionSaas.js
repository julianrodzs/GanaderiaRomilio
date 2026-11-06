import React, { useEffect, useMemo, useState } from 'react';
import {
  cambiarEstadoOrganizacionSaas,
  crearOrganizacionSaas,
  obtenerOrganizacionesSaas
} from '../services/api';
import { obtenerCarteraSaas } from '../services/api';
import { CamposPagoSuscripcion, EstadoSuscripcion, GestionSuscripcionSaas, pagoInicialVacio } from '../Components/SuscripcionesSaas';
import { fechaSuscripcion, montoSuscripcion } from '../utils/suscripciones.mjs';
import { ContenidoPaginado } from '../Components/PaginacionTabla';
import { etiquetaObjetivoProductivo, OBJETIVOS_LINEA_PRODUCTIVA } from '../constants/objetivosProductivos';

const PLANES = ['ESENCIAL', 'GESTION', 'PRO', 'PREMIUM'];
const OBJETIVOS = OBJETIVOS_LINEA_PRODUCTIVA;

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
  suscripcion: { diasPrueba: 15, diasGracia: 5, notasFacturacion: '' },
  finca: {
    nombre: '',
    codigo: 'PRINCIPAL',
    ubicacion: '',
    lineasProductivas: [
      { especie: 'Bovino', objetivos: ['REPRODUCCION', 'ENGORDE'], activa: true }
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
  const [cartera, setCartera] = useState(null), [filtroEstado, setFiltroEstado] = useState('Todas'), [filtroPlan, setFiltroPlan] = useState('Todos');
  const [modal, setModal] = useState(null), [registrarInicial, setRegistrarInicial] = useState(false), [pagoAlta, setPagoAlta] = useState(pagoInicialVacio);

  const cargar = async () => {
    try {
      setCargando(true);
      setError('');
      const [clientes, resumen] = await Promise.all([obtenerOrganizacionesSaas(), obtenerCarteraSaas()]);
      setOrganizaciones(clientes); setCartera(resumen);
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
          ? [{ especie, objetivos: ['REPRODUCCION', 'ENGORDE'], activa: true }]
          : ['Bovino', 'Porcino'].map((item) => ({ especie: item, objetivos: ['REPRODUCCION', 'ENGORDE'], activa: true }))
      }
    }));
  };

  const cambiarEspecieEsencial = (especie) => {
    setFormulario((actual) => ({
      ...actual,
      plan: { ...actual.plan, especiePlan: especie },
      finca: {
        ...actual.finca,
        lineasProductivas: [{ especie, objetivos: ['REPRODUCCION', 'ENGORDE'], activa: true }]
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
      const respuesta = await crearOrganizacionSaas({ ...formulario,
        pagoInicial: registrarInicial && formulario.plan.estado === 'Activo' ? { ...pagoAlta, monto: Number(pagoAlta.monto), fechaFinPersonalizada: pagoAlta.fechaFinPersonalizada || undefined } : null });
      setResultado(respuesta);
      setFormulario(crearEstadoInicial());
      setMostrarFormulario(false);
      setRegistrarInicial(false); setPagoAlta(pagoInicialVacio());
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const filtradas = organizaciones.filter((o) => {
    if (filtroPlan !== 'Todos' && o.plan?.codigo !== filtroPlan) return false;
    const s = o.suscripcion || {};
    if (filtroEstado === 'Por vencer') return s.diasParaVencer !== null && s.diasParaVencer >= 0 && s.diasParaVencer <= 7 && s.permiteOperar;
    if (filtroEstado === 'Vencidas') return ['EN_GRACIA', 'VENCIDA'].includes(s.estadoSuscripcion);
    if (filtroEstado === 'En prueba') return s.estadoSuscripcion === 'PRUEBA';
    if (filtroEstado === 'Activas') return ['ACTIVA', 'POR_VENCER'].includes(s.estadoSuscripcion) && o.estado === 'Activa';
    return true;
  });

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
        <article><span>Activas al día</span><strong>{cartera?.activas ?? estadisticas.activos}</strong></article>
        <article><span>En prueba</span><strong>{cartera?.prueba ?? estadisticas.prueba}</strong></article>
        <article><span>Por vencer · ≤ 7 días</span><strong>{cartera?.porVencer ?? 0}</strong></article>
        <article><span>En gracia / vencidas</span><strong>{cartera?.vencidas ?? 0}</strong></article>
        <article><span>Recaudado del mes · CRC</span><strong>{montoSuscripcion(cartera?.ingresos?.CRC || 0)}</strong></article>
        <article><span>Recaudado del mes · USD</span><strong>{montoSuscripcion(cartera?.ingresos?.USD || 0, 'USD')}</strong></article>
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
              {formulario.plan.estado === 'Prueba' && <label>Días de prueba<input type="number" min="1" max="365" value={formulario.suscripcion.diasPrueba} onChange={(e) => actualizarSeccion('suscripcion', 'diasPrueba', Number(e.target.value))} required /></label>}
              <label>Días de gracia<input type="number" min="0" max="60" value={formulario.suscripcion.diasGracia} onChange={(e) => actualizarSeccion('suscripcion', 'diasGracia', Number(e.target.value))} required /></label>
              <label className="saas-campo-amplio">Notas de facturación<input value={formulario.suscripcion.notasFacturacion} onChange={(e) => actualizarSeccion('suscripcion', 'notasFacturacion', e.target.value)} maxLength={2000} /></label>
            </div>
            {formulario.plan.estado === 'Activo' && <><label className="checkbox-line"><input type="checkbox" checked={registrarInicial} onChange={(e) => setRegistrarInicial(e.target.checked)} />Registrar pago inicial</label>{registrarInicial && <CamposPagoSuscripcion datos={pagoAlta} onChange={setPagoAlta} />}</>}
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
                        <span>{etiquetaObjetivoProductivo(objetivo)}</span>
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
      <div className="suscripcion-filtros"><label>Estado<select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>{['Todas', 'Activas', 'En prueba', 'Por vencer', 'Vencidas'].map((v) => <option key={v}>{v}</option>)}</select></label><label>Plan<select value={filtroPlan} onChange={(e) => setFiltroPlan(e.target.value)}><option>Todos</option>{PLANES.map((v) => <option key={v} value={v}>{etiquetaPlan(v)}</option>)}</select></label></div>

      {cargando ? <div className="estado-importacion">Cargando clientes...</div> : (
        <ContenidoPaginado datos={filtradas} clavePaginacion={`saas-organizaciones:${filtroEstado}:${filtroPlan}`}>
          {(organizacionesPagina) => (
            <div className="tabla-scroll tabla-dinamica">
              <table className="saas-tabla">
                <thead><tr><th>Organización</th><th>Plan</th><th>Finca principal</th><th>Usuarios</th><th>Vigencia</th><th>Acciones</th></tr></thead>
                <tbody>
                  {organizacionesPagina.map((item) => (
                    <tr key={item._id}>
                      <td><strong>{item.nombre}</strong><small>{item.slug}</small></td>
                      <td>{etiquetaPlan(item.plan?.codigo)}<small>{item.plan?.estado || '--'}</small></td>
                      <td>{item.fincaPrincipal?.nombre || '--'}<small>{item.fincasActivas || 0} finca(s)</small></td>
                      <td>{item.usuariosActivos || 0}</td>
                      <td><EstadoSuscripcion suscripcion={item.suscripcion} /><small>{fechaSuscripcion(item.suscripcion?.fechaProximoVencimiento)}</small><small>{item.suscripcion?.diasParaVencer === null ? 'Requiere revisión' : item.suscripcion?.diasParaVencer < 0 ? `${Math.abs(item.suscripcion.diasParaVencer)} días de atraso` : `${item.suscripcion?.diasParaVencer} días restantes`}</small><small>{item.suscripcion?.modoFacturacion} · {item.estado}</small></td>
                      <td><div className="suscripcion-acciones">{item.suscripcion?.modoFacturacion === 'MANUAL' && <><button type="button" className="boton-secundario compacto" onClick={() => setModal({ organizacion: item, tipo: 'pago' })}>+ Registrar pago</button><button type="button" className="boton-secundario compacto" onClick={() => setModal({ organizacion: item, tipo: 'ajuste' })}>Plan / vigencia</button></>}<button type="button" className="boton-link" onClick={() => setModal({ organizacion: item, tipo: 'historial' })}>Historial de pagos</button><button type="button" className="boton-link" onClick={() => alternarEstado(item)}>{item.estado === 'Activa' ? 'Suspender organización' : 'Reactivar organización'}</button></div></td>
                    </tr>
                  ))}
                  {filtradas.length === 0 && <tr><td colSpan="6">No hay organizaciones para estos filtros.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </ContenidoPaginado>
      )}
      {modal && <GestionSuscripcionSaas {...modal} onCerrar={() => setModal(null)} alActualizar={cargar} />}
    </section>
  );
};

export default AdministracionSaas;
