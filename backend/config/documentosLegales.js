const { createHash } = require('node:crypto');
const documentos = require('./documentosLegales.catalogo.json');
for (const d of documentos) {
    if (createHash('sha256').update(d.contenido, 'utf8').digest('hex') !== d.hashSha256) throw new Error('Catálogo legal inconsistente.');
    Object.freeze(d);
}
Object.freeze(documentos);
const metadatos = () => documentos.map(({ contenido, ...d }) => d);
const obtenerDocumento = (slug) => documentos.find((d) => d.slug === slug);
module.exports = { documentos, metadatos, obtenerDocumento };
