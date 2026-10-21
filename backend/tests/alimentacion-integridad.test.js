const test = require('node:test');
const assert = require('node:assert/strict');
const PertenenciaLote = require('../models/PertenenciaLote');
const SuministroAlimentacion = require('../models/SuministroAlimentacion');
const Alimento = require('../models/Alimento');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const {
    sanitizarAlimento,
    sanitizarPlanAlimentacion,
    sanitizarRacion,
    validarVigenciaPlanAlimentacion
} = require('../services/alimentacion-integridad-service');
const { limitesDiaEnZona } = require('../services/fechaZonaHoraria-service');
const { requirePlanVigente } = require('../middleware/plan');
const {
    contarAnimalesLoteEnFecha,
    conversionHistoricaSinCambios,
    convertirAKg,
    inicializarCatalogo,
    validarFechaSuministro
} = require('../services/alimentacion-service');

test('los DTO de alimentación rechazan tenant, operadores y campos no permitidos', () => {
    assert.throws(() => sanitizarAlimento({ nombre: 'Sal', tipo: 'MINERAL', fincaId: 'ajena' }), /sesión autenticada/);
    assert.throws(() => sanitizarRacion({ nombre: 'Ración', '$set': { activo: false } }), /no está permitida/);
    assert.throws(() => sanitizarPlanAlimentacion({ nombre: 'Plan', 'activo.valor': true }), /no está permitida/);
    assert.throws(() => sanitizarAlimento({ nombre: 'Sal', tipo: 'MINERAL', secreto: true }), /Campos no permitidos/);
});

test('el DTO conserva exclusivamente campos de negocio permitidos', () => {
    const limpio = sanitizarAlimento({
        _id: 'solo-lectura',
        nombre: 'Sal mineral',
        tipo: 'MINERAL',
        activo: true,
        presentaciones: [{ _id: 'p1', nombre: 'Saco', unidad: 'SACO', cantidadBaseKg: 40, activo: true }]
    });
    assert.equal(limpio._id, undefined);
    assert.deepEqual(Object.keys(limpio).sort(), ['activo', 'nombre', 'presentaciones', 'tipo']);
    assert.equal(limpio.presentaciones[0].unidad, 'SACO');
});

test('un plan no admite una vigencia invertida o inválida', () => {
    assert.throws(() => validarVigenciaPlanAlimentacion({ vigenciaInicio: '2026-10-20', vigenciaFin: '2026-10-19' }), /fecha final/);
    assert.throws(() => validarVigenciaPlanAlimentacion({ vigenciaInicio: 'fecha-inválida' }), /fecha inválida/);
});

test('el catálogo base usa upserts idempotentes para sus 13 alimentos', async () => {
    const original = Alimento.bulkWrite;
    const llamadas = [];
    Alimento.bulkWrite = async (operaciones, opciones) => { llamadas.push({ operaciones, opciones }); };
    try {
        await ejecutarConOrganizacion('507f1f77bcf86cd799439011', async () => {
            await inicializarCatalogo();
            await inicializarCatalogo();
        }, '507f1f77bcf86cd799439012');
        assert.equal(llamadas.length, 2);
        assert.equal(llamadas[0].operaciones.length, 13);
        assert.equal(llamadas[0].opciones.ordered, false);
        assert.ok(llamadas[0].operaciones.every((item) => item.updateOne.upsert));
    } finally {
        Alimento.bulkWrite = original;
    }
});

test('el día operativo de Costa Rica usa límites UTC correctos', () => {
    const fecha = new Date('2026-10-19T15:00:00.000Z');
    const { inicio, finExclusivo } = limitesDiaEnZona(fecha, 'America/Costa_Rica');
    assert.equal(inicio.toISOString(), '2026-10-19T06:00:00.000Z');
    assert.equal(finExclusivo.toISOString(), '2026-10-20T06:00:00.000Z');
});

test('la población retroactiva consulta pertenencias activas en el instante de entrega', async () => {
    const original = PertenenciaLote.countDocuments;
    let filtroCapturado;
    PertenenciaLote.countDocuments = (filtro) => {
        filtroCapturado = filtro;
        return { session() { return this; }, then(resolve) { resolve(17); } };
    };
    try {
        const fecha = new Date('2026-10-05T14:00:00.000Z');
        const cantidad = await contarAnimalesLoteEnFecha('lote-1', fecha, {
            ahora: new Date('2026-10-19T14:00:00.000Z'),
            zonaHoraria: 'America/Costa_Rica'
        });
        assert.equal(cantidad, 17);
        assert.deepEqual(filtroCapturado.fechaEntrada, { $lte: fecha });
        assert.deepEqual(filtroCapturado.$or, [{ fechaSalida: null }, { fechaSalida: { $gt: fecha } }]);
        assert.equal(filtroCapturado.activo, undefined);
    } finally {
        PertenenciaLote.countDocuments = original;
    }
});

test('una entrega del día usa la membresía activa actual del lote', async () => {
    const original = PertenenciaLote.countDocuments;
    let filtroCapturado;
    PertenenciaLote.countDocuments = (filtro) => {
        filtroCapturado = filtro;
        return { session() { return this; }, then(resolve) { resolve(21); } };
    };
    try {
        await contarAnimalesLoteEnFecha('lote-1', new Date('2026-10-19T08:00:00.000-06:00'), {
            ahora: new Date('2026-10-19T18:00:00.000Z'),
            zonaHoraria: 'America/Costa_Rica'
        });
        assert.deepEqual(filtroCapturado, { lote: 'lote-1', activo: true });
    } finally {
        PertenenciaLote.countDocuments = original;
    }
});

test('cantidades nulas y fechas fuera del lote son rechazadas', () => {
    assert.throws(() => convertirAKg({ cantidad: 0, unidad: 'KG' }), /mayor a cero/);
    assert.throws(() => validarFechaSuministro(
        { fechaInicio: new Date('2026-10-10T00:00:00.000Z') },
        new Date('2026-10-09T23:59:59.000Z'),
        new Date('2026-10-19T00:00:00.000Z')
    ), /anterior al inicio/);
    assert.throws(() => validarFechaSuministro(
        { fechaInicio: new Date('2026-10-01T00:00:00.000Z') },
        new Date('2026-10-20T00:00:00.000Z'),
        new Date('2026-10-19T00:00:00.000Z')
    ), /fecha futura/);
});

test('editar una nota conserva la conversión histórica y cambiar cantidad obliga a recalcular', () => {
    const original = {
        cantidadIngresada: 2,
        unidadIngresada: 'SACO',
        presentacionId: 'presentacion-40',
        factorConversionKgSnapshot: 40,
        cantidadKg: 80
    };
    assert.equal(conversionHistoricaSinCambios(original, {
        cantidadIngresada: 2,
        unidadIngresada: 'SACO',
        presentacionId: 'presentacion-40',
        observaciones: 'Nota corregida'
    }), true);
    assert.equal(conversionHistoricaSinCambios(original, {
        cantidadIngresada: 3,
        unidadIngresada: 'SACO',
        presentacionId: 'presentacion-40'
    }), false);
});

test('el suministro tiene una clave idempotente única por finca', () => {
    const indice = SuministroAlimentacion.schema.indexes().find(([campos]) => campos.claveIdempotencia === 1);
    assert.ok(indice);
    assert.equal(indice[1].unique, true);
    assert.deepEqual(indice[1].partialFilterExpression, { claveIdempotencia: { $type: 'string' } });
});

test('el middleware de alimentación bloquea una suscripción suspendida', async () => {
    const middleware = requirePlanVigente({
        obtenerPlanActual: async () => ({
            vigente: false,
            estado: 'Suspendido',
            vigencia: { code: 'PLAN_SUBSCRIPTION_INACTIVE', estadoOrganizacion: 'Activa' }
        })
    });
    let siguiente = false;
    const respuesta = {
        codigo: null,
        cuerpo: null,
        status(codigo) { this.codigo = codigo; return this; },
        json(cuerpo) { this.cuerpo = cuerpo; return this; }
    };
    await middleware({ organizacionId: 'org-1' }, respuesta, () => { siguiente = true; });
    assert.equal(siguiente, false);
    assert.equal(respuesta.codigo, 403);
    assert.equal(respuesta.cuerpo.code, 'PLAN_SUBSCRIPTION_INACTIVE');
});
