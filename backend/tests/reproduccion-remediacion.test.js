const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Animal = require('../models/Animal');
const EventoAnimal = require('../models/EventoAnimal');
const { Tarea } = require('../models/Tarea');
const { completarFechasYEstado } = require('../models/RegistroReproductivo');
const { calcularMetricasCampana, validarPlantilla } = require('../services/iatf-service');
const { validarRelacionGenealogica } = require('../services/genealogiaService');
const { prepararPasos } = require('../services/protocoloPorcino-service');
const { conciliarCicloVacioActivo } = require('../services/reproduccion-service');
const {
    limpiarActualizarRegistroReproductivo,
    limpiarCrearRegistroReproductivo
} = require('../services/reproduccion-dto-service');

test('el DTO reproductivo rechaza operadores Mongo y campos internos', () => {
    assert.throws(
        () => limpiarActualizarRegistroReproductivo({ $set: { estadoCiclo: 'Activo' } }),
        (error) => error.code === 'REPRODUCCION_OPERADOR_MONGO_RECHAZADO'
    );
    assert.throws(
        () => limpiarCrearRegistroReproductivo({ animal: 'a', 'semenSnapshot.toro': 'X' }),
        (error) => error.code === 'REPRODUCCION_OPERADOR_MONGO_RECHAZADO'
    );
    assert.throws(
        () => limpiarActualizarRegistroReproductivo({ organizacionId: 'otra', estadoCiclo: 'Activo' }),
        (error) => error.code === 'REPRODUCCION_DTO_INVALIDO'
    );
});

test('un diagnóstico VACIA cierra el ciclo y no recalcula una fecha de parto', () => {
    const registro = {
        especie: 'Bovino',
        fechaMonta: new Date('2026-01-01T00:00:00.000Z'),
        fechaPartoEstimada: new Date('2026-10-11T00:00:00.000Z'),
        resultadoDiagnosticoGestacion: 'VACIA',
        estadoCiclo: 'Activo',
        activoParaAlertas: true,
        gestacionConfirmada: true
    };
    completarFechasYEstado(registro);
    assert.equal(registro.estadoCiclo, 'No preñada');
    assert.equal(registro.activoParaAlertas, false);
    assert.equal(registro.gestacionConfirmada, false);
    assert.equal(registro.fechaPartoEstimada, undefined);
    assert.equal(registro.estado, 'Vacía');
});

test('un ciclo VACIA legado se concilia antes de abrir un nuevo servicio', async () => {
    const originales = { actualizar: Tarea.updateMany, crearEvento: EventoAnimal.create };
    let tareasCanceladas = false;
    let eventoCreado = false;
    Tarea.updateMany = async () => { tareasCanceladas = true; };
    EventoAnimal.create = async () => { eventoCreado = true; };
    const ciclo = {
        _id: new mongoose.Types.ObjectId(),
        animal: new mongoose.Types.ObjectId(),
        resultadoDiagnosticoGestacion: 'VACIA',
        estadoCiclo: 'Activo',
        activoParaAlertas: true,
        gestacionConfirmada: true,
        fechaPartoEstimada: new Date('2026-10-01T00:00:00.000Z'),
        save: async () => ciclo
    };
    try {
        assert.equal(await conciliarCicloVacioActivo({ ciclo, usuarioId: new mongoose.Types.ObjectId() }), true);
        assert.equal(ciclo.estadoCiclo, 'No preñada');
        assert.equal(ciclo.activoParaAlertas, false);
        assert.equal(ciclo.fechaPartoEstimada, undefined);
        assert.equal(tareasCanceladas, true);
        assert.equal(eventoCreado, true);
    } finally {
        Tarea.updateMany = originales.actualizar;
        EventoAnimal.create = originales.crearEvento;
    }
});

test('IATF multiplica pajuelas y deduplica diagnósticos de la misma hembra por fecha', () => {
    const animal = new mongoose.Types.ObjectId();
    const metricas = calcularMetricasCampana({
        participantes: [{
            animal,
            estadoParticipacion: 'INSEMINADA',
            fechaInseminacion: new Date('2026-01-01T00:00:00.000Z'),
            resultadoActual: 'PREÑADA',
            semenSnapshot: { costoUnitario: 10, cantidad: 3, moneda: 'USD' }
        }]
    }, [
        { animal, fecha: new Date('2026-02-01T00:00:00.000Z'), resultado: 'DUDOSA', createdAt: new Date('2026-02-01T08:00:00.000Z') },
        { animal, fecha: new Date('2026-02-01T00:00:00.000Z'), resultado: 'PREÑADA', createdAt: new Date('2026-02-01T09:00:00.000Z') }
    ]);
    assert.equal(metricas.costoSemen, 30);
    assert.equal(metricas.costosPorMoneda.USD, 30);
    assert.deepEqual(metricas.diagnosticosPorFecha, [{
        fecha: '2026-02-01',
        diagnosticadas: 1,
        prenadas: 1,
        pAI: 100
    }]);
});

test('la genealogía rechaza progenitores de especies diferentes', async () => {
    const padreId = new mongoose.Types.ObjectId();
    const madreId = new mongoose.Types.ObjectId();
    const originales = Animal.findById;
    const animales = new Map([
        [String(padreId), { _id: padreId, sexo: 'Macho', especie: 'Porcino' }],
        [String(madreId), { _id: madreId, sexo: 'Hembra', especie: 'Bovino' }]
    ]);
    Animal.findById = (id) => ({
        select: () => ({ lean: async () => animales.get(String(id)) || null })
    });
    try {
        await assert.rejects(
            validarRelacionGenealogica(null, padreId, madreId, 'Bovino'),
            /misma especie/
        );
    } finally {
        Animal.findById = originales;
    }
});

test('un protocolo porcino no puede iniciar con una tarea sin fecha base', () => {
    assert.throws(() => prepararPasos([{
        nombre: 'Diagnóstico',
        tipoAccion: 'DIAGNOSTICO_GESTACION',
        orden: 1,
        referenciaTemporal: 'DESDE_EVENTO_REAL',
        eventoReferencia: 'IA',
        offsetHoras: 672,
        generaTarea: true
    }]), /primera tarea/);
});

test('una campaña IATF exige que su primera tarea quede en la fecha de inicio', () => {
    assert.throws(() => validarPlantilla({
        nombre: 'Inicio tardío',
        pasos: [{
            _id: new mongoose.Types.ObjectId(),
            nombre: 'Primera actividad',
            tipoAccion: 'CONTROL',
            referenciaTemporal: 'DESDE_INICIO',
            offsetHoras: 24,
            generaTarea: true
        }]
    }), /primera tarea/);
});
