import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZONA_HORARIA_FALLBACK,
  formatearFechaISOEnZona,
  obtenerInfoLunar,
  obtenerProximaLunaLlena,
  obtenerProximaLunaNueva,
  obtenerProximasFases
} from '../src/services/calendarioLunarService.mjs';
import { obtenerContextoLunarTarea } from '../src/utils/tareasLuna.mjs';

test('clasifica las cuatro fases principales en fechas conocidas', () => {
  assert.equal(obtenerInfoLunar('2024-04-08').faseCodigo, 'NUEVA');
  assert.equal(obtenerInfoLunar('2024-04-15').faseCodigo, 'CUARTO_CRECIENTE');
  assert.equal(obtenerInfoLunar('2024-03-25').faseCodigo, 'LLENA');
  assert.equal(obtenerInfoLunar('2024-04-01').faseCodigo, 'CUARTO_MENGUANTE');
});

test('calcula iluminación coherente para luna nueva, luna llena y días intermedios', () => {
  const nueva = obtenerInfoLunar('2024-04-08');
  const llena = obtenerInfoLunar('2024-03-25');
  const intermedia = obtenerInfoLunar('2024-04-12');

  assert.ok(nueva.iluminacionPorcentaje < 2);
  assert.ok(llena.iluminacionPorcentaje > 98);
  assert.ok(intermedia.iluminacionPorcentaje > 2 && intermedia.iluminacionPorcentaje < 98);
});

test('usa mediodía local y conserva el día elegido en Costa Rica', () => {
  const info = obtenerInfoLunar('2026-09-30', ZONA_HORARIA_FALLBACK);
  assert.equal(formatearFechaISOEnZona(info.fecha, ZONA_HORARIA_FALLBACK), '2026-09-30');
  assert.equal(info.fecha.getUTCHours(), 18);
});

test('enumera las próximas cuatro fases en orden incluso al cambiar de año', () => {
  const fases = obtenerProximasFases('2026-12-28');
  assert.equal(fases.length, 4);
  assert.deepEqual(new Set(fases.map((fase) => fase.faseCodigo)).size, 4);
  assert.ok(fases.every((fase, indice) => indice === 0 || fase.fecha > fases[indice - 1].fecha));
  assert.ok(fases.some((fase) => fase.fecha.getUTCFullYear() === 2027));
});

test('resuelve próximas lunas principales para fechas históricas y futuras', () => {
  const nuevaHistorica = obtenerProximaLunaNueva('2000-01-01');
  const llenaFutura = obtenerProximaLunaLlena('2040-01-01');
  assert.equal(nuevaHistorica.faseCodigo, 'NUEVA');
  assert.equal(llenaFutura.faseCodigo, 'LLENA');
  assert.ok(nuevaHistorica.fecha > new Date('2000-01-01T00:00:00Z'));
  assert.ok(llenaFutura.fecha > new Date('2040-01-01T00:00:00Z'));
});

test('detecta reproducción y siembra mediante campos estructurados, no por el título', () => {
  assert.equal(obtenerContextoLunarTarea({ moduloOrigen: 'Reproduccion', titulo: 'Revisar animal' }), 'REPRODUCCION');
  assert.equal(obtenerContextoLunarTarea({ tipo: 'Siembra', titulo: 'Trabajo en banco' }), 'SIEMBRA');
  assert.equal(obtenerContextoLunarTarea({ categoriaAutomatica: 'Reproducción porcina' }), 'REPRODUCCION');
  assert.equal(obtenerContextoLunarTarea({ tipo: 'Otro', titulo: 'Sembrar potrero norte' }), null);
});
