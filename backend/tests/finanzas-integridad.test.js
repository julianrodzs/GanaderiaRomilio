const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizarMovimientoManual } = require('../services/movimientoFinanciero-dto');
const {
    esMovimientoFinancieroAutomatico,
    presentarMovimientoFinanciero
} = require('../services/movimientoFinanciero-proteccion-service');
const { preservarIdentidadAnimalesCompra } = require('../services/compraAnimal-integridad-service');
const Costo = require('../models/Costo');

test('el DTO financiero acepta negocio y rechaza tenant, origen y operadores MongoDB', () => {
    assert.deepEqual(sanitizarMovimientoManual({ descripcion: 'Sal', monto: 1000, desconocido: true }), {
        descripcion: 'Sal', monto: 1000
    });
    assert.throws(() => sanitizarMovimientoManual({ fincaId: 'ajena', monto: 1 }), /sesión autenticada/);
    assert.throws(() => sanitizarMovimientoManual({ referenciaModelo: 'CompraAnimal' }), /registro manual de Finanzas/);
    assert.throws(() => sanitizarMovimientoManual({ $set: { monto: 1 } }), /no está permitida/);
    assert.throws(() => sanitizarMovimientoManual({ 'proveedor.nombre': 'Inyectado' }), /no está permitida/);
});

test('compras, ventas y operaciones multi-finca son de solo lectura en Finanzas', () => {
    assert.equal(esMovimientoFinancieroAutomatico({ referenciaModelo: 'CompraAnimal' }), true);
    assert.equal(esMovimientoFinancieroAutomatico({ referenciaModelo: 'VentaAnimal' }), true);
    assert.equal(esMovimientoFinancieroAutomatico({ alcanceFinanciero: 'TRANSFERENCIA_INTERNA' }), true);
    assert.equal(esMovimientoFinancieroAutomatico({ alcanceFinanciero: 'GASTO_COMPARTIDO' }), true);
    assert.equal(esMovimientoFinancieroAutomatico({ alcanceFinanciero: 'EXTERNO' }), false);
    assert.equal(presentarMovimientoFinanciero({ descripcion: 'Manual' }).soloLectura, false);
});

test('editar una compra conserva los IDs e identidad original de sus animales', () => {
    const actuales = [
        { animal: 'animal-1', diio: '1001', identificadorFinca: '1001', nombre: 'Luna', sexo: 'Hembra', pesoCompraKg: 300, precioKg: 1000 },
        { animal: 'animal-2', diio: '1002', identificadorFinca: '1002', nombre: 'Sol', sexo: 'Macho', pesoCompraKg: 320, precioKg: 1000 }
    ];
    const editados = preservarIdentidadAnimalesCompra([
        { animal: 'animal-1', diio: 'ALTERADO', pesoCompraKg: 305, precioKg: 1100 },
        { animal: 'animal-2', pesoCompraKg: 325, precioKg: 1200 }
    ], actuales);

    assert.deepEqual(editados.map((item) => item.animal), ['animal-1', 'animal-2']);
    assert.equal(editados[0].diio, '1001');
    assert.equal(editados[0].nombre, 'Luna');
    assert.equal(editados[0].pesoCompraKg, 305);
    assert.throws(() => preservarIdentidadAnimalesCompra([editados[0]], actuales), /agregar ni quitar/);
});

test('Costo queda marcado como legado y MovimientoFinanciero es la fuente vigente', () => {
    assert.equal(Costo.esModeloLegado, true);
    assert.equal(Costo.modeloReemplazo, 'MovimientoFinanciero');
});
