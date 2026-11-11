const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const mongoose = require('mongoose');
const { documentos, metadatos, obtenerDocumento } = require('../config/documentosLegales');
const { validarVersiones, escenarioInvitacion } = require('../services/legal-service');
const Aceptacion = require('../models/AceptacionLegal');

const raiz = path.resolve(__dirname, '../..');
const fuentes = {
    terminos: 'TERMINOS_DEL_SERVICIO.md', privacidad: 'POLITICA_DE_PRIVACIDAD.md',
    suscripciones: 'CONDICIONES_DE_SUSCRIPCION.md', soporte: 'CONDICIONES_DE_SOPORTE.md'
};
const referencias = () => documentos.map(({ slug, version, hashSha256 }) => ({ slug, version, hashSha256 }));

test('catalogo publico: solo cuatro borradores, bytes identicos en backend y frontend y hashes del texto fuente', () => {
    const backend = fs.readFileSync(path.join(raiz, 'backend/config/documentosLegales.catalogo.json'));
    const frontend = fs.readFileSync(path.join(raiz, 'frontend/src/legal/documentos.json'));
    assert.deepEqual(backend, frontend);
    assert.deepEqual(JSON.parse(backend), documentos);
    assert.deepEqual(documentos.map((d) => d.slug).sort(), Object.keys(fuentes).sort());
    for (const d of documentos) {
        const fuente = fs.readFileSync(path.join(raiz, 'documentacion/comercial', fuentes[d.slug]), 'utf8').replace(/\r\n/g, '\n');
        assert.equal(d.contenido, fuente);
        assert.equal(d.hashSha256, createHash('sha256').update(fuente, 'utf8').digest('hex'));
        assert.equal(d.version, '0.9-borrador');
        assert.equal(d.estado, 'BORRADOR_PRUEBA');
        assert.match(d.fechaVigencia, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(Number.isFinite(Date.parse(d.fechaVigencia)));
        assert.ok(d.titulo && d.resumen && d.fechaActualizacion);
        assert.equal(Object.isFrozen(d), true);
        assert.equal(obtenerDocumento(d.slug), d);
    }
    assert.equal(Object.isFrozen(documentos), true);
    assert.equal(obtenerDocumento('protocolo-interno'), undefined);
    assert.deepEqual(metadatos(), documentos.map(({ contenido, ...d }) => d));
});

test('validarVersiones rechaza versiones, hashes, slugs internos, duplicados y campos inyectados', () => {
    assert.doesNotThrow(() => validarVersiones(referencias(), Object.keys(fuentes)));
    for (const cambio of [{ version: '1.0' }, { hashSha256: '0'.repeat(64) }, { slug: 'protocolo-interno' }]) {
        assert.throws(() => validarVersiones([{ ...referencias()[0], ...cambio }], ['terminos']), { status: 409 });
    }
    assert.throws(() => validarVersiones([referencias()[0], referencias()[0]], ['terminos']), { status: 409 });
    assert.throws(() => validarVersiones([], ['privacidad']), { status: 400 });
    for (const valor of [null, {}, referencias().concat(referencias()[0]), [null], [{ ...referencias()[0], '$set': {} }]]) {
        assert.throws(() => validarVersiones(valor, ['terminos']), { status: 400 });
    }
});

test('escenario de invitacion usa flag backend y activacion legada, no solo rol Administrador', () => {
    for (const rol of ['Encargado', 'Veterinario', 'Contador', 'Administrador']) {
        assert.equal(escenarioInvitacion({ rol, esActivacionOrganizacion: false, requiereContrasena: false }), 'COLABORADOR');
    }
    assert.equal(escenarioInvitacion({ rol: 'Administrador', requiereContrasena: true }), 'ORGANIZACION');
    assert.equal(escenarioInvitacion({ rol: 'Administrador', esActivacionOrganizacion: true }), 'ORGANIZACION');
    assert.equal(escenarioInvitacion({ rol: 'Veterinario', requiereContrasena: true }), 'COLABORADOR');
});

test('evidencia valida su SHA-256 antes de persistir un snapshot adulterado', async () => {
    const d = obtenerDocumento('privacidad');
    const datos = {
        usuarioId: new mongoose.Types.ObjectId(), organizacionId: new mongoose.Types.ObjectId(),
        rolEnMomento: 'Encargado', contexto: 'PANEL_CUENTA', tipoAceptacion: 'CONSENTIMIENTO_PRIVACIDAD_LEY8968',
        otorgado: true, documentoSlug: d.slug, versionDocumento: d.version, estadoDocumento: d.estado,
        hashTexto: d.hashSha256, copiaTextoExacto: d.contenido, declaracion: 'Consentimiento informado',
        claveSolicitud: 'validacion-local', solicitudHash: 'a'.repeat(64)
    };
    await new Aceptacion(datos).validate();
    await assert.rejects(new Aceptacion({ ...datos, copiaTextoExacto: `${d.contenido}\nAlterado` }).validate(), /hash/);
});
