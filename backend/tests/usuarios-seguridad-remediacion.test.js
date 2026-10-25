const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-local-pruebas-usuarios-2026-seguro';
const root = path.resolve(__dirname, '..');
const source = (archivo) => fs.readFileSync(path.join(root, archivo), 'utf8');

test('U01 el DTO administrativo rechaza identidad, operadores y rutas Mongo', () => {
    const controller = require('../controllers/usuario-controller');
    const { validarDtoCerrado } = controller._seguridad;
    const permitidos = new Set(['rol', 'fincas', 'estadoMembresia', 'accesoTodasFincas']);
    assert.throws(() => validarDtoCerrado({ contrasena: 'Secuestrada-123' }, permitidos), /no permitidos/i);
    assert.throws(() => validarDtoCerrado({ '$set': { rol: 'Administrador' } }, permitidos), /no permitidos/i);
    assert.throws(() => validarDtoCerrado({ 'fincas.0': 'ajena' }, permitidos), /no permitidos/i);
    assert.doesNotThrow(() => validarDtoCerrado({ rol: 'Encargado', fincas: [] }, permitidos));
});

test('U01 cuentas existentes se conducen a invitación y no a membresía directa', () => {
    const codigo = source('controllers/usuario-controller.js');
    assert.match(codigo, /if \(usuarioExistente \|\| sinAccesoCorreo !== true\)/);
    assert.match(codigo, /crearInvitacion/);
    assert.doesNotMatch(codigo, /usuarioExistente \|\| await new Usuario/);
});

test('U01 invitaciones son hasheadas, caducan, son únicas y verifican el correo', () => {
    const Invitacion = require('../models/Invitacion');
    assert.ok(Invitacion.schema.path('tokenHash'));
    assert.ok(Invitacion.schema.path('expiraEn'));
    assert.ok(Invitacion.schema.path('aceptadaEn'));
    const codigo = source('controllers/usuario-controller.js');
    assert.match(codigo, /72 \* 60 \* 60 \* 1000/);
    assert.match(codigo, /normalizarCorreo\(invitacion\.correo\).*normalizarCorreo\(req\.usuario\.correo\)/s);
});

test('U02 la comprobación de estado solo se hace si el usuario existe', () => {
    assert.match(source('controllers/usuario-controller.js'), /usuarioExistente && usuarioExistente\.estado !== 'Activo'/);
});

test('U03 todas las salidas de un administrador usan el bloqueo serializado', () => {
    const codigo = source('controllers/usuario-controller.js');
    assert.ok((codigo.match(/ejecutarProtegiendoAdministradores/g) || []).length >= 4);
    assert.match(source('services/membresia-seguridad-service.js'), /otros < 1/);
});

test('U03 dos degradaciones simultáneas conservan un administrador activo', async () => {
    const Bloqueo = require('../models/BloqueoSeguridad');
    const { Membresia } = require('../models/Membresia');
    const originales = {
        findOneAndUpdate: Bloqueo.findOneAndUpdate,
        deleteOne: Bloqueo.deleteOne,
        countDocuments: Membresia.countDocuments
    };
    let tokenBloqueo = null;
    const activos = new Map([['a', true], ['b', true]]);
    Bloqueo.findOneAndUpdate = async (filtro, cambio) => {
        if (tokenBloqueo) return null;
        tokenBloqueo = cambio.$set.token;
        return { token: tokenBloqueo };
    };
    Bloqueo.deleteOne = async ({ token }) => { if (token === tokenBloqueo) tokenBloqueo = null; };
    Membresia.countDocuments = async (filtro) => [...activos.entries()]
        .filter(([id, activo]) => activo && id !== String(filtro._id.$ne)).length;
    delete require.cache[require.resolve('../services/membresia-seguridad-service')];
    const { ejecutarProtegiendoAdministradores } = require('../services/membresia-seguridad-service');
    const degradar = (id) => ejecutarProtegiendoAdministradores({
        organizacionId: 'org',
        membresia: { _id: id, rol: 'Administrador', estado: 'Activo' },
        siguienteRol: 'Encargado',
        operacion: async () => { await new Promise((resolve) => setTimeout(resolve, 50)); activos.set(id, false); }
    });
    try {
        const resultados = await Promise.allSettled([degradar('a'), degradar('b')]);
        assert.equal(resultados.filter((item) => item.status === 'fulfilled').length, 1);
        assert.equal(resultados.filter((item) => item.status === 'rejected' && item.reason.status === 409).length, 1);
        assert.equal([...activos.values()].filter(Boolean).length, 1);
    } finally {
        Bloqueo.findOneAndUpdate = originales.findOneAndUpdate;
        Bloqueo.deleteOne = originales.deleteOne;
        Membresia.countDocuments = originales.countDocuments;
        delete require.cache[require.resolve('../services/membresia-seguridad-service')];
    }
});

test('U04 JWT exige HS256, issuer, audience, exp y duración absoluta', () => {
    const { generarToken, verificarToken } = require('../middleware/auth');
    const token = generarToken({ id: 'usuario', tokenVersion: 2 });
    const payload = verificarToken(token);
    assert.equal(payload.tokenVersion, 2);
    assert.equal(payload.exp - payload.authTime, 8 * 60 * 60);
    const partes = token.split('.');
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const firma = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${header}.${partes[1]}`).digest('base64url');
    assert.throws(() => verificarToken(`${header}.${partes[1]}.${firma}`), /Algoritmo/);
});

test('U04 cambiar de organización conserva authTime y vencimiento', () => {
    const { generarToken, verificarToken } = require('../middleware/auth');
    const inicial = verificarToken(generarToken({ id: 'u', tokenVersion: 0 }));
    const renovado = verificarToken(generarToken(
        { id: 'u', tokenVersion: 0 },
        { authTime: inicial.authTime, expiraEn: inicial.exp }
    ));
    assert.equal(renovado.authTime, inicial.authTime);
    assert.equal(renovado.exp, inicial.exp);
});

test('U04 tokenVersion revoca cualquier token anterior', () => {
    const { versionTokenValida } = require('../middleware/auth');
    assert.equal(versionTokenValida({ tokenVersion: 4 }, { tokenVersion: 4 }), true);
    assert.equal(versionTokenValida({ tokenVersion: 3 }, { tokenVersion: 4 }), false);
});

test('U04 política única rechaza claves cortas y comunes', () => {
    const { validarContrasena, cantidadContrasenasComunes } = require('../services/contrasena-service');
    assert.equal(cantidadContrasenasComunes, 10000);
    assert.throws(() => validarContrasena('x'), /10 caracteres/);
    assert.throws(() => validarContrasena('1234567890'), /común/);
    assert.throws(() => validarContrasena('q1w2e3r4t5'), /común/);
    assert.doesNotThrow(() => validarContrasena('Finca-Romilio-2026!'));
});

test('U05 límites independientes bloquean 50 correos por IP y 50 IP por cuenta', async () => {
    const Modelo = require('../models/RateLimitSeguridad');
    const original = Modelo.findOneAndUpdate;
    const contadores = new Map();
    Modelo.findOneAndUpdate = ({ clave }) => ({ lean: async () => {
        const intentos = (contadores.get(clave) || 0) + 1;
        contadores.set(clave, intentos);
        return { intentos, ventanaHasta: new Date(Date.now() + 60000) };
    } });
    delete require.cache[require.resolve('../middleware/rateLimit')];
    const { rateLimitLogin } = require('../middleware/rateLimit');
    const invocar = (ip, correo) => new Promise((resolve) => {
        const res = { setHeader() {}, status(codigo) { this.codigo = codigo; return this; }, json() { resolve(this.codigo); } };
        rateLimitLogin({ ip, body: { correo } }, res, () => resolve(200));
    });
    try {
        const porIp = await Promise.all(Array.from({ length: 50 }, (_, i) => invocar('192.0.2.1', `u${i}@test.local`)));
        assert.ok(porIp.includes(429));
        contadores.clear();
        const porCuenta = await Promise.all(Array.from({ length: 50 }, (_, i) => invocar(`192.0.2.${i + 2}`, 'misma@test.local')));
        assert.ok(porCuenta.includes(429));
    } finally {
        Modelo.findOneAndUpdate = original;
        delete require.cache[require.resolve('../middleware/rateLimit')];
    }
});

test('U06 login compara siempre bcrypt antes de revelar una cuenta inactiva', () => {
    const codigo = source('controllers/usuario-controller.js');
    const posicionComparacion = codigo.indexOf('await bcrypt.compare(contrasena, hashComparacion)');
    const posicionInactivo = codigo.indexOf("if (usuario.estado === 'Inactivo')", posicionComparacion);
    assert.ok(posicionComparacion > 0 && posicionInactivo > posicionComparacion);
    assert.match(codigo, /HASH_RELLENO/);
});

test('U01 invitaciones pendientes cuentan para el cupo del plan', () => {
    const codigo = source('services/plan-service.js');
    assert.match(codigo, /Invitacion\.countDocuments/);
    assert.match(codigo, /miembros \+ invitaciones/);
});

test('U01 superadministradores se excluyen de lecturas y mutaciones tenant', () => {
    const codigo = source('controllers/usuario-controller.js');
    assert.match(codigo, /ocultarSuperAdministrador/);
    assert.match(codigo, /item\.usuario\.esSuperAdministrador !== true/);
});

test('U08 dos restablecimientos concurrentes consumen el token una sola vez', async () => {
    const Usuario = require('../models/Usuario');
    const controller = require('../controllers/usuario-controller');
    const original = Usuario.findOneAndUpdate;
    let disponible = true;
    Usuario.findOneAndUpdate = async () => {
        if (!disponible) return null;
        disponible = false;
        return { _id: 'u' };
    };
    const ejecutar = (password) => new Promise((resolve) => controller.restablecerContrasena(
        { body: { token: 'token-prueba', password } },
        { status(codigo) { this.codigo = codigo; return this; }, json(body) { resolve({ codigo: this.codigo || 200, body }); } }
    ));
    try {
        const resultados = await Promise.all([ejecutar('Nueva-segura-A1'), ejecutar('Nueva-segura-B2')]);
        assert.deepEqual(resultados.map((item) => item.codigo).sort(), [200, 400]);
    } finally { Usuario.findOneAndUpdate = original; }
});

test('U09 el sanitizador redacta variantes anidadas y arreglos', () => {
    const { sanitizar, sanitizarRuta } = require('../middleware/auditoria');
    const limpio = sanitizar({ ConfirmarContrasena: 'a', anidado: [{ reset_password_token: 'b', APISecret: 'c' }] });
    assert.equal(limpio.ConfirmarContrasena, '[protegido]');
    assert.equal(limpio.anidado[0].reset_password_token, '[protegido]');
    assert.equal(limpio.anidado[0].APISecret, '[protegido]');
    assert.doesNotMatch(sanitizarRuta('/api/exportar?token=secreto&finca=uno'), /secreto/);
});

test('U10 exportaciones GET y login quedan dentro de auditoría', () => {
    const codigo = source('middleware/auditoria.js');
    assert.match(codigo, /exportar\|exportacion\|descargar\|download/);
    assert.match(source('controllers/usuario-controller.js'), /req\.usuario = \{/);
    assert.match(source('middleware/auditoria.js'), /evento: obtenerEvento/);
    assert.match(source('routes/adminAuditoriaRoutes.js'), /getAuditoriasPlataforma/);
    assert.match(source('controllers/auditoria-controller.js'), /omitirAislamientoOrganizacion/);
});

test('U11 correo escapa HTML y nunca imprime el enlace secreto', async () => {
    const correo = require('../services/correoElectronico-service');
    const apiKey = process.env.RESEND_API_KEY;
    const entorno = process.env.NODE_ENV;
    delete process.env.RESEND_API_KEY;
    process.env.NODE_ENV = 'test';
    const avisos = [];
    const warn = console.warn;
    console.warn = (...args) => avisos.push(args.join(' '));
    try {
        const resultado = await correo.enviarCorreoRecuperacion({ correo: 'x@example.test', nombre: '<script>alert(1)</script>', token: 'TOKEN_SECRETO' });
        assert.equal(JSON.stringify(avisos).includes('TOKEN_SECRETO'), false);
        assert.equal(JSON.stringify(resultado).includes('<script>'), false);
    } finally {
        console.warn = warn;
        if (apiKey) process.env.RESEND_API_KEY = apiKey; else delete process.env.RESEND_API_KEY;
        if (entorno) process.env.NODE_ENV = entorno; else delete process.env.NODE_ENV;
    }
});

test('U12 logout usa limpieza de todos los contextos del usuario', () => {
    assert.match(source('../frontend/src/App.js'), /limpiarAlmacenUsuario\(sesion\)/);
    assert.match(source('../frontend/src/App.js'), /limpiarTodosDatosOffline/);
    assert.match(source('../frontend/src/services/offlineStorage.js'), /obtenerCambiosPendientesUsuario/);
    assert.match(source('../frontend/src/services/offlineStorage.js'), /caches\.keys\(\)/);
    assert.match(source('../frontend/src/services/offlineStorage.js'), /indexedDB\.databases\(\)/);
    assert.match(source('../frontend/src/services/offlineStorage.js'), /DB_REGISTRY_KEY/);
});

test('U13 cada acceso offline revalida exp y authTime', () => {
    const codigo = source('../frontend/src/services/offlineStorage.js');
    assert.match(codigo, /datos\.exp && datos\.authTime/);
    assert.match(codigo, /obtenerContextoOffline[\s\S]*asegurarSesionOfflineVigente/);
    assert.match(source('../frontend/src/services/offlineSync.js'), /ACCESS_REVOKED/);
});

test('U14 archivos de dron exigen permiso y pertenencia de finca', () => {
    const codigo = source('routes/archivoRoutes.js');
    assert.match(codigo, /autorizarPermiso\('drone\.ver'\)/);
    assert.match(codigo, /ConteoDrone\.findOne/);
    assert.match(codigo, /fincasAutorizadas\.includes/);
});

test('U15 BandasPorcinas degrada cargas opcionales sin romper la pantalla', () => {
    const codigo = source('../frontend/src/Components/BandasPorcinas.js');
    assert.match(codigo, /cargarOpcional/);
    assert.match(codigo, /puedeCrearBanda/);
});

test('U16 conserva autoría mediante anonimización y registra consentimiento', () => {
    const Usuario = require('../models/Usuario');
    assert.ok(Usuario.schema.path('consentimiento.version'));
    assert.match(source('controllers/usuario-controller.js'), /Cuenta anonimizada y accesos revocados/);
});

test('U17 agrega cabeceras de seguridad, proxy confiable y HTTPS en producción', () => {
    const codigo = source('app.js');
    assert.match(codigo, /Strict-Transport-Security/);
    assert.match(codigo, /Content-Security-Policy/);
    assert.match(codigo, /trust proxy/);
    assert.match(codigo, /HTTPS es requerido/);
    assert.match(codigo, /res\.statusCode >= 500/);
    assert.match(codigo, /Error interno del servidor/);
});
