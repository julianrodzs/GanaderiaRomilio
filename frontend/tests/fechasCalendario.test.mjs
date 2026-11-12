import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { claveFechaCalendario, formatearFechaCalendario } from '../src/utils/fechasCalendario.mjs';
import { normalizarFormularioRotacion, prepararEnvioRotacion } from '../src/utils/formularioRotacion.mjs';
import { fechaEnRango, hoyFechaLocal } from '../src/utils/fechas.js';

test('calendario: conserva los dias de la captura en formulario, tabla y envio', () => {
  const rotacion = { fechaEntrada: '2026-11-07T00:00:00.000Z', fechaSalida: '2026-11-12T00:00:00.000Z', numeroAnimales: 77 };
  const formulario = normalizarFormularioRotacion(rotacion, '2026-11-11');
  assert.equal(formulario.fechaEntrada, '2026-11-07');
  assert.equal(formulario.fechaSalida, '2026-11-12');
  assert.equal(formatearFechaCalendario(rotacion.fechaEntrada), '07/11/2026');
  assert.equal(formatearFechaCalendario(rotacion.fechaSalida), '12/11/2026');
  assert.equal(prepararEnvioRotacion(formulario).fechaEntrada, formulario.fechaEntrada);
  assert.equal(prepararEnvioRotacion(formulario).fechaSalida, formulario.fechaSalida);
});

test('calendario: fechas civiles, ISO y Date usan el mismo dia UTC que los formularios', () => {
  for (const valor of ['2026-11-07', '2026-11-07T00:00:00.000Z', '2026-11-07T06:00:00Z', '2026-11-07T00:00:00-06:00', '2026-11-07T00:00:00', new Date('2026-11-07T00:00:00Z')]) {
    assert.equal(claveFechaCalendario(valor), '2026-11-07');
    assert.equal(formatearFechaCalendario(valor), '07/11/2026');
  }
  assert.equal(claveFechaCalendario('2026-11-07T23:30:00-06:00'), '2026-11-08');
  assert.equal(claveFechaCalendario('2026-11-07T00:30:00+14:00'), '2026-11-06');
});

test('calendario: vacios e invalidos no producen excepciones ni fechas inventadas', () => {
  for (const valor of [null, undefined, '', 'invalida', '07/11/2026', '2026-02-30', '2026-02-30T00:00:00Z', '2026-13-01', '2026-11-07T99:00:00Z', new Date(NaN), 0, {}]) {
    assert.equal(claveFechaCalendario(valor), '');
    assert.equal(formatearFechaCalendario(valor), '--');
    assert.equal(fechaEnRango(valor, {}), false);
  }
  assert.equal(formatearFechaCalendario('2028-02-29'), '29/02/2028');
  assert.equal(formatearFechaCalendario('2027-02-29'), '--');
});

test('calendario: los filtros incluyen ambos limites y coinciden con la fecha mostrada', () => {
  const rango = { fechaInicio: '2026-11-07', fechaFin: '2026-11-12' };
  for (const fecha of ['2026-11-07T00:00:00Z', '2026-11-12T23:59:59Z']) assert.equal(fechaEnRango(fecha, rango), true);
  for (const fecha of ['2026-11-06', '2026-11-13']) assert.equal(fechaEnRango(fecha, rango), false);
  assert.equal(typeof hoyFechaLocal(), 'string');
});

for (const zona of ['America/Costa_Rica', 'UTC', 'America/Los_Angeles', 'Europe/Madrid', 'Pacific/Kiritimati']) {
  test(`calendario: visualizacion y formulario independientes de TZ=${zona}`, () => {
    const script = `
      import assert from 'node:assert/strict';
      import { formatearFechaCalendario } from ${JSON.stringify(new URL('../src/utils/fechasCalendario.mjs', import.meta.url).href)};
      import { normalizarFormularioRotacion } from ${JSON.stringify(new URL('../src/utils/formularioRotacion.mjs', import.meta.url).href)};
      for (const dia of ['2026-01-01', '2026-03-08', '2026-11-01', '2026-11-07', '2026-12-31', '2028-02-29']) {
        for (const hora of ['00:00:00', '23:59:59']) {
          const fecha = dia + 'T' + hora + '.000Z';
          assert.equal(formatearFechaCalendario(fecha), dia.split('-').reverse().join('/'));
          assert.equal(normalizarFormularioRotacion({fechaEntrada:fecha}).fechaEntrada, dia);
        }
      }
    `;
    const resultado = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: zona }, encoding: 'utf8', windowsHide: true });
    assert.equal(resultado.status, 0, resultado.stderr || resultado.error?.message);
  });
}
