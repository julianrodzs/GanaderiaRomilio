const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const EventoAnimal = require('../models/EventoAnimal');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const { PlanSanitario } = require('../models/PlanSanitario');
const {
    construirDatosEventoAplicacion,
    normalizarIds,
    validarAnimalesSanidad
} = require('../services/aplicacionSanitaria-service');
const { obtenerAnimalesParaPlan } = require('../services/planSanitario-service');

const aplicar = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';

const main = async () => {
    await mongoose.connect(uri, { dbName });

    const planes = await PlanSanitario.find({ fechaAplicacion: { $ne: null } });
    const resumen = { revisados: planes.length, candidatos: 0, migrados: 0, omitidos: 0, errores: [] };

    for (const plan of planes) {
        const existente = await AplicacionSanitaria.exists({
            naturaleza: 'Plan sanitario',
            planSanitario: plan._id,
            fechaAplicacion: plan.fechaAplicacion
        });
        if (existente) {
            resumen.omitidos += 1;
            continue;
        }

        const eventosLegados = await EventoAnimal.find({
            moduloOrigen: 'Sanidad',
            referenciaId: plan._id
        });
        const animalesResueltos = eventosLegados.length
            ? eventosLegados.map((evento) => evento.animal)
            : (await obtenerAnimalesParaPlan(plan)).map((animal) => animal._id);
        const ids = normalizarIds(animalesResueltos);

        if (!ids.length) {
            resumen.errores.push({ plan: plan._id, motivo: 'No se pudieron identificar animales' });
            resumen.omitidos += 1;
            continue;
        }

        resumen.candidatos += 1;
        if (!aplicar) continue;

        try {
            const validacion = await validarAnimalesSanidad(ids, plan.especie || 'Bovino');
            const aplicacion = await AplicacionSanitaria.create({
                animales: validacion.ids,
                especie: validacion.especie,
                fechaAplicacion: plan.fechaAplicacion,
                producto: plan.producto,
                tipo: plan.actividad,
                dosis: plan.dosis,
                viaAplicacion: plan.viaAplicacion,
                responsable: plan.responsable,
                motivo: `Aplicación histórica del plan ${plan.grupoGanado}`,
                observaciones: plan.observaciones,
                naturaleza: 'Plan sanitario',
                planSanitario: plan._id,
                numeroAplicacion: 1
            });
            const datosEvento = construirDatosEventoAplicacion(aplicacion);

            for (const animalId of validacion.ids) {
                const eventoLegado = eventosLegados.find((evento) => evento.animal.toString() === animalId);
                if (eventoLegado) {
                    Object.assign(eventoLegado, datosEvento, { animal: animalId, referenciaId: aplicacion._id });
                    await eventoLegado.save();
                } else {
                    await EventoAnimal.create({ ...datosEvento, animal: animalId, referenciaId: aplicacion._id });
                }
            }

            resumen.migrados += 1;
        } catch (error) {
            resumen.errores.push({ plan: plan._id, motivo: error.message });
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
