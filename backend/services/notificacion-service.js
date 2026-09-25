const Notificacion = require('../models/Notificacion');
const Usuario = require('../models/Usuario');

let emisorTiempoReal = null;

const nombreUsuario = (usuario) => {
    if (!usuario) return 'El sistema';
    return [usuario.nombre, usuario.apellido].filter(Boolean).join(' ') || usuario.correo || 'Un usuario';
};

const normalizarId = (valor) => valor?._id?.toString() || valor?.toString() || null;

const configurarEmisorTiempoReal = (emisor) => {
    emisorTiempoReal = typeof emisor === 'function' ? emisor : null;
};

const emitirNotificacionTiempoReal = async (notificacion) => {
    if (!emisorTiempoReal) return false;
    await emisorTiempoReal(notificacion);
    return true;
};

const crearNotificacion = async (datos) => {
    const destinatario = normalizarId(datos.destinatario);
    if (!destinatario) throw new Error('El destinatario de la notificación es requerido');

    if (datos.dedupKey) {
        const existente = await Notificacion.findOne({ destinatario, dedupKey: datos.dedupKey });
        if (existente) return { notificacion: existente, creada: false };
    }

    try {
        const notificacion = await Notificacion.create({
            ...datos,
            destinatario,
            actor: normalizarId(datos.actor) || null,
            leida: false,
            fechaLectura: null
        });
        await emitirNotificacionTiempoReal(notificacion);
        return { notificacion, creada: true };
    } catch (error) {
        if (error?.code === 11000 && datos.dedupKey) {
            const existente = await Notificacion.findOne({ destinatario, dedupKey: datos.dedupKey });
            return { notificacion: existente, creada: false };
        }
        throw error;
    }
};

const crearNotificacionesParaUsuarios = async (usuarios, datos) => {
    const ids = [...new Set((usuarios || []).map(normalizarId).filter(Boolean))];
    const resultados = [];
    for (const destinatario of ids) {
        resultados.push(await crearNotificacion({ ...datos, destinatario }));
    }
    return resultados;
};

const notificarPorRoles = async (roles, datos, opciones = {}) => {
    const filtro = { rol: { $in: [...new Set(roles || [])] }, estado: 'Activo' };
    if (opciones.excluirUsuario) filtro._id = { $ne: opciones.excluirUsuario };
    const usuarios = await Usuario.find(filtro).select('_id');
    return crearNotificacionesParaUsuarios(usuarios, datos);
};

const rolesDestinoPorActor = (rolActor) => {
    if (rolActor === 'Trabajador' || rolActor === 'Veterinario') return ['Encargado', 'Administrador'];
    if (rolActor === 'Encargado' || rolActor === 'Contador') return ['Administrador'];
    return [];
};

const notificarAccion = async ({ actor, rolesDestino, ...datos }) => {
    const actorId = normalizarId(actor);
    const actorCompleto = actor?.rol
        ? actor
        : actorId
            ? await Usuario.findById(actorId).select('nombre apellido correo rol estado')
            : null;

    if (actorCompleto?.rol === 'Consulta') return [];
    const roles = rolesDestino || rolesDestinoPorActor(actorCompleto?.rol);
    if (!roles.length) return [];

    return notificarPorRoles(
        roles,
        { ...datos, actor: actorId },
        { excluirUsuario: actorId }
    );
};

const notificarAccionSegura = async (datos) => {
    try {
        return await notificarAccion(datos);
    } catch (error) {
        console.error('No se pudo crear la notificación informativa:', error.message);
        return [];
    }
};

const obtenerNotificacionesUsuario = async (usuarioId, filtros = {}) => {
    const page = Math.max(Number(filtros.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filtros.limit) || 20, 1), 100);
    const consulta = { destinatario: usuarioId };

    if (filtros.leida === 'true' || filtros.leida === true) consulta.leida = true;
    if (filtros.leida === 'false' || filtros.leida === false) consulta.leida = false;
    if (filtros.naturaleza) consulta.naturaleza = filtros.naturaleza;
    if (filtros.tipo) consulta.tipo = filtros.tipo;
    if (filtros.moduloOrigen) consulta.moduloOrigen = filtros.moduloOrigen;

    const [items, total] = await Promise.all([
        Notificacion.find(consulta)
            .populate('actor', 'nombre apellido correo rol')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Notificacion.countDocuments(consulta)
    ]);

    return { items, total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) };
};

const obtenerCantidadNoLeidas = (usuarioId) => Notificacion.countDocuments({
    destinatario: usuarioId,
    leida: false
});

const marcarComoLeida = async (notificacionId, usuarioId) => Notificacion.findOneAndUpdate(
    { _id: notificacionId, destinatario: usuarioId },
    { $set: { leida: true, fechaLectura: new Date() } },
    { new: true }
).populate('actor', 'nombre apellido correo rol');

const marcarTodasComoLeidas = async (usuarioId) => Notificacion.updateMany(
    { destinatario: usuarioId, leida: false },
    { $set: { leida: true, fechaLectura: new Date() } }
);

const existeDedupKey = (destinatario, dedupKey) => Notificacion.exists({ destinatario, dedupKey });

module.exports = {
    configurarEmisorTiempoReal,
    crearNotificacion,
    crearNotificacionesParaUsuarios,
    emitirNotificacionTiempoReal,
    existeDedupKey,
    marcarComoLeida,
    marcarTodasComoLeidas,
    nombreUsuario,
    notificarAccion,
    notificarAccionSegura,
    notificarPorRoles,
    obtenerCantidadNoLeidas,
    obtenerNotificacionesUsuario,
    rolesDestinoPorActor
};
