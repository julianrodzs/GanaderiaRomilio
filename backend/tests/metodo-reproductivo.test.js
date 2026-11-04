const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { catalogo, calcularAtribucion, validarMetodo, metodoLegado } = require('../services/metodoReproductivo-service');
const { analizarRegistro } = require('../scripts/migrar-metodo-reproductivo');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const id = () => new mongoose.Types.ObjectId();
test('el catalogo compartido limita IATF y TE a bovinos', () => {
    assert.deepEqual(catalogo, require('../../shared/metodos-reproductivos.json'));
    assert.deepEqual(catalogo, require('../../frontend/src/constants/metodosReproductivos.json'));
    assert.equal(Object.keys(catalogo).length, 5);
    assert.throws(() => validarMetodo('IATF', 'Porcino'), (e) => e.status === 400);
    assert.throws(() => validarMetodo('TRANSFERENCIA_EMBRIONES', 'Porcino'), (e) => e.status === 400);
    assert.equal(validarMetodo('IA_CONVENCIONAL', 'Porcino'), 'IA_CONVENCIONAL');
});
test('un unico servicio compatible se atribuye; dos se mantienen inciertos', () => {
    const a = id(), b = id();
    const r = { fechaPartoEstimada: '2026-10-11', servicios: [{ _id: a, metodo: 'IATF', fechaServicio: '2026-01-01' }] };
    assert.equal(calcularAtribucion(r).estadoAtribucion, 'CONFIRMADA');
    r.servicios.push({ _id: b, metodo: 'MONTA_NATURAL', fechaServicio: '2026-01-10' });
    assert.equal(calcularAtribucion(r).estadoAtribucion, 'INCIERTA');
    assert.equal(calcularAtribucion(r).servicioAtribuidoId, null);
    assert.equal(calcularAtribucion({ ...r, atribucionConfirmadaPorUsuario: true, servicioAtribuidoId: b }).metodo, 'MONTA_NATURAL');
});
test('servicios fuera de ventana o anulados no generan una paternidad ficticia', () => {
    const r = { fechaPartoReal: '2026-10-11', servicios: [{ _id: id(), metodo: 'IATF', fechaServicio: '2026-05-01' }, { _id: id(), metodo: 'MONTA_NATURAL', fechaServicio: '2026-01-01', anulado: true }] };
    assert.equal(calcularAtribucion(r).estadoAtribucion, 'SIN_SERVICIO');
});
test('una gestacion sin servicio conserva su fecha de parto y no inventa monta', () => {
    const r = analizarRegistro({ _id: id(), animal: id(), fechaPartoReal: new Date('2026-10-11'), tipoRegistro: 'Inseminación/Monta' });
    assert.equal(r.metodo, 'DESCONOCIDO'); assert.equal(r.servicios.length, 0); assert.equal(r.estadoAtribucion, 'SIN_SERVICIO'); assert.equal(r.resultado.tipo, 'PARTO');
});
test('la migracion denuncia contradicciones en vez de sobreescribir', () => {
    assert.throws(() => analizarRegistro({ tipoRegistro: 'Monta', campanaIATF: id() }), /contradictorios/);
    assert.equal(metodoLegado({ tipoRegistro: 'Monta' }), 'MONTA_NATURAL');
});
test('el modelo guarda donante y receptora sin un segundo modelo de gestacion', () => {
    const r = new RegistroReproductivo({ animal: id(), metodo: 'TRANSFERENCIA_EMBRIONES', servicios: [{ metodo: 'TRANSFERENCIA_EMBRIONES', embrion: { donanteId: id(), receptoraId: id(), origenEmbrion: 'FIV', estadoEmbrion: 'VITRIFICADO' } }] });
    assert.equal(r.servicios[0].embrion.origenEmbrion, 'FIV'); assert.ok(r.servicios[0]._id);
    assert.ok(require('../models/Animal').schema.path('madreGeneticaId'));
});
test('la migracion conserva la duracion porcina historica para no mover su calendario', () => {
    const r = analizarRegistro({ animal: id(), especie: 'Porcino', tipoRegistro: 'Monta', fechaMonta: '2026-01-01', fechaPartoEstimada: '2026-04-29' });
    assert.equal(r.diasGestacionReferencia, 118);
});
test('la migracion detecta repaso de otro ciclo legado sin duplicar el servicio propio', () => {
    const animal = id(), fincaId = id(), organizacionId = id();
    const iatf = { _id: id(), animal, fincaId, organizacionId, tipoInseminacion: 'IATF', fechaMonta: '2026-01-01', fechaPartoEstimada: '2026-10-11' };
    const monta = { _id: id(), animal, fincaId, organizacionId, tipoRegistro: 'Monta', fechaMonta: '2026-01-10' };
    const r = analizarRegistro(iatf, [iatf, monta]);
    assert.equal(r.estadoAtribucion, 'INCIERTA'); assert.equal(r.serviciosCandidatos.length, 2);
    assert.equal(r.servicios.filter((s) => s.cicloOrigenId).length, 1);
});
