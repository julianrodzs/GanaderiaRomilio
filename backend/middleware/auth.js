const crypto = require('crypto');
const { obtenerRolesPermiso, rolTienePermiso } = require('../config/permisosRoles');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { Membresia } = require('../models/Membresia');
require('../models/Organizacion');
const Usuario = require('../models/Usuario');
const { resolverFincaActiva } = require('../services/accesoFinca-service');

const base64UrlDecode = (valor) => {
    const base64 = valor.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf8');
};

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

    if (!secreto) {
        throw new Error('JWT_SECRET no configurado');
    }

    const ahora = Math.floor(Date.now() / 1000);
    const expiraEn = opciones.expiraEnSegundos || 60 * 60 * 8;
    const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
    const datos = base64UrlEncode({
        ...payload,
        iat: ahora,
        exp: ahora + expiraEn
    });
    const firma = firmar(header, datos, secreto);

    return `${header}.${datos}.${firma}`;
};

const verificarToken = (token) => {
    const secreto = process.env.JWT_SECRET;

    if (!secreto) {
        throw new Error('JWT_SECRET no configurado');
    }

    const partes = token.split('.');

    if (partes.length !== 3) {
        throw new Error('Token invalido');
    }

    const [header, payload, firma] = partes;
    const firmaEsperada = firmar(header, payload, secreto);

    if (firma !== firmaEsperada) {
        throw new Error('Firma invalida');
    }

    const datos = JSON.parse(base64UrlDecode(payload));

    if (datos.exp && Date.now() >= datos.exp * 1000) {
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
        const usuario = await Usuario.findById(datosToken.id).select('nombre apellido correo estado esSuperAdministrador');

        if (!usuario) {
            return res.status(401).json({ mensaje: 'Usuario no encontrado' });
        }

        if (usuario.estado === 'Inactivo') {
            return res.status(403).json({ mensaje: 'Usuario inactivo. Contacta al administrador.' });
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
            return res.status(403).json({ mensaje: 'El usuario no tiene acceso activo a una organización.' });
        }

        const organizacion = membresia.organizacionId;
        if (!organizacion || organizacion.estado !== 'Activa') {
            return res.status(403).json({ mensaje: 'La organización no está activa.' });
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

        return ejecutarConOrganizacion(req.organizacionId, next, req.fincaId);
    } catch (error) {
        res.status(error.status || 401).json({ mensaje: 'No autorizado', error: error.message, code: error.code });
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
            .select('nombre apellido correo estado esSuperAdministrador');

        if (!usuario) return res.status(401).json({ mensaje: 'Usuario no encontrado' });
        if (usuario.estado !== 'Activo') {
            return res.status(403).json({ mensaje: 'Usuario inactivo. Contacta al administrador.' });
        }
        if (usuario.esSuperAdministrador !== true) {
            return res.status(403).json({ mensaje: 'Acceso exclusivo para administradores de la plataforma.' });
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
        return res.status(401).json({ mensaje: 'No autorizado', error: error.message });
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
    verificarToken
};
