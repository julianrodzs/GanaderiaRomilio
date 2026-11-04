const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origen = path.join(root, 'shared/metodos-reproductivos.json');
const contenido = JSON.stringify(JSON.parse(fs.readFileSync(origen, 'utf8')), null, 2) + '\n';
const destinos = ['backend/config/metodos-reproductivos.json', 'frontend/src/constants/metodosReproductivos.json'];
const escribir = process.argv.includes('--escribir');
for (const archivo of destinos) {
    const destino = path.join(root, archivo);
    if (escribir) fs.writeFileSync(destino, contenido);
    else if (JSON.stringify(JSON.parse(fs.readFileSync(destino, 'utf8'))) !== JSON.stringify(JSON.parse(contenido))) throw Error(`Catalogo desactualizado: ${archivo}. Ejecute este script con --escribir.`);
}
console.log(escribir ? 'Catalogos generados desde shared/metodos-reproductivos.json.' : 'Catalogos de backend y frontend coinciden con la fuente compartida.');
