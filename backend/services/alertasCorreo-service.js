const AlertaCorreo = require('../models/AlertaCorreo');
const { Tarea } = require('../models/Tarea');
const { crearNotificacion } = require('./notificacion-service');
const { enviarCorreoAdministradores } = require('./correoElectronico-service');

const MS_DIA = 1000 * 60 * 60 * 24;
const DIAS_ANTICIPACION = 7;
const FRECUENCIA_PROXIMA_DIAS = 6;
const FRECUENCIA_VENCIDA_DIAS = 2;
const FRECUENCIA_CRITICA_DIAS = 1;

const normalizarDia = (fecha = new Date()) => {
    const dia = new Date(fecha);
    dia.setHours(0, 0, 0, 0);
    return dia;
};

const formatearFechaKey = (fecha) => normalizarDia(fecha).toISOString().slice(0, 10);

const formatearFecha = (fecha) => new Date(fecha).toLocaleDateString('es-CR', {
    year: 'numeric', month: '2-digit', day: '2-digit'
});

const diasHasta = (fecha) => Math.ceil((normalizarDia(fecha).getTime() - normalizarDia().getTime()) / MS_DIA);

const diasDesde = (fecha) => {
    if (!fecha) return Infinity;
    return Math.floor((normalizarDia().getTime() - normalizarDia(fecha).getTime()) / MS_DIA);
};

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

const crearNotificacionesOperativas = async (tareas) => {
    let creadas = 0;
    for (const tarea of tareas) {
        if (!tarea.asignadoA?._id || tarea.asignadoA.estado === 'Inactivo') continue;
        const fechaObjetivo = fechaObjetivoTarea(tarea);
        if (!fechaObjetivo) continue;
        const dias = diasHasta(fechaObjetivo);
        if (dias > DIAS_ANTICIPACION) continue;

        const vencida = dias < 0;
        const estadoKey = vencida ? 'VENCIDA' : 'PROXIMA';
        const resultado = await crearNotificacion({
            destinatario: tarea.asignadoA._id,
            naturaleza: 'Operativa',
            tipo: `TAREA_${estadoKey}`,
            titulo: tituloAlerta(tarea, vencida),
            mensaje: vencida
                ? `La tarea '${tarea.titulo}' está vencida desde el ${formatearFecha(fechaObjetivo)}.`
                : `La tarea '${tarea.titulo}' está programada para ${dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `dentro de ${dias} días`}.`,
            moduloOrigen: 'Tareas',
            entidadTipo: 'Tarea',
            entidadId: tarea._id,
            url: `/tareas/${tarea._id}`,
            dedupKey: `TAREA_${tarea._id}_${estadoKey}_${formatearFechaKey(fechaObjetivo)}`,
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

const debeEnviarCorreo = async (tarea, fechaObjetivo, dias) => {
    const vencida = dias < 0;
    const critica = vencida && tarea.prioridad === 'Urgente';
    const clave = `tarea-${critica ? 'critica' : vencida ? 'vencida' : 'proxima'}:${tarea._id}`;
    const fechaObjetivoKey = formatearFechaKey(fechaObjetivo);
    const estado = await AlertaCorreo.findOne({ clave });
    const frecuenciaDias = critica ? FRECUENCIA_CRITICA_DIAS : vencida ? FRECUENCIA_VENCIDA_DIAS : FRECUENCIA_PROXIMA_DIAS;

    if (!estado || estado.fechaObjetivoKey !== fechaObjetivoKey || diasDesde(estado.ultimoEnvio) >= frecuenciaDias) {
        return { enviar: true, clave, fechaObjetivoKey, critica, vencida };
    }
    return { enviar: false };
};

const obtenerAlertasTareas = async (tareasPrecargadas = null) => {
    const tareas = tareasPrecargadas || await obtenerTareasParaRecordatorio();
    const alertas = [];
    for (const tarea of tareas) {
        const fecha = fechaObjetivoTarea(tarea);
        if (!fecha) continue;
        const dias = diasHasta(fecha);
        if (dias > DIAS_ANTICIPACION) continue;
        const revision = await debeEnviarCorreo(tarea, fecha, dias);
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

const crearTexto = (titulo, alertas) => `${titulo}\n\n${alertas.map((alerta) => (
    `- ${alerta.tarea.titulo}. Fecha: ${formatearFecha(alerta.fecha)}. ${alerta.dias < 0 ? `Días vencida: ${Math.abs(alerta.dias)}` : `Días restantes: ${alerta.dias}`}.`
)).join('\n')}`;

const crearHtml = (titulo, alertas) => `
    <h2>${titulo}</h2>
    <p>Estas tareas requieren seguimiento en Ganadería Romilio.</p>
    <ul>${alertas.map((alerta) => `
        <li><strong>${alerta.tarea.titulo}</strong><br>
        Fecha objetivo: ${formatearFecha(alerta.fecha)}<br>
        ${alerta.dias < 0 ? `Días vencida: ${Math.abs(alerta.dias)}` : `Días restantes: ${alerta.dias}`}</li>
    `).join('')}</ul>
`;

const enviarCorreosTareas = async (alertas) => {
    if (process.env.EMAIL_ALERTS_ENABLED === 'false') return { enviadas: 0, grupos: 0, desactivado: true };

    const grupos = agruparPorAsunto(alertas);
    let enviadas = 0;
    for (const [asunto, grupo] of Object.entries(grupos)) {
        const resultado = await enviarCorreoAdministradores({
            subject: `${asunto} - Ganadería Romilio`,
            html: crearHtml(asunto, grupo),
            text: crearTexto(asunto, grupo)
        });
        if (!resultado.enviado) continue;
        for (const alerta of grupo) {
            await registrarEnvio(alerta);
            enviadas += 1;
        }
    }
    return { enviadas, grupos: Object.keys(grupos).length };
};

const procesarAlertasTareas = async () => {
    const tareas = await obtenerTareasParaRecordatorio();
    const notificacionesCreadas = await crearNotificacionesOperativas(tareas);
    const alertasCorreo = await obtenerAlertasTareas(tareas);
    const correos = await enviarCorreosTareas(alertasCorreo);
    return { notificacionesCreadas, correos };
};

const enviarAlertasCorreo = procesarAlertasTareas;
let intervaloAlertas = null;

const iniciarProgramadorAlertasCorreo = () => {
    const intervaloMs = Number(process.env.EMAIL_ALERTS_INTERVAL_MS) || MS_DIA;
    const ejecutar = async () => {
        try {
            console.log('Revisión central de tareas completada:', await procesarAlertasTareas());
        } catch (error) {
            console.error('Error revisando tareas y notificaciones:', error.message);
        }
    };
    ejecutar();
    intervaloAlertas = setInterval(ejecutar, intervaloMs);
};

module.exports = {
    crearNotificacionesOperativas,
    enviarAlertasCorreo,
    iniciarProgramadorAlertasCorreo,
    obtenerAlertasTareas,
    procesarAlertasTareas
};
