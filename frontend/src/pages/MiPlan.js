import React, { useEffect, useState } from 'react';
import PlanLimit from '../Components/PlanLimit';
import { usePlan } from '../context/PlanContext';
import {
  actualizarLineasProductivasFinca,
  obtenerFincas,
  seleccionarEspeciePlan
} from '../services/api';

const especiesProductivas = ['Bovino', 'Porcino'];
const objetivosProductivos = ['Cría', 'Engorde', 'Reemplazo', 'Reproducción', 'Otro'];

const funcionesPlan = [
  ['Centro de alertas', 'centroAlertas', 'Esencial'],
  ['Analítica productiva', 'analiticaProductiva', 'Gestión'],
  ['Correos operativos', 'emailsOperativos', 'Pro'],
  ['Analítica económica', 'analiticaEconomica', 'Pro'],
  ['Configuración avanzada de correos', 'configuracionEmailAvanzada', 'Premium']
];

const MiPlan = () => {
  const { plan, cargando, error, recargarPlan } = usePlan();
  const [guardando, setGuardando] = useState(false);
  const [guardandoFinca, setGuardandoFinca] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [fincas, setFincas] = useState([]);

  useEffect(() => {
    obtenerFincas()
      .then(setFincas)
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

  if (cargando) return <section className="vista-tabla"><p>Cargando plan...</p></section>;
  if (!plan) return <section className="vista-tabla"><p>{error || 'No se pudo cargar el plan.'}</p></section>;

  const esEsencial = plan.plan.codigo === 'ESENCIAL';
  return (
    <section className="vista-tabla mi-plan-page">
      <p className="eyebrow">Suscripción</p>
      <div className="mi-plan-header">
        <div><h1>Mi plan</h1><p>{plan.plan.nombre} · ${plan.plan.precioMensualUSD} USD al mes</p></div>
        <span className="estado-badge activo">{plan.plan.estado}</span>
      </div>

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
        </div>
        <div className="fincas-config-grid">
          {fincas.map((finca) => (
            <article className="finca-config" key={finca._id}>
              <header>
                <div><h3>{finca.nombre}</h3><span>{finca.codigo}</span></div>
                {finca.esPrincipal && <span className="estado-badge activo">Principal</span>}
              </header>
              <div className="lineas-productivas-grid">
                {especiesProductivas.map((especie) => {
                  const linea = (finca.lineasProductivas || []).find((item) => item.especie === especie);
                  return (
                    <fieldset key={especie} className="linea-productiva">
                      <label className="linea-productiva-especie">
                        <input type="checkbox" checked={Boolean(linea)} onChange={(evento) => cambiarEspecieFinca(finca._id, especie, evento.target.checked)} />
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
                              {objetivo}
                            </label>
                          ))}
                        </div>
                      )}
                    </fieldset>
                  );
                })}
              </div>
              <div className="form-actions">
                <button className="boton-primario compacto" type="button" disabled={guardandoFinca === finca._id} onClick={() => guardarLineasFinca(finca)}>
                  {guardandoFinca === finca._id ? 'Guardando...' : 'Guardar líneas'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="mi-plan-funciones">
        <h2>Funciones</h2>
        {funcionesPlan.map(([etiqueta, feature, planMinimo]) => (
          <div key={feature}>
            <span>{etiqueta}</span>
            <strong>{plan.funcionalidades[feature] ? 'Activo' : `Disponible desde ${planMinimo}`}</strong>
          </div>
        ))}
      </section>
    </section>
  );
};

export default MiPlan;
