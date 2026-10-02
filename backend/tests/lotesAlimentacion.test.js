const test = require('node:test');
const assert = require('node:assert/strict');
const Lote = require('../models/Lote');
const PertenenciaLote = require('../models/PertenenciaLote');
const AsignacionPlanAlimentacion = require('../models/AsignacionPlanAlimentacion');
const { validarAnimalParaLote } = require('../services/lote-service');
const { validarCompatibilidadPlanLote } = require('../services/planAlimentacion-service');
const { planesConfig } = require('../config/planes');
const HistorialEtapaLote = require('../models/HistorialEtapaLote');
const EventoLote = require('../models/EventoLote');
const RotacionPotrero = require('../models/RotacionPotrero');
const { Tarea } = require('../models/Tarea');
const { ETAPAS_LOTE } = require('../config/lotes');
const CompraAnimal = require('../models/CompraAnimal');
const { construirPrefijoCodigoLote } = require('../services/lote-service');

test('valida especie, estado y objetivo al ingresar un animal a un lote', () => {
    const lote = { especie: 'Bovino', proposito: 'ENGORDE' };
    assert.doesNotThrow(() => validarAnimalParaLote({ especie: 'Bovino', estado: 'Activo', objetivoProductivo: 'Engorde' }, lote));
    assert.throws(() => validarAnimalParaLote({ especie: 'Porcino', estado: 'Activo', objetivoProductivo: 'Engorde' }, lote), /especie/i);
    assert.throws(() => validarAnimalParaLote({ especie: 'Bovino', estado: 'Vendido', objetivoProductivo: 'Engorde', diio: '1' }, lote), /no está activo/i);
    assert.throws(() => validarAnimalParaLote({ especie: 'Bovino', estado: 'Activo', objetivoProductivo: 'Cría' }, lote), /no es compatible/i);
});

test('propósitos operativos sin objetivo equivalente no inventan compatibilidad', () => {
    assert.doesNotThrow(() => validarAnimalParaLote(
        { especie: 'Porcino', estado: 'Activo', objetivoProductivo: 'Engorde' },
        { especie: 'Porcino', proposito: 'CUARENTENA' }
    ));
});

test('un plan solo admite lotes activos de la misma especie y propósito', () => {
    const plan = { activo: true, especie: 'Porcino', proposito: 'ENGORDE' };
    assert.doesNotThrow(() => validarCompatibilidadPlanLote(plan, { codigo: 'P-1', estado: 'ACTIVO', especie: 'Porcino', proposito: 'ENGORDE' }));
    assert.throws(() => validarCompatibilidadPlanLote({ ...plan, activo: false }, { codigo: 'P-1', estado: 'ACTIVO', especie: 'Porcino', proposito: 'ENGORDE' }), /inactivo/i);
    assert.throws(() => validarCompatibilidadPlanLote(plan, { codigo: 'B-1', estado: 'ACTIVO', especie: 'Bovino', proposito: 'ENGORDE' }), /especie/i);
    assert.throws(() => validarCompatibilidadPlanLote(plan, { codigo: 'P-2', estado: 'ACTIVO', especie: 'Porcino', proposito: 'CRIA' }), /propósito/i);
});

test('los índices garantizan código de lote y una sola relación activa', () => {
    const indiceCodigo = Lote.schema.indexes().find(([campos]) => campos.organizacionId === 1 && campos.fincaId === 1 && campos.codigo === 1);
    const indicePertenencia = PertenenciaLote.schema.indexes().find(([campos, opciones]) => campos.animal === 1 && campos.organizacionId === 1 && opciones.unique);
    const indicePlan = AsignacionPlanAlimentacion.schema.indexes().find(([campos, opciones]) => campos.lote === 1 && campos.organizacionId === 1 && opciones.unique);
    assert.equal(indiceCodigo[1].unique, true);
    assert.equal(indicePertenencia[1].unique, true);
    assert.deepEqual(indicePertenencia[1].partialFilterExpression, { activo: true });
    assert.equal(indicePlan[1].unique, true);
    assert.deepEqual(indicePlan[1].partialFilterExpression, { activo: true });
});

test('lotes y planes de alimentación están disponibles en todos los planes comerciales', () => {
    Object.values(planesConfig).forEach((plan) => {
        assert.equal(plan.funcionalidades.lotes, true);
        assert.equal(plan.funcionalidades.planesAlimentacion, true);
    });
});

test('el lote separa propósito de etapa operativa y conserva historial', () => {
    assert.ok(ETAPAS_LOTE.includes('ADAPTACION'));
    assert.ok(ETAPAS_LOTE.includes('LISTO_VENTA'));
    assert.equal(Lote.schema.path('etapaOperativa').options.default, null);
    assert.equal(HistorialEtapaLote.schema.path('lote').options.ref, 'Lote');
    assert.equal(EventoLote.schema.path('lote').options.ref, 'Lote');
});

test('tareas y rotaciones pueden referenciar un lote sin perder compatibilidad histórica', () => {
    assert.equal(Tarea.schema.path('lote').options.ref, 'Lote');
    assert.equal(RotacionPotrero.schema.path('lote').instance, 'String');
    assert.equal(RotacionPotrero.schema.path('loteRef').options.ref, 'Lote');
    const indiceRotacion = RotacionPotrero.schema.indexes().find(([campos, opciones]) => campos.loteRef === 1 && opciones.unique);
    assert.ok(indiceRotacion);
    assert.equal(indiceRotacion[1].partialFilterExpression.estado, 'Activa');
});

test('la compra conserva objetivo por animal y una sola referencia de lote', () => {
    const detalleCompra = CompraAnimal.schema.path('animales').schema;
    assert.equal(detalleCompra.path('objetivoProductivo').options.default, 'SIN_DEFINIR');
    assert.equal(CompraAnimal.schema.path('loteAsignado').options.ref, 'Lote');
});

test('el lote rápido genera un prefijo legible por especie, propósito y año', () => {
    assert.equal(construirPrefijoCodigoLote('Bovino', 'ENGORDE', '2026-09-15'), 'BOV-ENG-2026');
    assert.equal(construirPrefijoCodigoLote('Porcino', 'REPRODUCCION', '2027-01-10'), 'POR-REP-2027');
});
