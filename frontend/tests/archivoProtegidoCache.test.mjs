import test from 'node:test';
import assert from 'node:assert/strict';
import { crearCacheArchivosProtegidos } from '../src/services/archivoProtegidoCache.mjs';

const preparar = (opciones = {}) => {
  let secuencia = 0, reloj = 0;
  const revocadas = [];
  const cache = crearCacheArchivosProtegidos({ crearUrl: () => `blob:${++secuencia}`,
    revocarUrl: (url) => revocadas.push(url), ahora: () => reloj, ...opciones });
  return { cache, revocadas, avanzar: (ms) => { reloj += ms; } };
};
const blob = (tamano = 4) => new Blob(['x'.repeat(tamano)]);

test('dos montajes simultaneos y posteriores comparten blob y URL; desmontar no revoca el cache', async () => {
  const { cache, revocadas } = preparar(); let llamadas = 0;
  const cargar = async () => { llamadas++; return blob(); };
  const [a, b] = await Promise.all([cache.obtener('org:finca:usuario', '/foto', cargar), cache.obtener('org:finca:usuario', '/foto', cargar)]);
  assert.equal(a, b); assert.equal(cache.obtenerUrl(a), cache.obtenerUrl(b));
  cache.liberar(a); cache.liberar(b);
  assert.deepEqual(revocadas, []);
  const c = await cache.obtener('org:finca:usuario', '/foto', cargar);
  assert.equal(c, a); assert.equal(cache.obtenerUrl(c), 'blob:1'); assert.equal(llamadas, 1);
  cache.limpiar(); assert.deepEqual(revocadas, ['blob:1']); assert.equal(cache.estado().bytes, 0);
});

test('LRU acota entradas y bytes y expulsa la menos usada', async () => {
  const { cache, revocadas } = preparar({ maxEntradas: 2, maxBytes: 8 });
  const a = await cache.obtener('c', '/a', async () => blob()); cache.obtenerUrl(a);
  const b = await cache.obtener('c', '/b', async () => blob()); cache.obtenerUrl(b);
  await cache.obtener('c', '/a', async () => assert.fail('Debe estar en cache'));
  await cache.obtener('c', '/c', async () => blob());
  assert.deepEqual(revocadas, ['blob:2']); assert.deepEqual(cache.estado(), { entradas: 2, bytes: 8, pendientes: 0 });
});

test('cambio de organizacion/finca/usuario y logout revocan el contexto anterior', async () => {
  const { cache, revocadas } = preparar(); let llamadas = 0;
  for (const contexto of ['org1:finca1:u1', 'org1:finca2:u1', 'org2:finca2:u1', 'org2:finca2:u2']) {
    const recurso = await cache.obtener(contexto, '/misma-foto', async () => { llamadas++; return blob(); }); cache.obtenerUrl(recurso);
  }
  assert.equal(llamadas, 4); assert.equal(revocadas.length, 3);
  cache.limpiar(); assert.equal(revocadas.length, 4);
  assert.equal(cache.estado().entradas, 0);
});

test('limpiar durante una descarga impide recuperar una foto de la sesion anterior', async () => {
  const { cache } = preparar(); let resolver;
  const promesa = cache.obtener('anterior', '/foto', () => new Promise((r) => { resolver = r; }));
  await Promise.resolve(); cache.limpiar(); resolver(blob());
  await assert.rejects(promesa, { code: 'REQUEST_CONTEXT_CHANGED' });
  assert.equal(cache.estado().entradas, 0);
});

test('invalidar foto en vuelo no borra su descarga nueva y permite reintentar tras error', async () => {
  const { cache } = preparar(); let resolver;
  const anterior = cache.obtener('c', '/foto', () => new Promise((r) => { resolver = r; }));
  await Promise.resolve(); cache.limpiar('/foto');
  const nueva = cache.obtener('c', '/foto', async () => blob(2));
  resolver(blob()); await assert.rejects(anterior, { code: 'REQUEST_CONTEXT_CHANGED' });
  assert.equal((await nueva).blob.size, 2);
  await assert.rejects(cache.obtener('c', '/error', async () => { throw Error('Red'); }), /Red/);
  assert.equal((await cache.obtener('c', '/error', async () => blob())).blob.size, 4);
});

test('caducidad revalida; archivos mayores al limite no se retienen y se liberan al ultimo consumidor', async () => {
  const { cache, avanzar, revocadas } = preparar({ maxBytes: 4, vigenciaMs: 10 }); let llamadas = 0;
  const cargar = async () => { llamadas++; return blob(); };
  cache.obtenerUrl(await cache.obtener('c', '/foto', cargar));
  avanzar(11); await cache.obtener('c', '/foto', cargar);
  assert.equal(llamadas, 2); assert.deepEqual(revocadas, ['blob:1']);
  const grande = await cache.obtener('c', '/grande', async () => blob(8));
  assert.equal(grande.cacheada, false); const url = cache.obtenerUrl(grande); cache.obtenerUrl(grande);
  cache.liberar(grande); assert.ok(!revocadas.includes(url));
  cache.liberar(grande); assert.ok(revocadas.includes(url)); assert.ok(cache.estado().bytes <= 4);
});
