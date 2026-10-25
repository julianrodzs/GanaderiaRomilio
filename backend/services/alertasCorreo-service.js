const { notificarTareaAsignada, ejecutarNotificacionSegura } = require('./tarea-notificacion-service');
const AlertaCorreo = require('../models/AlertaCorreo');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { sincronizarCategoriasAnimales } = require('./categoriaAnimal-service');
const Organizacion = require('../models/Organizacion');
const { Tarea } = require('../models/Tarea');
const { crearNotificacion } = require('./notificacion-service');
const { enviarCorreoResend } = require('./correoElectronico-service');
const { Membresia } = require('../models/Membresia');
const { listarFincasAccesibles } = require('./accesoFinca-service');
const { obtenerOrganizacionActual } = require('../context/organizacion-context');
const { escaparHtml } = require('./htmlSeguro-service');
const { claveFechaTarea, diasHastaTarea } = require('./tarea-integridad-service');
const { claveDiaEnZona } = require('./fechaZonaHoraria-service');
const { incrementarEmailsOperativos, tieneFeature } = require('./plan-service');

const MS_DIA = 1000 * 60 * 60 * 24;
const DIAS_ANTICIPACION = 7;
const FRECUENCIA_PROXIMA_DIAS = 6;
const FRECUENCIA_VENCIDA_DIAS = 2;
const FRECUENCIA_CRITICA_DIAS = 1;

const formatearFechaKey = claveFechaTarea;
const formatearFecha = (fecha, zona = 'America/Costa_Rica') => {
    const [anio, mes, dia] = claveFechaTarea(fecha, zona).split('-');
    return `${dia}/${mes}/${anio}`;
};
const diasHasta = diasHastaTarea;
const diasDesde = (fecha, zona) => fecha
    ? (Date.parse(claveDiaEnZona(new Date(), zona)) - Date.parse(claveDiaEnZona(fecha, zona))) / MS_DIA
    : Infinity;

const fechaObjetivoTarea = (tarea) => tarea.fechaLimite || tarea.fechaProgramada;

const categoriaTarea = (tarea) => {
    if (tarea.tipo === 'Sanidad' || tarea.moduloOrigen === 'Sanidad') return 'Sanidad';
    if (tarea.tipo === 'Reproducción' || tarea.moduloOrigen === 'Reproduccion') return 'Reproducción';
    return 'Tareas';
};

const tituloAlerta = (tarea, vencida) => {
    const categoria = categoriaTarea(tarea);
    if (categoria === 'Sanidad') return vencida ? 'Aplicación sanitaria vencida' : 'Aplicación sanitaria próxima';
    if (categoria === 'Reproducción') return vencida ? 'Actividad reproductiva vencida' : 'Actividad reproductiva próxima';
    return vencida ? 'Tarea vencida' : 'Tarea próxima';
};

const obtenerTareasParaRecordatorio = () => Tarea.find({
    estado: { $nin: ['Completada', 'Cancelada'] },
    $or: [
        { fechaLimite: { $exists: true, $ne: null } },
        { fechaProgramada: { $exists: true, $ne: null } }
    ]
}).populate('asignadoA', 'nombre apellido correo rol estado').lean();

const crearNotificacionesOperativas = async (tareas, zonaHoraria = 'America/Costa_Rica') => {
    let creadas = 0;
    for (const tarea of tareas) {
        if (!tarea.fincaId || !tarea.asignadoA?._id || tarea.asignadoA.estado === 'Inactivo') continue;
        // Reconciliar asignaciones pendientes sin crear duplicados, incluso fuera de la ventana de 7 días.
        const asignacion = await ejecutarNotificacionSegura(() => notificarTareaAsignada(tarea, tarea.creadoPor));
        if (asignacion?.creada) creadas += 1;
        const fechaObjetivo = fechaObjetivoTarea(tarea);
        if (!fechaObjetivo) continue;
        const dias = diasHasta(fechaObjetivo, zonaHoraria);
        if (dias > DIAS_ANTICIPACION) continue;

        const vencida = dias < 0;
        const estadoKey = vencida ? 'VENCIDA' : 'PROXIMA';
        const resultado = await crearNotificacion({
            destinatario: tarea.asignadoA._id,
            fincaId: tarea.fincaId,
            naturaleza: 'Operativa',
            tipo: `TAREA_${estadoKey}`,
            titulo: tituloAlerta(tarea, vencida),
            mensaje: vencida
                ? `La tarea '${tarea.titulo}' está vencida desde el ${formatearFecha(fechaObjetivo, zonaHoraria)}.`
                : `La tarea '${tarea.titulo}' tiene fecha objetivo ${formatearFecha(fechaObjetivo, zonaHoraria)}.`,
            moduloOrigen: 'Tareas',
            entidadTipo: 'Tarea',
            entidadId: tarea._id,
            url: `/tareas/${tarea._id}`,
            dedupKey: `TAREA_${tarea._id}_${estadoKey}_${formatearFechaKey(fechaObjetivo, zonaHoraria)}`,
            metadata: {
                fechaObjetivo,
                dias,
                prioridad: tarea.prioridad,
                moduloTarea: tarea.moduloOrigen,
                categoriaAutomatica: tarea.categoriaAutomatica
            }
        });
        if (resultado.creada) creadas += 1;
    }
    return creadas;
};

const debeEnviarCorreo = async (tarea, fechaObjetivo, dias, destinatario, zonaHoraria = 'America/Costa_Rica') => {
    const vencida = dias < 0;
    const critica = vencida && tarea.prioridad === 'Urgente';
    const clave = `tarea-${critica ? 'critica' : vencida ? 'vencida' : 'proxima'}:${tarea._id}:${destinatario || 'sin-destinatario'}`;
    const fechaObjetivoKey = formatearFechaKey(fechaObjetivo, zonaHoraria);
    const estado = destinatario ? await AlertaCorreo.findOne({ clave }) : null;
    const frecuenciaDias = critica ? FRECUENCIA_CRITICA_DIAS : vencida ? FRECUENCIA_VENCIDA_DIAS : FRECUENCIA_PROXIMA_DIAS;

    if (!estado || estado.fechaObjetivoKey !== fechaObjetivoKey || diasDesde(estado.ultimoEnvio, zonaHoraria) >= frecuenciaDias) {
        return { enviar: true, clave, fechaObjetivoKey, critica, vencida };
    }
    return { enviar: false };
};

const obtenerAlertasTareas = async (tareasPrecargadas = null, zonaHoraria = 'America/Costa_Rica') => {
    const tareas = tareasPrecargadas || await obtenerTareasParaRecordatorio();
    const alertas = [];
    for (const tarea of tareas) {
        const fecha = fechaObjetivoTarea(tarea);
        if (!fecha) continue;
        const dias = diasHasta(fecha, zonaHoraria);
        if (dias > DIAS_ANTICIPACION) continue;
        const revision = await debeEnviarCorreo(tarea, fecha, dias, null, zonaHoraria);
        if (!revision.enviar) continue;

        const categoria = categoriaTarea(tarea);
        alertas.push({
            ...revision,
            tarea,
            fecha,
            dias,
            categoria,
            asunto: revision.critica
                ? 'Alertas críticas de tareas'
                : revision.vencida
                    ? `Alertas de ${categoria.toLowerCase()} vencidas`
                    : `Alertas de ${categoria.toLowerCase()} próximas`
        });
    }
    return alertas;
};

const registrarEnvio = (alerta) => AlertaCorreo.findOneAndUpdate(
    { clave: alerta.clave },
    {
        $set: {
            tipo: alerta.vencida ? 'Tarea vencida' : 'Tarea próxima',
            referenciaModelo: 'Tarea',
            referenciaId: alerta.tarea._id,
            fechaObjetivoKey: alerta.fechaObjetivoKey,
            ultimoEnvio: new Date()
        },
        $inc: { vecesEnviada: 1 }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
);

const agruparPorAsunto = (alertas) => alertas.reduce((grupos, alerta) => {
    grupos[alerta.asunto] = [...(grupos[alerta.asunto] || []), alerta];
    return grupos;
}, {});

const crearTexto = (titulo, alertas, zonaHoraria) => `${titulo}\n\n${alertas.map((alerta) => (
    `- ${alerta.tarea.titulo}. Fecha: ${formatearFecha(alerta.fecha, zonaHoraria)}. ${alerta.dias < 0 ? `Días vencida: ${Math.abs(alerta.dias)}` : `Días restantes: ${alerta.dias}`}.`
)).join('\n')}`;

const crearHtml = (titulo, alertas, nombreOrganizacion, zonaHoraria) => `
    <h2>${escaparHtml(titulo)}</h2>
    <p>Estas tareas requieren seguimiento en ${escaparHtml(nombreOrganizacion)}.</p>
    <ul>${alertas.map((alerta) => `
        <li><strong>${escaparHtml(alerta.tarea.titulo)}</strong><br>
        Fecha objetivo: ${formatearFecha(alerta.fecha, zonaHoraria)}<br>
        ${alerta.dias < 0 ? `Días vencida: ${Math.abs(alerta.dias)}` : `Días restantes: ${alerta.dias}`}</li>
    `).join('')}</ul>
`;

const enviarCorreosTareas = async (alertas, nombreOrganizacion = 'la finca', zonaHoraria = 'America/Costa_Rica') => {
    if (process.env.EMAIL_ALERTS_ENABLED === 'false') return { enviadas: 0, grupos: 0, desactivado: true };
    const membresias = await Membresia.find({ organizacionId: obtenerOrganizacionActual(), estado: 'Activo', rol: 'Administrador' })
        .populate({ path: 'usuario', match: { estado: 'Activo' }, select: '_id correo' });
    let enviadas = 0;
    let alertasEnviadas = 0;
    const errores = [];
    for (const membresia of membresias) {
        if (!membresia.usuario?.correo) continue;
        try {
            const fincas = new Set((await listarFincasAccesibles(membresia)).map((finca) => String(finca._id)));
            const pendientes = [];
            for (const alerta of alertas) {
                if (!fincas.has(String(alerta.tarea.fincaId))) continue;
                const decision = await debeEnviarCorreo(alerta.tarea, alerta.fecha, alerta.dias, membresia.usuario._id, zonaHoraria);
                if (decision.enviar) pendientes.push({ ...alerta, ...decision });
            }
            for (const [asunto, grupo] of Object.entries(agruparPorAsunto(pendientes))) {
                const resultado = await enviarCorreoResend({
                    to: process.env.NODE_ENV !== 'production' && process.env.EMAIL_TEST_TO
                        ? process.env.EMAIL_TEST_TO
                        : membresia.usuario.correo,
                    subject: `${asunto} - ${nombreOrganizacion}`,
                    html: crearHtml(asunto, grupo, nombreOrganizacion, zonaHoraria),
                    text: crearTexto(asunto, grupo, zonaHoraria)
                });
                if (!resultado.enviado) continue;
                enviadas += 1;
                for (const alerta of grupo) { await registrarEnvio(alerta); alertasEnviadas += 1; }
            }
        } catch (error) { errores.push({ usuarioId: membresia.usuario._id, mensaje: error.message }); }
    }
    return { enviadas, alertasEnviadas, errores };
};

const procesarAlertasTareas = async ({ nombreOrganizacion, zonaHoraria = 'America/Costa_Rica' } = {}) => {
    if (!await tieneFeature('centroAlertas')) return { notificacionesCreadas: 0, correos: { enviadas: 0, desactivadoPorPlan: true } };
    const tareas = await obtenerTareasParaRecordatorio();
    const notificacionesCreadas = await crearNotificacionesOperativas(tareas, zonaHoraria);
    if (!await tieneFeature('emailsOperativos')) {
        return {
            notificacionesCreadas,
            correos: { enviadas: 0, grupos: 0, desactivadoPorPlan: true }
        };
    }
    const alertasCorreo = await obtenerAlertasTareas(tareas, zonaHoraria);
    const correos = await enviarCorreosTareas(alertasCorreo, nombreOrganizacion, zonaHoraria);
    if (correos.enviadas > 0) {
        await incrementarEmailsOperativos({ cantidad: correos.enviadas });
    }
    return { notificacionesCreadas, correos };
};

const procesarAlertasTodasOrganizaciones = async () => {
    const organizaciones = await Organizacion.find({ estado: 'Activa', 'plan.estado': { $in: ['Activo', 'Prueba'] } }).select('_id nombre zonaHoraria');
    const resultados = [];

    for (const organizacion of organizaciones) {
        try {
            const resultado = await ejecutarConOrganizacion(
                organizacion._id,
                async () => {
                    const [alertas, categoriasAnimales] = await Promise.all([
                        procesarAlertasTareas({ nombreOrganizacion: organizacion.nombre, zonaHoraria: organizacion.zonaHoraria }),
                        sincronizarCategoriasAnimales()
                    ]);
                    return { ...alertas, categoriasAnimales };
                }
            );
            resultados.push({
                organizacionId: organizacion._id,
                organizacion: organizacion.nombre,
                ...resultado
            });
        } catch (error) { resultados.push({ organizacionId: organizacion._id, error: error.message }); }
    }

    return resultados;
};

const enviarAlertasCorreo = procesarAlertasTodasOrganizaciones;

module.exports = {
    crearHtml,
    enviarCorreosTareas,
    crearNotificacionesOperativas,
    enviarAlertasCorreo,
    obtenerAlertasTareas,
    procesarAlertasTodasOrganizaciones,
    procesarAlertasTareas
};
