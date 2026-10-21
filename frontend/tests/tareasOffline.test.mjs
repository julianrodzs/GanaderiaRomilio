import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { claveFechaTarea, diasHastaFechaTarea } from '../src/utils/fechasTareas.mjs';

test('las fechas civiles no retroceden un día en Costa Rica y los instantes sí usan la zona', () => {
  assert.equal(claveFechaTarea('2026-10-20', 'America/Costa_Rica'), '2026-10-20');
  assert.equal(claveFechaTarea('2026-10-20T02:00:00Z', 'America/Costa_Rica'), '2026-10-19');
  assert.equal(diasHastaFechaTarea('2026-10-20', new Date('2026-10-20T04:00:00Z'), 'America/Costa_Rica'), 1);
});

// Ejecuta el sincronizador real con adaptadores de red/IndexedDB; sin navegador ni envíos.
const preparar = ({ conflicto = false, cambioContexto = false } = {}) => {
  const original = fs.readFileSync(new URL('../src/services/offlineSync.js', import.meta.url), 'utf8');
  const fuente = original.replace(/import[\s\S]*?from '\.\/[^']+';\s*/g, '').replace(/export const /g, 'const ')
    + '\nglobalThis.ejecutar = sincronizarCambiosOffline;';
  let cola = [{ id: 'op-1', idempotencyKey: 'op-1', clave: 'org:finca:usuario', tipo: 'completar-tarea', referenciaId: 'tarea', creadoEn: '2026-10-20T13:00:00Z', payload: { versionEsperada: 'version-1', observaciones: 'Hecho en corral' } }];
  const envios = [], cache = [];
  const contexto = {
    navigator: { onLine: true },
    obtenerContextoOffline: () => ({ clave: cambioContexto ? 'otra:finca:usuario' : 'org:finca:usuario' }),
    obtenerCambiosPendientes: async () => cola,
    actualizarCambioPendiente: async (id, cambios) => { Object.assign(cola.find((item) => item.id === id), cambios); return cola[0]; },
    eliminarCambioPendiente: async (id) => { cola = cola.filter((item) => item.id !== id); },
    actualizarTareaEnCache: async (tarea) => cache.push(tarea),
    registrarResultadoSincronizacion: async () => {},
    completarTarea: async (datos) => {
      envios.push(datos);
      if (conflicto) throw Object.assign(new Error('Cambió la tarea'), { status: 409 });
      return { _id: 'tarea', estado: 'Completada', fechaCompletada: datos.fechaEjecucionReal };
    }
  };
  vm.runInNewContext(fuente, contexto);
  return { ejecutar: contexto.ejecutar, envios, cache, pendientes: () => cola };
};

test('offline envía la hora de campo, clave y versión; concilia caché solo tras éxito', async () => {
  const escenario = preparar();
  const resultado = await escenario.ejecutar();
  assert.equal(resultado.sincronizados, 1);
  assert.equal(escenario.envios[0].fechaEjecucionReal, '2026-10-20T13:00:00Z');
  assert.equal(escenario.envios[0].idempotencyKey, 'op-1');
  assert.equal(escenario.envios[0].versionEsperada, 'version-1');
  assert.equal(escenario.cache[0].fechaCompletada, '2026-10-20T13:00:00Z');
  assert.equal(escenario.pendientes().length, 0);
});

test('un conflicto conserva la operación y no se reenvía automáticamente', async () => {
  const escenario = preparar({ conflicto: true });
  assert.equal((await escenario.ejecutar()).conflictos, 1);
  await escenario.ejecutar({ forzar: true });
  assert.equal(escenario.envios.length, 1);
  assert.equal(escenario.cache.length, 0);
  assert.equal(escenario.pendientes()[0].payload.versionEsperada, 'version-1');
});

test('no se envía una operación de la sesión anterior después de cambiar de finca', async () => {
  const escenario = preparar({ cambioContexto: true });
  await escenario.ejecutar();
  assert.equal(escenario.envios.length, 0);
  assert.equal(escenario.pendientes().length, 1);
});
