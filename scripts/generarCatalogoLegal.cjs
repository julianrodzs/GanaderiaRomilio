const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const raiz = path.resolve(__dirname, '..');
const fuentes = [
    ['terminos', 'TERMINOS_DEL_SERVICIO.md', 'Términos del Servicio', 'Reglas de uso y condiciones generales de CIR Ganadero.'],
    ['privacidad', 'POLITICA_DE_PRIVACIDAD.md', 'Política de Privacidad y Protección de Datos', 'Datos personales, finalidades, proveedores y ejercicio de derechos.'],
    ['suscripciones', 'CONDICIONES_DE_SUSCRIPCION.md', 'Condiciones de Suscripción', 'Planes, pagos, renovación, cancelación y reembolsos.'],
    ['soporte', 'CONDICIONES_DE_SOPORTE.md', 'Política de Soporte', 'Canales, horarios y alcance de la asistencia técnica.']
];
const documentos = fuentes.map(([slug, archivo, titulo, resumen]) => {
    const contenido = fs.readFileSync(path.join(raiz, 'documentacion/comercial', archivo), 'utf8').replace(/\r\n/g, '\n');
    return { slug, titulo, resumen, version: '0.9-borrador', estado: 'BORRADOR_PRUEBA', fechaVigencia: '2026-11-10', fechaActualizacion: '2026-11-10', contenido,
        hashSha256: createHash('sha256').update(contenido, 'utf8').digest('hex') };
});
const texto = `${JSON.stringify(documentos, null, 2)}\n`;
for (const destino of ['backend/config/documentosLegales.catalogo.json', 'frontend/src/legal/documentos.json']) {
    const absoluto = path.join(raiz, destino);
    fs.mkdirSync(path.dirname(absoluto), { recursive: true });
    fs.writeFileSync(absoluto, texto);
}
console.log('Catálogo de prueba generado: solo cuatro documentos públicos, con texto y hash idénticos.');
