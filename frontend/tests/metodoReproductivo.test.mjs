import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { esTareaEspecializada } from '../src/utils/fechasTareas.mjs';

const bundle = buildSync({ stdin: { contents: "export * from './src/Components/MetodoReproductivo.js'; export * from './src/Components/ProgramaTEIntegral.js'", resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'], loader: { '.js': 'jsx', '.css': 'empty' }, define: { 'import.meta.env': '{}' } });
const modulo = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, { module: modulo, exports: modulo.exports, require: createRequire(import.meta.url), URL });
const { FormularioMetodoReproductivo: Formulario, metodoDeRegistro } = modulo.exports;
const render = (props = {}) => renderToStaticMarkup(React.createElement(Formulario, { especie: 'Bovino', animales: [], usuariosAsignables: [], ...props }));

test('el formulario bovino ofrece TE e IATF sin restringir el registro historico por plan', () => {
    const html = render(); assert.match(html, /value="TRANSFERENCIA_EMBRIONES"/); assert.match(html, /value="IATF"/);
});
test('el formulario porcino excluye TE e IATF', () => {
    const html = render({ especie: 'Porcino' }); assert.doesNotMatch(html, /value="TRANSFERENCIA_EMBRIONES"|value="IATF"/); assert.match(html, /value="IA_CONVENCIONAL"/);
});
test('el acceso sin servicio permite diagnostico sin inventar un selector de semental', () => {
    const html = render({ sinServicio: true }); assert.match(html, /value="DESCONOCIDO" selected/); assert.match(html, /Fecha del diagnóstico/); assert.doesNotMatch(html, /Semental de la finca/);
});
test('los metodos historicos siguen visibles antes de migrar', () => {
    assert.equal(metodoDeRegistro({ origenGestacion: 'MONTA_NATURAL' }), 'MONTA_NATURAL'); assert.equal(metodoDeRegistro({ campanaIATF: 'campana' }), 'IATF'); assert.equal(metodoDeRegistro({}), 'DESCONOCIDO');
});
test('la transferencia real se ejecuta en su origen y el calendario puede completarse como tarea', () => {
    assert.equal(esTareaEspecializada({ categoriaAutomatica: 'Transferencia de embriones', claveAutomatica: 'te:123' }), true);
    assert.equal(esTareaEspecializada({ categoriaAutomatica: 'Transferencia de embriones', claveAutomatica: 'te:123:sincronizacion:0' }), false);
});
test('los nuevos protocolos TE no se pueden completar desde el cambio generico de tarea', () => {
    for (const categoriaAutomatica of ['TE_DONANTE', 'TETF']) assert.equal(esTareaEspecializada({ categoriaAutomatica }), true);
});
test('los indicadores TE muestran conservacion, colectas y costos separados por moneda', () => {
    const html = renderToStaticMarkup(React.createElement(modulo.exports.IndicadoresTE, { datos: { transferidos: 1, prenadas: 1, embrionesViables: 6, costoPorEmbrionViable: { CRC: 10000, USD: 100 }, porConservacion: [{ nombre: 'VITRIFICADO', transferidos: 1, prenadas: 1, tasaPrenez: 100 }], colectas: [{ _id: 'c', nombre: 'Sesion FIV', viables: 6 }], porFinca: [{ fincaId: 'f', nombre: 'Principal', transferidos: 1, prenadas: 1 }] } }));
    for (const texto of ['VITRIFICADO', 'Sesión', 'Sesion FIV', 'CRC', 'USD', 'Principal']) assert.ok(html.includes(texto), texto);
});
