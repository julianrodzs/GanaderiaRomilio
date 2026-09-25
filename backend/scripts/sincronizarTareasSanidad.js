const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { PlanSanitario } = require('../models/PlanSanitario');
const { TratamientoSanitario } = require('../models/TratamientoSanitario');
const { Tarea } = require('../models/Tarea');
const {
    sincronizarTareaPlanSanitario,
    sincronizarTareaTratamiento
} = require('../services/sanidad-tarea-service');

const aplicar = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';

const main = async () => {
    await mongoose.connect(uri, { dbName });

    const [planes, tratamientos] = await Promise.all([
        PlanSanitario.find({ proximaAplicacion: { $ne: null } }),
        TratamientoSanitario.find({ estado: 'Activo', proximaAplicacion: { $ne: null } })
    ]);
    const referencias = [...planes, ...tratamientos].map((item) => item._id);
    const existentes = referencias.length
        ? await Tarea.countDocuments({ moduloOrigen: 'Sanidad', referenciaId: { $in: referencias } })
        : 0;
    const resumen = {
        planes: planes.length,
        tratamientos: tratamientos.length,
        tareasSanitariasExistentes: existentes,
        sincronizados: 0,
        errores: []
    };

    if (aplicar) {
        for (const plan of planes) {
            try {
                if (await sincronizarTareaPlanSanitario(plan, plan.asignadoA || plan.creadoPor)) resumen.sincronizados += 1;
            } catch (error) {
                resumen.errores.push({ tipo: 'PlanSanitario', id: plan._id, motivo: error.message });
            }
        }
        for (const tratamiento of tratamientos) {
            try {
                if (await sincronizarTareaTratamiento(tratamiento, tratamiento.registradoPor)) resumen.sincronizados += 1;
            } catch (error) {
                resumen.errores.push({ tipo: 'TratamientoSanitario', id: tratamiento._id, motivo: error.message });
            }
        }
    }

    console.log(JSON.stringify({ modo: aplicar ? 'aplicar' : 'simulacion', baseDatos: dbName, ...resumen }, null, 2));
    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
});
