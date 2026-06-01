const usuarioCtrl = {};

const crypto = require('crypto');
const Usuario = require('../models/Usuario');
const {
    crearTokenRecuperacion,
    enviarCorreoRecuperacion
} = require('../services/correoElectronico-service');
const { generarToken } = require('../middleware/auth');

usuarioCtrl.getUsuarios = async (req, res) => {
    const usuarios = await Usuario.find();
    res.json(usuarios);
}

usuarioCtrl.createUsuario = async (req, res) => {
    try {
        const {nombre, apellido, correo, contrasena, telefono, rol} = req.body;

        const usuarioExistente = await Usuario.findOne({ correo });

        if (usuarioExistente) {
            return res.status(400).json({mensaje: 'Ya existe un usuario con ese correo'});
        }

        const nuevoUsuario = new Usuario({
            nombre,
            apellido,
            correo,
            contrasena,
            telefono,
            rol: rol || 'Administrador'
        });
        const usuarioGuardado = await nuevoUsuario.save();

        res.status(201).json({
            mensaje: 'Usuario creado',
            usuario: {
                id: usuarioGuardado._id,
                nombre: usuarioGuardado.nombre,
                apellido: usuarioGuardado.apellido,
                correo: usuarioGuardado.correo,
                telefono: usuarioGuardado.telefono,
                rol: usuarioGuardado.rol
            }
        });
    } catch (error) {
        res.status(400).json({mensaje: 'Error al crear usuario', error: error.message});
    }
}

usuarioCtrl.loginUsuario = async (req, res) => {
    try {
        const { correo, contrasena } = req.body;

        if (!correo || !contrasena) {
            return res.status(400).json({ mensaje: 'Correo y contrasena son requeridos' });
        }

        const usuario = await Usuario.findOne({ correo });

        if (!usuario || usuario.contrasena !== contrasena) {
            return res.status(401).json({ mensaje: 'Credenciales invalidas' });
        }

        const token = generarToken({
            id: usuario._id.toString(),
            correo: usuario.correo,
            nombre: usuario.nombre,
            rol: usuario.rol || 'Administrador'
        });

        res.json({
            token,
            usuario: {
                id: usuario._id,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                correo: usuario.correo,
                rol: usuario.rol || 'Administrador'
            }
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al iniciar sesion', error: error.message });
    }
};

usuarioCtrl.getPerfil = async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.usuario.id).select('-contrasena -recuperacionContrasenaToken -recuperacionContrasenaExpira');

        if (!usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        res.json({
            usuario: {
                id: usuario._id,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                correo: usuario.correo,
                telefono: usuario.telefono,
                rol: usuario.rol || 'Administrador'
            }
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener perfil', error: error.message });
    }
};

usuarioCtrl.getUsuario = async (req, res) => {
    const usuario = await Usuario.findById(req.params.id);
    res.json(usuario);
}

usuarioCtrl.deleteUsuario = async (req, res) => {
    await Usuario.findByIdAndDelete(req.params.id);
    res.json({mensaje: 'Usuario eliminado'});
}

usuarioCtrl.updateUsuario = async (req, res) => {
    const {nombre, apellido, correo, contrasena, telefono, rol} = req.body;
    await Usuario.findByIdAndUpdate(req.params.id, {
        nombre,
        apellido,
        correo,
        contrasena,
        telefono,
        rol
    })
    res.json({mensaje: 'Usuario actualizado'});
};

usuarioCtrl.solicitarRecuperacionContrasena = async (req, res) => {
    try {
        const { correo } = req.body;

        if (!correo) {
            return res.status(400).json({ mensaje: 'El correo es requerido' });
        }

        const usuario = await Usuario.findOne({ correo });

        if (!usuario) {
            return res.json({ mensaje: 'Si el correo existe, se enviaran instrucciones de recuperacion' });
        }

        const token = crearTokenRecuperacion();
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        usuario.recuperacionContrasenaToken = tokenHash;
        usuario.recuperacionContrasenaExpira = new Date(Date.now() + 1000 * 60 * 30);
        await usuario.save();

        await enviarCorreoRecuperacion({
            correo: usuario.correo,
            nombre: usuario.nombre,
            token
        });

        res.json({ mensaje: 'Si el correo existe, se enviaran instrucciones de recuperacion' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al solicitar recuperacion de contrasena', error: error.message });
    }
};

usuarioCtrl.restablecerContrasena = async (req, res) => {
    try {
        const { token, contrasena } = req.body;

        if (!token || !contrasena) {
            return res.status(400).json({ mensaje: 'Token y contrasena son requeridos' });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const usuario = await Usuario.findOne({
            recuperacionContrasenaToken: tokenHash,
            recuperacionContrasenaExpira: { $gt: new Date() }
        });

        if (!usuario) {
            return res.status(400).json({ mensaje: 'Token invalido o expirado' });
        }

        usuario.contrasena = contrasena;
        usuario.recuperacionContrasenaToken = undefined;
        usuario.recuperacionContrasenaExpira = undefined;
        await usuario.save();

        res.json({ mensaje: 'Contrasena actualizada correctamente' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al restablecer contrasena', error: error.message });
    }
};

module.exports = usuarioCtrl;
