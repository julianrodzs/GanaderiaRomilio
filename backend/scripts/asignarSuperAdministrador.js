require('dotenv').config();

const mongoose = require('mongoose');
const { Membresia } = require('../models/Membresia');
const Usuario = require('../models/Usuario');

const aplicar = process.argv.includes('--apply');
const argumentoCorreo = process.argv.find((item) => item.startsWith('--email='));
const correoSolicitado = (argumentoCorreo?.split('=').slice(1).join('=') || process.env.SUPERADMIN_EMAIL || '')
    .trim()
    .toLowerCase();
const URI = process.env.MONGODB_URI || 'mongodb://localhost/dataganado';
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';

const obtenerCandidato = async () => {
    if (correoSolicitado) return Usuario.findOne({ correo: correoSolicitado });

    const membresia = await Membresia.findOne({ rol: 'Administrador', estado: 'Activo' })
        .sort({ esPrincipal: -1, createdAt: 1 })
        .populate('usuario');
    return membresia?.usuario || null;
};

const ejecutar = async () => {
    await mongoose.connect(URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 10_000 });
    if (aplicar && !correoSolicitado) {
        throw new Error('Para aplicar debes indicar --email=correo@dominio.com o configurar SUPERADMIN_EMAIL.');
    }
    const usuario = await obtenerCandidato();
    if (!usuario) {
        throw new Error(correoSolicitado
            ? `No existe un usuario con el correo ${correoSolicitado}.`
            : 'No existe un Administrador activo que pueda convertirse en SuperAdministrador.');
    }

    console.log(JSON.stringify({
        modo: aplicar ? 'APLICAR' : 'REVISION',
        usuario: usuario.correo,
        esSuperAdministradorActual: usuario.esSuperAdministrador === true
    }, null, 2));

    if (!aplicar) {
        console.log('Vista previa. Usa --apply para confirmar. Puedes indicar --email=correo@dominio.com.');
        return;
    }

    usuario.esSuperAdministrador = true;
    await usuario.save();
    console.log('SuperAdministrador de plataforma asignado correctamente.');
};

ejecutar()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
