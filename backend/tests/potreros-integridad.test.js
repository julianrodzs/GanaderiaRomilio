const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const Potrero = require('../models/Potrero');
const RotacionPotrero = require('../models/RotacionPotrero');
const {
    sanitizarPotrero,
    sanitizarRotacion,
    validarDestinoPastoreo,
    validarPeriodoRotacion
} = require('../services/potrero-integridad-service');
const { validarComposicionCobertura } = require('../services/potreroCobertura-service');
const { construirFiltroCortes, convertirAKg } = require('../services/forraje-service');
const { resumirRendimientoForrajes } = require('../services/forrajeRendimiento-service');
const { calcularRendimientoPotrero, resolverPeriodo } = require('../services/potreroRendimiento-service');

test('el DTO de potreros rechaza operadores, tenant y campos desconocidos', () => {
    assert.throws(() => sanitizarPotrero({ $set: { estado: 'Ocupado' } }), /no esta permitido/);
    assert.throws(() => sanitizarPotrero({ organizacionId: new Types.ObjectId() }), /administrado por el sistema/);
    assert.throws(() => sanitizarPotrero({ campoInventado: true }), /contrato permitido/);
    assert.deepEqual(sanitizarPotrero({ codigo: 'P-1', fechaPrimerCorte: '2026-10-20' }), {
        datos: { codigo: 'P-1' },
        programacion: { fechaPrimerCorte: '2026-10-20' }
    });
});

test('las rotaciones aplican Activa por defecto y exigen enteros y fechas ordenadas', () => {
    assert.equal(sanitizarRotacion({ potrero: 'p1' }, { aplicarDefaults: true }).estado, 'Activa');
    assert.throws(() => validarPeriodoRotacion({ fechaEntrada: '2026-10-10', numeroAnimales: 1.5 }), /entero/);
    assert.throws(() => validarPeriodoRotacion({ fechaEntrada: '2026-10-10', fechaSalida: '2026-10-09', numeroAnimales: 2 }), /anterior/);
    assert.doesNotThrow(() => validarPeriodoRotacion({ fechaEntrada: '2026-10-10', fechaSalida: '2026-10-10', numeroAnimales: 2 }));
});

test('el esquema garantiza una sola rotacion activa por potrero', () => {
    const indice = RotacionPotrero.schema.indexes().find(([, opciones]) => opciones.name === 'una_rotacion_activa_por_potrero');
    assert.deepEqual(indice[0], { organizacionId: 1, fincaId: 1, potrero: 1, estado: 1 });
    assert.equal(indice[1].unique, true);
    assert.deepEqual(indice[1].partialFilterExpression, { estado: 'Activa' });
});

test('los estados permiten baja logica y los destinos excluyen bancos y mantenimiento', () => {
    assert.ok(Potrero.schema.path('estado').enumValues.includes('Inactivo'));
    assert.throws(() => validarDestinoPastoreo(null), /no encontrado/);
    assert.throws(() => validarDestinoPastoreo({ tipoArea: 'BANCO_FORRAJERO', estado: 'Disponible' }), /areas de pastoreo/);
    assert.throws(() => validarDestinoPastoreo({ tipoArea: 'PASTOREO', estado: 'Mantenimiento' }), /no esta disponible/);
    assert.equal(validarDestinoPastoreo({ tipoArea: 'PASTOREO', estado: 'Disponible' }).estado, 'Disponible');
});

test('la cobertura no admite duplicados ni porcentajes mayores al cien', () => {
    assert.throws(() => validarComposicionCobertura({ principal: 'a', secundarios: ['a'] }), /no puede repetirse/);
    assert.throws(() => validarComposicionCobertura({ porcentajes: [
        { catalogoPasto: 'a', porcentajeEstimado: 60 },
        { catalogoPasto: 'b', porcentajeEstimado: 50 }
    ] }), /superar el 100/);
    assert.throws(() => validarComposicionCobertura({ porcentajes: [
        { catalogoPasto: 'a', porcentajeEstimado: 30 },
        { catalogoPasto: 'a', porcentajeEstimado: 20 }
    ] }), /mas de un porcentaje/);
});

test('la produccion mensual de forraje queda en orden cronologico', () => {
    const base = {
        potrero: { _id: 'p1', nombre: 'Banco', area: 1 },
        forraje: { _id: 'f1' },
        forrajeNombre: 'Cuba',
        areaCortadaHa: 1,
        destino: { tipo: 'FINCA_GENERAL' }
    };
    const resultado = resumirRendimientoForrajes([
        { ...base, fechaCorte: '2026-02-10', cantidadForrajeVerdeKg: 5000 },
        { ...base, fechaCorte: '2026-01-10', cantidadForrajeVerdeKg: 100 }
    ]);
    assert.deepEqual(resultado.produccionPorMes.map((item) => item.clave), ['2026-01', '2026-02']);
});

test('un descanso objetivo ausente se conserva como null', () => {
    const periodo = resolverPeriodo({ fechaInicio: '2026-10-01', fechaFin: '2026-10-31' });
    const resultado = calcularRendimientoPotrero(
        { _id: 'p1', area: 1, diasDescansoObjetivo: null },
        [{ estado: 'Finalizada', fechaEntrada: '2026-10-01', fechaSalida: '2026-10-02', numeroAnimales: 2 }],
        periodo,
        { hoy: '2026-10-15' }
    );
    assert.equal(resultado.rendimiento.descansoObjetivo, null);
});

test('el filtro de cortes usa fin de dia exclusivo y las unidades son estrictas', () => {
    const filtro = construirFiltroCortes('p1', { fechaFin: '2026-10-15' });
    assert.equal(filtro.fechaCorte.$lt.toISOString(), '2026-10-16T00:00:00.000Z');
    assert.equal(convertirAKg(2, 'TON'), 2000);
    assert.throws(() => convertirAKg(2, 'LIBRAS'), /KG o TON/);
});
