const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const Animal = require('../models/Animal');
const ConfiguracionEmail = require('../models/ConfiguracionEmail');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const { Tarea } = require('../models/Tarea');
const {
    clavePeriodoResumen,
    debeEnviarResumen,
    normalizarFincaIds,
    recopilarResumen
} = require('../services/resumenEmail-service');
const { normalizarModulosResumen } = require('../services/permisosResumenEmail-service');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');

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

test('el override explicito de cron omite hora, pero conserva dia semanal y periodo', () => {
    const anterior = process.env.CRON_RESUMEN_IGNORE_HOUR;
    process.env.CRON_RESUMEN_IGNORE_HOUR = 'true';
    try {
        const fecha = new Date('2026-11-05T12:00:00Z');
        const cfg = { frecuencia: 'Semanal', horaPreferida: '23:59', diaSemana: 4 };
        const decision = debeEnviarResumen(cfg, fecha, 'America/Costa_Rica');
        assert.equal(decision.enviar, true);
        assert.equal(debeEnviarResumen({ ...cfg, diaSemana: 1 }, fecha, 'America/Costa_Rica').enviar, false);
        assert.equal(debeEnviarResumen({ ...cfg, ultimoPeriodo: decision.periodo }, fecha, 'America/Costa_Rica').enviar, false);
    } finally {
        if (anterior === undefined) delete process.env.CRON_RESUMEN_IGNORE_HOUR;
        else process.env.CRON_RESUMEN_IGNORE_HOUR = anterior;
    }
});

test('la preferencia de correo es única por usuario dentro de cada organización', () => {
    const indice = ConfiguracionEmail.schema.indexes().find(([campos]) => campos.organizacionId === 1 && campos.usuario === 1);
    assert.ok(indice);
    assert.equal(indice[1].unique, true);
});

test('el contenido financiero del correo depende del permiso vigente del destinatario', () => {
    const solicitados = { resumenGanadero: true, finanzas: true, tareasPendientes: true };
    assert.equal(normalizarModulosResumen(solicitados, 'Contador').finanzas, true);
    assert.equal(normalizarModulosResumen(solicitados, 'Administrador').finanzas, true);
    assert.equal(normalizarModulosResumen(solicitados, 'Encargado').finanzas, false);
    assert.equal(normalizarModulosResumen(solicitados, 'Consulta').finanzas, false);
});

test('el resumen financiero aplica la lista explícita de fincas autorizadas', async () => {
    const fincaId = new Types.ObjectId();
    const otroId = new Types.ObjectId();
    const filtros = [];
    const originales = {
        animales: Animal.aggregate,
        finanzas: MovimientoFinanciero.aggregate,
        tareas: Tarea.countDocuments
    };

    Animal.aggregate = async (pipeline) => {
        filtros.push(pipeline[0].$match);
        return [];
    };
    MovimientoFinanciero.aggregate = async (pipeline) => {
        filtros.push(pipeline[0].$match);
        return [];
    };
    Tarea.countDocuments = async (filtro) => {
        filtros.push(filtro);
        return 0;
    };

    try {
        await ejecutarConOrganizacion(new Types.ObjectId(), () => recopilarResumen({
            usuarioId: new Types.ObjectId(),
            frecuencia: 'Diario',
            rol: 'Contador',
            modulos: { resumenGanadero: false, finanzas: true, tareasPendientes: false, radarOperativo: false },
            fincaIds: [fincaId, fincaId, 'invalida'],
            ahora: new Date('2026-10-14T12:00:00Z')
        }));
    } finally {
        Animal.aggregate = originales.animales;
        MovimientoFinanciero.aggregate = originales.finanzas;
        Tarea.countDocuments = originales.tareas;
    }

    assert.equal(normalizarFincaIds([fincaId, fincaId, 'invalida']).length, 1);
    assert.equal(filtros.length, 1);
    filtros.forEach((filtro) => {
        const ids = filtro.fincaId?.$in || [];
        assert.deepEqual(ids.map(String), [String(fincaId)]);
        assert.equal(ids.some((id) => String(id) === String(otroId)), false);
    });
});
