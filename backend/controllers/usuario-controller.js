const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Membresia } = require('../models/Membresia');
const Usuario = require('../models/Usuario');
const {
    crearTokenRecuperacion,
    enviarCorreoRecuperacion
} = require('../services/correoElectronico-service');
const { generarToken } = require('../middleware/auth');
const { rolTienePermiso } = require('../config/permisosRoles');
const { listarUsuariosAsignables } = require('../services/usuarioAsignable-service');
const { asegurarPuedeCrearUsuario, puedeUsarRol } = require('../services/plan-service');
const { respuestaErrorPlan } = require('../middleware/plan');

const usuarioCtrl = {};
const MENSAJE_RECUPERACION = 'Si el correo existe, se enviarán instrucciones para recuperar la contraseña.';
const MENSAJE_TOKEN_INVALIDO = 'El enlace de recuperación es inválido o ha expirado.';
const CAMPOS_PRIVADOS = '-contrasena -resetPasswordToken -resetPasswordExpires -resetPasswordRequestedAt -resetPasswordRequestIp -recuperacionContrasenaToken -recuperacionContrasenaExpira';

const limpiarUsuario = (usuario) => {
    const datos = usuario.toObject ? usuario.toObject() : usuario;
    delete datos.contrasena;
    delete datos.resetPasswordToken;
    delete datos.resetPasswordExpires;
    delete datos.resetPasswordRequestedAt;
    delete datos.resetPasswordRequestIp;
    return datos;
};

const hashContrasena = (contrasena) => bcrypt.hash(contrasena, 10);

const esHashBcrypt = (valor = '') => /^\$2[aby]\$/.test(valor);

const normalizarCorreo = (correo = '') => correo.trim().toLowerCase();

const validarCorreoDuplicado = async (correo, usuarioId = null) => {
    const filtro = { correo: normalizarCorreo(correo) };

    if (usuarioId) {
        filtro._id = { $ne: usuarioId };
    }

    const usuarioExistente = await Usuario.findOne(filtro);
    return Boolean(usuarioExistente);
};

const presentarMembresia = (membresia) => {
    const usuario = membresia.usuario?.toObject
        ? membresia.usuario.toObject()
        : { ...(membresia.usuario || {}) };

    return limpiarUsuario({
        ...usuario,
        rol: membresia.rol,
        estado: membresia.estado,
        membresiaId: membresia._id,
        organizacionId: membresia.organizacionId?._id || membresia.organizacionId
    });
};

const obtenerMembresiaUsuario = (organizacionId, usuarioId) => Membresia.findOne({
    organizacionId,
    usuario: usuarioId
}).populate('usuario');

usuarioCtrl.getUsuarios = async (req, res) => {
    try {
        const membresias = await Membresia.find({ organizacionId: req.organizacionId })
            .populate({ path: 'usuario', select: CAMPOS_PRIVADOS })
            .sort({ createdAt: -1 });
        res.json(membresias.filter((item) => item.usuario).map(presentarMembresia));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener usuarios', error: error.message });
    }
};

usuarioCtrl.getUsuariosAsignables = async (req, res) => {
    try {
        const modulo = req.query.modulo;
        const permisoPorModulo = {
            Sanidad: 'sanidad.gestionar',
            Reproduccion: 'reproduccion.gestionar',
            Tareas: 'tareas.gestionar'
        };
        const permiso = permisoPorModulo[modulo];

        if (!permiso) return res.status(400).json({ mensaje: 'Módulo de asignación no válido' });
        if (!rolTienePermiso(req.usuario?.rol, permiso)) {
            return res.status(403).json({ mensaje: 'No tienes permisos para consultar responsables de este módulo' });
        }

        res.json(await listarUsuariosAsignables(modulo, req.organizacionId));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener usuarios asignables', error: error.message });
    }
};

usuarioCtrl.getUsuarioById = async (req, res) => {
    try {
        const membresia = await obtenerMembresiaUsuario(req.organizacionId, req.params.id);

        if (!membresia?.usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        res.json(presentarMembresia(membresia));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener usuario', error: error.message });
    }
};

usuarioCtrl.crearUsuario = async (req, res) => {
    try {
        const { nombre, apellido, correo, contrasena, telefono, rol, estado } = req.body;

        if (!nombre || !correo || !contrasena) {
            return res.status(400).json({ mensaje: 'Nombre, correo y contrasena son requeridos' });
        }

        if (await validarCorreoDuplicado(correo)) {
            return res.status(400).json({ mensaje: 'Ya existe un usuario con ese correo' });
        }
        await asegurarPuedeCrearUsuario({
            organizacionId: req.organizacionId,
            rol: rol || 'Encargado',
            estado: estado || 'Activo'
        });

        const nuevoUsuario = new Usuario({
            nombre,
            apellido,
            correo: normalizarCorreo(correo),
            contrasena: await hashContrasena(contrasena),
            telefono,
            rol: rol || 'Encargado',
            estado: estado || 'Activo'
        });

        const usuarioGuardado = await nuevoUsuario.save();
        let membresia;
        try {
            membresia = await Membresia.create({
                organizacionId: req.organizacionId,
                usuario: usuarioGuardado._id,
                rol: rol || 'Encargado',
                estado: estado || 'Activo'
            });
        } catch (error) {
            await Usuario.deleteOne({ _id: usuarioGuardado._id });
            throw error;
        }

        res.status(201).json({
            mensaje: 'Usuario creado',
            usuario: presentarMembresia({
                ...membresia.toObject(),
                usuario: usuarioGuardado
            })
        });
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(400).json({ mensaje: 'Error al crear usuario', error: error.message });
    }
};

usuarioCtrl.actualizarUsuario = async (req, res) => {
    try {
        const membresia = await obtenerMembresiaUsuario(req.organizacionId, req.params.id);
        const usuario = membresia?.usuario;

        if (!usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        const { nombre, apellido, correo, contrasena, telefono, rol, estado } = req.body;

        if (correo && await validarCorreoDuplicado(correo, req.params.id)) {
            return res.status(400).json({ mensaje: 'Ya existe un usuario con ese correo' });
        }
        if (rol !== undefined && rol !== membresia.rol) {
            const resultadoRol = await puedeUsarRol(rol, req.organizacionId);
            if (!resultadoRol.permitido) {
                const error = new Error(resultadoRol.message);
                error.name = 'PlanError';
                error.code = resultadoRol.code;
                error.status = 403;
                error.rolesPermitidos = resultadoRol.rolesPermitidos;
                throw error;
            }
        }
        if (estado === 'Activo' && membresia.estado !== 'Activo') {
            await asegurarPuedeCrearUsuario({
                organizacionId: req.organizacionId,
                rol: rol || membresia.rol,
                estado
            });
        }

        if (nombre !== undefined) usuario.nombre = nombre;
        if (apellido !== undefined) usuario.apellido = apellido;
        if (correo !== undefined) usuario.correo = normalizarCorreo(correo);
        if (telefono !== undefined) usuario.telefono = telefono;
        if (contrasena) usuario.contrasena = await hashContrasena(contrasena);

        if (rol !== undefined) membresia.rol = rol;
        if (estado !== undefined) membresia.estado = estado;

        const usuarioActualizado = await usuario.save();
        await membresia.save();

        res.json({
            mensaje: 'Usuario actualizado',
            usuario: presentarMembresia({
                ...membresia.toObject(),
                usuario: usuarioActualizado
            })
        });
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(400).json({ mensaje: 'Error al actualizar usuario', error: error.message });
    }
};

usuarioCtrl.cambiarEstadoUsuario = async (req, res) => {
    try {
        const { estado } = req.body;

        if (!['Activo', 'Inactivo'].includes(estado)) {
            return res.status(400).json({ mensaje: 'Estado invalido' });
        }

        const membresia = await obtenerMembresiaUsuario(req.organizacionId, req.params.id);

        if (!membresia?.usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }
        if (estado === 'Activo' && membresia.estado !== 'Activo') {
            await asegurarPuedeCrearUsuario({
                organizacionId: req.organizacionId,
                rol: membresia.rol,
                estado
            });
        }

        membresia.estado = estado;
        await membresia.save();

        res.json({
            mensaje: 'Estado de usuario actualizado',
            usuario: presentarMembresia(membresia)
        });
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(400).json({ mensaje: 'Error al cambiar estado del usuario', error: error.message });
    }
};

usuarioCtrl.eliminarUsuario = async (req, res) => {
    try {
        const membresia = await obtenerMembresiaUsuario(req.organizacionId, req.params.id);

        if (!membresia?.usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        const usuario = presentarMembresia(membresia);
        await Membresia.deleteOne({ _id: membresia._id, organizacionId: req.organizacionId });

        res.json({ mensaje: 'Acceso del usuario eliminado de la organización', usuario });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar usuario', error: error.message });
    }
};

usuarioCtrl.loginUsuario = async (req, res) => {
    try {
        const { correo, contrasena } = req.body;

        if (!correo || !contrasena) {
            return res.status(400).json({ mensaje: 'Correo y contrasena son requeridos' });
        }

        const usuario = await Usuario.findOne({ correo: normalizarCorreo(correo) });

        if (!usuario) {
            return res.status(401).json({ mensaje: 'Credenciales invalidas' });
        }

        if (usuario.estado === 'Inactivo') {
            return res.status(403).json({ mensaje: 'Usuario inactivo. Contacta al administrador.' });
        }

        const contrasenaValida = esHashBcrypt(usuario.contrasena)
            ? await bcrypt.compare(contrasena, usuario.contrasena)
            : usuario.contrasena === contrasena;

        if (!contrasenaValida) {
            return res.status(401).json({ mensaje: 'Credenciales invalidas' });
        }

        if (!esHashBcrypt(usuario.contrasena)) {
            usuario.contrasena = await hashContrasena(contrasena);
        }

        const membresias = await Membresia.find({
            usuario: usuario._id,
            estado: 'Activo'
        }).populate('organizacionId', 'nombre slug estado zonaHoraria');

        const membresiasActivas = membresias.filter((item) => item.organizacionId?.estado === 'Activa');
        const organizacionSolicitada = req.body.organizacionId;
        const membresia = organizacionSolicitada
            ? membresiasActivas.find((item) => item.organizacionId._id.toString() === organizacionSolicitada)
            : membresiasActivas.find((item) => item.esPrincipal) || membresiasActivas[0];

        if (!membresia) {
            return res.status(403).json({ mensaje: 'El usuario no tiene acceso activo a una organización.' });
        }

        req.auditoriaOrganizacionId = membresia.organizacionId._id.toString();

        usuario.ultimoAcceso = new Date();
        await usuario.save();

        const token = generarToken({
            id: usuario._id.toString(),
            correo: usuario.correo,
            nombre: usuario.nombre,
            rol: membresia.rol,
            organizacionId: membresia.organizacionId._id.toString()
        });

        res.json({
            token,
            usuario: {
                ...limpiarUsuario(usuario),
                rol: membresia.rol,
                estado: membresia.estado,
                organizacionId: membresia.organizacionId._id
            },
            organizacion: membresia.organizacionId,
            organizaciones: membresiasActivas.map((item) => ({
                id: item.organizacionId._id,
                nombre: item.organizacionId.nombre,
                slug: item.organizacionId.slug,
                rol: item.rol,
                esPrincipal: item.esPrincipal
            }))
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al iniciar sesion', error: error.message });
    }
};

usuarioCtrl.getPerfil = async (req, res) => {
    try {
        const membresia = await obtenerMembresiaUsuario(req.organizacionId, req.usuario.id);
        const usuario = membresia?.usuario;

        if (!usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        if (membresia.estado === 'Inactivo' || usuario.estado === 'Inactivo') {
            return res.status(403).json({ mensaje: 'Usuario inactivo' });
        }

        res.json({
            usuario: presentarMembresia(membresia),
            organizacion: req.organizacion
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener perfil', error: error.message });
    }
};

usuarioCtrl.solicitarRecuperacionContrasena = async (req, res) => {
    try {
        const { correo } = req.body;

        if (!correo) {
            return res.status(400).json({ mensaje: 'El correo es requerido' });
        }

        const usuario = await Usuario.findOne({ correo: normalizarCorreo(correo) });

        if (!usuario) {
            return res.json({ message: MENSAJE_RECUPERACION });
        }

        const token = crearTokenRecuperacion();
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        usuario.resetPasswordToken = tokenHash;
        usuario.resetPasswordExpires = new Date(Date.now() + 1000 * 60 * 30);
        usuario.resetPasswordRequestedAt = new Date();
        usuario.resetPasswordRequestIp = req.ip;
        await usuario.save();

        await enviarCorreoRecuperacion({
            correo: usuario.correo,
            nombre: usuario.nombre,
            token
        });

        res.json({ message: MENSAJE_RECUPERACION });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al solicitar recuperacion de contrasena', error: error.message });
    }
};

usuarioCtrl.restablecerContrasena = async (req, res) => {
    try {
        const { token } = req.body;
        const contrasena = req.body.password || req.body.contrasena;

        if (!token || !contrasena) {
            return res.status(400).json({ message: 'Token y contraseña son requeridos.' });
        }

        if (contrasena.length < 8) {
            return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const usuario = await Usuario.findOne({
            resetPasswordToken: tokenHash,
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!usuario) {
            return res.status(400).json({ message: MENSAJE_TOKEN_INVALIDO });
        }

        usuario.contrasena = await hashContrasena(contrasena);
        usuario.resetPasswordToken = undefined;
        usuario.resetPasswordExpires = undefined;
        usuario.resetPasswordRequestedAt = undefined;
        usuario.resetPasswordRequestIp = undefined;
        await usuario.save();

        res.json({ message: 'Contraseña actualizada correctamente.' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al restablecer contrasena', error: error.message });
    }
};

module.exports = usuarioCtrl;
