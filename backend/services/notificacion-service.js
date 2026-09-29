const Notificacion = require('../models/Notificacion');
const { obtenerOrganizacionActual } = require('../context/organizacion-context');
const { Membresia } = require('../models/Membresia');

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
    const filtro = {
        organizacionId: obtenerOrganizacionActual(),
        rol: { $in: [...new Set(roles || [])] },
        estado: 'Activo'
    };
    if (opciones.excluirUsuario) filtro.usuario = { $ne: opciones.excluirUsuario };
    const membresias = await Membresia.find(filtro).populate({
        path: 'usuario',
        match: { estado: 'Activo' },
        select: '_id'
    });
    return crearNotificacionesParaUsuarios(
        membresias.map((item) => item.usuario?._id).filter(Boolean),
        datos
    );
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
            ? await Membresia.findOne({
                organizacionId: obtenerOrganizacionActual(),
                usuario: actorId,
                estado: 'Activo'
            }).populate('usuario', 'nombre apellido correo estado')
            : null;

    const actorConRol = actorCompleto?.usuario
        ? { ...actorCompleto.usuario.toObject(), rol: actorCompleto.rol, estado: actorCompleto.estado }
        : actorCompleto;

    if (actorConRol?.rol === 'Consulta') return [];
    const roles = rolesDestino || rolesDestinoPorActor(actorConRol?.rol);
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
