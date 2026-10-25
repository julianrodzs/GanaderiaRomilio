require('dotenv').config();
const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
const { Membresia } = require('../models/Membresia');
const Auditoria = require('../models/Auditoria');

const main = async () => {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI no configurado');
    await mongoose.connect(process.env.MONGODB_URI);
    const [usuarios, membresias, auditoriasUsuarios] = await Promise.all([
        Usuario.find({}).select('correo esSuperAdministrador createdAt').lean(),
        Membresia.find({}).setOptions({ omitirAislamientoOrganizacion: true }).lean(),
        Auditoria.find({ modulo: { $in: ['Usuarios', 'Autenticacion'] } })
            .setOptions({ omitirAislamientoOrganizacion: true }).sort({ createdAt: 1 }).lean()
    ]);
    const usuariosPorId = new Map(usuarios.map((item) => [String(item._id), item]));
    const organizacionesPorUsuario = new Map();
    membresias.forEach((item) => {
        const clave = String(item.usuario);
        organizacionesPorUsuario.set(clave, [...(organizacionesPorUsuario.get(clave) || []), String(item.organizacionId)]);
    });
    const enlacesHistoricos = membresias.filter((m) => {
        const usuario = usuariosPorId.get(String(m.usuario));
        return usuario?.createdAt && m.createdAt && new Date(usuario.createdAt) < new Date(m.createdAt) - 60000;
    }).map((m) => ({ usuario: usuariosPorId.get(String(m.usuario))?.correo, organizacionId: m.organizacionId, creadaEn: m.createdAt }));
    const cambiosContrasenaAdministrativos = auditoriasUsuarios.filter((a) => (
        a.metodo === 'PUT' && /\/api\/usuarios\//.test(a.ruta)
        && JSON.stringify(a.datos || {}).match(/contrasena|password/i)
        && String(a.usuario || '') !== String(a.recursoId || '')
    )).map((a) => ({ fecha: a.createdAt, actor: a.usuarioCorreo, ruta: a.ruta, organizacionId: a.organizacionId }));
    const multiOrganizacion = usuarios.map((u) => ({
        correo: u.correo,
        esSuperAdministrador: u.esSuperAdministrador === true,
        organizaciones: [...new Set(organizacionesPorUsuario.get(String(u._id)) || [])]
    })).filter((u) => u.organizaciones.length > 1 || (u.esSuperAdministrador && u.organizaciones.length));
    const logins = auditoriasUsuarios.filter((a) => a.metodo === 'POST' && /\/login/.test(a.ruta) && a.codigoRespuesta === 200);
    const loginsPosteriores = cambiosContrasenaAdministrativos.flatMap((cambio) => logins.filter((login) => (
        login.organizacionId && String(login.organizacionId) === String(cambio.organizacionId)
        && new Date(login.createdAt) >= new Date(cambio.fecha)
        && new Date(login.createdAt) - new Date(cambio.fecha) <= 60 * 60 * 1000
    )).map((login) => ({ cambio, login: { fecha: login.createdAt, usuario: login.usuarioCorreo } })));
    console.log(JSON.stringify({
        generadoEn: new Date().toISOString(), modo: 'SOLO_LECTURA',
        enlacesHistoricos, cambiosContrasenaAdministrativos, multiOrganizacion, loginsPosteriores
    }, null, 2));
};

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(() => mongoose.disconnect());
