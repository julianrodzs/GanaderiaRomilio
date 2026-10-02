const test = require('node:test');
const assert = require('node:assert/strict');
const Animal = require('../models/Animal');
const Lote = require('../models/Lote');
const PertenenciaLote = require('../models/PertenenciaLote');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const { PlanSanitario } = require('../models/PlanSanitario');
const { TratamientoSanitario } = require('../models/TratamientoSanitario');
const {
    construirDatosEventoAplicacion,
    resolverAlcanceSanitario
} = require('../services/aplicacionSanitaria-service');

const consultaSeleccionable = (resultado) => ({
    select: () => Promise.resolve(resultado)
});

const consultaLista = (resultado) => ({
    select: () => ({ lean: () => Promise.resolve(resultado) })
});

test('los modelos sanitarios conservan el lote de origen', () => {
    assert.ok(PlanSanitario.schema.path('lote'));
    assert.ok(TratamientoSanitario.schema.path('lote'));
    assert.ok(AplicacionSanitaria.schema.path('lote'));
    assert.ok(AplicacionSanitaria.schema.path('loteCodigo'));
});

test('resuelve los animales desde pertenencias activas del lote', async (t) => {
    const originales = {
        lote: Lote.findById,
        pertenencias: PertenenciaLote.find,
        animales: Animal.find
    };
    t.after(() => {
        Lote.findById = originales.lote;
        PertenenciaLote.find = originales.pertenencias;
        Animal.find = originales.animales;
    });

    Lote.findById = () => consultaSeleccionable({ _id: 'lote-1', codigo: 'ENG-01', especie: 'Bovino', estado: 'ACTIVO' });
    PertenenciaLote.find = () => consultaLista([{ animal: 'animal-1' }, { animal: 'animal-2' }]);
    Animal.find = () => consultaSeleccionable([
        { _id: 'animal-1', especie: 'Bovino', estado: 'Activo' },
        { _id: 'animal-2', especie: 'Bovino', estado: 'Activo' }
    ]);

    const alcance = await resolverAlcanceSanitario({ lote: 'lote-1', especie: 'Bovino' }, { soloActivos: true });
    assert.equal(alcance.lote.codigo, 'ENG-01');
    assert.deepEqual(alcance.ids, ['animal-1', 'animal-2']);
});

test('rechaza operaciones sanitarias sobre un lote vacío', async (t) => {
    const originales = { lote: Lote.findById, pertenencias: PertenenciaLote.find };
    t.after(() => {
        Lote.findById = originales.lote;
        PertenenciaLote.find = originales.pertenencias;
    });
    Lote.findById = () => consultaSeleccionable({ _id: 'lote-1', codigo: 'ENG-01', especie: 'Bovino', estado: 'ACTIVO' });
    PertenenciaLote.find = () => consultaLista([]);

    await assert.rejects(
        resolverAlcanceSanitario({ lote: 'lote-1', especie: 'Bovino' }, { soloActivos: true }),
        /no tiene animales activos/
    );
});

test('la bitácora individual conserva el lote que originó la aplicación', () => {
    const evento = construirDatosEventoAplicacion({
        _id: 'aplicacion-1',
        animales: ['animal-1'],
        naturaleza: 'Aplicacion unica',
        fechaAplicacion: new Date('2026-10-02'),
        producto: 'Vitamina',
        lote: 'lote-1',
        loteCodigo: 'ENG-01'
    });
    assert.equal(evento.metadata.loteId, 'lote-1');
    assert.equal(evento.metadata.loteCodigo, 'ENG-01');
    assert.match(evento.descripcion, /Lote: ENG-01/);
});
