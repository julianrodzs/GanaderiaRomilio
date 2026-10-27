const assert = require('node:assert/strict');
const test = require('node:test');
const { S3Client } = require('@aws-sdk/client-s3');
const {
    construirClave,
    construirUrlPublica,
    obtenerConfiguracionR2,
    subirImagenR2,
    validarArchivoImagen
} = require('../services/almacenamientoR2-service');
const { IMAGENES_PREDETERMINADAS } = require('../services/apariencia-service');

const VARIABLES_R2 = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
    'R2_PRIVATE_BUCKET',
    'R2_PUBLIC_URL',
    'R2_ENDPOINT'
];

const conEntornoR2 = async (valores, callback) => {
    const originales = Object.fromEntries(VARIABLES_R2.map((clave) => [clave, process.env[clave]]));
    VARIABLES_R2.forEach((clave) => delete process.env[clave]);
    Object.entries(valores).forEach(([clave, valor]) => { process.env[clave] = valor; });
    try { return await callback(); } finally {
        VARIABLES_R2.forEach((clave) => {
            if (originales[clave] === undefined) delete process.env[clave];
            else process.env[clave] = originales[clave];
        });
    }
};

test('R2 permanece deshabilitado mientras falten credenciales', async () => {
    await conEntornoR2({ R2_ACCOUNT_ID: 'cuenta', R2_BUCKET: 'imagenes' }, () => {
        assert.equal(obtenerConfiguracionR2().disponible, false);
    });
});

test('R2 se habilita solo con la configuracion completa', async () => {
    await conEntornoR2({
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

test('un JPEG con extension PNG se acepta con su MIME y extension reales', () => {
    const archivo = {
        originalname: 'mapa-potreros.png', mimetype: 'image/png',
        buffer: Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex')
    };
    validarArchivoImagen(archivo);
    assert.equal(archivo.mimetype, 'image/jpeg');
    assert.equal(archivo.originalname, 'mapa-potreros.png');
    assert.match(construirClave({ organizacionId: 'org-1', fincaId: 'finca-1', uso: 'POTREROS_FINCA', archivo }), /\.jpg$/);
});

test('PNG y WebP tambien se normalizan cuando el MIME declarado es de otra imagen permitida', () => {
    for (const [buffer, mimetype] of [
        [Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), 'image/png'],
        [Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]), 'image/webp']
    ]) {
        const archivo = { buffer, mimetype: 'image/jpeg', originalname: 'foto.jpg' };
        assert.equal(validarArchivoImagen(archivo).mimetype, mimetype);
    }
});

test('renombrar contenido no permitido como PNG no evita la validacion', () => {
    for (const contenido of ['<svg xmlns="http://www.w3.org/2000/svg"></svg>', '%PDF-1.4', 'PK archivo zip', 'imagen falsa']) {
        assert.throws(() => validarArchivoImagen({
            originalname: 'foto.png', mimetype: 'image/png', buffer: Buffer.from(contenido)
        }), error => error.status === 415 && error.code === 'IMAGEN_CONTENIDO_NO_VALIDO');
    }
});

test('R2 recibe el ContentType y la clave del formato real para imagenes publicas y privadas', async (t) => {
    const peticiones = [];
    t.mock.method(S3Client.prototype, 'send', async (comando) => { peticiones.push(comando.input); return {}; });
    await conEntornoR2({
        R2_ACCOUNT_ID: 'cuenta-fixture', R2_ACCESS_KEY_ID: 'acceso-fixture', R2_SECRET_ACCESS_KEY: 'secreto-fixture',
        R2_BUCKET: 'publico-fixture', R2_PRIVATE_BUCKET: 'privado-fixture', R2_PUBLIC_URL: 'https://imagenes.example.test'
    }, async () => {
        for (const uso of ['POTREROS_FINCA', 'FOTO_ANIMAL']) {
            const archivo = { originalname: 'mapa-potreros.png', mimetype: 'image/png', buffer: Buffer.from('ffd8ffe000104a464946', 'hex') };
            const resultado = await subirImagenR2({ archivo, organizacionId: 'org-1', fincaId: 'finca-1', uso });
            assert.match(resultado.clave, /\.jpg$/);
            assert.equal(archivo.mimetype, 'image/jpeg', 'La metadata que persisten los servicios debe conservar el MIME normalizado.');
        }
    });
    assert.equal(peticiones.length, 2);
    assert.equal(peticiones[0].Bucket, 'publico-fixture');
    assert.equal(peticiones[1].Bucket, 'privado-fixture');
    for (const peticion of peticiones) {
        assert.equal(peticion.ContentType, 'image/jpeg');
        assert.match(peticion.Key, /\.jpg$/);
        assert.ok(peticion.Body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])));
    }
});

test('las organizaciones y fincas nuevas no heredan imagenes de otro cliente', () => {
    assert.deepEqual(IMAGENES_PREDETERMINADAS, {
        logo: '',
        dashboard: '',
        potreros: ''
    });
});

test('apariencia sin archivos devuelve estados vacios y sin imagen personalizada', async (t) => {
    const Organizacion = require('../models/Organizacion');
    const Finca = require('../models/Finca');
    const { obtenerAparienciaActual } = require('../services/apariencia-service');
    t.mock.method(Organizacion, 'findOne', () => ({ populate: async () => ({ _id: 'org-1', nombre: 'Cliente' }) }));
    t.mock.method(Finca, 'findOne', () => ({ populate: async () => ({ _id: 'finca-1', nombre: 'Finca', codigo: 'F1' }) }));
    const resultado = await obtenerAparienciaActual({ organizacionId: 'org-1', fincaId: 'finca-1' });
    for (const imagen of [resultado.organizacion.logo, resultado.finca.dashboard, resultado.finca.potreros]) {
        assert.equal(imagen.url, '');
        assert.equal(imagen.personalizada, false);
    }
});

test('la apariencia conserva las referencias de imagenes ya subidas a R2', async (t) => {
    const Organizacion = require('../models/Organizacion');
    const Finca = require('../models/Finca');
    const { obtenerAparienciaActual } = require('../services/apariencia-service');
    const logo = { _id: 'logo-1', url: 'https://imagenes.example.com/logo.png' };
    const mapa = { _id: 'mapa-1', url: 'https://imagenes.example.com/mapa.png' };
    t.mock.method(Organizacion, 'findOne', () => ({ populate: async () => ({ _id: 'org-1', branding: { logo } }) }));
    t.mock.method(Finca, 'findOne', () => ({ populate: async () => ({ _id: 'finca-1', imagenes: { dashboard: mapa, potreros: mapa } }) }));
    const resultado = await obtenerAparienciaActual({ organizacionId: 'org-1', fincaId: 'finca-1' });
    assert.equal(resultado.organizacion.logo.url, logo.url);
    assert.equal(resultado.organizacion.logo.personalizada, true);
    assert.equal(resultado.finca.dashboard.url, mapa.url);
    assert.equal(resultado.finca.potreros.url, mapa.url);
    assert.equal(resultado.finca.comparteImagen, true);
});
