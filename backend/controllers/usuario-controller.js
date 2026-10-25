const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Membresia } = require('../models/Membresia');
const Usuario = require('../models/Usuario');
const Finca = require('../models/Finca');
const Invitacion = require('../models/Invitacion');
const {
    crearTokenRecuperacion,
    enviarCorreoInvitacion,
    enviarCorreoRecuperacion
} = require('../services/correoElectronico-service');
const { generarToken } = require('../middleware/auth');
const { rolTienePermiso } = require('../config/permisosRoles');
const { listarUsuariosAsignables } = require('../services/usuarioAsignable-service');
const { asegurarPuedeCrearUsuario, ejecutarConReservaCuota, puedeUsarRol } = require('../services/plan-service');
const { respuestaErrorPlan } = require('../middleware/plan');
const { listarFincasAccesibles } = require('../services/accesoFinca-service');
const { validarContrasena } = require('../services/contrasena-service');
const { ejecutarProtegiendoAdministradores } = require('../services/membresia-seguridad-service');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');

const usuarioCtrl = {};
const MENSAJE_RECUPERACION = 'Si el correo existe, se enviarán instrucciones para recuperar la contraseña.';
const MENSAJE_TOKEN_INVALIDO = 'El enlace de recuperación es inválido o ha expirado.';
const CAMPOS_PRIVADOS = '-contrasena -resetPasswordToken -resetPasswordExpires -resetPasswordRequestedAt -resetPasswordRequestIp -recuperacionContrasenaToken -recuperacionContrasenaExpira';
const HASH_RELLENO = bcrypt.hashSync('Credencial-inexistente-2026', 10);
const MENSAJE_INVITACION = 'Se envió una invitación a ese correo.';
const CAMPOS_MEMBRESIA = new Set(['rol', 'fincas', 'estadoMembresia', 'accesoTodasFincas']);

const limpiarUsuario = (usuario) => {
    const datos = usuario.toObject ? usuario.toObject() : usuario;
    delete datos.contrasena;
    delete datos.resetPasswordToken;
    delete datos.resetPasswordExpires;
    delete datos.resetPasswordRequestedAt;
    delete datos.resetPasswordRequestIp;
    delete datos.tokenVersion;
    return datos;
};

const hashContrasena = (contrasena) => bcrypt.hash(contrasena, 10);

const esHashBcrypt = (valor = '') => /^\$2[aby]\$/.test(valor);

const normalizarCorreo = (correo = '') => correo.trim().toLowerCase();

const contieneClavePeligrosa = (valor) => {
    if (!valor || typeof valor !== 'object') return false;
    return Object.entries(valor).some(([clave, contenido]) => (
        clave.startsWith('$') || clave.includes('.') || contieneClavePeligrosa(contenido)
    ));
};

const validarDtoCerrado = (body, permitidos) => {
    if (!body || typeof body !== 'object' || Array.isArray(body) || contieneClavePeligrosa(body)) {
        const error = new Error('La solicitud contiene campos no permitidos.');
        error.status = 400;
        throw error;
    }
    const desconocidos = Object.keys(body).filter((clave) => !permitidos.has(clave));
    if (desconocidos.length) {
        const error = new Error(`Campos no permitidos: ${desconocidos.join(', ')}.`);
        error.status = 400;
        throw error;
    }
};

const listarOrganizacionesUsuario = async (usuarioId) => {
    const membresias = await Membresia.find({ usuario: usuarioId, estado: 'Activo' })
        .populate('organizacionId', 'nombre slug estado zonaHoraria fincaPrincipal')
        .sort({ esPrincipal: -1, createdAt: 1 });
    return membresias
        .filter((item) => item.organizacionId?.estado === 'Activa')
        .map((item) => ({
            id: item.organizacionId._id,
            nombre: item.organizacionId.nombre,
            slug: item.organizacionId.slug,
            rol: item.rol,
            esPrincipal: item.esPrincipal
        }));
};

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
        organizacionId: membresia.organizacionId?._id || membresia.organizacionId,
        accesoTodasFincas: membresia.accesoTodasFincas === true,
        fincas: membresia.fincas || []
    });
};

const obtenerMembresiaUsuario = (organizacionId, usuarioId) => Membresia.findOne({
    organizacionId,
    usuario: usuarioId
}).populate('usuario');

const ocultarSuperAdministrador = (membresia) => (
    membresia?.usuario?.esSuperAdministrador === true ? null : membresia
);

const crearInvitacion = async ({ req, correo, usuarioExistente, datos, accesoFincas }) => {
    if (usuarioExistente?.esSuperAdministrador) {
        const error = new Error('Usuario no encontrado');
        error.status = 404;
        throw error;
    }
    await Invitacion.updateMany(
        { organizacionId: req.organizacionId, correo, estado: 'Pendiente' },
        { $set: { estado: 'Revocada' } }
    );
    const token = crearTokenRecuperacion();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const invitacion = await Invitacion.create({
        organizacionId: req.organizacionId,
        correo,
        usuario: usuarioExistente?._id || null,
        nombre: datos.nombre || usuarioExistente?.nombre,
        apellido: datos.apellido || usuarioExistente?.apellido,
        telefono: datos.telefono || usuarioExistente?.telefono,
        rol: datos.rol || 'Encargado',
        estadoMembresia: datos.estadoMembresia || datos.estado || 'Activo',
        ...accesoFincas,
        tokenHash,
        expiraEn: new Date(Date.now() + 72 * 60 * 60 * 1000),
        invitadoPor: req.usuario.id
    });
    try {
        await enviarCorreoInvitacion({
            correo,
            nombre: datos.nombre || usuarioExistente?.nombre,
            organizacion: req.organizacion?.nombre || 'tu organización',
            token,
            cuentaExistente: Boolean(usuarioExistente)
        });
    } catch (error) {
        await Invitacion.deleteOne({ _id: invitacion._id });
        throw error;
    }
};

const validarAccesoFincas = async ({ accesoTodasFincas, fincas, organizacionId }) => {
    if (accesoTodasFincas !== false) return { accesoTodasFincas: true, fincas: [] };
    const ids = [...new Set((fincas || []).map(String).filter(Boolean))];
    if (!ids.length) {
        const error = new Error('Selecciona al menos una finca o habilita el acceso a todas.');
        error.status = 400;
        throw error;
    }
    const cantidad = await Finca.countDocuments({ _id: { $in: ids }, organizacionId });
    if (cantidad !== ids.length) {
        const error = new Error('La selección contiene una finca que no pertenece a la organización.');
        error.status = 400;
        throw error;
    }
    return { accesoTodasFincas: false, fincas: ids };
};

usuarioCtrl.getUsuarios = async (req, res) => {
    try {
        const membresias = await Membresia.find({ organizacionId: req.organizacionId })
            .populate({ path: 'usuario', select: CAMPOS_PRIVADOS })
            .sort({ createdAt: -1 });
        res.json(membresias
            .filter((item) => item.usuario && item.usuario.esSuperAdministrador !== true)
            .map(presentarMembresia));
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
            IATF: 'reproduccion.iatfCrear',
            ProtocolosEngorde: 'lotes.protocoloCrear',
            BandasPorcinas: 'reproduccion.protocoloPorcinoCrear',
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
        const membresia = ocultarSuperAdministrador(await obtenerMembresiaUsuario(req.organizacionId, req.params.id));

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
        const { nombre, apellido, correo, contrasena, telefono, rol, estado, estadoMembresia, accesoTodasFincas, fincas, sinAccesoCorreo } = req.body;

        if (!correo) return res.status(400).json({ mensaje: 'El correo es requerido' });
        const correoNormalizado = normalizarCorreo(correo);
        const usuarioExistente = await Usuario.findOne({ correo: correoNormalizado });

        if (!usuarioExistente && !nombre) {
            return res.status(400).json({ mensaje: 'Nombre y correo son requeridos' });
        }
        if (usuarioExistente?.esSuperAdministrador || (usuarioExistente && usuarioExistente.estado !== 'Activo')) {
            return res.status(201).json({ mensaje: MENSAJE_INVITACION });
        }
        if (usuarioExistente && await Membresia.exists({ organizacionId: req.organizacionId, usuario: usuarioExistente._id })) {
            return res.status(409).json({ mensaje: 'Este usuario ya pertenece a la organización.' });
        }
        const permisoCreacion = await asegurarPuedeCrearUsuario({
            organizacionId: req.organizacionId,
            rol: rol || 'Encargado',
            estado: estadoMembresia || estado || 'Activo'
        });
        const accesoFincas = await validarAccesoFincas({ accesoTodasFincas, fincas, organizacionId: req.organizacionId });

        if (usuarioExistente || sinAccesoCorreo !== true) {
            await ejecutarConReservaCuota({
                permiso: permisoCreacion,
                recurso: 'usuarios',
                organizacionId: req.organizacionId,
                operacion: () => crearInvitacion({
                    req,
                    correo: correoNormalizado,
                    usuarioExistente,
                    datos: req.body,
                    accesoFincas
                })
            });
            return res.status(201).json({ mensaje: MENSAJE_INVITACION });
        }

        validarContrasena(contrasena);

        const { usuarioGuardado, membresia } = await ejecutarConReservaCuota({
            permiso: permisoCreacion,
            recurso: 'usuarios',
            organizacionId: req.organizacionId,
            operacion: async () => {
                const usuarioGuardado = await new Usuario({
                    nombre, apellido, correo: correoNormalizado,
                    contrasena: await hashContrasena(contrasena), telefono,
                    rol: rol || 'Encargado', estado: 'Activo', debeCambiarContrasena: true
                }).save();
                try {
                    const membresia = await Membresia.create({
                        organizacionId: req.organizacionId,
                        usuario: usuarioGuardado._id,
                        rol: rol || 'Encargado', estado: estadoMembresia || estado || 'Activo', ...accesoFincas
                    });
                    return { usuarioGuardado, membresia };
                } catch (error) {
                    await Usuario.deleteOne({ _id: usuarioGuardado._id });
                    throw error;
                }
            }
        });

        res.status(201).json({
            mensaje: 'Usuario creado con contraseña temporal',
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
        validarDtoCerrado(req.body, CAMPOS_MEMBRESIA);
        const membresia = ocultarSuperAdministrador(await obtenerMembresiaUsuario(req.organizacionId, req.params.id));
        const usuario = membresia?.usuario;

        if (!usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        const { rol, estadoMembresia, accesoTodasFincas, fincas } = req.body;
        req.auditoriaAntes = {
            rol: membresia.rol, estadoMembresia: membresia.estado,
            accesoTodasFincas: membresia.accesoTodasFincas, fincas: membresia.fincas
        };
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
        let permisoReactivacion = null;
        if (estadoMembresia === 'Activo' && membresia.estado !== 'Activo') {
            permisoReactivacion = await asegurarPuedeCrearUsuario({
                organizacionId: req.organizacionId,
                rol: rol || membresia.rol,
                estado: estadoMembresia
            });
        }
        if (accesoTodasFincas !== undefined || fincas !== undefined) {
            const acceso = await validarAccesoFincas({
                accesoTodasFincas: accesoTodasFincas !== undefined ? accesoTodasFincas : membresia.accesoTodasFincas,
                fincas: fincas !== undefined ? fincas : membresia.fincas,
                organizacionId: req.organizacionId
            });
            if (String(req.params.id) === String(req.usuario.id)
                && !acceso.accesoTodasFincas
                && !acceso.fincas.map(String).includes(String(req.fincaId))) {
                return res.status(409).json({ mensaje: 'No puedes quitarte el acceso a la finca que estás utilizando.' });
            }
            membresia.accesoTodasFincas = acceso.accesoTodasFincas;
            membresia.fincas = acceso.fincas;
        }

        const guardarUsuario = async () => {
            if (rol !== undefined) membresia.rol = rol;
            if (estadoMembresia !== undefined) membresia.estado = estadoMembresia;
            await membresia.save();
            return usuario;
        };
        const operacion = () => (permisoReactivacion
            ? ejecutarConReservaCuota({ permiso: permisoReactivacion, recurso: 'usuarios', organizacionId: req.organizacionId, operacion: guardarUsuario })
            : guardarUsuario());
        const usuarioActualizado = await ejecutarProtegiendoAdministradores({
            organizacionId: req.organizacionId,
            membresia,
            siguienteRol: rol,
            siguienteEstado: estadoMembresia,
            operacion
        });
        req.auditoriaDespues = {
            rol: membresia.rol, estadoMembresia: membresia.estado,
            accesoTodasFincas: membresia.accesoTodasFincas, fincas: membresia.fincas
        };

        res.json({
            mensaje: 'Usuario actualizado',
            usuario: presentarMembresia({
                ...membresia.toObject(),
                usuario: usuarioActualizado
            })
        });
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al actualizar usuario' });
    }
};

usuarioCtrl.cambiarEstadoUsuario = async (req, res) => {
    try {
        const { estado } = req.body;

        if (!['Activo', 'Inactivo'].includes(estado)) {
            return res.status(400).json({ mensaje: 'Estado invalido' });
        }

        const membresia = ocultarSuperAdministrador(await obtenerMembresiaUsuario(req.organizacionId, req.params.id));

        if (!membresia?.usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }
        req.auditoriaAntes = { rol: membresia.rol, estadoMembresia: membresia.estado };
        let permisoReactivacion = null;
        if (estado === 'Activo' && membresia.estado !== 'Activo') {
            permisoReactivacion = await asegurarPuedeCrearUsuario({
                organizacionId: req.organizacionId,
                rol: membresia.rol,
                estado
            });
        }

        const guardarEstado = async () => { membresia.estado = estado; return membresia.save(); };
        const operacion = () => (permisoReactivacion
            ? ejecutarConReservaCuota({ permiso: permisoReactivacion, recurso: 'usuarios', organizacionId: req.organizacionId, operacion: guardarEstado })
            : guardarEstado());
        await ejecutarProtegiendoAdministradores({
            organizacionId: req.organizacionId, membresia, siguienteEstado: estado, operacion
        });
        req.auditoriaDespues = { rol: membresia.rol, estadoMembresia: estado };

        res.json({
            mensaje: 'Estado de usuario actualizado',
            usuario: presentarMembresia(membresia)
        });
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al cambiar estado del usuario' });
    }
};

usuarioCtrl.eliminarUsuario = async (req, res) => {
    try {
        const membresia = ocultarSuperAdministrador(await obtenerMembresiaUsuario(req.organizacionId, req.params.id));

        if (!membresia?.usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        const usuario = presentarMembresia(membresia);
        req.auditoriaAntes = { rol: membresia.rol, estadoMembresia: membresia.estado, acceso: 'presente' };
        await ejecutarProtegiendoAdministradores({
            organizacionId: req.organizacionId,
            membresia,
            siguienteEstado: 'Inactivo',
            operacion: () => Membresia.deleteOne({ _id: membresia._id, organizacionId: req.organizacionId })
        });
        req.auditoriaDespues = { acceso: 'eliminado' };

        res.json({ mensaje: 'Acceso del usuario eliminado de la organización', usuario });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: error.message || 'Error al eliminar usuario' });
    }
};

usuarioCtrl.loginUsuario = async (req, res) => {
    try {
        const { correo, contrasena } = req.body;

        if (!correo || !contrasena) {
            return res.status(400).json({ mensaje: 'Correo y contrasena son requeridos' });
        }

        const usuario = await Usuario.findOne({ correo: normalizarCorreo(correo) }).select('+contrasena');
        const hashComparacion = usuario && esHashBcrypt(usuario.contrasena) ? usuario.contrasena : HASH_RELLENO;
        const comparacionBcrypt = await bcrypt.compare(contrasena, hashComparacion);
        const contrasenaValida = Boolean(usuario) && (esHashBcrypt(usuario.contrasena)
            ? comparacionBcrypt
            : usuario.contrasena === contrasena);

        if (!contrasenaValida) {
            return res.status(401).json({ mensaje: 'Credenciales invalidas' });
        }
        if (usuario.estado === 'Inactivo') {
            return res.status(403).json({ mensaje: 'Usuario inactivo. Contacta al administrador.' });
        }

        if (!esHashBcrypt(usuario.contrasena)) {
            usuario.contrasena = await hashContrasena(contrasena);
        }

        const membresias = await Membresia.find({
            usuario: usuario._id,
            estado: 'Activo'
        }).populate('organizacionId', 'nombre slug estado zonaHoraria fincaPrincipal');

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
            organizacionId: membresia.organizacionId._id.toString(),
            tokenVersion: Number(usuario.tokenVersion || 0)
        });
        req.usuario = {
            id: usuario._id.toString(), nombre: usuario.nombre, apellido: usuario.apellido,
            correo: usuario.correo, rol: membresia.rol
        };
        const fincas = await listarFincasAccesibles(membresia);
        const finca = fincas.find((item) => String(item._id) === String(membresia.organizacionId.fincaPrincipal)) || fincas[0];

        res.json({
            token,
            usuario: {
                ...limpiarUsuario(usuario),
                rol: membresia.rol,
                estado: membresia.estado,
                organizacionId: membresia.organizacionId._id
            },
            organizacion: membresia.organizacionId,
            finca,
            fincaId: finca?._id,
            fincas,
            organizaciones: await listarOrganizacionesUsuario(usuario._id)
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

        const fincas = await listarFincasAccesibles(membresia);
        res.json({
            usuario: presentarMembresia(membresia),
            organizacion: req.organizacion,
            finca: req.finca,
            fincaId: req.fincaId,
            fincas,
            organizaciones: await listarOrganizacionesUsuario(usuario._id)
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener perfil', error: error.message });
    }
};

usuarioCtrl.actualizarPerfil = async (req, res) => {
    try {
        validarDtoCerrado(req.body, new Set(['nombre', 'apellido', 'telefono', 'contrasenaActual', 'contrasenaNueva']));
        const usuario = await Usuario.findById(req.usuario.id).select('+contrasena +resetPasswordToken +resetPasswordExpires');
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

        const cambiaContrasena = Boolean(req.body.contrasenaNueva);
        if (cambiaContrasena) {
            if (!req.body.contrasenaActual) return res.status(400).json({ mensaje: 'La contraseña actual es requerida.' });
            const correcta = esHashBcrypt(usuario.contrasena)
                ? await bcrypt.compare(req.body.contrasenaActual, usuario.contrasena)
                : usuario.contrasena === req.body.contrasenaActual;
            if (!correcta) return res.status(401).json({ mensaje: 'La contraseña actual no es correcta.' });
            validarContrasena(req.body.contrasenaNueva);
            usuario.contrasena = await hashContrasena(req.body.contrasenaNueva);
            usuario.tokenVersion = Number(usuario.tokenVersion || 0) + 1;
            usuario.debeCambiarContrasena = false;
            usuario.resetPasswordToken = undefined;
            usuario.resetPasswordExpires = undefined;
        }
        if (req.body.nombre !== undefined) usuario.nombre = req.body.nombre;
        if (req.body.apellido !== undefined) usuario.apellido = req.body.apellido;
        if (req.body.telefono !== undefined) usuario.telefono = req.body.telefono;
        await usuario.save();
        res.json({
            mensaje: cambiaContrasena
                ? 'Perfil actualizado. Inicia sesión nuevamente con tu nueva contraseña.'
                : 'Perfil actualizado.',
            requiereNuevoInicioSesion: cambiaContrasena,
            usuario: limpiarUsuario(usuario)
        });
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'No se pudo actualizar el perfil.' });
    }
};

usuarioCtrl.eliminarPerfil = async (req, res) => {
    try {
        validarDtoCerrado(req.body, new Set(['contrasenaActual', 'confirmacion']));
        if (req.body.confirmacion !== 'ELIMINAR MI CUENTA') {
            return res.status(400).json({ mensaje: 'La confirmación de eliminación no es válida.' });
        }
        const usuario = await Usuario.findById(req.usuario.id).select('+contrasena');
        const correcta = usuario && (esHashBcrypt(usuario.contrasena)
            ? await bcrypt.compare(req.body.contrasenaActual || '', usuario.contrasena)
            : usuario.contrasena === req.body.contrasenaActual);
        if (!correcta) return res.status(401).json({ mensaje: 'La contraseña actual no es correcta.' });
        const membresias = await Membresia.find({ usuario: usuario._id, estado: 'Activo' });
        for (const membresia of membresias) {
            if (membresia.rol === 'Administrador') {
                const otros = await Membresia.countDocuments({
                    organizacionId: membresia.organizacionId,
                    _id: { $ne: membresia._id }, rol: 'Administrador', estado: 'Activo'
                });
                if (!otros) return res.status(409).json({ mensaje: 'Transfiere la administración antes de eliminar tu cuenta.' });
            }
        }
        const marca = `${usuario._id}.${Date.now()}@anonimizado.invalid`;
        usuario.nombre = 'Usuario eliminado';
        usuario.apellido = '';
        usuario.telefono = undefined;
        usuario.correo = marca;
        usuario.estado = 'Inactivo';
        usuario.tokenVersion = Number(usuario.tokenVersion || 0) + 1;
        usuario.contrasena = await hashContrasena(crypto.randomBytes(32).toString('hex'));
        await usuario.save();
        await Membresia.updateMany({ usuario: usuario._id }, { $set: { estado: 'Inactivo' } });
        res.json({ mensaje: 'Cuenta anonimizada y accesos revocados.' });
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'No se pudo eliminar la cuenta.' });
    }
};

usuarioCtrl.aceptarPrivacidad = async (req, res) => {
    try {
        validarDtoCerrado(req.body, new Set(['version']));
        if (!req.body.version || String(req.body.version).length > 40) return res.status(400).json({ mensaje: 'Versión de privacidad no válida.' });
        await Usuario.updateOne({ _id: req.usuario.id }, {
            $set: { consentimiento: { version: String(req.body.version), aceptadoEn: new Date() } }
        });
        res.json({ mensaje: 'Aceptación registrada.' });
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message });
    }
};

usuarioCtrl.getMisOrganizaciones = async (req, res) => {
    try {
        res.json(await listarOrganizacionesUsuario(req.usuario.id));
    } catch (error) {
        res.status(500).json({ mensaje: 'No se pudieron consultar las organizaciones.', error: error.message });
    }
};

usuarioCtrl.cambiarOrganizacionActiva = async (req, res) => {
    try {
        const organizacionId = req.body.organizacionId;
        const membresia = await Membresia.findOne({
            organizacionId,
            usuario: req.usuario.id,
            estado: 'Activo'
        }).populate('organizacionId', 'nombre slug estado zonaHoraria fincaPrincipal');
        if (!membresia || membresia.organizacionId?.estado !== 'Activa') {
            return res.status(403).json({ mensaje: 'No tienes acceso activo a esta organización.' });
        }

        const usuario = await Usuario.findById(req.usuario.id);
        const fincas = await listarFincasAccesibles(membresia);
        const finca = fincas.find((item) => String(item._id) === String(membresia.organizacionId.fincaPrincipal)) || fincas[0];
        if (!finca) return res.status(409).json({ mensaje: 'La organización no tiene una finca activa disponible.' });

        const token = generarToken({
            id: usuario._id.toString(),
            correo: usuario.correo,
            nombre: usuario.nombre,
            rol: membresia.rol,
            organizacionId: membresia.organizacionId._id.toString(),
            tokenVersion: Number(usuario.tokenVersion || 0)
        }, { authTime: req.usuario.authTime, expiraEn: req.usuario.exp });
        res.json({
            token,
            usuario: {
                ...limpiarUsuario(usuario),
                rol: membresia.rol,
                estado: membresia.estado,
                organizacionId: membresia.organizacionId._id
            },
            organizacion: membresia.organizacionId,
            finca,
            fincaId: finca._id,
            fincas,
            organizaciones: await listarOrganizacionesUsuario(usuario._id)
        });
    } catch (error) {
        res.status(400).json({ mensaje: 'No se pudo cambiar de organización.', error: error.message });
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

        validarContrasena(contrasena);

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const usuario = await Usuario.findOneAndUpdate({
            resetPasswordToken: tokenHash,
            resetPasswordExpires: { $gt: new Date() }
        }, {
            $set: {
                contrasena: await hashContrasena(contrasena),
                debeCambiarContrasena: false
            },
            $inc: { tokenVersion: 1 },
            $unset: {
                resetPasswordToken: 1,
                resetPasswordExpires: 1,
                resetPasswordRequestedAt: 1,
                resetPasswordRequestIp: 1
            }
        }, { new: true });

        if (!usuario) {
            return res.status(400).json({ message: MENSAJE_TOKEN_INVALIDO });
        }

        res.json({ message: 'Contraseña actualizada correctamente.' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al restablecer contrasena', error: error.message });
    }
};

const consumirInvitacion = async (token) => Invitacion.findOneAndUpdate({
    tokenHash: crypto.createHash('sha256').update(String(token || '')).digest('hex'),
    estado: 'Pendiente',
    expiraEn: { $gt: new Date() }
}, {
    $set: { estado: 'Aceptada', aceptadaEn: new Date() }
}, { new: true }).select('+tokenHash');

const crearMembresiaInvitada = (invitacion, usuarioId) => Membresia.create({
    organizacionId: invitacion.organizacionId,
    usuario: usuarioId,
    rol: invitacion.rol,
    estado: invitacion.estadoMembresia,
    accesoTodasFincas: invitacion.accesoTodasFincas,
    fincas: invitacion.fincas
});

usuarioCtrl.aceptarInvitacionNueva = async (req, res) => {
    try {
        const { token, contrasena } = req.body;
        validarContrasena(contrasena);
        const tokenHash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
        const resultado = await ejecutarEnTransaccion(async (session) => {
            const invitacion = await Invitacion.findOne({
                tokenHash,
                estado: 'Pendiente',
                expiraEn: { $gt: new Date() }
            }).select('+tokenHash').session(session);
            if (!invitacion) {
                const error = new Error('La invitación es inválida o ha expirado.');
                error.status = 400;
                throw error;
            }

            if (invitacion.usuario && invitacion.requiereContrasena) {
                const usuario = await Usuario.findOne({
                    _id: invitacion.usuario,
                    correo: invitacion.correo
                }).select('+contrasena +resetPasswordToken +resetPasswordExpires').session(session);
                if (!usuario) {
                    const error = new Error('La invitación es inválida o ha expirado.');
                    error.status = 400;
                    throw error;
                }
                usuario.contrasena = await hashContrasena(contrasena);
                usuario.estado = 'Activo';
                usuario.tokenVersion = Number(usuario.tokenVersion || 0) + 1;
                usuario.resetPasswordToken = undefined;
                usuario.resetPasswordExpires = undefined;
                usuario.resetPasswordRequestedAt = undefined;
                usuario.resetPasswordRequestIp = undefined;
                await usuario.save({ session });

                const membresia = await Membresia.findOneAndUpdate(
                    { organizacionId: invitacion.organizacionId, usuario: usuario._id },
                    { $set: { estado: 'Activo', rol: invitacion.rol } },
                    { new: true, session, runValidators: true }
                );
                if (!membresia) throw new Error('No se encontró la membresía asociada a la invitación.');

                const consumida = await Invitacion.updateOne(
                    { _id: invitacion._id, estado: 'Pendiente' },
                    { $set: { estado: 'Aceptada', aceptadaEn: new Date() } },
                    { session }
                );
                if (consumida.modifiedCount !== 1) {
                    const error = new Error('La invitación ya fue utilizada.');
                    error.status = 409;
                    throw error;
                }
                return { aprovisionamiento: true };
            }

            if (invitacion.usuario) {
                const error = new Error('La invitación requiere iniciar sesión.');
                error.status = 400;
                throw error;
            }
            const existente = await Usuario.findOne({ correo: invitacion.correo }).session(session);
            if (existente) {
                const error = new Error('Inicia sesión con el correo invitado para aceptar.');
                error.status = 409;
                throw error;
            }
            const [usuario] = await Usuario.create([{
                nombre: invitacion.nombre,
                apellido: invitacion.apellido,
                telefono: invitacion.telefono,
                correo: invitacion.correo,
                contrasena: await hashContrasena(contrasena),
                estado: 'Activo'
            }], { session, ordered: true });
            await Membresia.create([{
                organizacionId: invitacion.organizacionId,
                usuario: usuario._id,
                rol: invitacion.rol,
                estado: invitacion.estadoMembresia,
                accesoTodasFincas: invitacion.accesoTodasFincas,
                fincas: invitacion.fincas
            }], { session, ordered: true });
            const consumida = await Invitacion.updateOne(
                { _id: invitacion._id, estado: 'Pendiente' },
                { $set: { estado: 'Aceptada', aceptadaEn: new Date(), usuario: usuario._id } },
                { session }
            );
            if (consumida.modifiedCount !== 1) throw new Error('La invitación ya fue utilizada.');
            return { aprovisionamiento: false };
        });
        res.status(resultado.aprovisionamiento ? 200 : 201).json({ mensaje: 'Invitación aceptada. Ya puedes iniciar sesión.' });
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'No se pudo aceptar la invitación.' });
    }
};

usuarioCtrl.aceptarInvitacionExistente = async (req, res) => {
    let invitacion;
    try {
        invitacion = await consumirInvitacion(req.body.token);
        if (!invitacion || !invitacion.usuario) return res.status(400).json({ mensaje: 'La invitación es inválida o ha expirado.' });
        if (normalizarCorreo(invitacion.correo) !== normalizarCorreo(req.usuario.correo)
            || String(invitacion.usuario) !== String(req.usuario.id)) {
            await Invitacion.updateOne({ _id: invitacion._id }, { $set: { estado: 'Pendiente' }, $unset: { aceptadaEn: 1 } });
            return res.status(403).json({ mensaje: 'La invitación pertenece a otro correo.' });
        }
        const usuario = await Usuario.findById(req.usuario.id);
        if (usuario?.esSuperAdministrador) {
            await Invitacion.updateOne({ _id: invitacion._id }, { $set: { estado: 'Revocada' } });
            return res.status(404).json({ mensaje: 'Invitación no encontrada.' });
        }
        await crearMembresiaInvitada(invitacion, req.usuario.id);
        res.status(201).json({ mensaje: 'Invitación aceptada.' });
    } catch (error) {
        if (invitacion?._id) await Invitacion.updateOne({ _id: invitacion._id }, { $set: { estado: 'Pendiente' }, $unset: { aceptadaEn: 1 } }).catch(() => null);
        res.status(error?.code === 11000 ? 409 : (error.status || 400)).json({ mensaje: error?.code === 11000 ? 'Ya perteneces a esta organización.' : error.message });
    }
};

usuarioCtrl._seguridad = { contieneClavePeligrosa, validarDtoCerrado };

module.exports = usuarioCtrl;
