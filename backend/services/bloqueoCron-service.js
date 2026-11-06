const crypto = require('crypto');
const TrabajoProgramado = require('../models/TrabajoProgramado');
const duracionBloqueo = () => {
    const valor = Number(process.env.CRON_LOCK_MS);
    return Number.isFinite(valor) && valor >= 1000 ? valor : 30 * 60 * 1000;
};
const errorBloqueo = (mensaje) => Object.assign(new Error(mensaje), { code: 'JOB_LOCK_LOST' });

const adquirirBloqueo = async (clave, origen, duracionMs = duracionBloqueo()) => {
    const ahora = new Date(), tokenBloqueo = crypto.randomUUID(), bloqueadoHasta = new Date(+ahora + duracionMs);
    try {
        const trabajo = await TrabajoProgramado.findOneAndUpdate({ clave,
            $or: [{ bloqueadoHasta: null }, { bloqueadoHasta: { $exists: false } }, { bloqueadoHasta: { $lte: ahora } }]
        }, { $set: { estado: 'Ejecutando', tokenBloqueo, bloqueadoHasta, ultimaEjecucionInicio: ahora, ultimoOrigen: origen, ultimoError: '' } },
        { upsert: true, new: true, setDefaultsOnInsert: true });
        return trabajo?.tokenBloqueo === tokenBloqueo ? { clave, tokenBloqueo, duracionMs, bloqueadoHasta } : null;
    } catch (error) { if (error?.code === 11000) return null; throw error; }
};

const iniciarRenovacion = (bloqueo, { intervaloMs = Math.min(5 * 60 * 1000, bloqueo.duracionMs / 3) } = {}) => {
    let fallo = null, pendiente = null, detenido = false;
    const renovar = () => {
        if (detenido) return Promise.resolve();
        if (pendiente) return pendiente;
        pendiente = (async () => {
            const ahora = new Date();
            const hasta = new Date(+ahora + bloqueo.duracionMs);
            const resultado = await TrabajoProgramado.updateOne({ clave: bloqueo.clave, tokenBloqueo: bloqueo.tokenBloqueo,
                estado: 'Ejecutando', bloqueadoHasta: { $gt: ahora } }, { $set: { bloqueadoHasta: hasta } });
            if (resultado.matchedCount !== 1) throw errorBloqueo('Se perdio la propiedad del bloqueo del cron.');
            bloqueo.bloqueadoHasta = hasta;
        })().catch((error) => {
            fallo = errorBloqueo(`No se pudo renovar el bloqueo del cron: ${error.message}`);
            clearInterval(temporizador);
        }).finally(() => { pendiente = null; });
        return pendiente;
    };
    const temporizador = setInterval(renovar, Math.max(10, Math.min(intervaloMs, bloqueo.duracionMs / 3)));
    temporizador.unref();
    return {
        renovar,
        async comprobar() {
            if (pendiente) await pendiente;
            if (fallo) throw fallo;
            if (+bloqueo.bloqueadoHasta <= Date.now()) throw errorBloqueo('El bloqueo del cron expiro antes de completar la operacion.');
        },
        async detener() { detenido = true; clearInterval(temporizador); if (pendiente) await pendiente; }
    };
};

const finalizarTrabajo = (bloqueo, cambios) => TrabajoProgramado.findOneAndUpdate(
    { clave: bloqueo.clave, tokenBloqueo: bloqueo.tokenBloqueo },
    { $set: { ...cambios, tokenBloqueo: null, bloqueadoHasta: null, ultimaEjecucionFin: new Date() } }, { new: true }
);

module.exports = { adquirirBloqueo, iniciarRenovacion, finalizarTrabajo };
