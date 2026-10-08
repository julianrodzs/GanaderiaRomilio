const assert = require('node:assert/strict');
const test = require('node:test');
const {
    construirUrlPublica,
    obtenerConfiguracionR2,
    validarArchivoImagen
} = require('../services/almacenamientoR2-service');
const { IMAGENES_PREDETERMINADAS } = require('../services/apariencia-service');

const VARIABLES_R2 = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
    'R2_PUBLIC_URL',
    'R2_ENDPOINT'
];

const conEntornoR2 = (valores, callback) => {
    const originales = Object.fromEntries(VARIABLES_R2.map((clave) => [clave, process.env[clave]]));
    VARIABLES_R2.forEach((clave) => delete process.env[clave]);
    Object.entries(valores).forEach(([clave, valor]) => { process.env[clave] = valor; });
    try { callback(); } finally {
        VARIABLES_R2.forEach((clave) => {
            if (originales[clave] === undefined) delete process.env[clave];
            else process.env[clave] = originales[clave];
        });
    }
};

test('R2 permanece deshabilitado mientras falten credenciales', () => {
    conEntornoR2({ R2_ACCOUNT_ID: 'cuenta', R2_BUCKET: 'imagenes' }, () => {
        assert.equal(obtenerConfiguracionR2().disponible, false);
    });
});

test('R2 se habilita solo con la configuracion completa', () => {
    conEntornoR2({
        R2_ACCOUNT_ID: 'cuenta',
        R2_ACCESS_KEY_ID: 'acceso',
        R2_SECRET_ACCESS_KEY: 'secreto',
        R2_BUCKET: 'imagenes',
        R2_PUBLIC_URL: 'https://media.example.com/'
    }, () => {
        const configuracion = obtenerConfiguracionR2();
        assert.equal(configuracion.disponible, true);
        assert.equal(configuracion.publicUrl, 'https://media.example.com');
    });
});

test('la URL publica codifica cada segmento de la clave', () => {
    assert.equal(
        construirUrlPublica('https://media.example.com/', 'organizaciones/abc/mi foto.webp'),
        'https://media.example.com/organizaciones/abc/mi%20foto.webp'
    );
});

test('el cargador rechaza archivos que no sean imagenes permitidas', () => {
    assert.throws(
        () => validarArchivoImagen({ buffer: Buffer.from('pdf'), mimetype: 'application/pdf' }),
        /JPG, PNG o WebP/
    );
    assert.throws(
        () => validarArchivoImagen({ buffer: Buffer.from('imagen falsa'), mimetype: 'image/webp' }),
        /contenido del archivo/
    );
    assert.doesNotThrow(() => validarArchivoImagen({
        buffer: Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from('contenido')]),
        mimetype: 'image/webp'
    }));
});

test('los fallbacks conservan los recursos actuales', () => {
    assert.deepEqual(IMAGENES_PREDETERMINADAS, {
        logo: '/assests/logo-romilio.png',
        dashboard: '/assests/mapa-potreros.png',
        potreros: '/assests/mapa-potreros.png'
    });
});
