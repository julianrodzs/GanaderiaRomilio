const test = require('node:test');
const assert = require('node:assert/strict');
const {
    analizarDescripcionRacial,
    determinarGrupoRacial,
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
