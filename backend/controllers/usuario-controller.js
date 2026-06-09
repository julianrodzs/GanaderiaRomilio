const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Usuario = require('../models/Usuario');
const {
    crearTokenRecuperacion,
    enviarCorreoRecuperacion
} = require('../services/correoElectronico-service');
const { generarToken } = require('../middleware/auth');

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

usuarioCtrl.getUsuarios = async (req, res) => {
    try {
        const usuarios = await Usuario.find().select(CAMPOS_PRIVADOS).sort({ createdAt: -1 });
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener usuarios', error: error.message });
    }
};

usuarioCtrl.getUsuarioById = async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.params.id).select(CAMPOS_PRIVADOS);

        if (!usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        res.json(usuario);
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

        res.status(201).json({
            mensaje: 'Usuario creado',
            usuario: limpiarUsuario(usuarioGuardado)
        });
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear usuario', error: error.message });
    }
};

usuarioCtrl.actualizarUsuario = async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.params.id);

        if (!usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        const { nombre, apellido, correo, contrasena, telefono, rol, estado } = req.body;

        if (correo && await validarCorreoDuplicado(correo, req.params.id)) {
            return res.status(400).json({ mensaje: 'Ya existe un usuario con ese correo' });
        }

        if (nombre !== undefined) usuario.nombre = nombre;
        if (apellido !== undefined) usuario.apellido = apellido;
        if (correo !== undefined) usuario.correo = normalizarCorreo(correo);
        if (telefono !== undefined) usuario.telefono = telefono;
        if (rol !== undefined) usuario.rol = rol;
        if (estado !== undefined) usuario.estado = estado;
        if (contrasena) usuario.contrasena = await hashContrasena(contrasena);

        const usuarioActualizado = await usuario.save();

        res.json({
            mensaje: 'Usuario actualizado',
            usuario: limpiarUsuario(usuarioActualizado)
        });
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar usuario', error: error.message });
    }
};

usuarioCtrl.cambiarEstadoUsuario = async (req, res) => {
    try {
        const { estado } = req.body;

        if (!['Activo', 'Inactivo'].includes(estado)) {
            return res.status(400).json({ mensaje: 'Estado invalido' });
        }

        const usuario = await Usuario.findByIdAndUpdate(
            req.params.id,
            { estado },
            { new: true, runValidators: true }
        ).select(CAMPOS_PRIVADOS);

        if (!usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        res.json({
            mensaje: 'Estado de usuario actualizado',
            usuario
        });
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al cambiar estado del usuario', error: error.message });
    }
};

usuarioCtrl.eliminarUsuario = async (req, res) => {
    try {
        const usuario = await Usuario.findByIdAndDelete(req.params.id).select(CAMPOS_PRIVADOS);

        if (!usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        res.json({ mensaje: 'Usuario eliminado', usuario });
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

        usuario.ultimoAcceso = new Date();
        await usuario.save();

        const token = generarToken({
            id: usuario._id.toString(),
            correo: usuario.correo,
            nombre: usuario.nombre,
            rol: usuario.rol || 'Encargado'
        });

        res.json({
            token,
            usuario: limpiarUsuario(usuario)
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al iniciar sesion', error: error.message });
    }
};

usuarioCtrl.getPerfil = async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.usuario.id).select(CAMPOS_PRIVADOS);

        if (!usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        if (usuario.estado === 'Inactivo') {
            return res.status(403).json({ mensaje: 'Usuario inactivo' });
        }

        res.json({ usuario: limpiarUsuario(usuario) });
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
