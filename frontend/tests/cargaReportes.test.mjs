import test from 'node:test';
import assert from 'node:assert/strict';
import { crearCargaReportes } from '../src/utils/cargaReportes.mjs';

const esperar = () => new Promise((r) => setImmediate(r));
const diferida = () => { let resolver; const promise = new Promise((r) => { resolver = r; }); return { promise, resolver }; };
const tarea = (id, firma, ejecutar) => ({ id, firma, ejecutar });

test('carga por seccion reutiliza datos y no repite consultas resueltas', async () => {
  let llamadas = 0;
  const gestor = crearCargaReportes(() => {});
  const inventario = tarea('inventario', 'f1', async () => { llamadas++; return 'datos'; });
  gestor.actualizar([inventario]); await esperar();
  gestor.actualizar([]); gestor.actualizar([inventario]); await esperar();
  assert.equal(llamadas, 1);
  assert.equal(gestor.leer(inventario).datos, 'datos');
});

test('abrir otra seccion no duplica solicitudes en curso', async () => {
  let llamadas = 0;
  const espera = diferida(), gestor = crearCargaReportes(() => {});
  const primera = tarea('a', 'f1', () => { llamadas++; return espera.promise; });
  gestor.actualizar([primera]); gestor.actualizar([primera, tarea('b', 'f1', async () => 'b')]);
  await esperar(); assert.equal(llamadas, 1);
  espera.resolver('a'); await esperar();
});

test('filtros o contexto nuevos no reciben una respuesta antigua', async () => {
  const vieja = diferida(), gestor = crearCargaReportes(() => {});
  const a = tarea('a', 'finca-a:enero', () => vieja.promise), b = tarea('a', 'finca-b:febrero', async () => 'nueva');
  gestor.actualizar([a]); await esperar(); gestor.actualizar([b]); await esperar();
  vieja.resolver('vieja'); await esperar();
  assert.equal(gestor.leer(a), null);
  assert.equal(gestor.leer(b).datos, 'nueva');
});

test('la cola limita concurrencia y omite consultas cerradas aun no iniciadas', async () => {
  const espera = diferida(), llamadas = [], gestor = crearCargaReportes(() => {}, 2);
  const tareas = ['a', 'b', 'c', 'd'].map((id) => tarea(id, '1', () => { llamadas.push(id); return espera.promise; }));
  gestor.actualizar(tareas); await esperar();
  assert.deepEqual(llamadas, ['a', 'b']);
  gestor.actualizar([tareas[0]]); espera.resolver('ok'); await esperar();
  assert.deepEqual(llamadas, ['a', 'b']);
  gestor.actualizar([tareas[2]]); await esperar(); assert.deepEqual(llamadas, ['a', 'b', 'c']);
});

test('un fallo no impide los demas reportes y un refresco permite reintentar', async () => {
  const gestor = crearCargaReportes(() => {});
  const fallo = tarea('a', '1', async () => { throw Object.assign(new Error('No permitido'), { status: 403 }); });
  const buena = tarea('b', '1', async () => 42);
  gestor.actualizar([fallo, buena]); await esperar();
  assert.equal(gestor.leer(fallo).error, 'UPGRADE'); assert.equal(gestor.leer(buena).datos, 42);
  const reintento = tarea('a', '2', async () => 'ok');
  gestor.actualizar([reintento]); await esperar(); assert.equal(gestor.leer(reintento).datos, 'ok');
});

test('al desmontar no se lanzan consultas en cola ni se notifican respuestas tardias', async () => {
  const espera = diferida(); let avisos = 0, extras = 0;
  const gestor = crearCargaReportes(() => avisos++, 1);
  gestor.actualizar([tarea('a', '1', () => espera.promise), tarea('b', '1', async () => extras++)]);
  await esperar(); gestor.pausar(); const antes = avisos; espera.resolver('ok'); await esperar();
  assert.equal(avisos, antes); assert.equal(extras, 0);
});
