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

const prepararTrabajo = (t, { alertas = [], categorias = [], resumenes = [], bloqueado = false, fallo, falloCategorias } = {}) => {
    const TrabajoProgramado = require('../models/TrabajoProgramado');
    const alertasServicio = require('../services/alertasCorreo-service');
    const resumenesServicio = require('../services/resumenEmail-service');
    const categoriasServicio = require('../services/categoriasProgramadas-service');
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
    const procesarCategorias = t.mock.method(categoriasServicio, 'procesarCategoriasTodasOrganizaciones', async () => {
        if (falloCategorias) throw falloCategorias;
        return categorias;
    });
    const archivo = require.resolve('../services/trabajoProgramado-service');
    delete require.cache[archivo];
    const trabajos = require(archivo);
    t.after(() => { delete require.cache[archivo]; });
    return { trabajos, escrituras, procesarAlertas, procesarCategorias };
};

test('alertas exitosas conservan totales y liberan el bloqueo como Completado', async (t) => {
    const { trabajos, escrituras } = prepararTrabajo(t, { categorias: [{ organizacionId: 'a', escaneados: 3, actualizados: 3 }], alertas: [
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

test('un error global de alertas conserva la fase de categorias y libera el bloqueo como Error', async (t) => {
    const fallo = new Error('Fallo global de consulta');
    const { trabajos, escrituras } = prepararTrabajo(t, { fallo });
    await assert.rejects(trabajos.ejecutarAlertasProgramadas(), (error) => {
        assert.equal(error.code, 'JOB_PARTIAL_FAILURE');
        assert.equal(error.resultado.categorias.status, 'Completado');
        assert.equal(error.resultado.alertas.errores[0].mensaje, fallo.message);
        return true;
    });
    assert.equal(escrituras.at(-1).cambio.$set.estado, 'Error');
    assert.equal(escrituras.at(-1).cambio.$set.ultimoResultado.alertas.status, 'Error');
});

test('las alertas y los resumenes opt-in se ejecutan incluso con fallo total de categorias', async (t) => {
    const { trabajos, procesarAlertas } = prepararTrabajo(t, { falloCategorias: new Error('Fallo de categorias'),
        alertas: [{ organizacionId: 'a', correos: { enviadas: 2 } }], resumenes: [{ organizacionId: 'a', envios: [{ enviado: true }] }] });
    await assert.rejects(trabajos.ejecutarAlertasProgramadas({ incluirResumenes: true }), (error) => {
        assert.equal(error.resultado.categorias.status, 'Error');
        assert.equal(error.resultado.alertas.status, 'Completado');
        assert.equal(error.resultado.correosEnviados, 3);
        assert.equal(error.resultado.resumenes.status, 'Completado');
        assert.equal(procesarAlertas.mock.callCount(), 1);
        return true;
    });
});

test('el mismo comando incluye resumenes por defecto y permite desactivarlos explicitamente', async (t) => {
    const { trabajos } = prepararTrabajo(t, { resumenes: [{ organizacionId: 'a', envios: [{ enviado: true }] }] });
    const normal = await trabajos.ejecutarAlertasProgramadas({ incluirResumenes: false });
    assert.equal(normal.resumenes.status, 'Desactivado');
    const completo = await trabajos.ejecutarAlertasProgramadas();
    assert.equal(completo.resumenes.status, 'Completado');
    assert.equal(completo.resumenes.enviadas, 1);
});

test('duracion y memoria se registran independientemente por fase', async (t) => {
    const { trabajos } = prepararTrabajo(t);
    const resultado = await trabajos.ejecutarAlertasProgramadas();
    for (const fase of [resultado.categorias, resultado.alertas]) {
        assert.ok(fase.duracionMs >= 0);
        for (const campo of ['rss', 'heapUsed', 'heapTotal']) assert.ok(fase.memoriaMb.pico[campo] >= fase.memoriaMb.inicio[campo]);
    }
});

test('el fallo exclusivo del resumen cuenta la organizacion afectada y conserva categorias/alertas', async (t) => {
    const { trabajos } = prepararTrabajo(t, { resumenes: [{ organizacionId: 'a', envios: [], errores: [{ mensaje: 'Proveedor rechazado' }] }] });
    await assert.rejects(trabajos.ejecutarAlertasProgramadas(), (error) => {
        assert.equal(error.resultado.organizacionesConError, 1);
        assert.equal(error.resultado.categorias.status, 'Completado');
        assert.equal(error.resultado.alertas.status, 'Completado');
        assert.equal(error.resultado.resumenes.status, 'Error');
        return true;
    });
});

test('los endpoints cron conservan el JSON parcial al responder 500', async (t) => {
    const { trabajos } = prepararTrabajo(t);
    const resultado = { ejecutado: true, categorias: { status: 'Error' }, alertas: { status: 'Completado' } };
    const fallar = async () => { throw Object.assign(new Error('Fallo parcial sintetico'), { resultado }); };
    t.mock.method(trabajos, 'ejecutarAlertasProgramadas', fallar);
    t.mock.method(trabajos, 'ejecutarResumenesEmailProgramados', fallar);
    const id = require.resolve('../routes/cronRoutes'); delete require.cache[id]; t.after(() => { delete require.cache[id]; });
    const router = require(id);
    for (const ruta of router.stack.filter((capa) => capa.route)) {
        const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
        await ruta.route.stack.at(-1).handle({}, res);
        assert.equal(res.code, 500); assert.deepEqual(res.body.resultado, resultado);
    }
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
