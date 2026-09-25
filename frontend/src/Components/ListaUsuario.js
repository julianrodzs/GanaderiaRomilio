import React from 'react';
import { useEffect, useState } from 'react';
import Animales from './Animales';
import Compras from './Compras';
import ConteoDrone from './ConteoDrone';
import Finanzas from './Finanzas';
import ImportarExcel from './ImportarExcel';
import Navegacion from './Navegacion';
import Pesajes from './Pesajes';
import PlanSanitario from './PlanSanitario';
import Potreros from './Potreros';
import Reproduccion from './Reproduccion';
import Reportes from './Reportes';
import Usuarios from '../pages/Usuarios';
import Tareas from '../pages/Tareas';
import CentroNotificaciones from '../pages/CentroNotificaciones';
import Ventas from './Ventas';
import { puedeAccederModulo, puedeGestionarModulo } from '../constants/permisosRoles';
import {
  obtenerAnimales,
  obtenerPlanesSanitarios,
  obtenerPotreros,
  obtenerProductividadCria,
  obtenerRegistrosReproductivos,
  obtenerSustentabilidadCria
} from '../services/api';
import { obtenerCambiosPendientes } from '../services/offlineStorage';

const obtenerRangoAnioActual = () => {
  const anio = new Date().getFullYear();
  return {
    fechaInicio: `${anio}-01-01`,
    fechaFin: `${anio}-12-31`
  };
};

const obtenerRangoMesActual = () => {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);

  return {
    fechaInicio: inicio.toISOString().slice(0, 10),
    fechaFin: fin.toISOString().slice(0, 10)
  };
};

const obtenerNivelIpg = (ipg) => {
  if (ipg >= 95) return 'excelente';
  if (ipg >= 85) return 'muy-bueno';
  if (ipg >= 75) return 'bueno';
  if (ipg >= 60) return 'regular';
  return 'deficiente';
};

const calcularEdadMeses = (fechaNacimiento) => {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return null;

  const hoy = new Date();
  let meses = (hoy.getFullYear() - nacimiento.getFullYear()) * 12;
  meses += hoy.getMonth() - nacimiento.getMonth();
  if (hoy.getDate() < nacimiento.getDate()) meses -= 1;
  return Math.max(meses, 0);
};

const formatearMoneda = (valor) => new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  maximumFractionDigits: 0
}).format(valor || 0);

const ListaUsuario = ({ usuario, onLogout }) => {
  const rol = usuario?.rol || 'Consulta';
  const modulosOrden = ['Dashboard', 'Tareas', 'Mis tareas', 'Inventario', 'Pesajes', 'Potreros', 'Sanidad', 'Reproduccion', 'Compras', 'Ventas', 'Finanzas', 'Reportes', 'Drone', 'Usuarios'];
  const obtenerVistaInicial = () => modulosOrden.find((modulo) => puedeAccederModulo(rol, modulo)) || 'Mis tareas';
  const [vistaActiva, setVistaActiva] = useState(obtenerVistaInicial);
  const [tareaInicialId, setTareaInicialId] = useState('');
  const [metricas, setMetricas] = useState({
    animales: 0,
    bovinos: 0,
    porcinos: 0,
    potreros: 0,
    vacasReproductivas: 0,
    vacasPrenadas: 0,
    proximosPartos: 0,
    proximosCelos: 0,
    destetesProximos: 0,
    hembras: 0,
    machos: 0,
    gastosOperativosMes: 0,
    utilidadPerdidaMes: 0,
    potrerosDescanso: 0,
    proximasSanidad: 0,
    vencidasSanidad: 0,
    ipg: 0,
    clasificacionIpg: 'Deficiente'
  });
  const [estadoConexion, setEstadoConexion] = useState({
    online: navigator.onLine,
    pendientes: 0
  });

  useEffect(() => {
    if (!puedeAccederModulo(rol, 'Dashboard')) {
      return;
    }

    const cargarMetricas = async () => {
      try {
        const [animales, potreros, planes, reproduccion, productividad, sustentabilidadMes] = await Promise.all([
          obtenerAnimales(),
          obtenerPotreros(),
          obtenerPlanesSanitarios(),
          obtenerRegistrosReproductivos(),
          obtenerProductividadCria(obtenerRangoAnioActual()),
          obtenerSustentabilidadCria(obtenerRangoMesActual())
        ]);
        const animalesActivos = animales.filter((animal) => !['Muerto', 'Vendido'].includes(animal.estado));
        const ciclosActivos = reproduccion.filter((registro) => (registro.estadoCiclo || 'Activo') === 'Activo' && registro.activoParaAlertas !== false);
        const animalesConRegistroReproductivo = new Set(
          reproduccion.map((registro) => registro.animal?._id || registro.animal).filter(Boolean)
        );
        const vacasReproductivas = animalesActivos.filter((animal) => {
          if (animal.sexo !== 'Hembra') return false;
          const edadMeses = calcularEdadMeses(animal.fechaNacimiento);
          return (edadMeses !== null && edadMeses >= 24) || animalesConRegistroReproductivo.has(animal._id);
        }).length;
        const vacasPrenadas = ciclosActivos.filter((registro) => ['Gestante', 'Próxima a parto'].includes(registro.estado)).length;

        setMetricas({
          animales: animalesActivos.length,
          bovinos: animalesActivos.filter((animal) => (animal.especie || 'Bovino') === 'Bovino').length,
          porcinos: animalesActivos.filter((animal) => animal.especie === 'Porcino').length,
          potreros: potreros.length,
          vacasReproductivas,
          vacasPrenadas,
          proximosPartos: ciclosActivos.filter((registro) => registro.estado === 'Próxima a parto').length,
          proximosCelos: ciclosActivos.filter((registro) => registro.estado === 'Próximo celo estimado').length,
          destetesProximos: ciclosActivos.filter((registro) => registro.estado === 'Destete próximo').length,
          hembras: animalesActivos.filter((animal) => animal.sexo === 'Hembra').length,
          machos: animalesActivos.filter((animal) => animal.sexo === 'Macho').length,
          gastosOperativosMes: sustentabilidadMes?.gastosOperativosPeriodo || 0,
          utilidadPerdidaMes: sustentabilidadMes?.utilidadPerdida || sustentabilidadMes?.margenSustentabilidad || 0,
          potrerosDescanso: potreros.filter((potrero) => potrero.estado === 'Descanso').length,
          proximasSanidad: planes.filter((plan) => plan.estado === 'Próximo').length,
          vencidasSanidad: planes.filter((plan) => plan.estado === 'Vencido').length,
          ipg: productividad?.ipg || 0,
          clasificacionIpg: productividad?.clasificacion || 'Deficiente'
        });
      } catch (error) {
        console.error('Error cargando metricas del dashboard', error);
      }
    };

    cargarMetricas();
  }, [rol]);

  useEffect(() => {
    if (!puedeAccederModulo(rol, vistaActiva)) {
      setVistaActiva(obtenerVistaInicial());
    }
  }, [rol, vistaActiva]);

  useEffect(() => {
    const actualizarEstadoConexion = async () => {
      const cambios = await obtenerCambiosPendientes().catch(() => []);
      setEstadoConexion({
        online: navigator.onLine,
        pendientes: cambios.length
      });
    };

    window.addEventListener('online', actualizarEstadoConexion);
    window.addEventListener('offline', actualizarEstadoConexion);
    window.addEventListener('ganaderiaOfflineCambios', actualizarEstadoConexion);
    actualizarEstadoConexion();

    return () => {
      window.removeEventListener('online', actualizarEstadoConexion);
      window.removeEventListener('offline', actualizarEstadoConexion);
      window.removeEventListener('ganaderiaOfflineCambios', actualizarEstadoConexion);
    };
  }, []);

  const navegarNotificacion = (notificacion) => {
    const entidadId = notificacion?.entidadId || '';
    const modulo = notificacion?.moduloOrigen;
    if (notificacion?.entidadTipo === 'Tarea' || modulo === 'Tareas') {
      setTareaInicialId(entidadId);
      setVistaActiva(puedeAccederModulo(rol, 'Tareas') ? 'Tareas' : 'Mis tareas');
      return;
    }
    if (modulo === 'Sanidad') setVistaActiva('Sanidad');
    else if (modulo === 'Reproduccion') setVistaActiva('Reproduccion');
    else if (modulo === 'Pesajes' || notificacion?.entidadTipo === 'Animal') setVistaActiva('Inventario');
    else if (modulo === 'Finanzas') setVistaActiva('Finanzas');
    else setVistaActiva('Notificaciones');
  };

  const cambiarVista = (vista) => {
    setTareaInicialId('');
    setVistaActiva(vista);
  };

  const propsNavegacion = {
    vistaActiva,
    onCambiarVista: cambiarVista,
    onLogout,
    usuario,
    onAbrirNotificaciones: () => setVistaActiva('Notificaciones'),
    onNavegarNotificacion: navegarNotificacion
  };
  const navegacion = <Navegacion {...propsNavegacion} />;
  const sinAcceso = (
    <main className="dashboard-shell">
      {navegacion}
      <section className="vista-tabla">
        <p className="eyebrow">Acceso</p>
        <h2>Sin permisos para este módulo</h2>
      </section>
    </main>
  );

  if (!puedeAccederModulo(rol, vistaActiva)) return sinAcceso;

  if (vistaActiva === 'Notificaciones') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <CentroNotificaciones onNavegar={navegarNotificacion} />
      </main>
    );
  }

  if (vistaActiva === 'Importar') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <ImportarExcel />
      </main>
    );
  }

  if (vistaActiva === 'Inventario') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Animales
          soloLectura={!puedeGestionarModulo(rol, 'Inventario')}
          puedeGestionarSanidad={puedeGestionarModulo(rol, 'Sanidad')}
        />
      </main>
    );
  }

  if (vistaActiva === 'Potreros') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Potreros soloLectura={!puedeGestionarModulo(rol, 'Potreros')} />
      </main>
    );
  }

  if (vistaActiva === 'Pesajes') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Pesajes soloLectura={!puedeGestionarModulo(rol, 'Pesajes')} />
      </main>
    );
  }

  if (vistaActiva === 'Sanidad') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <PlanSanitario soloLectura={!puedeGestionarModulo(rol, 'Sanidad')} />
      </main>
    );
  }

  if (vistaActiva === 'Reproduccion' || vistaActiva === 'Gestación') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Reproduccion soloLectura={!puedeGestionarModulo(rol, 'Reproduccion')} />
      </main>
    );
  }

  if (vistaActiva === 'Finanzas' || vistaActiva === 'Costos') {
    return (
      <main className="dashboard-shell">
        <Navegacion {...propsNavegacion} vistaActiva="Finanzas" />
        <Finanzas />
      </main>
    );
  }

  if (vistaActiva === 'Ventas') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Ventas soloLectura={!puedeGestionarModulo(rol, 'Ventas')} />
      </main>
    );
  }

  if (vistaActiva === 'Compras') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Compras soloLectura={!puedeGestionarModulo(rol, 'Compras')} />
      </main>
    );
  }

  if (vistaActiva === 'Reportes') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Reportes />
      </main>
    );
  }

  if (vistaActiva === 'Drone') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <ConteoDrone />
      </main>
    );
  }

  if (vistaActiva === 'Usuarios') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Usuarios usuarioActual={usuario} />
      </main>
    );
  }

  if (vistaActiva === 'Tareas' || vistaActiva === 'Mis tareas') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Tareas usuario={usuario} tareaInicialId={tareaInicialId} />
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      {navegacion}

      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Vision general de la hacienda</p>
          <div className="dashboard-saludo-linea">
            <h1>Buenos dias, {usuario?.nombre || 'Administrador'}</h1>
            <div className="app-status">
              <span className={estadoConexion.online ? 'status-pill online' : 'status-pill offline'}>
                {estadoConexion.online ? 'Online' : 'Offline'}
              </span>
              {estadoConexion.pendientes > 0 && <span className="status-pill pending">{estadoConexion.pendientes} pendientes</span>}
            </div>
          </div>
        </div>
      </section>

      <section className="metricas-grid">
        <article className="metric-card">
          <span>Total cabezas</span>
          <strong>{metricas.animales}</strong>
          <small>{metricas.bovinos} bovinos / {metricas.porcinos} porcinos</small>
        </article>
        <article className="metric-card">
          <span>Sexo del hato</span>
          <strong>{metricas.hembras}</strong>
          <small>{metricas.hembras} hembras / {metricas.machos} machos</small>
        </article>
        <article className="metric-card">
          <span>Vacas reproductivas</span>
          <strong>{metricas.vacasReproductivas}</strong>
          <small>Hembras adultas o con registro reproductivo</small>
        </article>
        <article className="metric-card">
          <span>Vacas preñadas</span>
          <strong>{metricas.vacasPrenadas}</strong>
          <small>Gestantes o próximas a parto</small>
        </article>
        <article className="metric-card">
          <span>Próximos partos</span>
          <strong>{metricas.proximosPartos}</strong>
          <small>Dentro de la ventana de alerta</small>
        </article>
        <article className="metric-card">
          <span>Próximos celos</span>
          <strong>{metricas.proximosCelos}</strong>
          <small>Estimados por último parto</small>
        </article>
        <article className="metric-card">
          <span>Destetes próximos</span>
          <strong>{metricas.destetesProximos}</strong>
          <small>Terneros en seguimiento</small>
        </article>
        <article className="metric-card">
          <span>Gastos operativos mes</span>
          <strong>{formatearMoneda(metricas.gastosOperativosMes)}</strong>
          <small>Finanzas del mes actual</small>
        </article>
        <article className={metricas.utilidadPerdidaMes >= 0 ? 'metric-card metric-card-positive' : 'metric-card metric-card-negative'}>
          <span>Utilidad / pérdida estimada</span>
          <strong>{formatearMoneda(metricas.utilidadPerdidaMes)}</strong>
          <small>Ventas - compras - costo operativo</small>
        </article>
        <article className="metric-card">
          <span>Potreros</span>
          <strong>{metricas.potreros}</strong>
          <small>{metricas.potrerosDescanso} en descanso</small>
        </article>
      </section>

      <section className="dashboard-content">
        <article className="panel-mapa">
          <div className="panel-title">
            <h2>Ubicacion de lotes</h2>
            <span>Mapa real</span>
          </div>
          <img className="dashboard-mapa-potreros" src="/assests/mapa-potreros.png" alt="Mapa de potreros de la finca" />
        </article>

        <article className="panel-alerta">
          <p className="eyebrow">Indicadores ejecutivos</p>
          <h2>Seguimiento diario</h2>
          <p>
            Priorizar partos, celos, destetes y sanidad pendiente. Revisar utilidad estimada
            cuando existan ventas registradas con peso y precio por kilo.
          </p>
          <div className={`dashboard-ipg-card ipg-fondo-${obtenerNivelIpg(metricas.ipg)}`}>
            <span>IPG</span>
            <strong>{metricas.ipg}</strong>
            <small>{metricas.clasificacionIpg}</small>
          </div>
          <div className="dashboard-mini-grid">
            <article>
              <span>Sanidad</span>
              <strong>{metricas.vencidasSanidad}</strong>
              <small>vencidas</small>
            </article>
            <article>
              <span>Sanidad</span>
              <strong>{metricas.proximasSanidad}</strong>
              <small>próximas</small>
            </article>
            <article>
              <span>Margen mes</span>
              <strong>{formatearMoneda(metricas.utilidadPerdidaMes)}</strong>
              <small>estimado</small>
            </article>
          </div>
          <div className="dashboard-logout-row">
            <button className="logout-dashboard-button" type="button" onClick={onLogout}>
              Salir
            </button>
          </div>
        </article>
      </section>
    </main>
  );
};

export default ListaUsuario;
