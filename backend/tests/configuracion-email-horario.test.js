const test = require('node:test');
const assert = require('node:assert/strict');
const ConfiguracionEmail = require('../models/ConfiguracionEmail');
const controller = require('../controllers/configuracionEmail-controller');

const req = (body = {}) => ({ usuario: { id: 'usuario-fixture', rol: 'Administrador' }, body });
const res = () => ({ codigo: 200, status(codigo) { this.codigo = codigo; return this; }, json(datos) { this.datos = datos; return this; } });
const preferencias = (extra = {}) => ({ frecuencia: 'Semanal', diaSemana: 4,
    modulos: { resumenGanadero: true, finanzas: false, tareasPendientes: true, radarOperativo: true }, ...extra });

test('configuracion nueva informa hora fija no editable y frecuencia desactivada', async (t) => {
    t.mock.method(ConfiguracionEmail, 'findOne', () => ({ lean: async () => null }));
    const respuesta = res(); await controller.obtenerConfiguracion(req(), respuesta);
    assert.equal(respuesta.codigo, 200);
    assert.equal(respuesta.datos.horaPreferida, '06:00');
    assert.deepEqual(respuesta.datos.horarioEnvio, { hora: '06:00', zonaHoraria: 'America/Costa_Rica', editable: false });
    assert.equal(respuesta.datos.frecuencia, 'Desactivado');
});

test('configuracion antigua muestra horario efectivo sin modificar su dia ni escribir en lectura', async (t) => {
    const antigua = { ...preferencias(), horaPreferida: '18:00', ultimoPeriodo: 'S:2026-11-09' };
    t.mock.method(ConfiguracionEmail, 'findOne', () => ({ lean: async () => antigua }));
    t.mock.method(ConfiguracionEmail, 'findOneAndUpdate', () => { assert.fail('GET no debe escribir preferencias'); });
    const respuesta = res(); await controller.obtenerConfiguracion(req(), respuesta);
    assert.equal(respuesta.datos.horaPreferida, '06:00');
    assert.equal(respuesta.datos.diaSemana, 4);
    assert.equal(respuesta.datos.ultimoPeriodo, antigua.ultimoPeriodo);
    assert.equal(antigua.horaPreferida, '18:00');
});

test('guardar sin hora conserva todos los dias semanales y persiste 06:00', async (t) => {
    const escrituras = [];
    t.mock.method(ConfiguracionEmail, 'findOneAndUpdate', async (filtro, cambio) => {
        escrituras.push({ filtro, cambio }); return cambio.$set;
    });
    for (let diaSemana = 0; diaSemana <= 6; diaSemana++) {
        const respuesta = res(); await controller.actualizarConfiguracion(req(preferencias({ diaSemana })), respuesta);
        assert.equal(respuesta.codigo, 200);
        assert.equal(respuesta.datos.configuracion.diaSemana, diaSemana);
        assert.equal(respuesta.datos.configuracion.horaPreferida, '06:00');
    }
    assert.equal(escrituras.length, 7);
    for (const { filtro, cambio } of escrituras) {
        assert.equal(filtro.usuario, 'usuario-fixture');
        assert.equal(cambio.$set.horaPreferida, '06:00');
        assert.equal(cambio.$set.ultimoPeriodo, undefined);
    }
});

test('API rechaza horas alternativas sin escribir; acepta 06:00 de clientes anteriores', async (t) => {
    let escrituras = 0;
    t.mock.method(ConfiguracionEmail, 'findOneAndUpdate', async (_, cambio) => { escrituras++; return cambio.$set; });
    for (const horaPreferida of ['18:00', '05:59', '', null, { $ne: '06:00' }]) {
        const respuesta = res(); await controller.actualizarConfiguracion(req(preferencias({ horaPreferida })), respuesta);
        assert.equal(respuesta.codigo, 422);
        assert.match(respuesta.datos.mensaje, /hora de envío es fija/);
    }
    assert.equal(escrituras, 0);
    const respuesta = res(); await controller.actualizarConfiguracion(req(preferencias({ horaPreferida: '06:00' })), respuesta);
    assert.equal(respuesta.codigo, 200); assert.equal(escrituras, 1);
});

test('conserva validacion del dia, frecuencia y permisos financieros', async (t) => {
    t.mock.method(ConfiguracionEmail, 'findOneAndUpdate', () => { assert.fail('No debe guardar preferencias invalidas'); });
    for (const body of [preferencias({ diaSemana: 7 }), preferencias({ diaSemana: -1 }), preferencias({ frecuencia: 'Mensual' })]) {
        const respuesta = res(); await controller.actualizarConfiguracion(req(body), respuesta); assert.equal(respuesta.codigo, 422);
    }
    const solicitud = req(preferencias({ modulos: { finanzas: true } })); solicitud.usuario.rol = 'Consulta';
    const respuesta = res(); await controller.actualizarConfiguracion(solicitud, respuesta); assert.equal(respuesta.codigo, 403);
});
