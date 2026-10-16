const test = require('node:test');
const assert = require('node:assert/strict');

const { rolTienePermiso } = require('../config/permisosRoles');
const {
    filtrarDatosComerciales,
    puedeVerDatosComerciales,
    serializarEventoParaRol
} = require('../services/eventoAnimal-privacidad-service');

test('Veterinario puede crear notas de bitacora sin acceso comercial', () => {
    assert.equal(rolTienePermiso('Veterinario', 'bitacora.crearNotas'), true);
    assert.equal(puedeVerDatosComerciales('Veterinario'), false);
    assert.equal(rolTienePermiso('Trabajador', 'bitacora.crearNotas'), false);
});

test('serializador oculta comprador, montos y precios a roles operativos', () => {
    const evento = {
        _id: 'evento-1',
        tipoEvento: 'Venta',
        moduloOrigen: 'Ventas',
        titulo: 'Animal vendido',
        descripcion: 'Venta por ₡850 000 a Ganadera XYZ.',
        metadata: {
            comprador: 'Ganadera XYZ',
            montoAsignado: 850000,
            precioKg: 1700,
            pesoVentaKg: 500,
            nested: { moneda: 'CRC', datoClinico: 'Sin lesiones' }
        }
    };

    const resultado = serializarEventoParaRol(evento, 'Trabajador');

    assert.equal(resultado.descripcion, 'Salida de inventario registrada.');
    assert.equal(resultado.metadata.comprador, undefined);
    assert.equal(resultado.metadata.montoAsignado, undefined);
    assert.equal(resultado.metadata.precioKg, undefined);
    assert.equal(resultado.metadata.pesoVentaKg, 500);
    assert.equal(resultado.metadata.nested.moneda, undefined);
    assert.equal(resultado.metadata.nested.datoClinico, 'Sin lesiones');
    assert.equal(resultado.metadata.datosComercialesOcultos, true);
});

test('roles comerciales conservan el detalle original', () => {
    const evento = {
        tipoEvento: 'Compra',
        moduloOrigen: 'Compras',
        descripcion: 'Compra a Proveedor Uno por ₡100 000.',
        metadata: { proveedor: 'Proveedor Uno', monto: 100000 }
    };

    assert.equal(puedeVerDatosComerciales('Encargado'), true);
    assert.deepEqual(serializarEventoParaRol(evento, 'Encargado'), evento);
});

test('filtro comercial conserva arreglos y datos operativos', () => {
    const resultado = filtrarDatosComerciales({
        aplicaciones: [{ producto: 'Vacuna A', proveedorCompra: 'Privado', dosis: '2 ml' }]
    });

    assert.deepEqual(resultado, {
        aplicaciones: [{ producto: 'Vacuna A', dosis: '2 ml' }]
    });
});
