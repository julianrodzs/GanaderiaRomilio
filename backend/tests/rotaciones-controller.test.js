const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { sanitizarRotacion } = require('../services/potrero-integridad-service');

const consulta = (leer) => {
    const query = { then: (resolve, reject) => Promise.resolve().then(leer).then(resolve, reject) };
    for (const metodo of ['session', 'select', 'populate', 'sort', 'lean']) query[metodo] = () => query;
    return query;
};

const preparar = ({ loteRef = null, falloPotrero = false } = {}) => {
    const rotaciones = new Map(['r1', 'r2'].map((id, indice) => [id, {
        _id: id, potrero: `p${indice + 1}`, estado: 'Activa', loteRef,
        organizacionId: 'org', fincaId: 'principal', createdAt: new Date('2020-01-01'), __v: 0,
        fechaEntrada: new Date('2020-01-01'), numeroAnimales: 20, diasOcupado: null, diasDescansoPrevio: null
    }]));
    const potreros = new Map(['p1', 'p2'].map(id => [id, { _id: id, estado: 'Ocupado', tipoArea: 'PASTOREO' }]));
    const actualizaciones = [];
    const documento = (datos) => datos ? { ...structuredClone(datos), toObject: () => structuredClone(datos) } : null;
    const modeloRotacion = {
        findById: id => consulta(() => documento(rotaciones.get(id))),
        findOne: filtro => consulta(() => documento([...rotaciones.values()].find(rotacion => (
            (!filtro.potrero || rotacion.potrero === filtro.potrero)
            && (!filtro.estado || rotacion.estado === filtro.estado)
            && (!filtro._id?.$ne || rotacion._id !== filtro._id.$ne)
            && (!filtro.fechaSalida || rotacion.fechaSalida && rotacion.fechaSalida <= filtro.fechaSalida.$lte)
        )))),
        findByIdAndUpdate: async (id, datos, opciones) => {
            assert.ok(opciones.session);
            actualizaciones.push(id);
            rotaciones.set(id, { ...rotaciones.get(id), ...datos });
            return documento(rotaciones.get(id));
        }
    };
    const modeloPotrero = {
        findById: id => consulta(() => ({
            ...potreros.get(id),
            async save({ session }) {
                assert.ok(session);
                if (falloPotrero) throw new Error('Fallo de sincronizacion');
                potreros.set(id, { _id: id, estado: this.estado, tipoArea: this.tipoArea });
            }
        }))
    };
    const mocks = {
        '../models/RotacionPotrero': modeloRotacion,
        '../models/Potrero': modeloPotrero,
        '../services/mongo-transaccion-service': {
            ejecutarEnTransaccion: async (operacion) => {
                const copia = structuredClone([...rotaciones.entries()]);
                try { return await operacion({ fixture: true }); }
                catch (error) { rotaciones.clear(); copia.forEach(([id, datos]) => rotaciones.set(id, datos)); throw error; }
            }
        }
    };
    const archivo = path.resolve(__dirname, '../controllers/rotacion-controller.js');
    const modulo = { exports: {} };
    const requerir = createRequire(archivo);
    vm.runInThisContext(`(function(require,module,exports){${fs.readFileSync(archivo, 'utf8')}\n})`, { filename: archivo })(
        nombre => Object.hasOwn(mocks, nombre) ? mocks[nombre] : requerir(nombre), modulo, modulo.exports
    );
    const editar = async (body) => {
        const respuesta = { codigo: 200, status(codigo) { this.codigo = codigo; return this; }, json(datos) { this.datos = datos; return this; } };
        await modulo.exports.updateRotacion({ params: { id: 'r1' }, body, organizacion: { zonaHoraria: 'America/Costa_Rica' } }, respuesta);
        return respuesta;
    };
    return { editar, rotaciones, potreros, actualizaciones };
};

test('el formulario de edicion excluye identidad, tenant y derivados antes de enviar a la API', async () => {
    const { normalizarFormularioRotacion, prepararEnvioRotacion } = await import('../../frontend/src/utils/formularioRotacion.mjs');
    const escenario = preparar();
    const registro = { ...escenario.rotaciones.get('r1'), potrero: { _id: 'p1', nombre: 'Potrero 1' } };
    const rechazoAnterior = await escenario.editar({ ...registro, estado: 'Planificada' });
    assert.equal(rechazoAnterior.codigo, 400);
    assert.equal(rechazoAnterior.datos.codigo, 'CAMPO_PROTEGIDO');
    assert.equal(escenario.actualizaciones.length, 0);

    const formulario = normalizarFormularioRotacion(registro);
    const envio = prepararEnvioRotacion({ ...formulario, estado: 'Planificada' });
    assert.doesNotThrow(() => sanitizarRotacion(envio));
    assert.equal(envio.potrero, 'p1');
    for (const campo of ['_id', '__v', 'fincaId', 'organizacionId', 'createdAt', 'diasOcupado', 'diasDescansoPrevio']) {
        assert.equal(Object.hasOwn(envio, campo), false);
    }
    const respuesta = await escenario.editar(envio);
    assert.equal(respuesta.codigo, 200, JSON.stringify(respuesta.datos));
    assert.equal(escenario.rotaciones.get('r1').estado, 'Planificada');
    assert.equal(escenario.rotaciones.get('r2').estado, 'Activa');
    assert.deepEqual(escenario.actualizaciones, ['r1']);
    assert.equal(escenario.potreros.get('p1').estado, 'Descanso');
    assert.equal(escenario.potreros.get('p2').estado, 'Ocupado');
});

test('la API rechaza activar una rotacion futura y no modifica otras rotaciones', async () => {
    const escenario = preparar();
    const respuesta = await escenario.editar({ estado: 'Activa', fechaEntrada: '2999-01-01' });
    assert.equal(respuesta.codigo, 400);
    assert.equal(respuesta.datos.codigo, 'ROTACION_FUTURA_NO_ACTIVA');
    assert.equal(escenario.actualizaciones.length, 0);
    assert.equal(escenario.rotaciones.get('r1').fechaEntrada.toISOString(), '2020-01-01T00:00:00.000Z');
});

test('la API no deja una rotacion con salida historica en Activa', async () => {
    const escenario = preparar();
    const respuesta = await escenario.editar({ estado: 'Activa', fechaSalida: '2020-01-10' });
    assert.equal(respuesta.codigo, 400);
    assert.equal(respuesta.datos.codigo, 'ROTACION_CON_SALIDA_NO_ACTIVA');
    assert.equal(escenario.actualizaciones.length, 0);
});

test('el cambio manual no evade la proteccion de rotaciones vinculadas a lotes', async () => {
    const escenario = preparar({ loteRef: 'lote-1' });
    const respuesta = await escenario.editar({ estado: 'Planificada' });
    assert.equal(respuesta.codigo, 409);
    assert.equal(respuesta.datos.codigo, 'ROTACION_LOTE_REQUIERE_FLUJO');
    assert.equal(escenario.actualizaciones.length, 0);
});

test('si falla la sincronizacion del potrero se revierte el cambio de estado', async () => {
    const escenario = preparar({ falloPotrero: true });
    const respuesta = await escenario.editar({ estado: 'Planificada' });
    assert.equal(respuesta.codigo, 400);
    assert.equal(escenario.rotaciones.get('r1').estado, 'Activa');
    assert.equal(escenario.potreros.get('p1').estado, 'Ocupado');
});

test('las fechas futuras se sugieren Planificadas y consultar el formulario no activa una planificada vencida', async () => {
    const { normalizarFormularioRotacion, hoyRotacion } = await import('../../frontend/src/utils/formularioRotacion.mjs');
    assert.equal(hoyRotacion('America/Costa_Rica', new Date('2026-10-25T04:00:00Z')), '2026-10-24');
    assert.equal(normalizarFormularioRotacion({ fechaEntrada: '2026-10-25' }, '2026-10-24').estado, 'Planificada');
    assert.equal(normalizarFormularioRotacion({ estado: 'Planificada', fechaEntrada: '2020-01-01' }, '2026-10-24').estado, 'Planificada');
});
