const banco = require('../services/bancoSemen-service');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const { validarCampana } = require('../services/bancoSemen-service');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const { Tarea } = require('../models/Tarea');
const { upsertEventoAnimal } = require('../services/eventoAnimal-service');

const accion = (operacion, status = 200) => async (req, res) => {
    try { res.status(status).json(await operacion(req)); } catch (error) {
        res.status(error.status || (error.name === 'ValidationError' ? 400 : 500)).json({ mensaje: error.message, code: error.code, disponible: error.disponible });
    }
};
module.exports = {
    listar: accion((req) => banco.listarBanco(req.query)),
    detalle: accion((req) => banco.detalleBanco(req.params.id)),
    entrada: accion((req) => banco.registrarEntrada(req.body, req.usuario.id), 201),
    trasladar: accion((req) => banco.trasladar(req.params.id, req.body, req.usuario.id)),
    ajustar: accion((req) => banco.ajustar(req.params.id, req.body, req.usuario.id)),
    asignar: accion((req) => banco.asignarCampana(req.params.id, req.body, req.usuario.id), 201),
    asignaciones: accion(async (req) => {
        await validarCampana(req.params.id, null, false);
        return banco.listarAsignaciones(req.params.id);
    }),
    devolver: accion((req) => ejecutarEnTransaccion(async (session) => {
        banco.validarEntrada(req.body);
        await validarCampana(req.params.id, session, false);
        return banco.devolverSobrantes(req.params.id, req.usuario.id, session);
    })),
    ventas: accion((req) => banco.listarVentas(req.query)),
    resumen: accion(() => banco.resumenVentas()),
    vender: accion((req) => banco.vender(req.body, req.usuario.id), 201),
    anular: accion((req) => banco.anularVenta(req.params.id, req.body, req.usuario.id)),
    anularInseminacion: accion((req) => ejecutarEnTransaccion(async (session) => {
        banco.validarEntrada(req.body);
        let campana, participante;
        if (req.params.participanteId) {
            campana = await validarCampana(req.params.id, session, false);
            participante = campana.participantes.id(req.params.participanteId);
            if (!participante?.registroReproductivo) throw banco.errorBanco('Participante sin inseminacion registrada.');
        }
        const registro = await RegistroReproductivo.findById(participante?.registroReproductivo || req.params.id).session(session);
        if (!registro || registro.inseminacionAnulada || !registro.semenSnapshot?.consumoSemenId) throw banco.errorBanco('La inseminacion no permite anulacion automatica.');
        if (!campana && registro.campanaIATF) throw banco.errorBanco('Anula esta inseminacion desde su campana.');
        if (registro.fechaPartoReal || registro.gestacionConfirmada || registro.resultadoDiagnosticoGestacion || participante && participante.resultadoActual !== 'SIN_DIAGNOSTICO') throw banco.errorBanco('Hay resultados posteriores; se requiere una correccion revisada antes de anular.');
        if (registro.bandaReproductivaPorcina) {
            const Banda = require('../models/BandaReproductivaPorcina');
            const banda = await Banda.findById(registro.bandaReproductivaPorcina).session(session);
            const miembro = banda?.participantes.find((p) => String(p.registroReproductivo) === String(registro._id));
            const paso = banda?.ejecuciones.find((p) => p.tipoAccion === 'INSEMINACION' && p.participantes.some((id) => String(id) === String(miembro?._id)));
            if (!banda || banda.estado !== 'ACTIVA' || !miembro || !paso) throw banco.errorBanco('La banda necesita revision antes de anular este servicio.');
            if (banda.ejecuciones.some((p) => String(p._id) !== String(paso._id) && p.fechaReal && p.fechaReal >= paso.fechaReal && p.participantes.some((id) => String(id) === String(miembro._id)))) throw banco.errorBanco('La participante tiene actividades posteriores; requiere revision.');
            miembro.estadoParticipacion = 'ACTIVA'; miembro.registroReproductivo = undefined;
            if (miembro.fechasReales) { delete miembro.fechasReales.IA; banda.markModified('participantes'); }
            paso.participantes = paso.participantes.filter((id) => String(id) !== String(miembro._id));
            paso.estado = paso.participantes.length ? 'PARCIAL' : 'PENDIENTE';
            if (!paso.participantes.length) paso.fechaReal = undefined;
            if (paso.tarea) await Tarea.updateOne({ _id: paso.tarea, estado: 'Completada' }, { $set: { estado: 'En proceso' }, $unset: { fechaCompletada: '' } }, { session });
            await banda.save({ session });
        }
        await banco.revertirConsumo({ eventoId: registro.semenSnapshot.consumoSemenId, motivo: req.body.motivo, usuarioId: req.usuario.id, session });
        registro.inseminacionAnulada = true; registro.estadoCiclo = 'Cancelado'; registro.activoParaAlertas = false; registro.motivoCierre = req.body.motivo;
        await registro.save({ session });
        await Tarea.updateMany({ referenciaId: registro._id, estado: { $in: ['Pendiente', 'En proceso'] } }, { $set: { estado: 'Cancelada', observaciones: 'Inseminacion anulada' } }, { session });
        if (campana) {
            campana.historialAnulacionesInseminacion.push({ participanteId: participante._id, fecha: new Date(), usuarioId: req.usuario.id, motivo: req.body.motivo, semenSnapshot: participante.semenSnapshot, registroReproductivo: registro._id });
            participante.fechaInseminacion = undefined; participante.semenUtilizado = undefined; participante.bancoSemenId = undefined; participante.semenSnapshot = undefined; participante.estadoParticipacion = 'PROTOCOLO_COMPLETADO';
            if (!['FINALIZADA', 'CANCELADA'].includes(campana.estado)) {
                campana.estado = 'EN_CURSO';
                const Paso = require('../models/EjecucionPasoIATF');
                const paso = await Paso.findOneAndUpdate({ campana: campana._id, 'pasoSnapshot.tipoAccion': 'IATF' }, { $set: { estado: 'PARCIAL' } }, { new: true, session });
                if (paso?.tarea) await Tarea.updateOne({ _id: paso.tarea, estado: 'Completada' }, { $set: { estado: 'En proceso' }, $unset: { fechaCompletada: '' } }, { session });
            }
            await campana.save({ session });
        }
        await upsertEventoAnimal({ animal: registro.animal, tipoEvento: 'Observacion', fecha: new Date(), titulo: 'Inseminacion anulada', descripcion: req.body.motivo, moduloOrigen: 'Reproduccion', referenciaId: registro._id, creadoPor: req.usuario.id, metadata: { inseminacionAnulada: true, consumoSemenId: registro.semenSnapshot.consumoSemenId } }, { session });
        return { mensaje: 'Inseminacion anulada y semen devuelto al origen.' };
    }))
};
