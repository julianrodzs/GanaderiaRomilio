const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Lote = require('../models/Lote');
const PertenenciaLote = require('../models/PertenenciaLote');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const {
    sanitizarActualizacionLote,
    sanitizarCreacionLote
} = require('../services/lote-integridad-service');
const {
    calcularResumenPesajes,
    proyectarDetalleLotePorPlan
} = require('../services/lote-service');
const {
    calcularCronograma,
    calcularCumplimiento,
    validarPasos
} = require('../services/protocoloScheduler-service');
const { prepararEtapas } = require('../services/protocoloEngorde-service');

const id = () => new mongoose.Types.ObjectId();

test('el DTO de lotes rechaza tenant, operadores y campos internos', () => {
    assert.throws(() => sanitizarCreacionLote({ nombre: 'Lote', fincaId: id() }), /sesión/);
    assert.throws(() => sanitizarCreacionLote({ nombre: 'Lote', $set: { estado: 'CERRADO' } }), /no está permitida/);
    assert.throws(() => sanitizarActualizacionLote({ 'nombre.valor': 'Lote' }), /no está permitida/);
    assert.throws(() => sanitizarCreacionLote({ nombre: 'Lote', estado: 'CERRADO' }), /Campos internos/);
});

test('el DTO normaliza etapa y métricas opcionales vacías', () => {
    const limpio = sanitizarCreacionLote({
        codigo: 'BOV-001', nombre: 'Engorde 1', especie: 'Bovino', proposito: 'ENGORDE',
        etapaOperativa: '', pesoObjetivoKg: '', gmdObjetivoKgDia: ''
    });
    assert.equal(limpio.etapaOperativa, null);
    assert.equal(limpio.pesoObjetivoKg, null);
    assert.equal(limpio.gmdObjetivoKgDia, null);
});

test('una pertenencia no admite salida anterior a la entrada', async () => {
    const organizacionId = id();
    const fincaId = id();
    await ejecutarConOrganizacion(organizacionId, async () => {
        const pertenencia = new PertenenciaLote({
            animal: id(), lote: id(), fechaEntrada: '2026-10-10', fechaSalida: '2026-10-09'
        });
        await assert.rejects(pertenencia.validate(), /salida no puede ser anterior/);
    }, fincaId);
});

test('el modelo conserva una GMD final negativa cuando hubo pérdida real de peso', async () => {
    const organizacionId = id();
    const fincaId = id();
    await ejecutarConOrganizacion(organizacionId, async () => {
        const lote = new Lote({
            codigo: 'BOV-ENG-001', nombre: 'Lote prueba', especie: 'Bovino', proposito: 'ENGORDE',
            gmdFinalLote: -0.125
        });
        await lote.validate();
        assert.equal(lote.gmdFinalLote, -0.125);
    }, fincaId);
});

test('la GMD del lote usa solo pesajes dentro de cada pertenencia', () => {
    const animal = id();
    const lote = { gmdObjetivoKgDia: 1, pesoObjetivoKg: 500 };
    const pertenencias = [{ animal, fechaEntrada: new Date('2026-10-01T00:00:00Z'), fechaSalida: new Date('2026-10-11T00:00:00Z') }];
    const resumen = calcularResumenPesajes(lote, pertenencias, [
        { animal, fecha: new Date('2026-09-25T00:00:00Z'), peso: 300 },
        { animal, fecha: new Date('2026-10-01T00:00:00Z'), peso: 350 },
        { animal, fecha: new Date('2026-10-11T00:00:00Z'), peso: 340 },
        { animal, fecha: new Date('2026-10-15T00:00:00Z'), peso: 600 }
    ]);
    assert.equal(resumen.pesoPromedioEntradaLote, 350);
    assert.equal(resumen.pesoPromedioActual, 340);
    assert.equal(resumen.kilosGanadosTotales, -10);
    assert.equal(resumen.gmdPromedioLote, -1);
});

test('el cronograma usa la ejecución real del paso precedente y propaga dependencias', () => {
    const a = id(); const b = id(); const c = id();
    const pasos = [
        { _id: a, nombre: 'A', tipoAccion: 'CONTROL', orden: 1, referenciaTemporal: 'DESDE_INICIO', offsetHoras: 0 },
        { _id: b, nombre: 'B', tipoAccion: 'CONTROL', orden: 2, referenciaTemporal: 'DESDE_PASO', pasoReferenciaId: a, offsetHoras: 24 },
        { _id: c, nombre: 'C', tipoAccion: 'CONTROL', orden: 3, referenciaTemporal: 'DESDE_PASO', pasoReferenciaId: b, offsetHoras: 24 }
    ];
    const resultado = calcularCronograma({
        pasos,
        fechaInicio: new Date('2026-10-01T12:00:00Z'),
        ejecuciones: [{ pasoId: a, fechaReal: new Date('2026-10-03T12:00:00Z'), estado: 'REALIZADO' }]
    });
    assert.equal(resultado[1].fechaProgramada.toISOString(), '2026-10-04T12:00:00.000Z');
    assert.equal(resultado[2].fechaProgramada.toISOString(), '2026-10-05T12:00:00.000Z');
});

test('el planificador rechaza dependencias circulares', () => {
    const a = id(); const b = id();
    const pasos = [
        { _id: a, nombre: 'A', tipoAccion: 'CONTROL', referenciaTemporal: 'DESDE_PASO', pasoReferenciaId: b },
        { _id: b, nombre: 'B', tipoAccion: 'CONTROL', referenciaTemporal: 'DESDE_PASO', pasoReferenciaId: a }
    ];
    assert.throws(() => validarPasos(pasos, ['CONTROL']), /dependencia circular/);
});

test('una tarea sanitaria no puede configurarse para un rol clínicamente incompatible', () => {
    assert.throws(() => prepararEtapas([{
        codigo: 'ADAPTACION', nombre: 'Adaptación',
        pasos: [{ nombre: 'Aplicar medicamento', tipoAccion: 'SANIDAD', rolResponsable: 'Trabajador' }]
    }]), /requiere Administrador, Encargado o Veterinario/);
});

test('una ejecución parcial no aumenta el cumplimiento del protocolo', () => {
    const cumplimiento = calcularCumplimiento([
        { obligatorio: true, estado: 'PARCIAL' },
        { obligatorio: true, estado: 'REALIZADO', fechaProgramada: new Date('2026-10-02T12:00:00Z'), fechaReal: new Date('2026-10-02T12:00:00Z') }
    ]);
    assert.equal(cumplimiento.realizadas, 1);
    assert.equal(cumplimiento.porcentaje, 50);
});

test('el plan sin analítica no recibe GMD ni kilos ganados en ninguna respuesta', () => {
    const visible = proyectarDetalleLotePorPlan({
        gmdObjetivoKgDia: 0.8,
        gmdFinalLote: 0.7,
        kilosGanadosTotales: 100,
        resumen: { gmdPromedioLote: 0.7, cumplimientoGmd: 87.5, alcanzaronPesoObjetivo: 3, kilosGanadosTotales: 100 }
    }, false);
    assert.equal(visible.gmdObjetivoKgDia, undefined);
    assert.equal(visible.gmdFinalLote, undefined);
    assert.equal(visible.kilosGanadosTotales, undefined);
    assert.equal(visible.resumen.gmdPromedioLote, undefined);
    assert.equal(visible.resumen.kilosGanadosTotales, undefined);
});
