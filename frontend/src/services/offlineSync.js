import { completarTarea } from './api';
import {
  actualizarCambioPendiente,
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
  await actualizarCambioPendiente(cambio.id, {
    estadoSincronizacion: 'Sincronizando',
    intentos,
    ultimoIntentoEn: new Date().toISOString(),
    errorSincronizacion: ''
  });

  try {
    if (cambio.tipo !== 'completar-tarea') {
      throw new Error(`Operacion offline no soportada: ${cambio.tipo}`);
    }

    await completarTarea({
      id: cambio.referenciaId,
      observaciones: cambio.payload?.observaciones || '',
      idempotencyKey: cambio.idempotencyKey,
      versionEsperada: cambio.payload?.versionEsperada || ''
    });
    await eliminarCambioPendiente(cambio.id);
    return { id: cambio.id, estado: 'Sincronizado' };
  } catch (error) {
    const esConflicto = error.status === 409;
    const agotado = intentos >= MAX_INTENTOS_AUTOMATICOS;
    const estadoSincronizacion = esConflicto ? 'Conflicto' : agotado ? 'Fallido' : 'Pendiente';
    const proximoIntentoEn = estadoSincronizacion === 'Pendiente'
      ? new Date(Date.now() + demoraReintentoMs(intentos)).toISOString()
      : null;

    await actualizarCambioPendiente(cambio.id, {
      estadoSincronizacion,
      proximoIntentoEn,
      codigoError: error.data?.codigo || '',
      errorSincronizacion: error.message || 'No se pudo sincronizar el cambio.'
    });
    return { id: cambio.id, estado: estadoSincronizacion, error: error.message };
  }
};

const ejecutarSincronizacion = async ({ forzar = false } = {}) => {
  if (!navigator.onLine) return { sincronizados: 0, pendientes: 0, conflictos: 0, fallidos: 0 };

  const cambios = await obtenerCambiosPendientes().catch(() => []);
  const candidatos = cambios.filter((cambio) => estaListoParaReintento(cambio, forzar));
  const resultados = [];

  for (const cambio of candidatos) {
    resultados.push(await sincronizarCambio(cambio));
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

export const reintentarCambioOffline = async (id) => {
  await actualizarCambioPendiente(id, {
    estadoSincronizacion: 'Pendiente',
    intentos: 0,
    proximoIntentoEn: null,
    codigoError: '',
    errorSincronizacion: ''
  });
  return sincronizarCambiosOffline({ forzar: true });
};

export const descartarCambioOffline = (id) => eliminarCambioPendiente(id);
