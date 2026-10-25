const crypto = require('crypto');
const { secretoFuerte } = require('../config/env');
const { obtenerRolesPermiso, rolTienePermiso } = require('../config/permisosRoles');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { Membresia } = require('../models/Membresia');
require('../models/Organizacion');
const Usuario = require('../models/Usuario');
const { resolverFincaActiva } = require('../services/accesoFinca-service');
const { obtenerPoliticaFincasOperativas } = require('../services/plan-service');

const base64UrlDecode = (valor) => {
    const base64 = valor.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf8');
};

const JWT_ISSUER = process.env.JWT_ISSUER || 'ganaderia-romilio-api';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ganaderia-romilio-web';
const DURACION_SESION_SEGUNDOS = Number(process.env.JWT_SESSION_SECONDS || 60 * 60 * 8);
const versionTokenValida = (datosToken, usuario) => (
    Number(datosToken?.tokenVersion) === Number(usuario?.tokenVersion || 0)
);

const firmar = (header, payload, secreto) => {
    return crypto
        .createHmac('sha256', secreto)
        .update(`${header}.${payload}`)
        .digest('base64url');
};

const base64UrlEncode = (valor) => {
    return Buffer.from(JSON.stringify(valor)).toString('base64url');
};

const generarToken = (payload, opciones = {}) => {
    const secreto = process.env.JWT_SECRET;

    if (!secreto || secreto.length < 32 || (process.env.NODE_ENV === 'production' && !secretoFuerte(secreto))) {
        throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
    }

    const ahora = Math.floor(Date.now() / 1000);
    const authTime = Number(opciones.authTime || payload.authTime || ahora);
    const expiracionAbsoluta = authTime + DURACION_SESION_SEGUNDOS;
    const expSolicitada = opciones.expiraEn
        ? Number(opciones.expiraEn)
        : ahora + Number(opciones.expiraEnSegundos || DURACION_SESION_SEGUNDOS);
    const exp = Math.min(expSolicitada, expiracionAbsoluta);
    if (!Number.isFinite(authTime) || !Number.isFinite(exp) || exp <= ahora) {
        throw new Error('La sesión alcanzó su duración máxima');
    }
    const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
    const datos = base64UrlEncode({
        ...payload,
        tokenVersion: Number(payload.tokenVersion || 0),
        iat: ahora,
        authTime,
        exp,
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE
    });
    const firma = firmar(header, datos, secreto);

    return `${header}.${datos}.${firma}`;
};

const verificarToken = (token) => {
    const secreto = process.env.JWT_SECRET;

    if (!secreto || secreto.length < 32 || (process.env.NODE_ENV === 'production' && !secretoFuerte(secreto))) {
        throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
    }

    const partes = token.split('.');

    if (partes.length !== 3) {
        throw new Error('Token invalido');
    }

    const [header, payload, firma] = partes;
    const encabezado = JSON.parse(base64UrlDecode(header));
    if (encabezado.alg !== 'HS256' || encabezado.typ !== 'JWT') {
        throw new Error('Algoritmo de token no permitido');
    }
    const firmaEsperada = firmar(header, payload, secreto);

    const firmaRecibida = Buffer.from(firma);
    const firmaValida = Buffer.from(firmaEsperada);
    if (firmaRecibida.length !== firmaValida.length || !crypto.timingSafeEqual(firmaRecibida, firmaValida)) {
        throw new Error('Firma invalida');
    }

    const datos = JSON.parse(base64UrlDecode(payload));
    const ahora = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(datos.exp) || !Number.isInteger(datos.iat) || !Number.isInteger(datos.authTime)) {
        throw new Error('Token sin vigencia válida');
    }
    if (datos.iss !== JWT_ISSUER || datos.aud !== JWT_AUDIENCE) throw new Error('Emisor o audiencia inválidos');
    if (datos.nbf !== undefined && (!Number.isInteger(datos.nbf) || ahora < datos.nbf)) throw new Error('Token aún no vigente');
    if (datos.iat > ahora + 60 || datos.authTime > datos.iat || datos.exp > datos.authTime + DURACION_SESION_SEGUNDOS) {
        throw new Error('Vigencia de token inválida');
    }
    if (ahora >= datos.exp) {
        throw new Error('Token expirado');
    }

    return datos;
};

const auth = async (req, res, next) => {
    try {
        const authorization = req.headers.authorization || '';
        const [tipo, token] = authorization.split(' ');

        if (tipo !== 'Bearer' || !token) {
            return res.status(401).json({ mensaje: 'Token de autenticacion requerido' });
        }

        const datosToken = verificarToken(token);
        const usuario = await Usuario.findById(datosToken.id).select('nombre apellido correo estado esSuperAdministrador tokenVersion debeCambiarContrasena');

        if (!usuario) {
            return res.status(401).json({ mensaje: 'Usuario no encontrado' });
        }

        if (usuario.estado === 'Inactivo') {
            return res.status(403).json({ mensaje: 'Usuario inactivo. Contacta al administrador.', code: 'ACCOUNT_INACTIVE' });
        }
        if (!versionTokenValida(datosToken, usuario)) {
            return res.status(401).json({ mensaje: 'La sesión fue revocada. Inicia sesión nuevamente.', code: 'SESSION_REVOKED' });
        }

        const filtroMembresia = {
            usuario: usuario._id,
            estado: 'Activo'
        };
        if (datosToken.organizacionId) filtroMembresia.organizacionId = datosToken.organizacionId;

        const membresia = await Membresia.findOne(filtroMembresia)
            .sort({ esPrincipal: -1, createdAt: 1 })
            .populate('organizacionId', 'nombre slug estado zonaHoraria fincaPrincipal plan');

        if (!membresia) {
            return res.status(403).json({
                mensaje: 'El acceso a esta organización fue revocado. Inicia sesión nuevamente.',
                code: 'ACCESS_REVOKED'
            });
        }

        const organizacion = membresia.organizacionId;
        if (!organizacion || organizacion.estado !== 'Activa') {
            return res.status(403).json({ mensaje: 'La organización no está activa.', code: 'ORGANIZATION_INACTIVE' });
        }
        const finca = await resolverFincaActiva({
            membresia,
            organizacion,
            fincaSolicitada: req.get('X-Finca-Id')
        });

        req.usuario = {
            id: usuario._id.toString(),
            nombre: usuario.nombre,
            apellido: usuario.apellido,
            correo: usuario.correo,
            rol: membresia.rol,
            estado: membresia.estado,
            esSuperAdministrador: usuario.esSuperAdministrador === true,
            debeCambiarContrasena: usuario.debeCambiarContrasena === true,
            tokenVersion: Number(usuario.tokenVersion || 0),
            authTime: datosToken.authTime,
            exp: datosToken.exp,
            membresiaId: membresia._id.toString(),
            organizacionId: organizacion._id.toString(),
            accesoTodasFincas: membresia.accesoTodasFincas === true,
            fincas: membresia.fincas || []
        };
        req.organizacionId = organizacion._id.toString();
        req.organizacion = organizacion;
        req.finca = finca;
        req.fincaId = finca._id.toString();
        req.fincaPrincipalId = organizacion.fincaPrincipal?.toString() || null;
        req.planSuscripcion = organizacion.plan || {};
        req.planVigente = ['Activo', 'Prueba'].includes(organizacion.plan?.estado || 'Activo');

        const politicaFincas = await obtenerPoliticaFincasOperativas(req.organizacionId);
        const fincaSoloLectura = politicaFincas.soloLectura.some((item) => String(item._id) === req.fincaId);
        req.fincaSoloLecturaPlan = fincaSoloLectura;
        const esMutacion = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        const cambiaSeleccionOperativa = req.originalUrl?.split('?')[0] === '/api/plan/fincas-operativas';
        if (fincaSoloLectura && esMutacion && !cambiaSeleccionOperativa) {
            return res.status(403).json({
                mensaje: 'Esta finca excede el cupo del plan actual y se encuentra en modo solo lectura.',
                code: 'PLAN_FINCA_EXCEDENTE_LECTURA'
            });
        }

        if (usuario.debeCambiarContrasena === true
            && !['/api/usuarios/perfil'].includes(req.originalUrl?.split('?')[0])) {
            return res.status(403).json({
                mensaje: 'Debes cambiar la contraseña temporal antes de continuar.',
                code: 'PASSWORD_CHANGE_REQUIRED'
            });
        }

        return ejecutarConOrganizacion(req.organizacionId, next, req.fincaId);
    } catch (error) {
        res.status(error.status || 401).json({
            mensaje: 'No autorizado',
            ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }),
            code: error.code
        });
    }
};

const authPlataforma = async (req, res, next) => {
    try {
        const authorization = req.headers.authorization || '';
        const [tipo, token] = authorization.split(' ');

        if (tipo !== 'Bearer' || !token) {
            return res.status(401).json({ mensaje: 'Token de autenticacion requerido' });
        }

        const datosToken = verificarToken(token);
        const usuario = await Usuario.findById(datosToken.id)
            .select('nombre apellido correo estado esSuperAdministrador tokenVersion');

        if (!usuario) return res.status(401).json({ mensaje: 'Usuario no encontrado' });
        if (usuario.estado !== 'Activo') {
            return res.status(403).json({ mensaje: 'Usuario inactivo. Contacta al administrador.' });
        }
        if (usuario.esSuperAdministrador !== true) {
            return res.status(403).json({ mensaje: 'Acceso exclusivo para administradores de la plataforma.' });
        }
        if (!versionTokenValida(datosToken, usuario)) {
            return res.status(401).json({ mensaje: 'La sesión fue revocada. Inicia sesión nuevamente.', code: 'SESSION_REVOKED' });
        }

        req.usuarioPlataforma = {
            id: usuario._id.toString(),
            nombre: usuario.nombre,
            apellido: usuario.apellido,
            correo: usuario.correo
        };
        req.usuario = {
            ...req.usuarioPlataforma,
            rol: 'SuperAdministrador',
            estado: usuario.estado,
            esSuperAdministrador: true
        };
        return next();
    } catch (error) {
        return res.status(401).json({
            mensaje: 'No autorizado',
            ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message })
        });
    }
};

const autorizarRoles = (...rolesPermitidos) => (req, res, next) => {
    if (!req.usuario) {
        return res.status(401).json({ mensaje: 'Token de autenticacion requerido' });
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
        return res.status(403).json({ mensaje: 'No tienes permisos para realizar esta accion' });
    }

    next();
};

const autorizarPermiso = (permiso) => (req, res, next) => {
    if (!req.usuario) {
        return res.status(401).json({ mensaje: 'Token de autenticacion requerido' });
    }

    if (!rolTienePermiso(req.usuario.rol, permiso)) {
        return res.status(403).json({ mensaje: 'No tienes permisos para realizar esta accion' });
    }

    next();
};

module.exports = {
    autorizarPermiso,
    autorizarRoles,
    auth,
    authPlataforma,
    generarToken,
    obtenerRolesPermiso,
    rolTienePermiso,
    verificarToken,
    versionTokenValida
};
