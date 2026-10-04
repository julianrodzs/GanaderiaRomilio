const crypto = require('crypto');
const TrabajoProgramado = require('../models/TrabajoProgramado');
const { procesarAlertasTodasOrganizaciones } = require('./alertasCorreo-service');
const { procesarResumenesTodasOrganizaciones } = require('./resumenEmail-service');

const CLAVE_ALERTAS = 'alertas-operativas';
const CLAVE_RESUMENES = 'resumenes-email-premium';
let intervaloInterno = null;
let intervaloResumenes = null;

const adquirirBloqueo = async (clave, origen) => {
    const ahora = new Date();
    const duracionMs = Number(process.env.CRON_LOCK_MS) || 30 * 60 * 1000;
    const tokenBloqueo = crypto.randomUUID();

    try {
        const trabajo = await TrabajoProgramado.findOneAndUpdate(
            {
                clave,
                $or: [
                    { bloqueadoHasta: null },
                    { bloqueadoHasta: { $exists: false } },
                    { bloqueadoHasta: { $lte: ahora } }
                ]
            },
            {
                $set: {
                    estado: 'Ejecutando',
                    tokenBloqueo,
                    bloqueadoHasta: new Date(ahora.getTime() + duracionMs),
                    ultimaEjecucionInicio: ahora,
                    ultimoOrigen: origen,
                    ultimoError: ''
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        return trabajo?.tokenBloqueo === tokenBloqueo ? tokenBloqueo : null;
    } catch (error) {
        if (error?.code === 11000) return null;
        throw error;
    }
};

const finalizarTrabajo = (clave, tokenBloqueo, cambios) => TrabajoProgramado.findOneAndUpdate(
    { clave, tokenBloqueo },
    {
        $set: {
            ...cambios,
            tokenBloqueo: null,
            bloqueadoHasta: null,
            ultimaEjecucionFin: new Date()
        }
    },
    { new: true }
);

const ejecutarAlertasProgramadas = async ({ origen = 'manual' } = {}) => {
    const tokenBloqueo = await adquirirBloqueo(CLAVE_ALERTAS, origen);
    if (!tokenBloqueo) {
        return { ejecutado: false, omitido: true, motivo: 'Ya existe una ejecucion de alertas en curso.' };
    }

    try {
        const resultados = await procesarAlertasTodasOrganizaciones();
        const resumen = {
            organizacionesProcesadas: resultados.length,
            notificacionesCreadas: resultados.reduce((total, item) => total + Number(item.notificacionesCreadas || 0), 0),
            correosEnviados: resultados.reduce((total, item) => total + Number(item.correos?.enviadas || 0), 0),
            categoriasAnimalesActualizadas: resultados.reduce((total, item) => total + Number(item.categoriasAnimales?.actualizados || 0), 0)
        };
        await finalizarTrabajo(CLAVE_ALERTAS, tokenBloqueo, {
            estado: 'Completado',
            ultimoResultado: resumen,
            ultimoError: ''
        });
        return { ejecutado: true, ...resumen, resultados };
    } catch (error) {
        await finalizarTrabajo(CLAVE_ALERTAS, tokenBloqueo, {
            estado: 'Error',
            ultimoError: error.message,
            ultimoResultado: null
        });
        throw error;
    }
};

const ejecutarResumenesEmailProgramados = async ({ origen = 'manual' } = {}) => {
    const tokenBloqueo = await adquirirBloqueo(CLAVE_RESUMENES, origen);
    if (!tokenBloqueo) return { ejecutado: false, omitido: true, motivo: 'Ya existe una ejecución de resúmenes en curso.' };
    try {
        const resultados = await procesarResumenesTodasOrganizaciones();
        const resumen = {
            organizacionesProcesadas: resultados.length,
            correosEnviados: resultados.reduce((total, item) => total + item.envios.filter((envio) => envio.enviado).length, 0)
        };
        await finalizarTrabajo(CLAVE_RESUMENES, tokenBloqueo, { estado: 'Completado', ultimoResultado: resumen, ultimoError: '' });
        return { ejecutado: true, ...resumen, resultados };
    } catch (error) {
        await finalizarTrabajo(CLAVE_RESUMENES, tokenBloqueo, { estado: 'Error', ultimoError: error.message, ultimoResultado: null });
        throw error;
    }
};

const iniciarProgramadorAlertas = () => {
    const modo = (process.env.CRON_MODE || 'internal').toLowerCase();
    if (modo !== 'internal') {
        console.log(`Programador interno de alertas desactivado. CRON_MODE=${modo}`);
        return;
    }

    const intervaloMs = Number(process.env.EMAIL_ALERTS_INTERVAL_MS) || 24 * 60 * 60 * 1000;
    const ejecutar = () => ejecutarAlertasProgramadas({ origen: 'programador-interno' })
        .then((resultado) => console.log('Revision central de tareas completada:', resultado))
        .catch((error) => console.error('Error revisando tareas y notificaciones:', error.message));

    ejecutar();
    intervaloInterno = setInterval(ejecutar, intervaloMs);

    const ejecutarResumenes = () => ejecutarResumenesEmailProgramados({ origen: 'programador-interno' })
        .then((resultado) => console.log('Revisión de resúmenes Premium completada:', resultado))
        .catch((error) => console.error('Error enviando resúmenes Premium:', error.message));
    ejecutarResumenes();
    intervaloResumenes = setInterval(ejecutarResumenes, Number(process.env.EMAIL_DIGEST_INTERVAL_MS) || 60 * 60 * 1000);
};

module.exports = {
    ejecutarAlertasProgramadas,
    ejecutarResumenesEmailProgramados,
    iniciarProgramadorAlertas
};
