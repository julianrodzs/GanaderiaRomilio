const crypto = require('node:crypto');
const BloqueoImportacion = require('../models/BloqueoImportacion');

const crearErrorBloqueo = () => Object.assign(
    new Error('Ya hay una importación procesándose para esta organización.'),
    { status: 409, codigo: 'IMPORTACION_EN_PROCESO' }
);

const adquirirBloqueoImportacion = async ({ organizacionId, operacion, duracionMs }) => {
    if (!organizacionId) throw Object.assign(new Error('No se pudo determinar la organización.'), { status: 400 });
    const ahora = new Date();
    const token = crypto.randomUUID();
    const expiraEn = new Date(ahora.getTime() + Number(duracionMs || process.env.IMPORT_LOCK_TIMEOUT_MS || 20 * 60 * 1000));
    try {
        const bloqueo = await BloqueoImportacion.findOneAndUpdate(
            { organizacionId, $or: [{ expiraEn: { $lte: ahora } }, { expiraEn: { $exists: false } }] },
            {
                $set: { token, operacion, expiraEn },
                $setOnInsert: { organizacionId }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (!bloqueo || bloqueo.token !== token) throw crearErrorBloqueo();
        return { organizacionId, token };
    } catch (error) {
        if (error?.code === 11000 || error?.codigo === 'IMPORTACION_EN_PROCESO') throw crearErrorBloqueo();
        throw error;
    }
};

const liberarBloqueoImportacion = async (bloqueo) => {
    if (!bloqueo?.organizacionId || !bloqueo?.token) return;
    await BloqueoImportacion.deleteOne({ organizacionId: bloqueo.organizacionId, token: bloqueo.token });
};

module.exports = { adquirirBloqueoImportacion, liberarBloqueoImportacion };
