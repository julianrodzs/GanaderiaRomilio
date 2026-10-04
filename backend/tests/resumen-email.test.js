const test = require('node:test');
const assert = require('node:assert/strict');
const ConfiguracionEmail = require('../models/ConfiguracionEmail');
const { clavePeriodoResumen, debeEnviarResumen } = require('../services/resumenEmail-service');

test('el resumen diario respeta hora local y se envía una sola vez por período', () => {
    const antes = new Date('2026-10-05T11:59:00Z');
    const despues = new Date('2026-10-05T12:05:00Z');
    const configuracion = { frecuencia: 'Diario', horaPreferida: '06:00', ultimoPeriodo: '' };
    assert.equal(debeEnviarResumen(configuracion, antes, 'America/Costa_Rica').enviar, false);
    const decision = debeEnviarResumen(configuracion, despues, 'America/Costa_Rica');
    assert.equal(decision.enviar, true);
    assert.equal(debeEnviarResumen({ ...configuracion, ultimoPeriodo: decision.periodo }, despues, 'America/Costa_Rica').enviar, false);
});

test('el resumen semanal solo vence el día configurado y usa una clave semanal estable', () => {
    const lunes = new Date('2026-10-05T13:00:00Z');
    const martes = new Date('2026-10-06T13:00:00Z');
    const configuracion = { frecuencia: 'Semanal', horaPreferida: '06:00', diaSemana: 1, ultimoPeriodo: '' };
    assert.equal(debeEnviarResumen(configuracion, lunes, 'America/Costa_Rica').enviar, true);
    assert.equal(debeEnviarResumen(configuracion, martes, 'America/Costa_Rica').enviar, false);
    assert.equal(
        clavePeriodoResumen({ frecuencia: 'Semanal', fecha: lunes, zonaHoraria: 'America/Costa_Rica' }),
        clavePeriodoResumen({ frecuencia: 'Semanal', fecha: martes, zonaHoraria: 'America/Costa_Rica' })
    );
});

test('la preferencia de correo es única por usuario dentro de cada organización', () => {
    const indice = ConfiguracionEmail.schema.indexes().find(([campos]) => campos.organizacionId === 1 && campos.usuario === 1);
    assert.ok(indice);
    assert.equal(indice[1].unique, true);
});
