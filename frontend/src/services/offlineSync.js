import { completarTarea, crearEventoAnimal } from './api';
import {
  actualizarCambioPendiente,
  actualizarTareaEnCache,
  obtenerContextoOffline,
  eliminarCambioPendiente,
  obtenerCambiosPendientes,
  registrarResultadoSincronizacion
} from './offlineStorage';

const MAX_INTENTOS_AUTOMATICOS = 5;
const MINUTO_MS = 60 * 1000;
let sincronizacionActiva = null;

const demoraReintentoMs = (intentos) => Math.min(2 ** Math.max(intentos - 1, 0) * MINUTO_MS, 30 * MINUTO_MS);

const estaListoParaReintento = (cambio, forzar) => {
  if (forzar) return cambio.estadoSincronizacion !== 'Conflicto';
  if (cambio.estadoSincronizacion === 'Conflicto' || cambio.estadoSincronizacion === 'Fallido') return false;
  if (!cambio.proximoIntentoEn) return true;
  return new Date(cambio.proximoIntentoEn).getTime() <= Date.now();
};

const sincronizarCambio = async (cambio) => {
  const intentos = Number(cambio.intentos || 0) + 1;
  const actualizado = await actualizarCambioPendiente(cambio.id, {
    estadoSincronizacion: 'Sincronizando',
    intentos,
    ultimoIntentoEn: new Date().toISOString(),
    errorSincronizacion: ''
  });

  if (!actualizado || obtenerContextoOffline().clave !== cambio.clave) return { id: cambio.id, estado: 'Pendiente' };
  try {
    if (cambio.tipo === 'completar-tarea') {
      const tarea = await completarTarea({
        id: cambio.referenciaId,
        observaciones: cambio.payload?.observaciones || '',
        idempotencyKey: cambio.idempotencyKey,
        versionEsperada: cambio.payload?.versionEsperada || '',
        fechaEjecucionReal: cambio.creadoEn,
        contextoEsperado: cambio
      });
      if (obtenerContextoOffline().clave === cambio.clave) await actualizarTareaEnCache(tarea);
    } else if (cambio.tipo === 'crear-nota-bitacora') {
      await crearEventoAnimal(cambio.payload, { idempotencyKey: cambio.idempotencyKey });
    } else {
      throw new Error(`Operacion offline no soportada: ${cambio.tipo}`);
    }
    await eliminarCambioPendiente(cambio.id);
    return { id: cambio.id, estado: 'Sincronizado' };
  } catch (error) {
    const esConflicto = error.status === 409;
    const accesoRevocado = error.status === 401
      || error.data?.code === 'ACCESS_REVOKED'
      || error.data?.code === 'ACCOUNT_INACTIVE'
      || error.data?.code === 'ORGANIZATION_INACTIVE';
    const agotado = intentos >= MAX_INTENTOS_AUTOMATICOS;
    if (error.status === 401) {
      return { id: cambio.id, estado: 'SesionExpirada', error: error.message };
    }
    const estadoSincronizacion = esConflicto ? 'Conflicto' : (accesoRevocado || agotado) ? 'Fallido' : 'Pendiente';
    const proximoIntentoEn = estadoSincronizacion === 'Pendiente'
      ? new Date(Date.now() + demoraReintentoMs(intentos)).toISOString()
      : null;

    await actualizarCambioPendiente(cambio.id, {
      estadoSincronizacion,
      proximoIntentoEn,
      codigoError: error.data?.code || error.data?.codigo || '',
      errorSincronizacion: accesoRevocado
        ? 'El acceso fue revocado. Inicia sesión nuevamente; este registro no se volverá a enviar.'
        : (error.message || 'No se pudo sincronizar el cambio.')
    });
    if (accesoRevocado && error.status !== 401) {
      let sesion = null;
      try { sesion = JSON.parse(localStorage.getItem('ganaderiaSesion') || 'null'); } catch (errorSesion) { sesion = null; }
      window.dispatchEvent(new CustomEvent('ganaderiaSesionExpirada', { detail: { sesion } }));
    }
    return { id: cambio.id, estado: estadoSincronizacion, error: error.message };
  }
};

const ejecutarSincronizacion = async ({ forzar = false } = {}) => {
  if (!navigator.onLine) return { sincronizados: 0, pendientes: 0, conflictos: 0, fallidos: 0 };

  const cambios = await obtenerCambiosPendientes().catch(() => []);
  const candidatos = cambios.filter((cambio) => estaListoParaReintento(cambio, forzar));
  const resultados = [];

  for (const cambio of candidatos) {
    const resultado = await sincronizarCambio(cambio);
    resultados.push(resultado);
    if (resultado.estado === 'SesionExpirada') {
      return {
        sincronizados: resultados.filter((item) => item.estado === 'Sincronizado').length,
        pendientes: 0,
        conflictos: 0,
        fallidos: 0,
        sesionExpirada: true
      };
    }
  }

  const restantes = await obtenerCambiosPendientes().catch(() => []);
  const resumen = {
    sincronizados: resultados.filter((item) => item.estado === 'Sincronizado').length,
    pendientes: restantes.filter((item) => ['Pendiente', 'Sincronizando'].includes(item.estadoSincronizacion)).length,
    conflictos: restantes.filter((item) => item.estadoSincronizacion === 'Conflicto').length,
    fallidos: restantes.filter((item) => item.estadoSincronizacion === 'Fallido').length
  };
  await registrarResultadoSincronizacion(resumen, { notificar: candidatos.length > 0 });
  return resumen;
};

export const sincronizarCambiosOffline = (opciones = {}) => {
  if (sincronizacionActiva) return sincronizacionActiva;
  sincronizacionActiva = ejecutarSincronizacion(opciones).finally(() => {
    sincronizacionActiva = null;
  });
  return sincronizacionActiva;
};

export const reintentarCambioOffline = async (id, { versionEsperada } = {}) => {
  const cambio = (await obtenerCambiosPendientes()).find((item) => item.id === id);
  if (!cambio) return;
  if (cambio.tipo === 'completar-tarea' && cambio.estadoSincronizacion === 'Conflicto' && !versionEsperada) {
    throw new Error('Revisa la tarea actual antes de volver a completarla.');
  }
  await actualizarCambioPendiente(id, {
    ...(versionEsperada ? { payload: { ...cambio.payload, versionEsperada } } : {}),
    estadoSincronizacion: 'Pendiente',
    intentos: 0,
    proximoIntentoEn: null,
    codigoError: '',
    errorSincronizacion: ''
  });
  return sincronizarCambiosOffline({ forzar: true });
};

export const descartarCambioOffline = (id) => eliminarCambioPendiente(id);
