import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/pages/ConfiguracionCuenta.js', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', '*/context/PlanContext', '*/services/api'], loader: { '.js': 'jsx', '.css': 'empty' }
});
const preparar = ({ estado = {}, hooksFicticios = false, disponible = true } = {}) => {
  const envios = [], modulo = { exports: {} };
  const estadoInicial = (inicial) => {
    const valor = typeof inicial === 'function' ? inicial() : inicial;
    return valor && 'frecuencia' in valor ? { ...valor, ...estado } : valor;
  };
  const react = { ...React,
    useEffect: hooksFicticios ? () => {} : React.useEffect,
    useState: (inicial) => hooksFicticios ? [estadoInicial(inicial), () => {}] : React.useState(() => estadoInicial(inicial))
  };
  const require = createRequire(import.meta.url);
  vm.runInNewContext(bundle.outputFiles[0].text, { module: modulo, exports: modulo.exports, require: (id) => {
    if (id === 'react') return react;
    if (id.endsWith('/context/PlanContext')) return { usePlan: () => ({ tieneFeature: () => disponible }) };
    if (id.endsWith('/services/api')) return { actualizarConfiguracionEmails: async (datos) => {
      envios.push(datos); return { configuracion: datos };
    } };
    return require(id);
  } });
  return { Componente: modulo.exports.default, envios };
};
const usuario = { nombre: 'Ana', rol: 'Administrador' };

test('hora fija visible sin selector, independientemente del modo o de la preferencia antigua', () => {
  for (const modoEjecucion of [undefined, 'continuo', 'cron_diario']) {
    const { Componente } = preparar({ estado: { modoEjecucion, horaPreferida: '18:00', frecuencia: 'Semanal', diaSemana: 4 } });
    const html = renderToStaticMarkup(React.createElement(Componente, { usuario }));
    assert.match(html, /Hora de envío: 6:00 a\. m\. \(Costa Rica\)/);
    assert.doesNotMatch(html, /type="time"|Hora preferida|18:00/);
    assert.match(html, /Día de envío/);
    assert.match(html, /<option value="4" selected="">Jueves<\/option>/);
    for (let dia = 0; dia <= 6; dia++) assert.match(html, new RegExp(`<option value="${dia}"`));
  }
});

test('diario y desactivado no ofrecen un dia semanal y mantienen el horario fijo', () => {
  for (const frecuencia of ['Diario', 'Desactivado']) {
    const { Componente } = preparar({ estado: { frecuencia } });
    const html = renderToStaticMarkup(React.createElement(Componente, { usuario }));
    assert.doesNotMatch(html, /Día de envío|type="time"/);
    assert.match(html, /Hora de envío: 6:00/);
  }
});

test('guardar envia frecuencia, dia y contenido; nunca reenvia la hora antigua', async () => {
  const { Componente, envios } = preparar({ hooksFicticios: true, estado: { frecuencia: 'Semanal', diaSemana: 0, horaPreferida: '18:00', modoEjecucion: 'continuo' } });
  const buscarFormulario = (nodo) => {
    if (!React.isValidElement(nodo)) return null;
    if (nodo.type === 'form' && React.Children.toArray(nodo.props.children).some((hijo) => hijo?.type === 'fieldset')) return nodo;
    for (const hijo of React.Children.toArray(nodo.props.children)) { const resultado = buscarFormulario(hijo); if (resultado) return resultado; }
    return null;
  };
  const formulario = buscarFormulario(Componente({ usuario })); assert.ok(formulario);
  await formulario.props.onSubmit({ preventDefault() {} });
  assert.equal(envios.length, 1);
  assert.equal(envios[0].frecuencia, 'Semanal'); assert.equal(envios[0].diaSemana, 0);
  assert.deepEqual(Object.keys(envios[0]).sort(), ['diaSemana', 'frecuencia', 'modulos']);
});
