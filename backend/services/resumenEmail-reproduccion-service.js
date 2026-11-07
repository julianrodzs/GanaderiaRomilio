const { RegistroReproductivo: Registro } = require('../models/RegistroReproductivo');
const Animal = require('../models/Animal');

const obtenerReproduccionResumen = async ({ organizacionId, fincaIds, zonaHoraria, hoy, hastaDia }) => {
    const filas = await Registro.aggregate([
        // Los ciclos legados sin finca solo se aceptan al verificar la hembra actual autorizada.
        { $match: { organizacionId, $or: [{ fincaId: { $in: fincaIds } }, { fincaId: null }] } },
        { $lookup: { from: Animal.collection.name, localField: 'animal', foreignField: '_id', as: 'hembra' } },
        { $unwind: '$hembra' },
        { $match: { 'hembra.organizacionId': organizacionId, 'hembra.fincaId': { $in: fincaIds }, 'hembra.estado': 'Activo', 'hembra.sexo': 'Hembra',
            $expr: { $or: [{ $eq: [{ $ifNull: ['$fincaId', null] }, null] }, { $eq: ['$fincaId', '$hembra.fincaId'] }] } } },
        { $set: { fincaId: '$hembra.fincaId', especieResumen: { $ifNull: ['$hembra.especie', { $ifNull: ['$especie', 'Bovino'] }] } } },
        // Evaluar el ultimo ciclo antes de filtrar su estado: un cierre o diagnostico nuevo no rescata uno viejo positivo.
        { $set: { ordenResumen: { $ifNull: ['$createdAt', { $toDate: '$_id' }] } } },
        { $sort: { ordenResumen: -1, _id: -1 } },
        { $group: { _id: '$animal', ciclo: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$ciclo' } },
        { $match: { estadoCiclo: { $in: ['Activo', null] }, activoParaAlertas: { $ne: false }, fechaPartoReal: null,
            'resultado.tipo': { $nin: ['PARTO', 'PERDIDA_GESTACIONAL', 'ABORTO', 'REABSORCION', 'OTRO'] } } },
        { $set: { diagnosticoActual: { $ifNull: ['$resultadoDiagnosticoGestacion', { $arrayElemAt: ['$historialDiagnosticos.resultado', -1] }] } } },
        { $match: { diagnosticoActual: { $nin: ['VACIA', 'VACÍA'] } } },
        // Una fecha de parto o una tarea no confirma una preñez. Un diagnostico explicito prevalece sobre la bandera legada.
        { $set: { confirmadaResumen: { $cond: [
            { $in: ['$diagnosticoActual', ['PREÑADA', 'PRENADA']] }, true,
            { $cond: [{ $in: ['$diagnosticoActual', ['PENDIENTE', 'DUDOSA', 'REQUIERE_RECONFIRMACION']] }, false, { $eq: ['$gestacionConfirmada', true] }] }
        ] }, tieneFechaResumen: { $eq: [{ $type: '$fechaPartoEstimada' }, 'date'] } } },
        { $match: { $or: [{ confirmadaResumen: true }, { tieneFechaResumen: true }, { estado: { $in: ['Gestante', 'Próxima a parto'] } }] } },
        { $set: { diaResumen: { $dateToString: { date: { $cond: ['$tieneFechaResumen', '$fechaPartoEstimada', null] }, format: '%Y-%m-%d', timezone: {
            $cond: [{ $eq: [{ $dateToString: { date: { $cond: ['$tieneFechaResumen', '$fechaPartoEstimada', null] }, format: '%H:%M:%S.%L', timezone: 'UTC' } }, '00:00:00.000'] }, 'UTC', zonaHoraria]
        } } } } },
        { $facet: {
            totales: [{ $group: { _id: '$especieResumen', total: { $sum: 1 }, confirmadas: { $sum: { $cond: ['$confirmadaResumen', 1, 0] } } } }],
            proximas: [{ $match: { tieneFechaResumen: true, diaResumen: { $gte: hoy, $lt: hastaDia } } },
                { $group: { _id: { finca: '$fincaId', especie: '$especieResumen' }, cantidad: { $sum: 1 }, confirmadas: { $sum: { $cond: ['$confirmadaResumen', 1, 0] } } } }],
            detalle: [{ $match: { tieneFechaResumen: true, diaResumen: { $gte: hoy, $lt: hastaDia } } },
                { $sort: { diaResumen: 1, _id: 1 } }, { $limit: 5 },
                { $project: { _id: 0, animalId: '$animal', diio: { $ifNull: ['$hembra.diio', '$hembra.identificadorFinca'] }, nombre: '$hembra.nombre',
                    dia: '$diaResumen', especie: '$especieResumen', confirmada: '$confirmadaResumen' } }]
        } }
    ]);
    return filas[0] || { totales: [], proximas: [], detalle: [] };
};

module.exports = { obtenerReproduccionResumen };
