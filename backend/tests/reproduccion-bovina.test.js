const test = require('node:test');
const assert = require('node:assert/strict');

const {
    calcularProximoCelo,
    completarFechasYEstado
} = require('../models/RegistroReproductivo');
const {
    crearDefinicionesTareasBovinas,
    esSeguimientoBovinoVigente
} = require('../services/reproduccionBovina-service');
const Animal = require('../models/Animal');

test('el parto real calcula revisión de celo a 60 días y destete a 7 meses', () => {
    const datos = {
        especie: 'Bovino',
        fechaPartoReal: new Date('2099-01-10T00:00:00.000Z')
    };

    completarFechasYEstado(datos);

    assert.equal(datos.fechaProximoCelo.toISOString().slice(0, 10), '2099-03-11');
    assert.equal(datos.fechaDestete.toISOString().slice(0, 10), '2099-08-10');
});

test('una estimación de celo vencida avanza en ciclos de 21 días', () => {
    const parto = new Date('2020-01-01T00:00:00.000Z');
    const proximo = calcularProximoCelo(parto);
    const diferenciaDias = Math.round((proximo.getTime() - parto.getTime()) / (24 * 60 * 60 * 1000));
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);

    assert.ok(proximo >= hoy);
    assert.equal((diferenciaDias - 60) % 21, 0);
});

test('un ciclo bovino cerrado con parto conserva el seguimiento posparto', () => {
    assert.equal(esSeguimientoBovinoVigente({
        estadoCiclo: 'Cerrado',
        activoParaAlertas: false,
        fechaPartoReal: new Date()
    }), true);
    assert.equal(esSeguimientoBovinoVigente({ estadoCiclo: 'Cancelado', fechaPartoReal: new Date() }), false);
    assert.equal(esSeguimientoBovinoVigente({ estadoCiclo: 'No preñada' }), false);
});

test('las tareas posparto separan el celo de la madre y el destete del ternero', () => {
    const madre = { _id: 'madre-1', diio: '1001' };
    const ternero = { _id: 'ternero-1', diio: '2001' };
    const tareas = crearDefinicionesTareasBovinas({
        registro: {
            _id: 'ciclo-1',
            asignadoA: 'usuario-1',
            fechaPartoReal: new Date('2026-10-02T00:00:00.000Z'),
            fechaProximoCelo: new Date('2026-12-01T00:00:00.000Z'),
            fechaDestete: new Date('2027-05-02T00:00:00.000Z')
        },
        animal: madre,
        ternero,
        usuarioId: 'usuario-1'
    });

    assert.deepEqual(tareas.map((tarea) => tarea.claveAutomatica), ['proximo-celo', 'destete']);
    assert.equal(tareas.find((tarea) => tarea.claveAutomatica === 'proximo-celo').animal, madre._id);
    assert.equal(tareas.find((tarea) => tarea.claveAutomatica === 'destete').animal, ternero._id);
});

test('el animal separa el destete estimado del destete real', () => {
    assert.ok(Animal.schema.path('fechaDesteteEstimada'));
    assert.ok(Animal.schema.path('fechaDestete'));
});
