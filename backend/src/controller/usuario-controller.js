const usuarioCtrl = {};

const Usuario = require('../models/Usuario');

usuarioCtrl.getUsuarios = async (req, res) => {
    const usuarios = await Usuario.find();
    res.json(usuarios);
}

usuarioCtrl.createUsuario = async (req, res) => {
    const {nombre, apellido, correo, contrasena, telefono} = req.body;
    const nuevoUsuario = new Usuario({
        nombre: nombre,
        apellido: apellido,
        correo: correo,
        contrasena: contrasena,
        telefono: telefono
    });
    await nuevoUsuario.save();
    res.json({mensaje: 'Usuario creado'});
}

usuarioCtrl.getUsuario = async (req, res) => {
    const usuario = await Usuario.findById(req.params.id);
    res.json(usuario);
}

usuarioCtrl.deleteUsuario = async (req, res) => {
    await Usuario.findByIdAndDelete(req.params.id);
    res.json({mensaje: 'Usuario eliminado'});
}

usuarioCtrl.updateUsuario = async (req, res) => {
    const {nombre, apellido, correo, contrasena, telefono} = req.body;
    await Usuario.findByIdAndUpdate(req.params.id, {
        nombre,
        apellido,
        correo,
        contrasena,
        telefono
    })
    res.json({mensaje: 'Usuario actualizado'});
};

module.exports = usuarioCtrl;