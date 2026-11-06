const ConfiguracionEmail = require('../models/ConfiguracionEmail');
const { Membresia } = require('../models/Membresia');
const Organizacion = require('../models/Organizacion');
const Usuario = require('../models/Usuario');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { enviarCorreoResend } = require('./correoElectronico-service');
const { incrementarEmailsOperativos, tieneFeature } = require('./plan-service');
const { recopilarResumen, normalizarFincaIds } = require('./resumenEmail-datos-service');
const { crearContenido } = require('./resumenEmail-plantilla-service');
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

const debeEnviarResumen = (configuracion, fecha = new Date(), zonaHoraria = 'America/Costa_Rica', opciones = {}) => {
    if (!configuracion || configuracion.frecuencia === 'Desactivado') return { enviar: false };
    const partes = obtenerPartesLocales(fecha, zonaHoraria);
    const minutosActuales = Number(partes.hour) * 60 + Number(partes.minute);
    const [hora, minuto] = String(configuracion.horaPreferida || '06:00').split(':').map(Number);
    const ignorarHora = opciones.modoEjecucion === 'cron_diario' || process.env.CRON_RESUMEN_IGNORE_HOUR === 'true';
    if (!ignorarHora && minutosActuales < hora * 60 + minuto) return { enviar: false };
    if (configuracion.frecuencia === 'Semanal' && numeroDia[partes.weekday] !== Number(configuracion.diaSemana)) return { enviar: false };
    const periodo = clavePeriodoResumen({ frecuencia: configuracion.frecuencia, fecha, zonaHoraria });
    return { enviar: configuracion.ultimoPeriodo !== periodo, periodo };
};

const procesarResumenesOrganizacion = async (organizacion, ahora = new Date(), comprobarBloqueo = async () => {}, opciones = {}) => {
    if (!await tieneFeature('configuracionEmailAvanzada', organizacion._id)) return [];
    const configuraciones = ConfiguracionEmail.find({ frecuencia: { $ne: 'Desactivado' } })
        .populate({ path: 'usuario', model: Usuario, match: { estado: 'Activo' }, select: 'nombre correo estado' }).cursor({ batchSize: 100 });
    const resultados = [];
    for await (const configuracion of configuraciones) {
        await comprobarBloqueo();
        if (!configuracion.usuario) continue;
        let enviado = false;
        try {
            const membresia = await Membresia.findOne({
                organizacionId: organizacion._id,
                usuario: configuracion.usuario._id,
                estado: 'Activo'
            }).lean();
            if (!membresia) continue;
            const decision = debeEnviarResumen(configuracion, ahora, organizacion.zonaHoraria, opciones);
            if (!decision.enviar) continue;
            const fincas = await listarFincasAccesibles(membresia);
            if (!fincas.length) continue;
            const modulos = normalizarModulosResumen(configuracion.modulos, membresia.rol);
            if (!Object.values(modulos).some(Boolean)) continue;
            const resumen = await recopilarResumen({
                usuarioId: configuracion.usuario._id,
                frecuencia: configuracion.frecuencia,
                modulos,
                rol: membresia.rol,
                fincas,
                zonaHoraria: organizacion.zonaHoraria,
                fincaIds: fincas.map((finca) => finca._id),
                ahora
            });
            await comprobarBloqueo();
            const correo = await enviarCorreoResend({
                to: configuracion.usuario.correo,
                claveIdempotencia: `resumen:${organizacion._id}:${configuracion.usuario._id}:${decision.periodo}`,
                ...crearContenido({ usuario: configuracion.usuario, organizacion, resumen, frecuencia: configuracion.frecuencia })
            });
            enviado = correo.enviado;
            if (enviado) {
                configuracion.ultimoEnvio = ahora;
                configuracion.ultimoPeriodo = decision.periodo;
                await configuracion.save();
                await incrementarEmailsOperativos({ cantidad: 1 });
            }
            resultados.push({ usuarioId: configuracion.usuario._id, enviado, periodo: decision.periodo });
        } catch (error) {
            if (error.code === 'JOB_LOCK_LOST') throw error;
            resultados.push({ usuarioId: configuracion.usuario._id, enviado, error: error.message });
        }
    }
    return resultados;
};

const procesarResumenesTodasOrganizaciones = async (ahora = new Date(), { comprobarBloqueo = async () => {}, alProgreso = () => {}, ...opciones } = {}) => {
    const organizaciones = await Organizacion.find({
        estado: 'Activa',
        'plan.codigo': 'PREMIUM',
        'plan.estado': { $in: ['Activo', 'Prueba'] }
    }).select('_id nombre zonaHoraria');
    const resultados = [];
    for (const organizacion of organizaciones) {
        await comprobarBloqueo();
        try {
            const envios = await ejecutarConOrganizacion(organizacion._id, () => procesarResumenesOrganizacion(organizacion, ahora, comprobarBloqueo, opciones));
            resultados.push({ organizacionId: organizacion._id, envios,
                errores: envios.filter((e) => e.error).map((e) => ({ usuarioId: e.usuarioId, mensaje: e.error })) });
        } catch (error) {
            if (error.code === 'JOB_LOCK_LOST') throw error;
            resultados.push({ organizacionId: organizacion._id, envios: [], error: error.message });
        }
        alProgreso();
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
