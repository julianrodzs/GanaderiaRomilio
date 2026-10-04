import React, { useEffect, useState } from 'react';
import PlanLimit from '../Components/PlanLimit';
import { usePlan } from '../context/PlanContext';
import {
  actualizarFinca,
  actualizarLineasProductivasFinca,
  cambiarEstadoFinca,
  crearFinca,
  marcarFincaPrincipal,
  obtenerFincas,
  seleccionarEspeciePlan
} from '../services/api';
import { etiquetaObjetivoProductivo, OBJETIVOS_LINEA_PRODUCTIVA } from '../constants/objetivosProductivos';
import FacturacionPlan from '../Components/FacturacionPlan';

const especiesProductivas = ['Bovino', 'Porcino'];
const objetivosProductivos = OBJETIVOS_LINEA_PRODUCTIVA;

const funcionesPlan = [
  { etiqueta: 'Centro de alertas', feature: 'centroAlertas', planMinimo: 'Esencial' },
  { etiqueta: 'Analítica productiva', feature: 'analiticaProductiva', planMinimo: 'Gestión' },
  { etiqueta: 'Correos operativos', feature: 'emailsOperativos', planMinimo: 'Pro' },
  { etiqueta: 'Analítica económica', feature: 'analiticaEconomica', planMinimo: 'Pro' },
  { etiqueta: 'Reportes multi-finca', feature: 'reportesMultiFinca', planMinimo: 'Premium' },
  { etiqueta: 'Configuración avanzada de correos', feature: 'configuracionEmailAvanzada', planMinimo: 'Premium' }
];

const MiPlan = () => {
  const { capacidadDisponible, plan, cargando, error, recargarPlan, puedeUsarEspecie } = usePlan();
  const [guardando, setGuardando] = useState(false);
  const [guardandoFinca, setGuardandoFinca] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [fincas, setFincas] = useState([]);
  const [mostrarNuevaFinca, setMostrarNuevaFinca] = useState(false);
  const [nuevaFinca, setNuevaFinca] = useState({ nombre: '', codigo: '', ubicacion: '', descripcion: '' });

  const publicarFincas = (items) => {
    setFincas(items);
    window.dispatchEvent(new CustomEvent('ganaderiaFincasActualizadas', { detail: { fincas: items } }));
  };

  const cargarFincas = async () => {
    const items = await obtenerFincas();
    publicarFincas(items);
    return items;
  };

  useEffect(() => {
    cargarFincas()
      .catch((err) => setMensaje(err.message));
  }, []);

  const elegirEspecie = async (especiePlan) => {
    setGuardando(true);
    setMensaje('');
    try {
      await seleccionarEspeciePlan(especiePlan);
      await recargarPlan();
      setMensaje('Especie del plan actualizada.');
    } catch (err) {
      setMensaje(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEspecieFinca = (fincaId, especie, activa) => {
    setFincas((actuales) => actuales.map((finca) => {
      if (finca._id !== fincaId) return finca;
      const otras = (finca.lineasProductivas || []).filter((linea) => linea.especie !== especie);
      return {
        ...finca,
        lineasProductivas: activa
          ? [...otras, { especie, objetivos: [...objetivosProductivos], activa: true }]
          : otras
      };
    }));
  };

  const cambiarObjetivoFinca = (fincaId, especie, objetivo, activo) => {
    setFincas((actuales) => actuales.map((finca) => {
      if (finca._id !== fincaId) return finca;
      return {
        ...finca,
        lineasProductivas: (finca.lineasProductivas || []).map((linea) => (
          linea.especie === especie
            ? {
                ...linea,
                objetivos: activo
                  ? [...new Set([...(linea.objetivos || []), objetivo])]
                  : (linea.objetivos || []).filter((item) => item !== objetivo)
              }
            : linea
        ))
      };
    }));
  };

  const guardarLineasFinca = async (finca) => {
    setGuardandoFinca(finca._id);
    setMensaje('');
    try {
      const respuesta = await actualizarLineasProductivasFinca(finca._id, finca.lineasProductivas || []);
      setFincas((actuales) => actuales.map((item) => item._id === finca._id
        ? { ...respuesta.finca, esPrincipal: item.esPrincipal }
        : item));
      setMensaje('Líneas productivas actualizadas.');
    } catch (err) {
      setMensaje(err.message);
    } finally {
      setGuardandoFinca('');
    }
  };

  const crearNuevaFinca = async (evento) => {
    evento.preventDefault();
    setGuardandoFinca('nueva');
    setMensaje('');
    try {
      const lineasProductivas = esEsencial
        ? [{ especie: plan.plan.especiePlan, objetivos: [...objetivosProductivos], activa: true }]
        : especiesProductivas.map((especie) => ({ especie, objetivos: [...objetivosProductivos], activa: true }));
      await crearFinca({ ...nuevaFinca, lineasProductivas });
      await Promise.all([cargarFincas(), recargarPlan()]);
      setNuevaFinca({ nombre: '', codigo: '', ubicacion: '', descripcion: '' });
      setMostrarNuevaFinca(false);
      setMensaje('Finca creada. Ya puede seleccionarse desde el encabezado.');
    } catch (err) {
      setMensaje(err.message);
    } finally {
      setGuardandoFinca('');
    }
  };

  const guardarDatosFinca = async (finca) => {
    setGuardandoFinca(finca._id);
    setMensaje('');
    try {
      await actualizarFinca(finca._id, {
        nombre: finca.nombre,
        codigo: finca.codigo,
        ubicacion: finca.ubicacion,
        descripcion: finca.descripcion
      });
      await cargarFincas();
      setMensaje('Datos de finca actualizados.');
    } catch (err) {
      setMensaje(err.message);
    } finally {
      setGuardandoFinca('');
    }
  };

  const alternarEstadoFinca = async (finca) => {
    const estado = finca.estado === 'Activa' ? 'Inactiva' : 'Activa';
    if (estado === 'Inactiva' && !window.confirm(`¿Desactivar ${finca.nombre}? Sus datos se conservarán.`)) return;
    setGuardandoFinca(finca._id);
    setMensaje('');
    try {
      await cambiarEstadoFinca(finca._id, estado);
      await Promise.all([cargarFincas(), recargarPlan()]);
      setMensaje(`Finca ${estado.toLowerCase()}.`);
    } catch (err) {
      setMensaje(err.message);
    } finally {
      setGuardandoFinca('');
    }
  };

  const hacerPrincipal = async (finca) => {
    setGuardandoFinca(finca._id);
    setMensaje('');
    try {
      await marcarFincaPrincipal(finca._id);
      await cargarFincas();
      setMensaje(`${finca.nombre} es ahora la finca principal.`);
    } catch (err) {
      setMensaje(err.message);
    } finally {
      setGuardandoFinca('');
    }
  };

  if (cargando) return <section className="vista-tabla"><p>Cargando plan...</p></section>;
  if (!plan) return <section className="vista-tabla"><p>{error || 'No se pudo cargar el plan.'}</p></section>;

  const esEsencial = plan.plan.codigo === 'ESENCIAL';
  const cuotaFincas = capacidadDisponible('fincas');
  return (
    <section className="vista-tabla mi-plan-page">
      <p className="eyebrow">Suscripción</p>
      <div className="mi-plan-header">
        <div><h1>Mi plan</h1><p>{plan.plan.nombre} · ${plan.plan.precioMensualUSD} USD al mes</p></div>
        <span className={`estado-badge ${plan.plan.vigente ? 'activo' : 'estado-Aplicado'}`}>{plan.plan.estado}</span>
      </div>
      <FacturacionPlan codigoActual={plan.plan.codigo} />

      {esEsencial && (
        <section className="mi-plan-especie">
          <h2>¿Qué tipo de producción desea administrar?</h2>
          <p>El plan Esencial permite administrar una especie. Los planes superiores permiten Bovinos y Porcinos en una misma cuenta.</p>
          <div className="selector-especie">
            {['Bovino', 'Porcino'].map((especie) => (
              <button key={especie} type="button" disabled={guardando} className={plan.plan.especiePlan === especie ? 'activo' : ''} onClick={() => elegirEspecie(especie)}>
                {especie === 'Bovino' ? 'Bovinos · hasta 210 activos · 15 conteos de dron/mes' : 'Porcinos · hasta 500 activos'}
              </button>
            ))}
          </div>
        </section>
      )}

      {mensaje && <p className="form-message">{mensaje}</p>}
      <div className="plan-limits-grid">
        <PlanLimit etiqueta="Animales activos" actual={plan.uso.animalesActuales} limite={plan.limites.animales} sobreLimite={plan.sobreLimite.animales} />
        <PlanLimit etiqueta="Usuarios activos" actual={plan.uso.usuariosActuales} limite={plan.limites.usuarios} sobreLimite={plan.sobreLimite.usuarios} />
        <PlanLimit etiqueta="Fincas activas" actual={plan.uso.fincasActuales} limite={plan.limites.fincas} sobreLimite={plan.sobreLimite.fincas} />
        <PlanLimit etiqueta={`Conteos de dron (${plan.uso.periodo})`} actual={plan.uso.conteosDroneMes} limite={plan.limites.conteosDrone} sobreLimite={plan.sobreLimite.conteosDrone} />
      </div>
      <section className="mi-plan-fincas">
        <div className="panel-title">
          <div><p className="eyebrow">Operación</p><h2>Fincas y líneas productivas</h2></div>
          {plan.limites.fincas > 1 && (
            <button className="boton-primario compacto" type="button" onClick={() => setMostrarNuevaFinca((actual) => !actual)} disabled={!mostrarNuevaFinca && !cuotaFincas.permitido} title={!cuotaFincas.permitido ? cuotaFincas.mensaje : ''}>
              {mostrarNuevaFinca ? 'Cancelar' : 'Nueva finca'}
            </button>
          )}
        </div>
        {mostrarNuevaFinca && (
          <form className="finca-nueva-form" onSubmit={crearNuevaFinca}>
            <label>Nombre<input required value={nuevaFinca.nombre} onChange={(e) => setNuevaFinca((actual) => ({ ...actual, nombre: e.target.value }))} /></label>
            <label>Código<input required value={nuevaFinca.codigo} onChange={(e) => setNuevaFinca((actual) => ({ ...actual, codigo: e.target.value.toUpperCase() }))} /></label>
            <label>Ubicación<input value={nuevaFinca.ubicacion} onChange={(e) => setNuevaFinca((actual) => ({ ...actual, ubicacion: e.target.value }))} /></label>
            <label>Descripción<input value={nuevaFinca.descripcion} onChange={(e) => setNuevaFinca((actual) => ({ ...actual, descripcion: e.target.value }))} /></label>
            <button className="boton-primario" type="submit" disabled={guardandoFinca === 'nueva' || !cuotaFincas.permitido} title={!cuotaFincas.permitido ? cuotaFincas.mensaje : ''}>{guardandoFinca === 'nueva' ? 'Creando...' : 'Crear finca'}</button>
          </form>
        )}
        <div className="fincas-config-grid">
          {fincas.map((finca) => (
            <article className="finca-config" key={finca._id}>
              <header>
                <div><h3>{finca.nombre}</h3><span>{finca.codigo} · {finca.estado}</span></div>
                <div className="finca-badges">
                  {finca.esActiva && <span className="estado-badge activo">En uso</span>}
                  {finca.esPrincipal && <span className="estado-badge activo">Principal</span>}
                </div>
              </header>
              <div className="finca-datos-grid">
                <label>Nombre<input value={finca.nombre || ''} onChange={(e) => setFincas((actuales) => actuales.map((item) => item._id === finca._id ? { ...item, nombre: e.target.value } : item))} /></label>
                <label>Código<input value={finca.codigo || ''} onChange={(e) => setFincas((actuales) => actuales.map((item) => item._id === finca._id ? { ...item, codigo: e.target.value.toUpperCase() } : item))} /></label>
                <label>Ubicación<input value={finca.ubicacion || ''} onChange={(e) => setFincas((actuales) => actuales.map((item) => item._id === finca._id ? { ...item, ubicacion: e.target.value } : item))} /></label>
                <label>Descripción<input value={finca.descripcion || ''} onChange={(e) => setFincas((actuales) => actuales.map((item) => item._id === finca._id ? { ...item, descripcion: e.target.value } : item))} /></label>
              </div>
              <div className="lineas-productivas-grid">
                {especiesProductivas.map((especie) => {
                  const linea = (finca.lineasProductivas || []).find((item) => item.especie === especie);
                  return (
                    <fieldset key={especie} className="linea-productiva">
                      <label className="linea-productiva-especie">
                        <input type="checkbox" checked={Boolean(linea)} disabled={!linea && !puedeUsarEspecie(especie)} title={!puedeUsarEspecie(especie) ? 'Esta especie no está incluida en el plan.' : ''} onChange={(evento) => cambiarEspecieFinca(finca._id, especie, evento.target.checked)} />
                        {especie === 'Bovino' ? 'Bovinos' : 'Porcinos'}
                      </label>
                      {linea && (
                        <div className="linea-productiva-objetivos">
                          {objetivosProductivos.map((objetivo) => (
                            <label key={objetivo}>
                              <input
                                type="checkbox"
                                checked={(linea.objetivos || []).includes(objetivo)}
                                onChange={(evento) => cambiarObjetivoFinca(finca._id, especie, objetivo, evento.target.checked)}
                              />
                              {etiquetaObjetivoProductivo(objetivo)}
                            </label>
                          ))}
                        </div>
                      )}
                    </fieldset>
                  );
                })}
              </div>
              <div className="form-actions">
                <button type="button" disabled={guardandoFinca === finca._id} onClick={() => guardarDatosFinca(finca)}>Guardar datos</button>
                <button className="boton-primario compacto" type="button" disabled={guardandoFinca === finca._id} onClick={() => guardarLineasFinca(finca)}>
                  {guardandoFinca === finca._id ? 'Guardando...' : 'Guardar líneas'}
                </button>
                {!finca.esPrincipal && finca.estado === 'Activa' && <button type="button" disabled={guardandoFinca === finca._id} onClick={() => hacerPrincipal(finca)}>Hacer principal</button>}
                {!finca.esPrincipal && !finca.esActiva && <button className={finca.estado === 'Activa' ? 'boton-peligro' : ''} type="button" disabled={guardandoFinca === finca._id || (finca.estado !== 'Activa' && !cuotaFincas.permitido)} title={finca.estado !== 'Activa' && !cuotaFincas.permitido ? cuotaFincas.mensaje : ''} onClick={() => alternarEstadoFinca(finca)}>{finca.estado === 'Activa' ? 'Desactivar' : 'Reactivar'}</button>}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="mi-plan-funciones">
        <h2>Funciones</h2>
        {funcionesPlan.map(({ etiqueta, feature, planMinimo, proximamente }) => (
          <div key={feature}>
            <span>{etiqueta}</span>
            <strong>{proximamente ? `Próximamente · ${planMinimo}` : plan.funcionalidades[feature] ? 'Activo' : `Disponible desde ${planMinimo}`}</strong>
          </div>
        ))}
      </section>
    </section>
  );
};

export default MiPlan;
