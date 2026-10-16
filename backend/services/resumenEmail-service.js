const { Types } = require('mongoose');
const Animal = require('../models/Animal');
const ConfiguracionEmail = require('../models/ConfiguracionEmail');
const { Membresia } = require('../models/Membresia');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const Organizacion = require('../models/Organizacion');
const { Tarea } = require('../models/Tarea');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { enviarCorreoResend } = require('./correoElectronico-service');
const { incrementarEmailsOperativos } = require('./plan-service');
const { crearMapaMonedas, normalizarMoneda } = require('./finanzas-calculos-service');
const { listarFincasAccesibles } = require('./accesoFinca-service');
const { normalizarModulosResumen } = require('./permisosResumenEmail-service');

const obtenerPartesLocales = (fecha, zonaHoraria) => {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: zonaHoraria,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
    }).formatToParts(fecha);
    return Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
};

const numeroDia = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const clavePeriodoResumen = ({ frecuencia, fecha = new Date(), zonaHoraria = 'America/Costa_Rica' }) => {
    const partes = obtenerPartesLocales(fecha, zonaHoraria);
    const fechaLocal = `${partes.year}-${partes.month}-${partes.day}`;
    if (frecuencia === 'Diario') return `D:${fechaLocal}`;
    const base = new Date(`${fechaLocal}T12:00:00Z`);
    const desplazamiento = (numeroDia[partes.weekday] + 6) % 7;
    base.setUTCDate(base.getUTCDate() - desplazamiento);
    return `S:${base.toISOString().slice(0, 10)}`;
};

const debeEnviarResumen = (configuracion, fecha = new Date(), zonaHoraria = 'America/Costa_Rica') => {
    if (!configuracion || configuracion.frecuencia === 'Desactivado') return { enviar: false };
    const partes = obtenerPartesLocales(fecha, zonaHoraria);
    const minutosActuales = Number(partes.hour) * 60 + Number(partes.minute);
    const [hora, minuto] = String(configuracion.horaPreferida || '06:00').split(':').map(Number);
    if (minutosActuales < hora * 60 + minuto) return { enviar: false };
    if (configuracion.frecuencia === 'Semanal' && numeroDia[partes.weekday] !== Number(configuracion.diaSemana)) return { enviar: false };
    const periodo = clavePeriodoResumen({ frecuencia: configuracion.frecuencia, fecha, zonaHoraria });
    return { enviar: configuracion.ultimoPeriodo !== periodo, periodo };
};

const normalizarFincaIds = (fincaIds = []) => [...new Set(fincaIds.map((finca) => String(finca?._id || finca)).filter(Boolean))]
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

const recopilarResumen = async ({ usuarioId, frecuencia, modulos, fincaIds, ahora = new Date() }) => {
    const desde = new Date(ahora.getTime() - (frecuencia === 'Semanal' ? 7 : 1) * 24 * 60 * 60 * 1000);
    const fincasAutorizadas = normalizarFincaIds(fincaIds);
    if (!fincasAutorizadas.length) {
        throw Object.assign(new Error('El destinatario no tiene fincas activas autorizadas para el resumen.'), {
            code: 'EMAIL_FARM_SCOPE_EMPTY'
        });
    }
    const filtroFincas = { fincaId: { $in: fincasAutorizadas } };
    const resultado = {};
    if (modulos.resumenGanadero) {
        const inventario = await Animal.aggregate([
            { $match: { ...filtroFincas, estado: 'Activo' } },
            { $group: { _id: { $ifNull: ['$especie', 'Bovino'] }, cantidad: { $sum: 1 } } }
        ]);
        resultado.ganado = Object.fromEntries(inventario.map((item) => [item._id, item.cantidad]));
    }
    if (modulos.finanzas) {
        const filasFinanzas = await MovimientoFinanciero.aggregate([
            { $match: { ...filtroFincas, fecha: { $gte: desde, $lte: ahora }, excluirConsolidacion: { $ne: true } } },
            { $group: {
                _id: { moneda: { $ifNull: ['$moneda', 'CRC'] } },
                ingresos: { $sum: { $cond: [{ $eq: ['$naturaleza', 'Ingreso'] }, '$monto', 0] } },
                egresos: { $sum: { $cond: [{ $eq: ['$naturaleza', 'Egreso'] }, '$monto', 0] } }
            } }
        ]);
        resultado.finanzas = crearMapaMonedas(() => ({ ingresos: 0, egresos: 0, balance: 0 }));
        filasFinanzas.forEach((item) => {
            const moneda = normalizarMoneda(item._id?.moneda);
            const ingresos = Number(item.ingresos || 0);
            const egresos = Number(item.egresos || 0);
            resultado.finanzas[moneda] = { ingresos, egresos, balance: ingresos - egresos };
        });
    }
    if (modulos.tareasPendientes) {
        const filtro = { ...filtroFincas, asignadoA: usuarioId, estado: { $nin: ['Completada', 'Cancelada'] } };
        const [pendientes, vencidas] = await Promise.all([
            Tarea.countDocuments(filtro),
            Tarea.countDocuments({ ...filtro, $or: [{ fechaLimite: { $lt: ahora } }, { fechaLimite: null, fechaProgramada: { $lt: ahora } }] })
        ]);
        resultado.tareas = { pendientes, vencidas };
    }
    return resultado;
};

const crearContenido = ({ usuario, organizacion, resumen, frecuencia }) => {
    const bloques = [];
    if (resumen.ganado) bloques.push(`<h3>Inventario activo</h3><p>Bovinos: ${resumen.ganado.Bovino || 0}<br>Porcinos: ${resumen.ganado.Porcino || 0}</p>`);
    if (resumen.finanzas) {
        const lineas = Object.entries(resumen.finanzas).map(([moneda, datos]) => (
            `<strong>${moneda}</strong>: Ingresos ${datos.ingresos}, Egresos ${datos.egresos}, Balance ${datos.balance}`
        ));
        bloques.push(`<h3>Finanzas del período</h3><p>${lineas.join('<br>')}</p>`);
    }
    if (resumen.tareas) bloques.push(`<h3>Tareas</h3><p>Pendientes: ${resumen.tareas.pendientes}<br>Vencidas: ${resumen.tareas.vencidas}</p>`);
    return {
        subject: `Resumen ${frecuencia.toLowerCase()} - ${organizacion.nombre}`,
        html: `<p>Hola ${usuario.nombre || ''},</p>${bloques.join('')}<p>Este resumen fue generado según tus preferencias.</p>`,
        text: `Resumen ${frecuencia.toLowerCase()} de ${organizacion.nombre}. ${JSON.stringify(resumen)}`
    };
};

const procesarResumenesOrganizacion = async (organizacion, ahora = new Date()) => {
    const configuraciones = await ConfiguracionEmail.find({ frecuencia: { $ne: 'Desactivado' } })
        .populate({ path: 'usuario', match: { estado: 'Activo' }, select: 'nombre correo estado' });
    const resultados = [];
    for (const configuracion of configuraciones) {
        if (!configuracion.usuario) continue;
        const membresia = await Membresia.findOne({
            organizacionId: organizacion._id,
            usuario: configuracion.usuario._id,
            estado: 'Activo'
        }).lean();
        if (!membresia) continue;
        const decision = debeEnviarResumen(configuracion, ahora, organizacion.zonaHoraria);
        if (!decision.enviar) continue;
        const fincas = await listarFincasAccesibles(membresia);
        if (!fincas.length) continue;
        const modulos = normalizarModulosResumen(configuracion.modulos, membresia.rol);
        if (!Object.values(modulos).some(Boolean)) continue;
        const resumen = await recopilarResumen({
            usuarioId: configuracion.usuario._id,
            frecuencia: configuracion.frecuencia,
            modulos,
            fincaIds: fincas.map((finca) => finca._id),
            ahora
        });
        const correo = await enviarCorreoResend({
            to: configuracion.usuario.correo,
            ...crearContenido({ usuario: configuracion.usuario, organizacion, resumen, frecuencia: configuracion.frecuencia })
        });
        if (correo.enviado) {
            configuracion.ultimoEnvio = ahora;
            configuracion.ultimoPeriodo = decision.periodo;
            await configuracion.save();
            await incrementarEmailsOperativos({ cantidad: 1 });
        }
        resultados.push({ usuarioId: configuracion.usuario._id, enviado: correo.enviado, periodo: decision.periodo });
    }
    return resultados;
};

const procesarResumenesTodasOrganizaciones = async (ahora = new Date()) => {
    const organizaciones = await Organizacion.find({
        estado: 'Activa',
        'plan.codigo': 'PREMIUM',
        'plan.estado': { $in: ['Activo', 'Prueba'] }
    }).select('_id nombre zonaHoraria');
    const resultados = [];
    for (const organizacion of organizaciones) {
        const envios = await ejecutarConOrganizacion(organizacion._id, () => procesarResumenesOrganizacion(organizacion, ahora));
        resultados.push({ organizacionId: organizacion._id, envios });
    }
    return resultados;
};

module.exports = {
    clavePeriodoResumen,
    debeEnviarResumen,
    normalizarFincaIds,
    procesarResumenesOrganizacion,
    procesarResumenesTodasOrganizaciones,
    recopilarResumen
};
