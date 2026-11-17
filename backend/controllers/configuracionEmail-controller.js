const ConfiguracionEmail = require('../models/ConfiguracionEmail');
const { HORA_RESUMEN_EMAIL, ZONA_HORARIA_CRON_EMAIL } = require('../config/horarioResumenEmail');
const {
    normalizarModulosResumen,
    puedeSolicitarFinanzas
} = require('../services/permisosResumenEmail-service');

const valoresPermitidos = new Set(['Desactivado', 'Diario', 'Semanal']);

const presentar = (configuracion, usuarioId, rol) => {
    const base = configuracion || {
        usuario: usuarioId,
        frecuencia: 'Desactivado',
        horaPreferida: HORA_RESUMEN_EMAIL,
        diaSemana: 1,
        modulos: { resumenGanadero: true, finanzas: true, tareasPendientes: true },
        ultimoEnvio: null
    };
    const datos = typeof base.toObject === 'function' ? base.toObject() : { ...base };
    return {
        ...datos,
        horaPreferida: HORA_RESUMEN_EMAIL,
        horarioEnvio: { hora: HORA_RESUMEN_EMAIL, zonaHoraria: ZONA_HORARIA_CRON_EMAIL, editable: false },
        modulos: normalizarModulosResumen(datos.modulos, rol),
        modoEjecucion: (process.env.CRON_MODE || 'internal').toLowerCase() === 'internal' && process.env.CRON_RESUMEN_IGNORE_HOUR !== 'true' ? 'continuo' : 'cron_diario'
    };
};

const obtenerConfiguracion = async (req, res) => {
    try {
        res.json(presentar(
            await ConfiguracionEmail.findOne({ usuario: req.usuario.id }).lean(),
            req.usuario.id,
            req.usuario.rol
        ));
    } catch (error) {
        res.status(500).json({ mensaje: 'No se pudo consultar la configuración de correos.', error: error.message });
    }
};

const actualizarConfiguracion = async (req, res) => {
    try {
        const frecuencia = req.body.frecuencia;
        const horaPreferida = HORA_RESUMEN_EMAIL;
        const diaSemana = Number(req.body.diaSemana);
        if (!valoresPermitidos.has(frecuencia)) return res.status(422).json({ mensaje: 'Frecuencia no permitida.' });
        if (req.body.horaPreferida !== undefined && req.body.horaPreferida !== HORA_RESUMEN_EMAIL) {
            return res.status(422).json({ mensaje: 'La hora de envío es fija: 6:00 a. m. (Costa Rica). Solo puedes elegir el día para el resumen semanal.' });
        }
        if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) return res.status(422).json({ mensaje: 'Día semanal no permitido.' });
        if (req.body.modulos?.finanzas === true && !puedeSolicitarFinanzas(req.usuario.rol)) {
            return res.status(403).json({ mensaje: 'No tienes permiso para incluir información financiera en el resumen.' });
        }
        const modulos = normalizarModulosResumen({
            resumenGanadero: req.body.modulos?.resumenGanadero === true,
            finanzas: req.body.modulos?.finanzas === true,
            tareasPendientes: req.body.modulos?.tareasPendientes === true,
            radarOperativo: req.body.modulos?.radarOperativo !== false
        }, req.usuario.rol);
        if (frecuencia !== 'Desactivado' && !Object.values(modulos).some(Boolean)) {
            return res.status(422).json({ mensaje: 'Selecciona al menos un módulo para el resumen.' });
        }
        const configuracion = await ConfiguracionEmail.findOneAndUpdate(
            { usuario: req.usuario.id },
            { $set: { frecuencia, horaPreferida, diaSemana, modulos } },
            { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
        res.json({
            mensaje: 'Preferencias de correo actualizadas.',
            configuracion: presentar(configuracion, req.usuario.id, req.usuario.rol)
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'No se pudo actualizar la configuración de correos.', error: error.message });
    }
};

module.exports = { actualizarConfiguracion, obtenerConfiguracion };
