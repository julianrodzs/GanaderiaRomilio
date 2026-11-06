import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { enlaceRenovacion, previsualizarVencimiento, montoSuscripcion } from '../src/utils/suscripciones.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = buildSync({ stdin: { contents: "export{default as Facturacion}from'./src/Components/FacturacionPlan.js';export{EstadoSuscripcion,CamposPagoSuscripcion}from'./src/Components/SuscripcionesSaas.js'", resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'], loader: { '.js': 'jsx', '.css': 'empty' }, define: { 'import.meta.env': JSON.stringify({ VITE_WHATSAPP_SOPORTE: '50688887777' }) } });
const modulo = { exports: {} }, require = createRequire(import.meta.url);
let fixture, primero;
const react = { ...React, useState: (inicial) => React.useState(fixture && !primero && inicial === null ? (primero = true, fixture) : inicial) };
vm.runInNewContext(bundle.outputFiles[0].text, { module: modulo, exports: modulo.exports, require: (nombre) => nombre === 'react' ? react : require(nombre), URL, URLSearchParams });
const render = (componente, props, datos) => { fixture = datos; primero = false; return renderToStaticMarkup(React.createElement(modulo.exports[componente], props)); };

test('suscripciones: renovar conserva dias futuros y limita fin de mes', () => {
  const org = { plan: { estado: 'Activo' }, suscripcion: { fechaProximoVencimiento: '2027-01-31T12:00:00Z' } };
  assert.equal(previsualizarVencimiento(org, 1, '', new Date('2027-01-26')).toISOString(), '2027-02-28T12:00:00.000Z');
  assert.equal(previsualizarVencimiento({ plan: { estado: 'Activo' }, suscripcion: { fechaProximoVencimiento: '2027-03-01T05:59:59.999Z' } }, 1, '', new Date('2027-02-25')).toISOString(), '2027-03-29T05:59:59.999Z');
  assert.equal(previsualizarVencimiento({ ...org, plan: { estado: 'Prueba' } }, 1, '', new Date('2027-01-26T12:00:00Z')).toISOString(), '2027-02-26T12:00:00.000Z');
});
test('suscripciones: WhatsApp contiene organizacion y planes, sin aceptar destinos arbitrarios', () => {
  const url = new URL(enlaceRenovacion({ telefono: '8888-7777', organizacion: 'Finca & Norte', actual: 'ESENCIAL', destino: 'PREMIUM' }));
  assert.equal(url.hostname, 'wa.me'); assert.equal(url.pathname, '/50688887777');
  assert.match(url.searchParams.get('text'), /Finca & Norte/); assert.match(url.searchParams.get('text'), /Esencial/); assert.match(url.searchParams.get('text'), /Premium/);
  assert.equal(enlaceRenovacion({ telefono: 'https://example.test' }), null);
});
test('suscripciones: montos separados por moneda y badges con texto no dependen solo de color', () => {
  assert.match(montoSuscripcion(12000), /12[ .]000/); assert.equal(montoSuscripcion(2300, 'USD'), '$2,300.00');
  assert.match(render('EstadoSuscripcion', { suscripcion: { estadoSuscripcion: 'EN_GRACIA' } }), /En período de gracia/);
  assert.match(render('EstadoSuscripcion', { suscripcion: { vigenciaPendiente: true } }), /Vigencia por configurar/);
});
test('suscripciones: cobro manual ofrece referencia pero nunca carga archivos ni Stripe', () => {
  const html = render('CamposPagoSuscripcion', { datos: { metodoPago: 'SINPE_MOVIL', moneda: 'CRC', monto: 10000, referenciaComprobante: '', mesesCubiertos: 1, notas: '' }, onChange() {} });
  assert.match(html, /SINPE Móvil/); assert.match(html, /Número de comprobante/);
  assert.doesNotMatch(html, /type="file"|value="STRIPE"/);
});
const estado = { organizacion: { nombre: 'Finca principal' }, suscripcion: { modoFacturacion: 'MANUAL', estadoSuscripcion: 'ACTIVA', fechaProximoVencimiento: '2026-12-05T12:00:00Z' },
  plan: { estado: 'Activo', administrable: false }, stripeConfigurado: false, catalogo: [{ codigo: 'ESENCIAL', nombre: 'Esencial', precioMensualUSD: 10 }, { codigo: 'PRO', nombre: 'Pro', precioMensualUSD: 35 }] };
test('suscripciones: Mi plan manual muestra WhatsApp e historial sin requerir precios Stripe', () => {
  const html = render('Facturacion', { codigoActual: 'ESENCIAL' }, estado);
  assert.match(html, /Vigente hasta/); assert.match(html, /Solicitar renovación por WhatsApp/); assert.match(html, /Mis pagos registrados/);
  assert.match(html, /Solicitar cambio de plan/); assert.doesNotMatch(html, /Administrar pagos|configurado en Stripe/);
});
test('suscripciones: Stripe configurado conserva portal y no muestra el flujo manual', () => {
  const html = render('Facturacion', { codigoActual: 'ESENCIAL' }, { ...estado, stripeConfigurado: true, suscripcion: { modoFacturacion: 'STRIPE' }, plan: { estado: 'Activo', administrable: true } });
  assert.match(html, /Administrar pagos/); assert.match(html, /Cambiar en portal/); assert.doesNotMatch(html, /WhatsApp|Mis pagos registrados/);
});
