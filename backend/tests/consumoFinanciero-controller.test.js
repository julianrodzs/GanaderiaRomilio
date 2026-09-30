const test = require('node:test');
const assert = require('node:assert/strict');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const movimientoFinancieroCtrl = require('../controllers/movimientoFinanciero-controller');
const reporteCtrl = require('../controllers/reporte-controller');
const { normalizarUnidad } = require('../services/normalizacionFinanciera-service');

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

test('el resumen de consumo excluye ventas y otros movimientos que no son compras', async () => {
    const aggregateOriginal = MovimientoFinanciero.aggregate;
    let filtroAplicado;
    MovimientoFinanciero.aggregate = async (pipeline) => {
        filtroAplicado = pipeline[0].$match;
        return [];
    };

    try {
        const res = crearRespuesta();
        await movimientoFinancieroCtrl.getResumenConsumo({ query: {} }, res);

        assert.equal(res.statusCode, 200);
        assert.equal(filtroAplicado.naturaleza, 'Egreso');
        assert.equal(filtroAplicado.tipoMovimiento, 'Compra');
    } finally {
        MovimientoFinanciero.aggregate = aggregateOriginal;
    }
});

test('los reportes de productos usan solamente compras que representan egresos', async () => {
    const aggregateOriginal = MovimientoFinanciero.aggregate;
    const filtrosAplicados = [];
    MovimientoFinanciero.aggregate = async (pipeline) => {
        filtrosAplicados.push(pipeline[0].$match);
        return [];
    };

    try {
        const res = crearRespuesta();
        await reporteCtrl.getProductosResumen({ query: {} }, res);

        assert.equal(res.statusCode, 200);
        assert.equal(filtrosAplicados.length, 5);
        filtrosAplicados.forEach((filtro) => {
            assert.equal(filtro.naturaleza, 'Egreso');
            assert.equal(filtro.tipoMovimiento, 'Compra');
        });
    } finally {
        MovimientoFinanciero.aggregate = aggregateOriginal;
    }
});

test('el detalle de productos pagina en base de datos y devuelve metadatos', async () => {
    const aggregateOriginal = MovimientoFinanciero.aggregate;
    let pipelineAplicado;
    MovimientoFinanciero.aggregate = async (pipeline) => {
        pipelineAplicado = pipeline;
        return [{
            datos: [{ producto: 'SAL MINERAL', montoTotal: 1000 }],
            conteo: [{ total: 26 }]
        }];
    };

    try {
        const res = crearRespuesta();
        await reporteCtrl.getProductosPorProducto({ query: { pagina: '2', limite: '10' } }, res);

        const facet = pipelineAplicado.find((etapa) => etapa.$facet)?.$facet;
        assert.deepEqual(facet.datos, [{ $skip: 10 }, { $limit: 10 }]);
        assert.deepEqual(res.body.datos, [{ producto: 'SAL MINERAL', montoTotal: 1000 }]);
        assert.deepEqual(res.body.paginacion, {
            pagina: 2,
            limite: 10,
            total: 26,
            totalPaginas: 3
        });
    } finally {
        MovimientoFinanciero.aggregate = aggregateOriginal;
    }
});

test('normaliza presentaciones con o sin multiplicador explicito', () => {
    assert.deepEqual(normalizarUnidad({ unidad: '46 KG', cantidad: 40 }), {
        unidadNormalizada: 'KG',
        factorUnidad: 46,
        cantidadFisica: 1840
    });
    assert.deepEqual(normalizarUnidad({ unidad: '46 x KG', cantidad: 40 }), {
        unidadNormalizada: 'KG',
        factorUnidad: 46,
        cantidadFisica: 1840
    });
});
