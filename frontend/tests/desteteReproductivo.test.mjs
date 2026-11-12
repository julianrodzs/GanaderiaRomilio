import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararCambioDestete, esTareaDesteteBovino, AVISO_DESTETE_REAL } from '../src/utils/desteteReproductivo.mjs';

const registro = { fechaPartoReal: '2026-10-02T00:00:00.000Z', fechaDestete: '2027-05-02T00:00:00.000Z' };
test('destete: solo envia una fecha modificada y exige motivo, sin modificar el resultado clinico', () => {
  assert.deepEqual(prepararCambioDestete(registro, '2027-05-02', ''), {});
  assert.deepEqual(prepararCambioDestete(registro, '2027-04-02', ' Mejor condicion '), { fechaDestete: '2027-04-02', motivoCambioDestete: 'Mejor condicion' });
  assert.throws(() => prepararCambioDestete(registro, '2027-04-02', ''));
  assert.throws(() => prepararCambioDestete(registro, '2026-10-01', 'Motivo'));
  assert.throws(() => prepararCambioDestete(registro, '2027-02-30', 'Motivo'));
  assert.throws(() => prepararCambioDestete(registro, '', 'Motivo'));
});
test('destete: el aviso diferencia ejecucion real, programacion y tareas sin cria vinculada', () => {
  const tarea = { moduloOrigen: 'Reproduccion', especie: 'Bovino', claveAutomatica: 'destete', animal: 'cria', referenciaId: 'ciclo' };
  assert.equal(esTareaDesteteBovino(tarea), true);
  assert.equal(esTareaDesteteBovino(null), false);
  for (const cambio of [{ especie: 'Porcino' }, { claveAutomatica: 'proximo-celo' }, { moduloOrigen: 'Manual' }, { animal: null }]) assert.equal(esTareaDesteteBovino({ ...tarea, ...cambio }), false);
  assert.match(AVISO_DESTETE_REAL, /fecha de ejecución/);
  assert.match(AVISO_DESTETE_REAL, /no la fecha programada/);
  assert.match(AVISO_DESTETE_REAL, /se conservará/);
});
