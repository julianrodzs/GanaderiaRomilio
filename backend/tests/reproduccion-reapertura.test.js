const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { Tarea } = require('../models/Tarea');
const { crearDefinicionesTareasPorcinas } = require('../services/reproduccionPorcina-service');

const definiciones = (desplazamientoDias = 0) => {
    const sumar = (dias) => new Date(Date.UTC(2026, 0, 1 + dias + desplazamientoDias));
    return crearDefinicionesTareasPorcinas({
        registro: {
            _id: new mongoose.Types.ObjectId(),
            asignadoA: new mongoose.Types.ObjectId(),
            fechaRevisionCelo: sumar(21),
            fechaDesparasitacionAntesParto: sumar(84),
            fechaAlimentoLactancia: sumar(99),
            fechaPartoEstimada: sumar(114),
            fechaInicioVentanaParto: sumar(111),
            fechaFinVentanaParto: sumar(117)
        },
        animal: { _id: new mongoose.Types.ObjectId(), diio: 'P-101' },
        usuarioId: new mongoose.Types.ObjectId()
    });
};

test('cambiar la fecha base desplaza tareas porcinas sin cambiar sus claves idempotentes', () => {
    const originales = definiciones(0);
    const desplazadas = definiciones(3);

    assert.deepEqual(originales.map((item) => item.claveAutomatica), desplazadas.map((item) => item.claveAutomatica));
    assert.equal(originales.length, desplazadas.length);
    originales.forEach((tarea, indice) => {
        const diferenciaDias = (desplazadas[indice].fechaProgramada - tarea.fechaProgramada) / 86400000;
        assert.equal(diferenciaDias, 3);
    });
});

test('Tarea identifica cancelaciones automáticas para reabrir solo las causadas por el cierre', () => {
    assert.ok(Tarea.schema.path('cancelacionAutomaticaOrigen'));
    assert.ok(Tarea.schema.path('canceladaAutomaticamenteEn'));
});
