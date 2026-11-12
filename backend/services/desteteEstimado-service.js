const { randomUUID } = require('crypto');
const Animal = require('../models/Animal');
const EventoAnimal = require('../models/EventoAnimal');
const { Tarea } = require('../models/Tarea');
const { crearDefinicionesTareasBovinas, esSeguimientoBovinoVigente } = require('./reproduccionBovina-service');
const { parsearFechaCivil } = require('./fechaZonaHoraria-service');

const errorDestete = (mensaje, status = 422) => Object.assign(new Error(mensaje), { status });
const claveDia = (fecha) => fecha ? new Date(fecha).toISOString().slice(0, 10) : '';
const validarFechaDestete = (valor) => {
    if (typeof valor !== 'string') {
        throw errorDestete('Indique una fecha estimada de destete valida (AAAA-MM-DD).');
    }
    try { return parsearFechaCivil(valor, 'La fecha estimada de destete'); }
    catch (err) { throw errorDestete(err.message); }
};

// El llamador conserva ciclo, crias, tareas y evidencia dentro de una sola transaccion.
const reprogramarDesteteEstimado = async ({ registro, fecha, motivo, usuarioId, session }) => {
    if (!session?.inTransaction()) throw errorDestete('La reprogramacion requiere una transaccion.', 500);
    const nueva = validarFechaDestete(fecha);
    if (registro.especie !== 'Bovino' || !registro.fechaPartoReal || !esSeguimientoBovinoVigente(registro)) {
        throw errorDestete('Solo puede reprogramar el destete de un seguimiento bovino con parto real vigente.');
    }
    if (claveDia(nueva) < claveDia(registro.fechaPartoReal)) throw errorDestete('El destete estimado no puede ser anterior al parto real.');
    if (claveDia(nueva) === claveDia(registro.fechaDestete)) return false;
    if (typeof motivo !== 'string' || motivo.trim().length < 3 || motivo.trim().length > 1000) {
        throw errorDestete('Indique el motivo del cambio de destete (entre 3 y 1000 caracteres).');
    }
    const inicio = new Date(`${claveDia(registro.fechaPartoReal)}T00:00:00.000Z`);
    const fin = new Date(inicio); fin.setUTCDate(fin.getUTCDate() + 1);
    const crias = await Animal.find({
        especie: 'Bovino', fechaNacimiento: { $gte: inicio, $lt: fin },
        $or: [{ madreGestanteId: registro.animal }, { madreGestanteId: null, madre: registro.animal }]
    }).session(session);
    const tareas = await Tarea.find({ moduloOrigen: 'Reproduccion', referenciaId: registro._id, claveAutomatica: 'destete', creadoAutomaticamente: true }).session(session);
    if (crias.some((cria) => cria.fechaDestete) || tareas.some((tarea) => tarea.estado === 'Completada')) {
        throw errorDestete('El destete ya tiene una ejecucion real registrada. No se puede reprogramar su historial.', 409);
    }
    const anterior = registro.fechaDestete;
    const animal = await Animal.findById(registro.animal).session(session);
    if (!animal) throw errorDestete('La madre no existe en la finca activa.', 404);
    registro.fechaDestete = nueva;
    await registro.save({ session });
    const cambioId = randomUUID();
    const eventos = [];
    const registrarCambio = (animal, fechaAnterior) => eventos.push({
        animal, tipoEvento: 'Observacion', fecha: new Date(), titulo: 'Reprogramacion de destete estimado',
        descripcion: `Destete estimado cambiado de ${claveDia(fechaAnterior) || 'sin fecha'} a ${claveDia(nueva)}. Motivo: ${motivo.trim()}`,
        moduloOrigen: 'Reproduccion', referenciaId: registro._id, creadoPor: usuarioId,
        claveIdempotencia: `destete-estimado:${cambioId}:${animal}`,
        metadata: { fechaAnterior: claveDia(fechaAnterior) || null, fechaNueva: claveDia(nueva), motivo: motivo.trim(), registroReproductivoId: registro._id }
    });
    registrarCambio(registro.animal, anterior);
    for (const cria of crias) {
        const anteriorCria = cria.fechaDesteteEstimada;
        cria.fechaDesteteEstimada = nueva;
        await cria.save({ session });
        registrarCambio(cria._id, anteriorCria);
    }
    const definicion = crearDefinicionesTareasBovinas({ registro, animal, ternero: crias[0], usuarioId }).find((tarea) => tarea.claveAutomatica === 'destete');
    for (const tarea of tareas.filter((tarea) => ['Pendiente', 'En proceso'].includes(tarea.estado))) {
        tarea.fechaProgramada = nueva;
        tarea.fechaLimite = nueva;
        tarea.descripcion = definicion.descripcion;
        if (crias.length === 1) tarea.animal = crias[0]._id;
        await tarea.save({ session });
    }
    if (!tareas.length && registro.asignadoA) await Tarea.create([definicion], { session });
    await EventoAnimal.create(eventos, { session, ordered: true });
    return true;
};

module.exports = { reprogramarDesteteEstimado, validarFechaDestete };
