const test = require('node:test');
const assert = require('node:assert/strict');

const {
    analizarBovinos,
    analizarPorcinos,
    resumirBovinos,
    resumirPorcinos
} = require('../services/reportePesoDestete-service');

test('el reporte básico bovino conserva cobertura y no convierte pesos faltantes en cero', () => {
    const resumen = resumirBovinos([
        {
            _id: 'bovino-1',
            diio: '1001',
            sexo: 'Macho',
            fechaNacimiento: '2026-01-01',
            fechaDestete: '2026-07-20',
            pesoNacimiento: 35,
            pesoDestete: 235
        },
        {
            _id: 'bovino-2',
            diio: '1002',
            sexo: 'Hembra',
            fechaNacimiento: '2026-01-01',
            fechaDestete: '2026-07-20'
        }
    ]);

    assert.equal(resumen.totalDestetados, 2);
    assert.equal(resumen.conPeso, 1);
    assert.equal(resumen.coberturaPeso, 50);
    assert.equal(resumen.pesos.promedio, 235);
    assert.equal(resumen.detalle[1].pesoDestete, null);
});

test('el análisis bovino calcula equivalente a 205 días solo dentro de 160 a 250 días', () => {
    const resumen = resumirBovinos([
        {
            _id: 'bovino-valido',
            diio: '1001',
            sexo: 'Macho',
            fechaNacimiento: '2026-01-01',
            fechaDestete: '2026-07-20',
            pesoNacimiento: 35,
            pesoDestete: 235
        },
        {
            _id: 'bovino-fuera-rango',
            diio: '1002',
            sexo: 'Hembra',
            fechaNacimiento: '2026-01-01',
            fechaDestete: '2026-04-11',
            pesoNacimiento: 30,
            pesoDestete: 120
        }
    ]);
    const analisis = analizarBovinos(resumen);

    assert.equal(analisis.elegibles205, 1);
    assert.equal(analisis.fueraRango205, 1);
    assert.equal(analisis.pesoEquivalente205.promedio, 240);
    assert.equal(analisis.detalle[1].pesoEquivalente205, null);
});

test('el peso porcino básico se pondera por cantidad de lechones destetados', () => {
    const resumen = resumirPorcinos([
        {
            _id: 'camada-1',
            codigoCamada: 'CAM-1',
            fechaNacimiento: '2026-01-01',
            fechaDesteteReal: '2026-01-29',
            destetados: 10,
            pesoTotalDestete: 100
        },
        {
            _id: 'camada-2',
            codigoCamada: 'CAM-2',
            fechaNacimiento: '2026-02-01',
            fechaDesteteReal: '2026-02-22',
            destetados: 5,
            pesoPromedioDestete: 8
        }
    ]);

    assert.equal(resumen.totalDestetados, 15);
    assert.equal(resumen.criasConPeso, 15);
    assert.equal(resumen.pesoPromedioPonderado, 9.33);
});

test('el análisis porcino aplica factores de 21 días solo entre 14 y 28 días', () => {
    const resumen = resumirPorcinos([
        {
            _id: 'camada-valida',
            codigoCamada: 'CAM-1',
            fechaNacimiento: '2026-01-01',
            fechaDesteteReal: '2026-01-29',
            nacidosVivos: 12,
            destetados: 10,
            pesoPromedioNacimiento: 1.5,
            pesoTotalDestete: 100
        },
        {
            _id: 'camada-fuera-rango',
            codigoCamada: 'CAM-2',
            fechaNacimiento: '2026-02-01',
            fechaDesteteReal: '2026-03-04',
            nacidosVivos: 10,
            destetados: 8,
            pesoTotalDestete: 80
        }
    ]);
    const analisis = analizarPorcinos(resumen);

    assert.equal(analisis.elegibles21, 1);
    assert.equal(analisis.fueraRango21, 1);
    assert.equal(analisis.pesoCamada21.promedio, 82);
    assert.equal(analisis.pesoPromedioLechon21, 8.2);
    assert.equal(analisis.detalle[1].pesoCamada21, null);
});
