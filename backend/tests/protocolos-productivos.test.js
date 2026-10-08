const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { planesConfig, PLAN_MINIMO_POR_FEATURE } = require('../config/planes');
const { permisosPorModulo } = require('../config/permisosRoles');
const BandaReproductivaPorcina = require('../models/BandaReproductivaPorcina');
const CicloEngorde = require('../models/CicloEngorde');
const { PlantillaProtocoloEngorde } = require('../models/PlantillaProtocoloEngorde');
const { PlantillaProtocoloReproductivoPorcino } = require('../models/PlantillaProtocoloReproductivoPorcino');
const { completarFechasYEstado, RegistroReproductivo } = require('../models/RegistroReproductivo');
const { prepararEtapas, rolPuedeEjecutarPaso: rolPuedeEjecutarEngorde } = require('../services/protocoloEngorde-service');
const { normalizarResultadoDiagnostico, prepararPasos, rolPuedeEjecutarPaso: rolPuedeEjecutarPorcino } = require('../services/protocoloPorcino-service');
const { calcularCronograma, calcularCumplimiento } = require('../services/protocoloScheduler-service');

test('los protocolos productivos se habilitan solamente desde PRO', () => {
    ['protocolosEngorde', 'protocolosReproductivosPorcinos'].forEach((feature) => {
        assert.equal(planesConfig.ESENCIAL.funcionalidades[feature], false);
        assert.equal(planesConfig.GESTION.funcionalidades[feature], false);
        assert.equal(planesConfig.PRO.funcionalidades[feature], true);
        assert.equal(planesConfig.PREMIUM.funcionalidades[feature], true);
        assert.equal(PLAN_MINIMO_POR_FEATURE[feature], 'PRO');
    });
});

test('los permisos separan configuración y ejecución operativa', () => {
    assert.deepEqual(permisosPorModulo.lotes.protocoloConfigurar, ['Administrador']);
    assert.ok(permisosPorModulo.lotes.protocoloEjecutar.includes('Trabajador'));
    assert.deepEqual(permisosPorModulo.reproduccion.protocoloPorcinoConfigurar, ['Administrador', 'Veterinario']);
    assert.ok(permisosPorModulo.reproduccion.protocoloPorcinoEjecutar.includes('Encargado'));
});

test('un trabajador solo ejecuta actividades asignadas y el diagnóstico queda restringido', () => {
    assert.equal(rolPuedeEjecutarEngorde({ rolUsuario: 'Trabajador', tipoAccion: 'PESAJE', asignada: false }), false);
    assert.equal(rolPuedeEjecutarEngorde({ rolUsuario: 'Trabajador', tipoAccion: 'PESAJE', asignada: true }), true);
    assert.equal(rolPuedeEjecutarEngorde({ rolUsuario: 'Veterinario', tipoAccion: 'PESAJE', asignada: false }), false);
    assert.equal(rolPuedeEjecutarEngorde({ rolUsuario: 'Veterinario', tipoAccion: 'SANIDAD', asignada: false }), true);
    assert.equal(rolPuedeEjecutarPorcino({ rolUsuario: 'Trabajador', tipoAccion: 'SERVICIO', asignada: false }), false);
    assert.equal(rolPuedeEjecutarPorcino({ rolUsuario: 'Trabajador', tipoAccion: 'SERVICIO', asignada: true }), true);
    assert.equal(rolPuedeEjecutarPorcino({ rolUsuario: 'Encargado', tipoAccion: 'DIAGNOSTICO_GESTACION', asignada: true }), false);
    assert.equal(rolPuedeEjecutarPorcino({ rolUsuario: 'Veterinario', tipoAccion: 'DIAGNOSTICO_GESTACION', asignada: false }), true);
});

test('el diagnóstico porcino normaliza la variante histórica sin eñe', () => {
    assert.equal(normalizarResultadoDiagnostico('PRENADA'), 'PREÑADA');
    assert.equal(normalizarResultadoDiagnostico('VACIA'), 'VACIA');
});

test('una fecha porcina dependiente espera el evento real y luego se recalcula', () => {
    const paso = { _id: new mongoose.Types.ObjectId(), nombre: 'Diagnóstico', tipoAccion: 'DIAGNOSTICO_GESTACION', orden: 1, referenciaTemporal: 'DESDE_EVENTO_REAL', eventoReferencia: 'IA', offsetHoras: 24 * 28 };
    const pendiente = calcularCronograma({ pasos: [paso], fechaInicio: new Date('2026-10-01T00:00:00Z') });
    assert.equal(pendiente[0].fechaProgramada, null);
    const calculado = calcularCronograma({ pasos: [paso], fechaInicio: new Date('2026-10-01T00:00:00Z'), eventos: { IA: new Date('2026-10-03T00:00:00Z') } });
    assert.equal(calculado[0].fechaProgramada.toISOString(), '2026-10-31T00:00:00.000Z');
});

test('el cumplimiento usa hechos reales y conserva denominadores explícitos', () => {
    const fecha = new Date('2026-10-05T12:00:00Z');
    const resultado = calcularCumplimiento([
        { obligatorio: true, estado: 'REALIZADO', fechaProgramada: fecha, fechaReal: fecha },
        { obligatorio: true, estado: 'PENDIENTE', fechaProgramada: fecha },
        { obligatorio: false, estado: 'PENDIENTE', fechaProgramada: fecha }
    ]);
    assert.deepEqual(resultado, { totalObligatorias: 2, realizadas: 1, aTiempo: 1, porcentaje: 50, porcentajeATiempo: 100 });
});

test('las plantillas validan acciones del dominio y no aceptan acciones inventadas', () => {
    assert.doesNotThrow(() => prepararEtapas([{ codigo: 'ENGORDE', nombre: 'Engorde', pasos: [{ nombre: 'Pesaje', tipoAccion: 'PESAJE', offsetHoras: 0 }] }]));
    assert.throws(() => prepararEtapas([{ codigo: 'ENGORDE', nombre: 'Engorde', pasos: [{ nombre: 'Automático', tipoAccion: 'VENDER_AUTOMATICO' }] }]));
    assert.doesNotThrow(() => prepararPasos([{ nombre: 'Servicio', tipoAccion: 'SERVICIO', offsetHoras: 0 }]));
    assert.throws(() => prepararPasos([{ nombre: 'Dieta', tipoAccion: 'RECOMENDAR_DIETA' }]));
});

test('los modelos de coordinación conservan aislamiento y snapshots', () => {
    [BandaReproductivaPorcina, CicloEngorde, PlantillaProtocoloEngorde, PlantillaProtocoloReproductivoPorcino].forEach((Modelo) => assert.ok(Modelo.schema.path('organizacionId')));
    assert.ok(BandaReproductivaPorcina.schema.path('fincaId'));
    assert.ok(CicloEngorde.schema.path('fincaId'));
    assert.ok(CicloEngorde.schema.path('protocoloSnapshot'));
    assert.ok(BandaReproductivaPorcina.schema.path('protocoloSnapshot'));
});

test('el diagnóstico porcino vacío no permanece marcado como gestante', () => {
    const registro = { especie: 'Porcino', fechaInseminacion: new Date('2026-10-01'), resultadoDiagnosticoGestacion: 'VACIA', gestacionConfirmada: true };
    completarFechasYEstado(registro);
    assert.equal(registro.estado, 'Vacía');
    assert.equal(registro.gestacionConfirmada, false);
    assert.ok(RegistroReproductivo.schema.path('bandaReproductivaPorcina'));
    assert.ok(RegistroReproductivo.schema.path('historialDiagnosticos'));
});

test('el parto porcino real desplaza destete y servicio desde la fecha observada', () => {
    const registro = { especie: 'Porcino', fechaInseminacion: new Date('2026-01-01T00:00:00Z'), fechaPartoReal: new Date('2026-04-28T00:00:00Z'), diasDestetePorcino: 28 };
    completarFechasYEstado(registro);
    assert.equal(registro.fechaDestete.toISOString(), '2026-05-26T00:00:00.000Z');
    assert.ok(registro.fechaNuevaInseminacion > registro.fechaDestete);
});
