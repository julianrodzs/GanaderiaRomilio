const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { planesConfig, PLAN_MINIMO_POR_FEATURE } = require('../config/planes');
const { permisosPorModulo } = require('../config/permisosRoles');
const CampanaIATF = require('../models/CampanaIATF');
const DiagnosticoGestacionIATF = require('../models/DiagnosticoGestacionIATF');
const EjecucionPasoIATF = require('../models/EjecucionPasoIATF');
const { InsumoReproductivo } = require('../models/InsumoReproductivo');
const { PlantillaProtocoloIATF } = require('../models/PlantillaProtocoloIATF');
const { RegistroReproductivo, completarFechasYEstado } = require('../models/RegistroReproductivo');
const {
    calcularCronograma,
    calcularMetricasCampana,
    evaluarEstadoPasoIatf,
    limpiarDatosInsumo,
    limpiarDatosPlantilla,
    validarPlantilla
} = require('../services/iatf-service');
const { sumarDiasUtc } = require('../services/duracionGestacion-service');

const paso = (datos = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    nombre: 'Paso',
    tipoAccion: 'APLICAR_PRODUCTO',
    referenciaTemporal: 'DESDE_INICIO',
    offsetHoras: 0,
    ...datos
});

test('IATF se habilita solamente desde PRO', () => {
    assert.equal(planesConfig.ESENCIAL.funcionalidades.iatfReproductivo, false);
    assert.equal(planesConfig.GESTION.funcionalidades.iatfReproductivo, false);
    assert.equal(planesConfig.PRO.funcionalidades.iatfReproductivo, true);
    assert.equal(planesConfig.PREMIUM.funcionalidades.iatfReproductivo, true);
    assert.equal(PLAN_MINIMO_POR_FEATURE.iatfReproductivo, 'PRO');
});

test('los DTO IATF no permiten cambiar organización ni finca', () => {
    assert.deepEqual(limpiarDatosPlantilla({ nombre: 'P', pasos: [], organizacionId: 'otra', fincaId: 'otra', $set: {} }), { nombre: 'P', pasos: [] });
    assert.deepEqual(limpiarDatosInsumo({ nombre: 'Semen', categoria: 'SEMEN', fincaId: 'otra', organizacionId: 'otra' }), { nombre: 'Semen', categoria: 'SEMEN' });
});

test('los permisos separan configuración, ejecución y diagnóstico', () => {
    assert.deepEqual(permisosPorModulo.reproduccion.iatfConfigurar, ['Administrador', 'Veterinario']);
    assert.ok(permisosPorModulo.reproduccion.iatfEjecutar.includes('Encargado'));
    assert.ok(!permisosPorModulo.reproduccion.iatfDiagnosticar.includes('Encargado'));
});

test('representa protocolos P4/E2, GnRH y personalizados sin productos obligatorios', () => {
    const ejemplos = [
        { nombre: 'P4/E2 7 días', pasos: [paso({ nombre: 'Inicio' }), paso({ nombre: 'Retiro', offsetHoras: 168, tipoAccion: 'RETIRAR_DISPOSITIVO' }), paso({ nombre: 'IATF', offsetHoras: 216, tipoAccion: 'IATF' })] },
        { nombre: 'GnRH/CIDR', pasos: [paso({ nombre: 'Inicio GnRH/CIDR' }), paso({ nombre: 'Retiro CIDR', offsetHoras: 168 }), paso({ nombre: 'IATF', offsetHoras: 228, tipoAccion: 'IATF' })] },
        { nombre: 'Personalizado sin eCG', pasos: [paso({ tipoAccion: 'CONTROL' })] }
    ];
    ejemplos.forEach((plantilla) => assert.doesNotThrow(() => validarPlantilla(plantilla)));
});

test('calcula Día 7, Día 8 y ventanas de IATF 48/56/66 horas', () => {
    const inicio = new Date('2026-10-01T08:00:00.000Z');
    const retiro7 = paso({ nombre: 'Retiro D7', offsetHoras: 168 });
    const retiro8 = paso({ nombre: 'Retiro D8', offsetHoras: 192 });
    const iatf = paso({
        nombre: 'IATF relativa', tipoAccion: 'IATF', referenciaTemporal: 'DESDE_PASO',
        pasoReferenciaId: retiro7._id, offsetHoras: 52, ventanaInicioHoras: -4, ventanaFinHoras: 14
    });
    const cronograma = calcularCronograma([retiro7, retiro8, iatf], inicio);
    const porNombre = Object.fromEntries(cronograma.map((item) => [item.paso.nombre, item]));
    assert.equal(porNombre['Retiro D7'].fechaHoraProgramada.toISOString(), '2026-10-08T08:00:00.000Z');
    assert.equal(porNombre['Retiro D8'].fechaHoraProgramada.toISOString(), '2026-10-09T08:00:00.000Z');
    assert.equal(porNombre['IATF relativa'].ventanaInicio.toISOString(), '2026-10-10T08:00:00.000Z');
    assert.equal(porNombre['IATF relativa'].fechaHoraProgramada.toISOString(), '2026-10-10T12:00:00.000Z');
    assert.equal(porNombre['IATF relativa'].ventanaFin.toISOString(), '2026-10-11T02:00:00.000Z');
});

test('recalcula una dependencia desde la ejecución real del paso', () => {
    const inicio = new Date('2026-10-01T08:00:00.000Z');
    const retiro = paso({ offsetHoras: 168 });
    const iatf = paso({ referenciaTemporal: 'DESDE_PASO', pasoReferenciaId: retiro._id, offsetHoras: 52, tipoAccion: 'IATF' });
    const reales = new Map([[String(retiro._id), new Date('2026-10-08T12:00:00.000Z')]]);
    const cronograma = calcularCronograma([retiro, iatf], inicio, reales);
    assert.equal(cronograma.find((item) => item.paso.tipoAccion === 'IATF').fechaHoraProgramada.toISOString(), '2026-10-10T16:00:00.000Z');
});

test('P/AI usa inseminadas y calcula 18/30 = 60%', () => {
    const participantes = [
        ...Array.from({ length: 18 }, (_, i) => ({ estadoParticipacion: 'INSEMINADA', fechaInseminacion: new Date(), resultadoActual: 'PREÑADA', semenSnapshot: { codigoToro: i < 10 ? 'A' : 'B', costoUnitario: 8000 } })),
        ...Array.from({ length: 12 }, () => ({ estadoParticipacion: 'INSEMINADA', fechaInseminacion: new Date(), resultadoActual: 'VACIA', semenSnapshot: { codigoToro: 'B', costoUnitario: 8000 } })),
        { estadoParticipacion: 'PROTOCOLO_COMPLETADO', resultadoActual: 'SIN_DIAGNOSTICO' },
        ...Array.from({ length: 3 }, () => ({ estadoParticipacion: 'RETIRADA', resultadoActual: 'SIN_DIAGNOSTICO' }))
    ];
    const metricas = calcularMetricasCampana({
        participantes,
        costosAdicionales: { veterinario: 120000, tecnico: 0, otros: 30000 }
    }, [], [{ productosRealmenteUtilizados: [{ costoTotalSnapshot: 180000 }] }]);
    assert.equal(metricas.inscritas, 34);
    assert.equal(metricas.completaron, 31);
    assert.equal(metricas.inseminadas, 30);
    assert.equal(metricas.prenadas, 18);
    assert.equal(metricas.pAI, 60);
    assert.equal(metricas.costoTotal, 570000);
    assert.equal(metricas.costoPorPrenez, 31666.67);
    assert.equal(metricas.resultadosObservadosPorToro.length, 2);
});

test('una hembra inseminada y luego retirada permanece en el denominador P/AI', () => {
    const metricas = calcularMetricasCampana({
        participantes: [
            { estadoParticipacion: 'RETIRADA', fechaInseminacion: new Date(), resultadoActual: 'VACIA' },
            { estadoParticipacion: 'INSEMINADA', fechaInseminacion: new Date(), resultadoActual: 'PREÑADA' }
        ]
    });
    assert.equal(metricas.inseminadas, 2);
    assert.equal(metricas.pAI, 50);
});

test('un lote parcialmente aplicado no completa el paso IATF al registrar ese semen', () => {
    const participantes = Array.from({ length: 30 }, (_, indice) => ({
        animal: String(indice + 1),
        estadoParticipacion: indice < 10 ? 'INSEMINADA' : 'EN_PROTOCOLO',
        fechaInseminacion: indice < 10 ? new Date() : undefined
    }));
    assert.equal(evaluarEstadoPasoIatf({
        participantes,
        animalesAplicados: participantes.slice(0, 10).map((item) => item.animal)
    }), 'PARCIAL');
    assert.equal(evaluarEstadoPasoIatf({
        participantes: participantes.map((item) => ({ ...item, estadoParticipacion: 'INSEMINADA', fechaInseminacion: new Date() })),
        animalesAplicados: participantes.map((item) => item.animal)
    }), 'REALIZADO');
});

test('los costos no mezclan CRC y USD en un total engañoso', () => {
    const metricas = calcularMetricasCampana({
        participantes: [{ estadoParticipacion: 'INSEMINADA', fechaInseminacion: new Date(), resultadoActual: 'PREÑADA', semenSnapshot: { costoUnitario: 25, moneda: 'USD' } }],
        costosAdicionales: { veterinario: 10000, moneda: 'CRC' }
    }, [], []);
    assert.equal(metricas.costoTotal, null);
    assert.equal(metricas.costoPorPrenez, null);
    assert.deepEqual(metricas.costosPorMoneda, { USD: 25, CRC: 10000 });
});

test('los modelos IATF quedan aislados y preservan diagnósticos múltiples', () => {
    [CampanaIATF, DiagnosticoGestacionIATF, EjecucionPasoIATF, InsumoReproductivo, PlantillaProtocoloIATF].forEach((Modelo) => {
        assert.ok(Modelo.schema.path('organizacionId'));
    });
    assert.ok(CampanaIATF.schema.path('fincaId'));
    assert.ok(DiagnosticoGestacionIATF.schema.path('fincaId'));
    assert.ok(DiagnosticoGestacionIATF.schema.indexes().some(([campos]) => campos.campanaIATF === 1 && campos.animal === 1 && campos.fecha === -1));
});

test('la integración reproductiva distingue IATF sin crear destete ni secado', () => {
    assert.ok(RegistroReproductivo.schema.path('tipoInseminacion').enumValues.includes('IATF'));
    assert.ok(RegistroReproductivo.schema.path('campanaIATF'));
    assert.ok(RegistroReproductivo.schema.path('origenGestacion').enumValues.includes('INDETERMINADO'));
    assert.equal(RegistroReproductivo.schema.path('fechaSecado'), undefined);
});

test('una IATF no declara gestación ni calcula parto antes del diagnóstico', () => {
    const registro = {
        especie: 'Bovino',
        tipoInseminacion: 'IATF',
        fechaInseminacion: new Date('2026-10-01T00:00:00.000Z'),
        fechaMonta: new Date('2026-10-01T00:00:00.000Z'),
        gestacionConfirmada: false
    };
    completarFechasYEstado(registro);
    assert.equal(registro.estado, 'Inseminada pendiente diagnóstico');
    assert.equal(registro.fechaPartoEstimada, undefined);
    assert.equal(registro.fechaDestete, undefined);
});

test('la fecha probable admite una duración configurada distinta de 283', () => {
    assert.equal(sumarDiasUtc('2026-10-01T00:00:00.000Z', 290).toISOString(), '2027-07-18T00:00:00.000Z');
});
