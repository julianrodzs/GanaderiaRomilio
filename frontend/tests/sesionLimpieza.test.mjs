import test from 'node:test';
import assert from 'node:assert/strict';
import { limpiarDatosSecundariosSesion, observarCierreSesion } from '../src/services/sesionLimpieza.mjs';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';

const almacen = (datos = {}) => {
  const mapa = new Map(Object.entries(datos));
  return { get length() { return mapa.size; }, key: (i) => [...mapa.keys()][i], getItem: (k) => mapa.get(k) ?? null,
    setItem: (k, v) => mapa.set(k, v), removeItem: (k) => mapa.delete(k) };
};
const ventana = () => Object.assign(new EventTarget(), { localStorage: almacen(), sessionStorage: almacen() });
const eventoStorage = (w, datos) => { const e = new Event('storage'); Object.assign(e, { storageArea: w.localStorage, ...datos }); w.dispatchEvent(e); };

test('logout limpia apariencia y acciones de la app, sin borrar datos de otros productos', () => {
  const w = ventana(); let avisos = 0; w.addEventListener('ganaderiaSesionLimpiada', () => avisos++);
  for (const clave of ['ganaderiaApariencia:o:f:u', 'ganaderiaApariencia:otra:finca', 'ajeno']) w.localStorage.setItem(clave, 'dato');
  for (const clave of ['ganaderiaAccionLote', 'ganaderiaAccionSanidad', 'ganaderiaAccionTE', 'ganaderia-romilio:paginacion:animales', 'cir:reportes:secciones:o:f:u', 'ajeno']) w.sessionStorage.setItem(clave, 'dato');
  limpiarDatosSecundariosSesion(w);
  assert.equal(w.localStorage.length, 1); assert.equal(w.localStorage.getItem('ajeno'), 'dato');
  assert.equal(w.sessionStorage.length, 1); assert.equal(w.sessionStorage.getItem('ajeno'), 'dato'); assert.equal(avisos, 1);
});

test('storage logout/clear cierra otra pestana y limpia sus acciones; desuscripcion y eventos viejos seguros', () => {
  const w = ventana(), cierres = [];
  const desuscribir = observarCierreSesion((sesion) => cierres.push(sesion), w);
  w.sessionStorage.setItem('ganaderiaAccionLote', '{"animales":["a"]}');
  eventoStorage(w, { key: 'ganaderiaSesion', oldValue: '{"token":"anterior"}', newValue: null });
  assert.equal(cierres[0].token, 'anterior'); assert.equal(w.sessionStorage.getItem('ganaderiaAccionLote'), null);
  w.localStorage.setItem('ganaderiaSesion', '{"token":"nueva"}');
  eventoStorage(w, { key: 'ganaderiaSesion', newValue: null }); assert.equal(cierres.length, 1);
  w.localStorage.removeItem('ganaderiaSesion'); eventoStorage(w, { key: null }); assert.equal(cierres.length, 2);
  desuscribir(); eventoStorage(w, { key: 'ganaderiaSesion' }); assert.equal(cierres.length, 2);
});

test('sessionStorage bloqueado no impide limpiar apariencia ni notificar a los contextos', () => {
  const w = ventana(); let avisos = 0;
  w.localStorage.setItem('ganaderiaApariencia:o:f', 'dato');
  Object.defineProperty(w, 'sessionStorage', { get() { throw Error('SecurityError'); } });
  w.addEventListener('ganaderiaSesionLimpiada', () => avisos++);
  limpiarDatosSecundariosSesion(w); assert.equal(w.localStorage.length, 0); assert.equal(avisos, 1);
});

const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/context/AparienciaContext.js', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', '*/services/api'], loader: { '.js': 'jsx' } });
const prepararProvider = () => {
  const w = ventana(), efectos = [], refs = [], estados = [], pendientes = [];
  w.localStorage.setItem('ganaderiaSesion', '{"token":"fixture"}');
  const modulo = { exports: {} };
  const react = { ...React, useRef: (v) => { const r = { current: v }; refs.push(r); return r; },
    useState: (v) => [v, (nuevo) => estados.push(nuevo)], useEffect: (fn) => efectos.push(fn),
    useCallback: (fn) => fn, useMemo: (fn) => fn() };
  vm.runInNewContext(bundle.outputFiles[0].text, { module: modulo, exports: modulo.exports, localStorage: w.localStorage, window: w, URL,
    require: (id) => {
      if (id === 'react') return react;
      if (id.endsWith('/services/api')) return { obtenerApariencia: () => new Promise((resolve, reject) => pendientes.push({ resolve, reject })) };
      throw Error(`Import inesperado: ${id}`);
    } });
  const nodo = modulo.exports.AparienciaProvider({ children: null, contextoId: 'o:f:u' });
  const limpiezas = efectos.map((fn) => fn());
  return { w, estados, pendientes, recargar: nodo.props.value.recargarApariencia,
    desmontar: () => limpiezas.forEach((fn) => fn?.()) };
};
const respuesta = { organizacion: { logo: { url: 'https://imagenes.example.test/logo.png' } }, finca: {}, almacenamiento: { disponible: true } };
const tick = () => new Promise((r) => setImmediate(r));

test('AparienciaProvider ignora respuestas tardias despues de logout y no recrea cache ni estado privado', async () => {
  const p = prepararProvider(); assert.equal(p.pendientes.length, 1);
  p.w.localStorage.setItem('ganaderiaApariencia:o:f:u', 'vieja');
  p.w.localStorage.removeItem('ganaderiaSesion'); limpiarDatosSecundariosSesion(p.w);
  const estadosTrasLogout = p.estados.length;
  p.pendientes[0].resolve(respuesta); await tick();
  assert.equal(p.w.localStorage.getItem('ganaderiaApariencia:o:f:u'), null);
  assert.equal(p.estados.length, estadosTrasLogout); p.desmontar();
});

test('AparienciaProvider conserva cache offline valida, descarta respuestas de otra sesion y del componente desmontado', async () => {
  const p = prepararProvider(); p.pendientes[0].resolve(respuesta); await tick();
  assert.ok(p.w.localStorage.getItem('ganaderiaApariencia:o:f:u'));
  const lectura = p.recargar(); p.pendientes[1].reject(Error('Sin red')); await lectura;
  assert.ok(p.estados.at(-1).logo);
  const anterior = p.w.localStorage.getItem('ganaderiaApariencia:o:f:u');
  const cambio = p.recargar(); p.w.localStorage.setItem('ganaderiaSesion', '{"token":"otra"}');
  p.pendientes[2].resolve({ organizacion: { logo: { url: 'https://ajena.example.test' } } }); await cambio;
  assert.equal(p.w.localStorage.getItem('ganaderiaApariencia:o:f:u'), anterior);
  const desmontada = p.recargar(); const total = p.estados.length; p.desmontar(); p.pendientes[3].resolve(respuesta); await desmontada;
  assert.equal(p.estados.length, total);
});
