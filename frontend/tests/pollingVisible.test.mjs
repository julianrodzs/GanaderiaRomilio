import test from 'node:test';
import assert from 'node:assert/strict';
import { iniciarPollingVisible } from '../src/utils/pollingVisible.mjs';

const preparar = () => {
  const ventana = new EventTarget(), documento = new EventTarget(), conexion = { onLine: true };
  const timers = new Map(); let reloj = 0, id = 0;
  documento.visibilityState = 'visible';
  ventana.setTimeout = (fn, ms) => { timers.set(++id, { fn, en: reloj + ms }); return id; };
  ventana.clearTimeout = (key) => timers.delete(key);
  const avanzar = async (ms) => {
    const hasta = reloj + ms;
    while (true) {
      const siguiente = [...timers].filter(([, t]) => t.en <= hasta).sort((a, b) => a[1].en - b[1].en)[0];
      if (!siguiente) break;
      timers.delete(siguiente[0]); reloj = siguiente[1].en; siguiente[1].fn(); await Promise.resolve(); await Promise.resolve();
    }
    reloj = hasta;
  };
  const emitir = async (destino, nombre) => { destino.dispatchEvent(new Event(nombre)); await Promise.resolve(); await Promise.resolve(); };
  return { ventana, documento, conexion, avanzar, emitir, timers, opciones: { ventana, documento, conexion, ahora: () => reloj, intervaloMs: 120_000 } };
};

test('campana: de 160 lecturas/hora a 30 del contador visible; cero en ocho horas oculta', async () => {
  const e = preparar(); let llamadas = 0;
  const detener = iniciarPollingVisible(async () => { llamadas++; }, e.opciones);
  await Promise.resolve(); await e.avanzar(3_600_000 - 1);
  assert.equal(llamadas, 30);
  e.documento.visibilityState = 'hidden'; await e.emitir(e.documento, 'visibilitychange');
  await e.avanzar(8 * 3_600_000);
  await e.emitir(e.ventana, 'focus'); await e.emitir(e.ventana, 'online');
  assert.equal(llamadas, 30); assert.equal(e.timers.size, 0);
  e.documento.visibilityState = 'visible'; await e.emitir(e.documento, 'visibilitychange');
  await e.emitir(e.ventana, 'focus'); assert.equal(llamadas, 31);
  detener(); assert.equal(e.timers.size, 0);
});

test('no solapa peticiones ni duplica focus/visibility; al desmontar retira listeners', async () => {
  const e = preparar(); let llamadas = 0, resolver;
  const detener = iniciarPollingVisible(() => { llamadas++; return new Promise((r) => { resolver = r; }); }, { ...e.opciones, eventos: ['cambios'] });
  await e.avanzar(600_000); await e.emitir(e.ventana, 'cambios');
  await e.emitir(e.ventana, 'focus'); assert.equal(llamadas, 1);
  resolver(); await Promise.resolve(); await e.avanzar(120_000);
  assert.equal(llamadas, 2);
  detener(); resolver(); await Promise.resolve(); await e.emitir(e.ventana, 'cambios');
  assert.equal(llamadas, 2); assert.equal(e.timers.size, 0);
});

test('sin red no programa consultas; al recuperar conexion y antiguedad las retoma', async () => {
  const e = preparar(); e.conexion.onLine = false; let llamadas = 0;
  const detener = iniciarPollingVisible(async () => { llamadas++; }, e.opciones);
  await e.avanzar(600_000); assert.equal(llamadas, 0);
  e.conexion.onLine = true; await e.emitir(e.ventana, 'online'); assert.equal(llamadas, 1);
  e.conexion.onLine = false; await e.emitir(e.ventana, 'offline');
  await e.avanzar(600_000); assert.equal(llamadas, 1); detener();
});

test('un cambio propio fuerza refresco visible; no provoca consultas oculto', async () => {
  const e = preparar(); let llamadas = 0;
  const detener = iniciarPollingVisible(async () => { llamadas++; }, { ...e.opciones, eventos: ['cambios'] });
  await Promise.resolve(); await e.emitir(e.ventana, 'cambios'); assert.equal(llamadas, 2);
  e.documento.visibilityState = 'hidden'; await e.emitir(e.documento, 'visibilitychange');
  await e.emitir(e.ventana, 'cambios'); assert.equal(llamadas, 2); detener();
});
