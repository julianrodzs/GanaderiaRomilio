// Revisión por defecto. Solo --apply escribe; no asignar una finca por conjetura.
const mongoose = require('mongoose');
const Notificacion = require('../models/Notificacion');
const Finca = require('../models/Finca');
const modelos = {
    Tarea: require('../models/Tarea').Tarea,
    Animal: require('../models/Animal'),
    RegistroReproductivo: require('../models/RegistroReproductivo').RegistroReproductivo,
    AplicacionSanitaria: require('../models/AplicacionSanitaria').AplicacionSanitaria,
    MovimientoFinanciero: require('../models/MovimientoFinanciero')
};

const resolverFincaLegada = async (aviso, catalogo = modelos, fincas = Finca.collection) => {
    const modelo = Object.hasOwn(catalogo, aviso.entidadTipo) ? catalogo[aviso.entidadTipo] : null;
    if (!modelo || !aviso.entidadId || !aviso.organizacionId) return null;
    // El identificador y la organización deben coincidir en el origen, incluso sin contexto HTTP.
    const origen = await modelo.collection.findOne({ _id: aviso.entidadId, organizacionId: aviso.organizacionId });
    if (!origen?.fincaId) return null;
    // Si la entidad cambió después del aviso (p. ej. traslado de animal), su finca actual
    // no demuestra la finca histórica. Dejar el aviso oculto para revisión manual.
    if (!aviso.createdAt || !origen.updatedAt || new Date(origen.updatedAt) > new Date(aviso.createdAt)) return null;
    const finca = await fincas.findOne({ _id: origen.fincaId, organizacionId: aviso.organizacionId });
    return finca?._id || null;
};

const ejecutar = async () => {
    require('dotenv').config();
    const aplicar = process.argv.includes('--apply');
    if (!process.env.MONGODB_URI) throw new Error('Configura MONGODB_URI explícitamente para revisar la migración.');
    await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado', serverSelectionTimeoutMS: 10000 });
    const resumen = { modo: aplicar ? 'APLICAR' : 'REVISION', revisadas: 0, resolubles: 0, actualizadas: 0, sinOrigenVerificable: 0, clavesDuplicadas: 0 };
    const filtro = { $or: [{ fincaId: { $exists: false } }, { fincaId: null }] };
    for await (const aviso of Notificacion.collection.find(filtro)) {
        resumen.revisadas += 1;
        const fincaId = await resolverFincaLegada(aviso);
        if (!fincaId) { resumen.sinOrigenVerificable += 1; continue; }
        const dedupKey = aviso.dedupKey ? `${fincaId}:${aviso.dedupKey}` : undefined;
        if (dedupKey && await Notificacion.collection.findOne({ organizacionId: aviso.organizacionId, destinatario: aviso.destinatario, dedupKey })) {
            resumen.clavesDuplicadas += 1; continue;
        }
        resumen.resolubles += 1;
        if (aplicar) {
            const resultado = await Notificacion.collection.updateOne(
                { _id: aviso._id, organizacionId: aviso.organizacionId, ...filtro },
                { $set: { fincaId, ...(dedupKey ? { dedupKey } : {}) } }
            );
            resumen.actualizadas += resultado.modifiedCount;
        }
    }
    console.log(JSON.stringify(resumen, null, 2));
};

if (require.main === module) ejecutar().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { resolverFincaLegada };
