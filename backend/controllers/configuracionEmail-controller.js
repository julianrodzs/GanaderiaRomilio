const ConfiguracionEmail = require('../models/ConfiguracionEmail');

const valoresPermitidos = new Set(['Desactivado', 'Diario', 'Semanal']);
const horaValida = (valor) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(valor || ''));

const presentar = (configuracion, usuarioId) => configuracion || {
    usuario: usuarioId,
    frecuencia: 'Desactivado',
    horaPreferida: '06:00',
    diaSemana: 1,
    modulos: { resumenGanadero: true, finanzas: true, tareasPendientes: true },
    ultimoEnvio: null
};

const obtenerConfiguracion = async (req, res) => {
    try {
        res.json(presentar(await ConfiguracionEmail.findOne({ usuario: req.usuario.id }).lean(), req.usuario.id));
    } catch (error) {
        res.status(500).json({ mensaje: 'No se pudo consultar la configuración de correos.', error: error.message });
    }
};

const actualizarConfiguracion = async (req, res) => {
    try {
        const frecuencia = req.body.frecuencia;
        const horaPreferida = req.body.horaPreferida;
        const diaSemana = Number(req.body.diaSemana);
        if (!valoresPermitidos.has(frecuencia)) return res.status(422).json({ mensaje: 'Frecuencia no permitida.' });
        if (!horaValida(horaPreferida)) return res.status(422).json({ mensaje: 'La hora debe usar el formato HH:mm.' });
        if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) return res.status(422).json({ mensaje: 'Día semanal no permitido.' });
        const modulos = {
            resumenGanadero: req.body.modulos?.resumenGanadero === true,
            finanzas: req.body.modulos?.finanzas === true,
            tareasPendientes: req.body.modulos?.tareasPendientes === true
        };
        if (frecuencia !== 'Desactivado' && !Object.values(modulos).some(Boolean)) {
            return res.status(422).json({ mensaje: 'Selecciona al menos un módulo para el resumen.' });
        }
        const configuracion = await ConfiguracionEmail.findOneAndUpdate(
            { usuario: req.usuario.id },
            { $set: { frecuencia, horaPreferida, diaSemana, modulos } },
            { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
        res.json({ mensaje: 'Preferencias de correo actualizadas.', configuracion });
    } catch (error) {
        res.status(500).json({ mensaje: 'No se pudo actualizar la configuración de correos.', error: error.message });
    }
};

module.exports = { actualizarConfiguracion, obtenerConfiguracion };
