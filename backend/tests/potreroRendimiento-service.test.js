const test = require('node:test');
const assert = require('node:assert/strict');
const {
    calcularDiasRotacion,
    calcularRendimientoPorPastoConDatos,
    calcularRendimientoPotrero,
    resolverPeriodo
} = require('../services/potreroRendimiento-service');

const periodoSeptiembre = resolverPeriodo({ fechaInicio: '2026-09-01', fechaFin: '2026-09-30' });

test('recorta rotaciones que cruzan meses y omite las planificadas', () => {
    assert.equal(calcularDiasRotacion({
        estado: 'Finalizada',
        fechaEntrada: '2026-08-29',
        fechaSalida: '2026-09-03'
    }, periodoSeptiembre), 2);
    assert.equal(calcularDiasRotacion({
        estado: 'Planificada',
        fechaEntrada: '2026-09-05',
        fechaSalida: '2026-09-08'
    }, periodoSeptiembre), 0);
});

test('asigna una rotacion que cruza un cambio a cada cobertura historica', () => {
    const resultado = calcularRendimientoPorPastoConDatos({
        potreros: [{ _id: 'p1', codigo: 'P-1', nombre: 'Uno', area: 2 }],
        rotaciones: [{ _id: 'r1', potrero: 'p1', estado: 'Finalizada', fechaEntrada: '2026-01-10', fechaSalida: '2026-01-20', numeroAnimales: 10 }],
        historiales: [
            { potrero: 'p1', pastoPrincipal: { _id: 'a', nombre: 'Brizantha', especieBase: 'Urochloa brizantha' }, fechaInicio: '2025-01-01', fechaFin: '2026-01-14' },
            { potrero: 'p1', pastoPrincipal: { _id: 'b', nombre: 'Mombaza', especieBase: 'Megathyrsus maximus' }, fechaInicio: '2026-01-15', fechaFin: null }
        ]
    }, { fechaInicio: '2026-01-01', fechaFin: '2026-01-31', hoy: '2026-01-31' });

    assert.equal(resultado.grupos.length, 2);
    assert.equal(resultado.grupos.find((item) => item.nombre === 'Brizantha').animalDias, 50);
    assert.equal(resultado.grupos.find((item) => item.nombre === 'Mombaza').animalDias, 50);
});

test('agrupa potreros con el mismo pasto sin duplicar su area', () => {
    const pasto = { _id: 'a', nombre: 'Toledo', especieBase: 'Urochloa brizantha' };
    const resultado = calcularRendimientoPorPastoConDatos({
        potreros: [
            { _id: 'p1', codigo: 'P-1', nombre: 'Uno', area: 2 },
            { _id: 'p2', codigo: 'P-2', nombre: 'Dos', area: 3 }
        ],
        rotaciones: [
            { _id: 'r1', potrero: 'p1', estado: 'Finalizada', fechaEntrada: '2026-01-01', fechaSalida: '2026-01-11', numeroAnimales: 10 },
            { _id: 'r2', potrero: 'p2', estado: 'Finalizada', fechaEntrada: '2026-01-01', fechaSalida: '2026-01-06', numeroAnimales: 20 }
        ],
        historiales: [
            { potrero: 'p1', pastoPrincipal: pasto, fechaInicio: '2025-01-01', fechaFin: null },
            { potrero: 'p2', pastoPrincipal: pasto, fechaInicio: '2025-01-01', fechaFin: null }
        ]
    }, { fechaInicio: '2026-01-01', fechaFin: '2026-01-31', hoy: '2026-01-31' });

    assert.equal(resultado.grupos.length, 1);
    assert.equal(resultado.grupos[0].cantidadPotreros, 2);
    assert.equal(resultado.grupos[0].areaHectareas, 5);
    assert.equal(resultado.grupos[0].animalDias, 200);
    assert.equal(resultado.grupos[0].animalDiasPorHectarea, 40);
});

test('mantiene un grupo explicito para rotaciones sin cobertura', () => {
    const resultado = calcularRendimientoPorPastoConDatos({
        potreros: [{ _id: 'p1', codigo: 'P-1', nombre: 'Uno', area: 1 }],
        rotaciones: [{ _id: 'r1', potrero: 'p1', estado: 'Finalizada', fechaEntrada: '2026-01-01', fechaSalida: '2026-01-03', numeroAnimales: 4 }],
        historiales: []
    }, { fechaInicio: '2026-01-01', fechaFin: '2026-01-31' });

    assert.equal(resultado.grupos[0].nombre, 'Sin cobertura registrada');
    assert.equal(resultado.grupos[0].animalDias, 8);
});

test('usa la cobertura actual cuando el potrero legado no tiene historial', () => {
    const resultado = calcularRendimientoPorPastoConDatos({
        potreros: [{
            _id: 'p1',
            codigo: 'P-1',
            nombre: 'Uno',
            area: 0.5,
            pastoPrincipal: { _id: 'ratana', nombre: 'Ratana', especieBase: 'Ischaemum indicum' }
        }],
        rotaciones: [{ _id: 'r1', potrero: 'p1', estado: 'Finalizada', fechaEntrada: '2026-01-01', fechaSalida: '2026-01-03', numeroAnimales: 20 }],
        historiales: []
    }, { fechaInicio: '2026-01-01', fechaFin: '2026-01-31' });

    assert.equal(resultado.grupos[0].nombre, 'Ratana');
    assert.equal(resultado.grupos[0].potrerosConCoberturaActualSinHistorial, 1);
    assert.equal(resultado.grupos[0].densidadAnimalesPorHectarea, 40);
});

test('no reescribe un periodo anterior cuando ya existe historial de cobertura', () => {
    const resultado = calcularRendimientoPorPastoConDatos({
        potreros: [{
            _id: 'p1',
            codigo: 'P-1',
            nombre: 'Uno',
            area: 1,
            pastoPrincipal: { _id: 'mombaza', nombre: 'Mombaza' }
        }],
        rotaciones: [{ _id: 'r1', potrero: 'p1', estado: 'Finalizada', fechaEntrada: '2026-01-01', fechaSalida: '2026-01-03', numeroAnimales: 5 }],
        historiales: [{ potrero: 'p1', pastoPrincipal: { _id: 'mombaza', nombre: 'Mombaza' }, fechaInicio: '2026-02-01', fechaFin: null }]
    }, { fechaInicio: '2026-01-01', fechaFin: '2026-01-31' });

    assert.equal(resultado.grupos[0].nombre, 'Sin cobertura registrada');
    assert.equal(resultado.grupos[0].potrerosConCoberturaActualSinHistorial, 0);
});

test('la fecha de establecimiento extiende la primera cobertura del reporte', () => {
    const pasto = { _id: 'brizantha', nombre: 'Brizantha', especieBase: 'Urochloa brizantha' };
    const resultado = calcularRendimientoPorPastoConDatos({
        potreros: [{
            _id: 'p1',
            codigo: 'P-1',
            nombre: 'Uno',
            area: 2,
            pastoPrincipal: pasto,
            fechaEstablecimientoPasto: '2025-06-01'
        }],
        rotaciones: [{ _id: 'r1', potrero: 'p1', estado: 'Finalizada', fechaEntrada: '2026-06-10', fechaSalida: '2026-06-12', numeroAnimales: 10 }],
        historiales: [{
            potrero: 'p1',
            pastoPrincipal: pasto,
            fechaInicio: '2026-10-01',
            fechaFin: null,
            fechaEstablecimientoPasto: '2025-06-01'
        }]
    }, { fechaInicio: '2026-06-01', fechaFin: '2026-06-30' });

    assert.equal(resultado.grupos.length, 1);
    assert.equal(resultado.grupos[0].nombre, 'Brizantha');
    assert.equal(resultado.grupos[0].animalDias, 20);
});

test('una correccion posterior de la misma cobertura aporta su fecha de establecimiento', () => {
    const pasto = { _id: 'ratana', nombre: 'Ratana' };
    const resultado = calcularRendimientoPorPastoConDatos({
        potreros: [{ _id: 'p1', codigo: 'P-1', nombre: 'Uno', area: 1, pastoPrincipal: pasto, fechaEstablecimientoPasto: '2025-01-01' }],
        rotaciones: [{ _id: 'r1', potrero: 'p1', estado: 'Finalizada', fechaEntrada: '2026-05-01', fechaSalida: '2026-05-03', numeroAnimales: 4 }],
        historiales: [
            { potrero: 'p1', pastoPrincipal: pasto, fechaInicio: '2026-09-01', fechaFin: '2026-09-30' },
            { potrero: 'p1', pastoPrincipal: pasto, fechaInicio: '2026-10-01', fechaFin: null, fechaEstablecimientoPasto: '2025-01-01' }
        ]
    }, { fechaInicio: '2026-05-01', fechaFin: '2026-05-31' });

    assert.equal(resultado.grupos[0].nombre, 'Ratana');
    assert.equal(resultado.grupos[0].animalDias, 8);
});

test('una rotacion real de entrada y salida el mismo dia cuenta un dia', () => {
    assert.equal(calcularDiasRotacion({
        estado: 'Finalizada',
        fechaEntrada: '2026-09-10',
        fechaSalida: '2026-09-10'
    }, periodoSeptiembre), 1);
});

test('calcula rendimiento, carga por hectarea y descansos sin guardar derivados', () => {
    const resultado = calcularRendimientoPotrero(
        { _id: 'potrero-1', codigo: 'P-1', nombre: 'Potrero 1', area: 2.5, estado: 'Descanso' },
        [
            { _id: 'r1', estado: 'Finalizada', fechaEntrada: '2026-08-29', fechaSalida: '2026-09-03', numeroAnimales: 10 },
            { _id: 'r2', estado: 'Finalizada', fechaEntrada: '2026-09-10', fechaSalida: '2026-09-10', numeroAnimales: 5 },
            { _id: 'r3', estado: 'Planificada', fechaEntrada: '2026-09-20', fechaSalida: '2026-09-22', numeroAnimales: 100 }
        ],
        periodoSeptiembre,
        { hoy: '2026-09-24' }
    );

    assert.equal(resultado.rendimiento.diasOcupados, 3);
    assert.equal(resultado.rendimiento.numeroRotaciones, 2);
    assert.equal(resultado.rendimiento.animalDias, 25);
    assert.equal(resultado.rendimiento.animalDiasPorHectarea, 10);
    assert.equal(resultado.rendimiento.densidadAnimalesPorHectarea, 3.3);
    assert.equal(resultado.rendimiento.descansoPromedio, 7);
    assert.equal(resultado.usoProyectado.numeroRotaciones, 1);
});

test('una rotacion activa usa solo el tiempo transcurrido hasta hoy', () => {
    const resultado = calcularRendimientoPotrero(
        { _id: 'potrero-2', codigo: 'P-2', nombre: 'Potrero 2', area: null, estado: 'Ocupado' },
        [{ _id: 'r1', estado: 'Activa', fechaEntrada: '2026-09-23', numeroAnimales: 20 }],
        periodoSeptiembre,
        { hoy: '2026-09-24' }
    );

    assert.equal(resultado.rendimiento.diasOcupados, 1);
    assert.equal(resultado.rendimiento.animalDias, 20);
    assert.equal(resultado.rendimiento.animalDiasPorHectarea, null);
    assert.equal(resultado.rendimiento.descansoActual, null);
});
