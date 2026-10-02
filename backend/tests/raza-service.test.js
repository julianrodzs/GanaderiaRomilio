const test = require('node:test');
const assert = require('node:assert/strict');
const {
    analizarDescripcionRacial,
    determinarGrupoRacial,
    normalizarFraccionRacial,
    obtenerCatalogoRacial,
    prepararDatosRaciales
} = require('../services/raza-service');

test('normaliza Brahman histórico y su error ortográfico frecuente', () => {
    assert.equal(analizarDescripcionRacial('brahman').razaPrincipal, 'Brahman');
    assert.equal(analizarDescripcionRacial('BRAHAMAN').razaPrincipal, 'Brahman');
    assert.equal(analizarDescripcionRacial('Brahman Registro').gradoRacial, 'Puro / Registrado');
    assert.equal(analizarDescripcionRacial('CRUCE NELOR').razaPrincipal, 'Nelore');
});

test('no adivina la segunda raza de Brahman cruzado', () => {
    const resultado = analizarDescripcionRacial('Brahman cruzado');
    assert.equal(resultado.razaSecundaria, null);
    assert.equal(resultado.gradoRacial, 'Cruce no definido');
    assert.equal(resultado.grupoRacial, 'Cruce cebú no definido');
    assert.equal(analizarDescripcionRacial('Brahman Cruza').grupoRacial, 'Cruce cebú no definido');
});

test('clasifica cruces conocidos y razas sintéticas', () => {
    assert.equal(determinarGrupoRacial({ razaPrincipal: 'Brahman', razaSecundaria: 'Angus' }), 'Cebú × Europeo');
    assert.equal(determinarGrupoRacial({ razaPrincipal: 'Brahman', razaSecundaria: 'Nelore' }), 'Cebuino');
    assert.equal(determinarGrupoRacial({ razaPrincipal: 'Brahman', razaSecundaria: 'Senepol' }), 'Cebú × Tropical adaptado');
    assert.equal(determinarGrupoRacial({ razaPrincipal: 'Brangus' }), 'Sintético');
});

test('conserva un texto racial no reconocido para revisión', () => {
    const resultado = prepararDatosRaciales({ especie: 'Bovino', raza: 'Cruce de la casa' });
    assert.equal(resultado.raza, 'Cruce de la casa');
    assert.equal(resultado.descripcionRacial, 'Cruce de la casa');
    assert.equal(resultado.razaPrincipal, 'Otra');
});

test('normaliza las principales razas porcinas sin mezclarlas con bovinos', () => {
    assert.equal(analizarDescripcionRacial('Yorkshire', 'Porcino').razaPrincipal, 'Large White (Yorkshire)');
    assert.equal(analizarDescripcionRacial('Pietrain', 'Porcino').razaPrincipal, 'Pietrain');
    assert.equal(analizarDescripcionRacial('PIETRAN CRUZA', 'Porcino').razaPrincipal, 'Pietrain');
    assert.equal(analizarDescripcionRacial('LANDRA CRUZA', 'Porcino').razaPrincipal, 'Landrace');
    assert.equal(analizarDescripcionRacial('DUROCK/LANDRACE', 'Porcino').razaPrincipal, 'Duroc');
    assert.equal(analizarDescripcionRacial('CRUZA', 'Porcino').razaPrincipal, 'Mestizo / Cruce no definido');
    assert.equal(analizarDescripcionRacial('Duroc con Landrace', 'Porcino').razaSecundaria, 'Landrace');
    assert.ok(obtenerCatalogoRacial('Porcino').razas.includes('Hampshire'));
    assert.ok(!obtenerCatalogoRacial('Porcino').razas.includes('Brahman'));
});

test('guarda fracciones raciales opcionales como información estructurada', () => {
    const resultado = prepararDatosRaciales({
        especie: 'Porcino',
        razaPrincipal: 'Duroc',
        razaSecundaria: 'Landrace',
        fraccionRazaPrincipal: ' 3 / 8 ',
        fraccionRazaSecundaria: '10/16'
    });
    assert.equal(resultado.fraccionRazaPrincipal, '3/8');
    assert.equal(resultado.fraccionRazaSecundaria, '5/8');
    assert.equal(resultado.composicionRacial, '3/8 Duroc + 5/8 Landrace');
    assert.equal(normalizarFraccionRacial('6/8'), '3/4');
    assert.throws(() => normalizarFraccionRacial('tres octavos'), /formato 3\/8/);
});
