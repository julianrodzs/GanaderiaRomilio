const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backend = path.resolve(__dirname, '..');
const ejecutarAislado = (codigo) => spawnSync(process.execPath, ['-e', codigo], {
    cwd: backend, encoding: 'utf8', timeout: 15000
});

for (const servicio of ['alertasCorreo-service', 'resumenEmail-service', 'trabajoProgramado-service']) {
    test(`el arranque aislado de ${servicio} registra Usuario sin cargar app ni conectar MongoDB`, () => {
        const proceso = ejecutarAislado(`
            require('./services/${servicio}');
            const mongoose = require('mongoose');
            require('node:assert/strict').equal(mongoose.model('Usuario').modelName, 'Usuario');
            require('node:assert/strict').equal(mongoose.connection.readyState, 0);
        `);
        assert.equal(proceso.status, 0, proceso.stderr);
    });
}

const prepararTrabajo = (t, { alertas = [], resumenes = [], bloqueado = false, fallo } = {}) => {
    const TrabajoProgramado = require('../models/TrabajoProgramado');
    const alertasServicio = require('../services/alertasCorreo-service');
    const resumenesServicio = require('../services/resumenEmail-service');
    const escrituras = [];
    t.mock.method(TrabajoProgramado, 'findOneAndUpdate', async (filtro, cambio) => {
        escrituras.push({ filtro, cambio });
        if (!filtro.tokenBloqueo) return bloqueado ? null : { tokenBloqueo: cambio.$set.tokenBloqueo };
        return cambio.$set;
    });
    const procesarAlertas = t.mock.method(alertasServicio, 'procesarAlertasTodasOrganizaciones', async () => {
        if (fallo) throw fallo;
        return alertas;
    });
    t.mock.method(resumenesServicio, 'procesarResumenesTodasOrganizaciones', async () => resumenes);
    const archivo = require.resolve('../services/trabajoProgramado-service');
    delete require.cache[archivo];
    const trabajos = require(archivo);
    t.after(() => { delete require.cache[archivo]; });
    return { trabajos, escrituras, procesarAlertas };
};

test('alertas exitosas conservan totales y liberan el bloqueo como Completado', async (t) => {
    const { trabajos, escrituras } = prepararTrabajo(t, { alertas: [
        { organizacionId: 'a', notificacionesCreadas: 2, correos: { enviadas: 1, errores: [] }, categoriasAnimales: { actualizados: 3 } },
        { organizacionId: 'b', correos: { enviadas: 0, desactivadoPorPlan: true } }
    ] });
    const resultado = await trabajos.ejecutarAlertasProgramadas();
    assert.equal(resultado.organizacionesProcesadas, 2);
    assert.equal(resultado.notificacionesCreadas, 2);
    assert.equal(resultado.correosEnviados, 1);
    assert.equal(resultado.categoriasAnimalesActualizadas, 3);
    assert.equal(escrituras.at(-1).cambio.$set.estado, 'Completado');
    assert.equal(escrituras.at(-1).cambio.$set.tokenBloqueo, null);
    assert.equal(escrituras.at(-1).cambio.$set.bloqueadoHasta, null);
});

for (const soloErrores of [false, true]) {
    test(`alertas con fallo ${soloErrores ? 'total' : 'parcial'} marcan Error, preservan detalles y liberan el bloqueo`, async (t) => {
        const alertas = [
            ...(soloErrores ? [] : [{ organizacionId: 'ok', notificacionesCreadas: 2, correos: { enviadas: 1 } }]),
            { organizacionId: 'error', error: 'Schema has not been registered for model Usuario' }
        ];
        const { trabajos, escrituras } = prepararTrabajo(t, { alertas });
        await assert.rejects(trabajos.ejecutarAlertasProgramadas(), (error) => {
            assert.equal(error.code, 'JOB_PARTIAL_FAILURE');
            assert.equal(error.resultado.organizacionesConError, 1);
            assert.deepEqual(error.resultado.resultados, alertas);
            assert.equal(error.resultado.correosEnviados, soloErrores ? 0 : 1);
            return true;
        });
        const final = escrituras.at(-1).cambio.$set;
        assert.equal(final.estado, 'Error');
        assert.equal(final.ultimoResultado.organizacionesConError, 1);
        assert.equal(final.tokenBloqueo, null);
        assert.equal(final.bloqueadoHasta, null);
        assert.match(final.ultimoError, /trabajo fallo/);
    });
}

test('los fallos por destinatario tampoco se reportan como ejecucion exitosa', async (t) => {
    const { trabajos } = prepararTrabajo(t, { alertas: [
        { organizacionId: 'a', correos: { enviadas: 1, errores: [{ usuarioId: 'u', mensaje: 'Fallo de correo' }] } }
    ] });
    await assert.rejects(trabajos.ejecutarAlertasProgramadas(), { code: 'JOB_PARTIAL_FAILURE' });
});

test('sin organizaciones o sin correos pendientes no es un error', async (t) => {
    const { trabajos } = prepararTrabajo(t);
    const resultado = await trabajos.ejecutarAlertasProgramadas();
    assert.equal(resultado.ejecutado, true);
    assert.equal(resultado.organizacionesProcesadas, 0);
});

test('otro cron en curso se omite sin ejecutar ni liberar su bloqueo', async (t) => {
    const { trabajos, escrituras, procesarAlertas } = prepararTrabajo(t, { bloqueado: true });
    const resultado = await trabajos.ejecutarAlertasProgramadas();
    assert.equal(resultado.omitido, true);
    assert.equal(procesarAlertas.mock.callCount(), 0);
    assert.equal(escrituras.length, 1);
});

test('un error global se propaga y libera el bloqueo como Error', async (t) => {
    const fallo = new Error('Fallo global de consulta');
    const { trabajos, escrituras } = prepararTrabajo(t, { fallo });
    await assert.rejects(trabajos.ejecutarAlertasProgramadas(), fallo);
    assert.equal(escrituras.at(-1).cambio.$set.estado, 'Error');
    assert.equal(escrituras.at(-1).cambio.$set.ultimoResultado, null);
});

test('resumenes Premium exitosos conservan el conteo real de envios', async (t) => {
    const { trabajos, escrituras } = prepararTrabajo(t, { resumenes: [
        { organizacionId: 'a', envios: [{ enviado: true }, { enviado: false }] }
    ] });
    const resultado = await trabajos.ejecutarResumenesEmailProgramados();
    assert.equal(resultado.correosEnviados, 1);
    assert.equal(escrituras.at(-1).cambio.$set.estado, 'Completado');
});

test('resumenes Premium con errores por organizacion fallan y conservan el resultado parcial', async (t) => {
    const { trabajos, escrituras } = prepararTrabajo(t, { resumenes: [
        { organizacionId: 'ok', envios: [{ enviado: true }] },
        { organizacionId: 'error', envios: [], error: 'Fallo de destinatarios' }
    ] });
    await assert.rejects(trabajos.ejecutarResumenesEmailProgramados(), { code: 'JOB_PARTIAL_FAILURE' });
    const final = escrituras.at(-1).cambio.$set;
    assert.equal(final.estado, 'Error');
    assert.equal(final.ultimoResultado.correosEnviados, 1);
    assert.equal(final.ultimoResultado.organizacionesConError, 1);
    assert.equal(final.tokenBloqueo, null);
});

for (const script of ['ejecutarAlertasProgramadas', 'ejecutarResumenesEmail']) {
    for (const falla of [false, true]) {
        test(`CLI ${script}: salida ${falla ? '1 con detalles al fallar' : '0 al completar'}`, () => {
            // Ejecutar el CLI real con DB, dotenv y procesadores sustituidos: sin .env, red ni envios.
            const proceso = ejecutarAislado(`
                const assert = require('node:assert/strict');
                const reemplazar = (ruta, exports) => {
                    const id = require.resolve(ruta);
                    require.cache[id] = { id, filename: id, loaded: true, exports };
                };
                reemplazar('dotenv', { config() {} });
                reemplazar('./database', async () => {});
                let desconectado = false;
                require('mongoose').disconnect = async () => { desconectado = true; };
                const procesar = async () => {
                    const resultado = { ejecutado: true, organizacionesConError: ${falla ? 1 : 0}, resultados: [] };
                    if (${falla}) throw Object.assign(new Error('Fallo sintetico'), { resultado });
                    return resultado;
                };
                reemplazar('./services/trabajoProgramado-service', {
                    ejecutarAlertasProgramadas: procesar,
                    ejecutarResumenesEmailProgramados: procesar
                });
                process.on('exit', () => { assert.equal(desconectado, true); });
                require('./scripts/${script}');
            `);
            assert.equal(proceso.status, falla ? 1 : 0, proceso.stderr);
            assert.match(falla ? proceso.stderr : proceso.stdout, /organizacionesConError/);
        });
    }
}
