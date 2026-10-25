const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { secretoFuerte } = require('../config/env');

const generarSecreto = () => {
    let secreto;
    do {
        secreto = crypto.randomBytes(48).toString('base64url');
    } while (!secretoFuerte(secreto));
    return secreto;
};

const generarArchivoSecretos = () => {
    const archivo = path.resolve(__dirname, '../secretos-produccion.env');
    const contenido = [
        '# Configurar estos valores en Environment del servicio backend de Render.',
        '# Archivo privado: no publicar ni incluir en Git.',
        `JWT_SECRET=${generarSecreto()}`,
        `CRON_SECRET=${generarSecreto()}`,
        ''
    ].join('\n');
    fs.writeFileSync(archivo, contenido, { flag: 'wx', mode: 0o600 });
    return archivo;
};

if (require.main === module) {
    try {
        const archivo = generarArchivoSecretos();
        console.log(`Claves validas preparadas en: ${archivo}`);
        console.log('No se modificaron variables locales ni configuracion remota.');
    } catch (error) {
        console.error(error.code === 'EEXIST'
            ? 'El archivo privado ya existe; se conserva sin reemplazar sus claves.'
            : 'No se pudo preparar el archivo privado de claves.');
        process.exitCode = 1;
    }
}

module.exports = { generarArchivoSecretos, generarSecreto };
