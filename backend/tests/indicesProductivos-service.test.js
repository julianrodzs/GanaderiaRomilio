const test = require('node:test');
const assert = require('node:assert/strict');
const {
    calcularEficienciaTiempo,
    calcularGmd,
    calcularIcpPorcino,
    calcularIeeGeneral,
    obtenerProyeccionPesoObjetivo
} = require('../services/indicesProductivos-service');

const configuracion = {
    porcinos: {
        gmdFase1KgDia: 0.3,
        gmdFase2KgDia: 0.4,
        gmdFase3KgDia: 0.55,
        gmdDesarrolloKgDia: 0.75,
        gmdEngordeKgDia: 0.85,
        pesoObjetivoEngordeKg: 110
    },
    bovinosEngorde: { gmdObjetivoKgDia: 0.9, pesoObjetivoKg: 500 },
    diasPesajeReciente: 60
};

const periodo = {
    fechaInicio: new Date('2026-01-01T00:00:00Z'),
    fechaFin: new Date('2026-12-31T23:59:59Z')
};

test('calcula GMD real y conserva pérdidas de peso', () => {
    const resultado = calcularGmd([
        { fecha: '2026-01-01', peso: 100 },
        { fecha: '2026-01-11', peso: 90 }
    ]);
    assert.equal(resultado.gananciaKg, -10);
    assert.equal(resultado.gmdReal, -1);
});

test('omite pesajes del mismo día y series con un solo dato', () => {
    assert.equal(calcularGmd([{ fecha: '2026-01-01', peso: 20 }]), null);
    assert.equal(calcularGmd([
        { fecha: '2026-01-01T08:00:00Z', peso: 20 },
        { fecha: '2026-01-01T08:00:00Z', peso: 22 }
    ]), null);
});

test('ICP pondera por animal-días y excluye animales sin suficientes pesajes', () => {
    const animales = [
        { _id: 'p1', especie: 'Porcino', estado: 'Activo', etapaProductiva: 'Engorde' },
        { _id: 'p2', especie: 'Porcino', estado: 'Activo', etapaProductiva: 'Engorde' },
        { _id: 'p3', especie: 'Porcino', estado: 'Activo', etapaProductiva: 'Engorde' }
    ];
    const pesajes = [
        { animal: 'p1', fecha: '2026-01-01', peso: 20 },
        { animal: 'p1', fecha: '2026-03-02', peso: 71 },
        { animal: 'p2', fecha: '2026-01-01', peso: 20 },
        { animal: 'p2', fecha: '2026-01-11', peso: 24.25 },
        { animal: 'p3', fecha: '2026-01-01', peso: 20 }
    ];
    const resultado = calcularIcpPorcino({ animales, pesajes, configuracion });
    assert.equal(resultado.icp, 92.9);
    assert.equal(resultado.resumen.porcinosEvaluados, 2);
    assert.equal(resultado.resumen.porcinosSinDatosSuficientes, 1);
    assert.equal(resultado.resumen.animalDiasEvaluados, 70);
});

test('ICP separa un período que atraviesa etapas registradas', () => {
    const animales = [{ _id: 'p1', especie: 'Porcino', estado: 'Activo' }];
    const pesajes = [
        { animal: 'p1', fecha: '2026-01-01', peso: 10, etapaProductiva: 'Fase 1' },
        { animal: 'p1', fecha: '2026-01-11', peso: 13, etapaProductiva: 'Fase 2' },
        { animal: 'p1', fecha: '2026-01-21', peso: 17, etapaProductiva: 'Fase 2' }
    ];
    const resultado = calcularIcpPorcino({ animales, pesajes, configuracion });
    assert.equal(resultado.porEtapa.length, 2);
    assert.equal(resultado.porEtapa[0].etapa, 'Fase 1');
    assert.equal(resultado.porEtapa[1].etapa, 'Fase 2');
    assert.equal(resultado.icp, 100);
});

test('ICP no inventa meta cuando la etapa no está definida', () => {
    const resultado = calcularIcpPorcino({
        animales: [{ _id: 'p1', especie: 'Porcino', estado: 'Activo', categoria: 'Lechón' }],
        pesajes: [
            { animal: 'p1', fecha: '2026-01-01', peso: 10 },
            { animal: 'p1', fecha: '2026-01-11', peso: 14 }
        ],
        configuracion
    });
    assert.equal(resultado.icp, null);
    assert.equal(resultado.datosInsuficientes, true);
    assert.equal(resultado.resumen.porcinosSinMetaProductiva, 1);
});

test('IEE calcula fincas bovinas, porcinas y mixtas contra metas propias', () => {
    const animales = [
        { _id: 'b1', especie: 'Bovino', estado: 'Activo', objetivoProductivo: 'Engorde', createdAt: '2025-01-01' },
        { _id: 'p1', especie: 'Porcino', estado: 'Activo', categoria: 'Engorde', createdAt: '2025-01-01' }
    ];
    const pesajes = [
        { animal: 'b1', fecha: '2026-01-01', peso: 300 },
        { animal: 'b1', fecha: '2026-04-11', peso: 390 },
        { animal: 'p1', fecha: '2026-01-01', peso: 25 },
        { animal: 'p1', fecha: '2026-03-02', peso: 76 }
    ];
    const mixto = calcularIeeGeneral({ animales, pesajes, configuracion, ...periodo, especie: 'Todos' });
    const bovino = calcularIeeGeneral({ animales, pesajes, configuracion, ...periodo, especie: 'Bovino' });
    const porcino = calcularIeeGeneral({ animales, pesajes, configuracion, ...periodo, especie: 'Porcino' });
    assert.ok(mixto.ieeGeneral !== null);
    assert.ok(bovino.bovinos.iee !== null);
    assert.equal(bovino.porcinos, null);
    assert.ok(porcino.porcinos.iee !== null);
    assert.equal(porcino.bovinos, null);
});

test('IEE no calcula índice sin meta GMD configurada', () => {
    const resultado = calcularIeeGeneral({
        animales: [{ _id: 'b1', especie: 'Bovino', estado: 'Activo', objetivoProductivo: 'Engorde' }],
        pesajes: [
            { animal: 'b1', fecha: '2026-01-01', peso: 300 },
            { animal: 'b1', fecha: '2026-02-01', peso: 330 }
        ],
        configuracion: { bovinosEngorde: {}, porcinos: {} },
        ...periodo,
        especie: 'Bovino'
    });
    assert.equal(resultado.ieeGeneral, null);
    assert.equal(resultado.datosInsuficientes, true);
});

test('supervivencia usa fechaMuerte y reporta muertes sin fecha confiable', () => {
    const animales = [
        { _id: 'b1', especie: 'Bovino', estado: 'Activo', objetivoProductivo: 'Engorde' },
        { _id: 'b2', especie: 'Bovino', estado: 'Muerto', objetivoProductivo: 'Engorde', fechaMuerte: '2026-06-01' },
        { _id: 'b3', especie: 'Bovino', estado: 'Muerto', objetivoProductivo: 'Engorde' }
    ];
    const pesajes = [
        { animal: 'b1', fecha: '2026-01-01', peso: 300 },
        { animal: 'b1', fecha: '2026-02-01', peso: 328 },
        { animal: 'b2', fecha: '2026-01-01', peso: 300 },
        { animal: 'b2', fecha: '2026-02-01', peso: 325 }
    ];
    const resultado = calcularIeeGeneral({ animales, pesajes, configuracion, ...periodo, especie: 'Bovino' }).bovinos;
    assert.equal(resultado.muertesEngorde, 1);
    assert.equal(resultado.muertesSinFechaConfiable, 1);
    assert.equal(resultado.supervivencia, 66.7);
});

test('calcula tiempo al alcanzar el objetivo y proyección restante', () => {
    const eficiencia = calcularEficienciaTiempo({
        gmd: { pesoInicial: 80, pesoFinal: 110, dias: 40, gmdReal: 0.75 },
        pesoObjetivo: 110,
        gmdObjetivo: 0.85
    });
    assert.ok(eficiencia > 0);
    assert.deepEqual(obtenerProyeccionPesoObjetivo({ pesoActual: 86, pesoObjetivo: 110, gmdReal: 0.8 }), {
        kgRestantes: 24,
        diasEstimados: 30
    });
});

test('animal sobre el peso objetivo usa duración real sin proyección restante', () => {
    const eficiencia = calcularEficienciaTiempo({
        gmd: { pesoInicial: 80, pesoFinal: 120, dias: 50, gmdReal: 0.8 },
        pesoObjetivo: 110,
        gmdObjetivo: 0.85
    });
    assert.ok(eficiencia > 0);
    assert.deepEqual(obtenerProyeccionPesoObjetivo({ pesoActual: 120, pesoObjetivo: 110, gmdReal: 0.8 }), {
        kgRestantes: 0,
        diasEstimados: 0
    });
});

test('IEE conserva GMD y supervivencia cuando falta peso objetivo', () => {
    const configSinPesoObjetivo = {
        ...configuracion,
        bovinosEngorde: { gmdObjetivoKgDia: 0.9 }
    };
    const resultado = calcularIeeGeneral({
        animales: [{ _id: 'b1', especie: 'Bovino', estado: 'Activo', objetivoProductivo: 'Engorde' }],
        pesajes: [
            { animal: 'b1', fecha: '2026-01-01', peso: 300 },
            { animal: 'b1', fecha: '2026-02-10', peso: 336 }
        ],
        configuracion: configSinPesoObjetivo,
        ...periodo,
        especie: 'Bovino'
    });
    assert.ok(resultado.ieeGeneral !== null);
    assert.equal(resultado.bovinos.eficienciaTiempo, null);
    assert.deepEqual(resultado.bovinos.componentesDisponibles.sort(), ['cumplimientoGmd', 'supervivencia']);
});

test('período sin pesajes devuelve datos insuficientes, no cero', () => {
    const resultado = calcularIeeGeneral({
        animales: [{ _id: 'p1', especie: 'Porcino', estado: 'Activo', categoria: 'Engorde' }],
        pesajes: [],
        configuracion,
        ...periodo,
        especie: 'Porcino'
    });
    assert.equal(resultado.ieeGeneral, null);
    assert.equal(resultado.datosInsuficientes, true);
});
