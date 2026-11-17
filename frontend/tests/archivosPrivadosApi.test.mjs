import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';
import { crearCacheArchivosProtegidos } from '../src/services/archivoProtegidoCache.mjs';

const fuente = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/import\.meta\.env/g, '__env')
  .replace(/export \{[^}]+\};/g, '').replace(/export const /g, 'const ');
const nombres = ['obtenerArchivoProtegido', 'obtenerUrlArchivoProtegido', 'contextoArchivosProtegidos', 'subirFotoPrincipalAnimal', 'eliminarFotoPrincipalAnimal'];
const sesion = (fincaId = 'A') => ({ token: 'fixture', usuario: { _id: 'u' }, organizacion: { _id: 'o' }, fincaId });
const preparar = ({ responder, cambiarTrasPrimeraLectura = false } = {}) => {
  let actual = sesion(), numeroUrl = 0;
  let lecturasSesion = 0;
  const peticiones = [], revocadas = [];
  const cache = crearCacheArchivosProtegidos({ crearUrl: () => `blob:${++numeroUrl}`, revocarUrl: (url) => revocadas.push(url) });
  const setSesion = (valor) => { actual = valor; };
  const api = vm.runInNewContext(fuente + `\n({${nombres.join(',')}})`, {
    __env: { VITE_API_URL: '/api' }, FormData, URLSearchParams, Event, CustomEvent,
    localStorage: { getItem: () => {
      const serializada = actual ? JSON.stringify(actual) : null;
      if (cambiarTrasPrimeraLectura && lecturasSesion++ === 0) actual = sesion('B');
      return serializada;
    } },
    window: { dispatchEvent() {} },
    cacheArchivosProtegidos: cache, limpiarCacheArchivosProtegidos: (ruta) => cache.limpiar(ruta),
    fetch: async (url, opciones) => {
      peticiones.push({ url, opciones });
      const r = await responder?.({ url, opciones, setSesion }) || {};
      return { ok: !r.status || r.status < 400, status: r.status || 200,
        json: async () => r.data || {}, blob: async () => { await r.antesBlob?.(); return new Blob(['foto']); } };
    }
  });
  return { api, cache, peticiones, revocadas, setSesion };
};

test('API comparte descarga y URL por contexto, normaliza prefijo y revalida cache privada', async () => {
  const e = preparar();
  const [blob, recurso] = await Promise.all([e.api.obtenerArchivoProtegido('/api/archivos/r2/a'), e.api.obtenerUrlArchivoProtegido('/archivos/r2/a')]);
  assert.equal(blob.size, 4); assert.equal(recurso.url, 'blob:1'); recurso.liberar();
  assert.equal((await e.api.obtenerUrlArchivoProtegido('/api/archivos/r2/a')).url, 'blob:1');
  assert.equal(e.peticiones.length, 1); assert.equal(e.peticiones[0].opciones.cache, 'no-cache');
  assert.equal(e.peticiones[0].opciones.headers.Authorization, 'Bearer fixture');
  assert.equal(e.peticiones[0].opciones.headers['X-Finca-Id'], 'A');
});

test('exportaciones dinamicas nunca se reutilizan como fotos de sesion', async () => {
  const e = preparar();
  await e.api.obtenerArchivoProtegido('/pesajes/exportar?formato=xlsx');
  await e.api.obtenerArchivoProtegido('/pesajes/exportar?formato=xlsx');
  assert.equal(e.peticiones.length, 2); assert.equal(e.cache.estado().entradas, 0);
  assert.ok(e.peticiones.every((p) => p.opciones.cache === 'no-store'));
});

test('no adjunta credenciales a URLs externas o rutas sin origen API', async () => {
  const e = preparar();
  for (const ruta of ['https://externo.example/foto', '//externo.example/foto', 'foto.webp']) {
    await assert.rejects(e.api.obtenerArchivoProtegido(ruta), /protegida no valida/);
  }
  assert.equal(e.peticiones.length, 0);
});

test('cambiar o eliminar foto invalida los blobs; un error de guardado conserva la foto vigente', async () => {
  let fallar = false;
  const e = preparar({ responder: ({ opciones }) => opciones.method && fallar ? { status: 500, data: { mensaje: 'Fallo' } } : {} });
  await e.api.obtenerUrlArchivoProtegido('/api/archivos/r2/a');
  fallar = true; await assert.rejects(e.api.eliminarFotoPrincipalAnimal('a'), /Fallo/); assert.equal(e.cache.estado().entradas, 1);
  fallar = false; await e.api.subirFotoPrincipalAnimal('a', new Blob(['png']));
  assert.deepEqual(e.revocadas, ['blob:1']); assert.equal(e.cache.estado().entradas, 0);
  await e.api.obtenerUrlArchivoProtegido('/api/archivos/r2/a'); await e.api.eliminarFotoPrincipalAnimal('a');
  assert.deepEqual(e.revocadas, ['blob:1', 'blob:2']);
});

test('respuesta tardia al cambiar finca no se publica ni conserva en cache', async () => {
  const e = preparar({ responder: ({ setSesion }) => ({ antesBlob: () => setSesion(sesion('B')) }) });
  await assert.rejects(e.api.obtenerArchivoProtegido('/api/archivos/r2/a'), { code: 'REQUEST_CONTEXT_CHANGED' });
  assert.equal(e.cache.estado().entradas, 0);
});

test('la clave de cache y las cabeceras usan la misma captura de sesion', async () => {
  const e = preparar({ cambiarTrasPrimeraLectura: true });
  await assert.rejects(e.api.obtenerArchivoProtegido('/api/archivos/r2/a'), { code: 'REQUEST_CONTEXT_CHANGED' });
  assert.equal(e.peticiones[0].opciones.headers['X-Finca-Id'], 'A');
  assert.equal(e.cache.estado().entradas, 0);
});

test('404 invalida solo la foto ausente; 401 y acceso sin sesion limpian los recursos privados', async () => {
  let estado = 404;
  const e = preparar({ responder: ({ url }) => url.endsWith('/b') ? { status: estado, data: { mensaje: 'Sin acceso' } } : {} });
  await e.api.obtenerUrlArchivoProtegido('/api/archivos/r2/a');
  await assert.rejects(e.api.obtenerArchivoProtegido('/api/archivos/r2/b'), /Sin acceso/);
  assert.equal(e.cache.estado().entradas, 1); assert.deepEqual(e.revocadas, []);
  estado = 401; await assert.rejects(e.api.obtenerArchivoProtegido('/api/archivos/r2/b'), /Sin acceso/);
  assert.equal(e.cache.estado().entradas, 0); assert.deepEqual(e.revocadas, ['blob:1']);
  await e.api.obtenerUrlArchivoProtegido('/api/archivos/r2/a'); e.setSesion(null);
  await assert.rejects(e.api.obtenerArchivoProtegido('/api/archivos/r2/a'), /sesion segura/);
  assert.equal(e.cache.estado().entradas, 0); assert.deepEqual(e.revocadas, ['blob:1', 'blob:2']);
});

const hookBundle = await build({ entryPoints: [fileURLToPath(new URL('../src/hooks/useArchivoProtegido.js', import.meta.url))],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react', '../services/api'] });

test('hook real: remonta sin descargar ni revocar; cambio de finca y logout ocultan URL anterior', async () => {
  const e = preparar(); let instancia;
  const modulo = { exports: {} };
  vm.runInNewContext(hookBundle.outputFiles[0].text, { module: modulo, exports: modulo.exports, require: (id) => {
    if (id !== 'react') return e.api;
    return {
      useState: (inicial) => {
        const i = instancia;
        if (!i.estado) i.estado = inicial;
        return [i.estado, (estado) => { i.estado = estado; }];
      },
      useEffect: (accion, deps) => {
        const i = instancia;
        if (!i.deps || deps.some((v, n) => v !== i.deps[n])) {
          i.limpiar?.(); i.deps = deps; i.limpiar = accion();
        }
      }
    };
  } });
  const montar = () => {
    const i = {};
    return { render: () => { instancia = i; return modulo.exports.default('/api/archivos/r2/a'); }, desmontar: () => i.limpiar?.() };
  };
  const a = montar(), b = montar(); a.render(); b.render();
  await new Promise((r) => setImmediate(r));
  assert.equal(a.render(), 'blob:1'); assert.equal(b.render(), 'blob:1'); assert.equal(e.peticiones.length, 1);
  a.desmontar(); b.desmontar(); assert.deepEqual(e.revocadas, []);
  const c = montar(); c.render(); await new Promise((r) => setImmediate(r)); assert.equal(c.render(), 'blob:1');
  assert.equal(e.peticiones.length, 1);
  e.setSesion(sesion('B')); assert.equal(c.render(), ''); await new Promise((r) => setImmediate(r));
  assert.equal(c.render(), 'blob:2'); assert.equal(e.peticiones.length, 2); assert.deepEqual(e.revocadas, ['blob:1']);
  e.setSesion(null); e.cache.limpiar(); assert.equal(c.render(), '');
  await new Promise((r) => setImmediate(r)); assert.equal(c.render(), ''); c.desmontar();
  assert.deepEqual(e.revocadas, ['blob:1', 'blob:2']);
});
