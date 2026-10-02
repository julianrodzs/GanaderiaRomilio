const test = require('node:test');
const assert = require('node:assert/strict');
const {
    construirReporteDescendencia,
    construirReporteRacial
} = require('../services/reportesRazaGenealogia-service');

test('agrupa el reporte racial en grupo y detalle', () => {
    const reporte = construirReporteRacial([
        { especie: 'Bovino', razaPrincipal: 'Brahman', grupoRacial: 'Cebuino' },
        { especie: 'Bovino', razaPrincipal: 'Brahman', razaSecundaria: 'Angus', grupoRacial: 'Cebú × Europeo' },
        { especie: 'Porcino', raza: 'Yorkshire' }
    ]);
    assert.equal(reporte.resumen.totalBovinos, 2);
    assert.equal(reporte.porGrupo.find((item) => item.grupoRacial === 'Cebú × Europeo').detalles[0].detalle, 'Brahman × Angus');
});

test('deriva partos y crías por separado con compatibilidad DIIO', () => {
    const vaca = { _id: 'vaca1', especie: 'Bovino', sexo: 'Hembra', categoria: 'Vaca', diio: '1001', fechaNacimiento: '2020-01-01' };
    const toro = { _id: 'toro1', especie: 'Bovino', sexo: 'Macho', categoria: 'Toro', diio: '2001' };
    const animales = [
        vaca,
        toro,
        { _id: 'cria1', especie: 'Bovino', sexo: 'Macho', madre: 'vaca1', padre: 'toro1', fechaNacimiento: '2026-03-01', estado: 'Activo' },
        { _id: 'cria2', especie: 'Bovino', sexo: 'Hembra', madreDiio: '1001', padreDiio: '2001', fechaNacimiento: '2026-03-01', estado: 'Vendido' }
    ];
    const reporte = construirReporteDescendencia({
        animales,
        registros: [{ animal: 'vaca1', fechaPartoReal: '2026-03-01', estado: 'Parida' }],
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31')
    });
    assert.equal(reporte.vacas[0].partosRegistrados, 1);
    assert.equal(reporte.vacas[0].criasRegistradas, 2);
    assert.equal(reporte.toros[0].madresDiferentes, 1);
    assert.equal(reporte.toros[0].criasRegistradas, 2);
});

test('incluye porcinos y fracciones en el reporte racial por especie', () => {
    const reporte = construirReporteRacial([
        { especie: 'Bovino', razaPrincipal: 'Brahman', grupoRacial: 'Cebuino' },
        {
            especie: 'Porcino',
            razaPrincipal: 'Duroc',
            razaSecundaria: 'Landrace',
            fraccionRazaPrincipal: '3/8',
            fraccionRazaSecundaria: '5/8',
            grupoRacial: 'Comercial internacional'
        }
    ], 'Porcino');
    assert.equal(reporte.resumen.totalAnimales, 1);
    assert.equal(reporte.resumen.totalPorcinos, 1);
    assert.equal(reporte.porGrupo[0].detalles[0].detalle, '3/8 Duroc × 5/8 Landrace');
});
