const test = require('node:test');
const assert = require('node:assert/strict');
const Animal = require('../models/Animal');
const Pesaje = require('../models/Pesaje');
const Camada = require('../models/Camada');
const ConfiguracionProductiva = require('../models/ConfiguracionProductiva');
const reporteCtrl = require('../controllers/reporte-controller');

const crearRespuesta = () => ({
    statusCode: 200,
    body: null,
    status(codigo) {
        this.statusCode = codigo;
        return this;
    },
    json(datos) {
        this.body = datos;
        return this;
    }
});

test('el crecimiento histórico filtra animales y pesajes por especie', async () => {
    const findAnimalOriginal = Animal.find;
    const findPesajeOriginal = Pesaje.find;
    let filtroAnimales;
    let filtroPesajes;

    Animal.find = (filtro) => {
        filtroAnimales = filtro;
        return {
            lean: async () => [{
                _id: 'porcino-1',
                especie: 'Porcino',
                estado: 'Activo',
                sexo: 'Macho',
                fechaNacimiento: '2026-09-01',
                pesoNacimiento: 1.4,
                diio: 'P-1'
            }]
        };
    };
    Pesaje.find = (filtro) => {
        filtroPesajes = filtro;
        return {
            sort: () => ({
                lean: async () => [
                    { animal: 'porcino-1', fecha: '2026-09-10', peso: 3 },
                    { animal: 'porcino-1', fecha: '2026-09-20', peso: 6 }
                ]
            })
        };
    };

    try {
        const res = crearRespuesta();
        await reporteCtrl.getCrecimientoPesajes({ query: { especie: 'Porcino' } }, res);

        assert.equal(res.statusCode, 200);
        assert.equal(filtroAnimales.especie, 'Porcino');
        assert.deepEqual(filtroPesajes.animal.$in, ['porcino-1']);
        assert.equal(res.body.resumen.totalPesajes, 2);
        assert.equal(res.body.crecimientoCrias[0].categoria, 'Lechón');
        assert.equal(res.body.crecimientoTerneros.length, 0);
    } finally {
        Animal.find = findAnimalOriginal;
        Pesaje.find = findPesajeOriginal;
    }
});

test('el endpoint de productividad porcina calcula camadas sin mezclar bovinos', async () => {
    const findCamadaOriginal = Camada.find;
    const findConfiguracionOriginal = ConfiguracionProductiva.findOneAndUpdate;
    Camada.find = () => ({
        lean: async () => [{ madre: 'm1', estado: 'Destetada', nacidosVivos: 10, destetados: 9 }]
    });
    ConfiguracionProductiva.findOneAndUpdate = async () => ({
        toObject: () => ({
            porcinosCria: {
                nacidosVivosObjetivoCamada: 12,
                destetadosObjetivoCamada: 11,
                supervivenciaPredesteteObjetivoPct: 90
            }
        })
    });

    try {
        const res = crearRespuesta();
        await reporteCtrl.getProductividadCria({ query: { especie: 'Porcino' } }, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.tipo, 'Porcino');
        assert.equal(res.body.supervivenciaPredestete, 90);
        assert.equal(res.body.icrp, 86.8);
        assert.equal(Object.hasOwn(res.body, 'ipg'), false);
    } finally {
        Camada.find = findCamadaOriginal;
        ConfiguracionProductiva.findOneAndUpdate = findConfiguracionOriginal;
    }
});

test('vacas a revisar declara que no aplica para el filtro porcino', async () => {
    const res = crearRespuesta();
    await reporteCtrl.getVacasImproductivas({ query: { especie: 'Porcino' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.aplica, false);
    assert.deepEqual(res.body.vacas, []);
});
