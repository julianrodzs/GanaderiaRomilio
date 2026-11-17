const mongoose = require('mongoose');
const Notificacion = require('../models/Notificacion');
const AlertaCorreo = require('../models/AlertaCorreo');
const ImportacionExcel = require('../models/ImportacionExcel');
const Invitacion = require('../models/Invitacion');
const { DIA_MS, DIAS_NOTIFICACIONES, DIAS_PURGA_PREVIEW, DIAS_PURGA_INVITACION,
    ESTADOS_IMPORTACION_TEMPORAL, ESTADOS_INVITACION_TEMPORAL } = require('../services/retencionDatos-service');

const prepararRetencion = async ({ aplicar = false, ahora = new Date() } = {}) => {
    // Migracion global explicita: colecciones nativas, sin cargar documentos ni tocar Auditoria.
    const tareas = [
        { modelo: Notificacion, filtro: { leida: true, expiraEn: null },
            update: [{ $set: { expiraEn: { $add: [{ $ifNull: ['$fechaLectura', ahora] }, DIAS_NOTIFICACIONES * DIA_MS] } } }] },
        { modelo: Notificacion, filtro: { leida: false, expiraEn: { $type: 'date' } }, update: { $set: { expiraEn: null } } },
        { modelo: ImportacionExcel, filtro: { estado: { $in: ESTADOS_IMPORTACION_TEMPORAL }, expiraEn: { $type: 'date' }, purgarEn: null },
            update: [{ $set: { purgarEn: { $add: ['$expiraEn', DIAS_PURGA_PREVIEW * DIA_MS] } } }] },
        { modelo: ImportacionExcel, filtro: { estado: { $in: ['Aplicada', 'Confirmada', 'Confirmada con errores'] },
            $or: [{ registros: { $exists: true } }, { errores: { $exists: true } }, { purgarEn: { $exists: true } }] },
            update: { $unset: { registros: '', errores: '', purgarEn: '' } } },
        { modelo: Invitacion, filtro: { estado: { $in: ESTADOS_INVITACION_TEMPORAL }, expiraEn: { $type: 'date' }, purgarEn: null },
            update: [{ $set: { purgarEn: { $add: ['$expiraEn', DIAS_PURGA_INVITACION * DIA_MS] } } }] }
    ];
    const cambios = [];
    for (const { modelo, filtro, update } of tareas) {
        const candidatos = await modelo.collection.countDocuments(filtro);
        let modificados = 0;
        if (aplicar) {
            const cursor = modelo.collection.find(filtro, { projection: { _id: 1 } }).sort({ _id: 1 }).batchSize(100);
            let lote = [];
            const guardar = async () => {
                if (!lote.length) return;
                const resultado = await modelo.collection.bulkWrite(lote, { ordered: false });
                modificados += resultado.modifiedCount;
                lote = [];
            };
            try {
                for await (const doc of cursor) {
                    lote.push({ updateOne: { filter: { $and: [{ _id: doc._id }, filtro] }, update } });
                    if (lote.length >= 100) await guardar();
                }
                await guardar();
            } finally { await cursor.close(); }
        }
        cambios.push({ modelo: modelo.modelName, candidatos, modificados });
    }
    const indices = [];
    for (const modelo of [Notificacion, AlertaCorreo, ImportacionExcel, Invitacion]) {
        for (const [key, options] of modelo.schema.indexes().filter(([, o]) => o.expireAfterSeconds !== undefined)) {
            const { background, ...opciones } = options;
            if (aplicar) await modelo.collection.createIndex(key, opciones);
            const campo = Object.keys(key)[0];
            const limite = new Date(ahora.getTime() - opciones.expireAfterSeconds * 1000);
            const vencidos = await modelo.collection.countDocuments({
                ...(opciones.partialFilterExpression || {}), [campo]: { $type: 'date', $lte: limite }
            });
            indices.push({ modelo: modelo.modelName, key, ...opciones, vencidos });
        }
    }
    return { aplicar, cambios, indices,
        advertencia: 'Activar TTL permite a MongoDB borrar los documentos temporales vencidos. Respalde y revise antes de --apply. No se eliminan importaciones confirmadas ni Auditoria.' };
};

if (require.main === module) {
    (async () => {
        require('dotenv').config();
        if (!process.env.MONGODB_URI) throw new Error('Defina MONGODB_URI explicitamente.');
        await mongoose.connect(process.env.MONGODB_URI, {
            dbName: process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado',
            autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000
        });
        console.log(JSON.stringify(await prepararRetencion({ aplicar: process.argv.includes('--apply') }), null, 2));
    })().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
}

module.exports = { prepararRetencion };
