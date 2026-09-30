const CorteForraje = require('../models/CorteForraje');
const Potrero = require('../models/Potrero');
const HistorialCoberturaPotrero = require('../models/HistorialCoberturaPotrero');
const { Tarea } = require('../models/Tarea');
const { diaUTC, obtenerCoberturaEnFecha } = require('./potreroCobertura-service');
const { validarUsuarioAsignable } = require('./usuarioAsignable-service');

const MS_DIA = 86400000;
const CATEGORIA_CORTE = 'CORTE_FORRAJE';
const CATEGORIA_SIEMBRA = 'SIEMBRA_FORRAJE';

const sumarDias = (fecha, dias) => new Date(diaUTC(fecha).getTime() + Number(dias) * MS_DIA);

const convertirAKg = (cantidad, unidad = 'KG') => {
    const valor = Number(cantidad);
    if (!Number.isFinite(valor) || valor < 0) throw new Error('La cantidad de forraje debe ser un número mayor o igual a cero.');
    return String(unidad).toUpperCase() === 'TON' || String(unidad).toUpperCase() === 'TONELADAS' ? valor * 1000 : valor;
};

const cancelarDuplicadas = async (potreroId, categoria, conservarId) => Tarea.updateMany({
    potrero: potreroId,
    moduloOrigen: 'Potreros',
    categoriaAutomatica: categoria,
    creadoAutomaticamente: true,
    estado: { $in: ['Pendiente', 'En proceso'] },
    ...(conservarId ? { _id: { $ne: conservarId } } : {})
}, { estado: 'Cancelada', observaciones: 'Reprogramada por una actualización del banco forrajero.' });

const programarTarea = async ({ potrero, fecha, responsable, usuarioId, categoria = CATEGORIA_CORTE, tipo = 'Corte de forraje' }) => {
    if (!fecha || !responsable) return null;
    await validarUsuarioAsignable(responsable, 'Tareas');
    const claveAutomatica = `${categoria.toLowerCase()}-${potrero._id}`;
    let tarea = await Tarea.findOne({
        potrero: potrero._id,
        moduloOrigen: 'Potreros',
        categoriaAutomatica: categoria,
        creadoAutomaticamente: true,
        estado: { $in: ['Pendiente', 'En proceso'] }
    }).sort({ fechaProgramada: 1 });
    if (!tarea) tarea = new Tarea({ potrero: potrero._id, referenciaId: potrero._id, moduloOrigen: 'Potreros' });
    const responsableAnterior = tarea.asignadoA;
    Object.assign(tarea, {
        titulo: `${tipo === 'Siembra' ? 'Sembrar' : 'Cortar'} ${potrero.nombre}`,
        descripcion: tipo === 'Siembra'
            ? `Establecimiento o renovación de forraje en ${potrero.nombre}.`
            : `Corte programado según el intervalo objetivo de ${potrero.nombre}.`,
        tipo,
        fechaProgramada: diaUTC(fecha),
        prioridad: 'Media',
        estado: tarea.estado === 'En proceso' ? 'En proceso' : 'Pendiente',
        asignadoA: responsable,
        creadoPor: tarea.creadoPor || usuarioId || responsable,
        creadoAutomaticamente: true,
        categoriaAutomatica: categoria,
        claveAutomatica
    });
    if (tarea.asignacionModificadaManualmente && responsableAnterior) tarea.asignadoA = responsableAnterior;
    await tarea.save();
    await cancelarDuplicadas(potrero._id, categoria, tarea._id);
    return tarea;
};

const programarPrimerCorte = async (potrero, { fechaPrimerCorte, responsableCorte, fechaSiembra } = {}, usuarioId) => {
    const responsable = responsableCorte || potrero.responsableCorte;
    const tareas = [];
    if (fechaPrimerCorte && responsable) tareas.push(await programarTarea({ potrero, fecha: fechaPrimerCorte, responsable, usuarioId }));
    if (fechaSiembra && responsable) tareas.push(await programarTarea({ potrero, fecha: fechaSiembra, responsable, usuarioId, categoria: CATEGORIA_SIEMBRA, tipo: 'Siembra' }));
    return tareas.filter(Boolean);
};

const obtenerForrajeEnFecha = async (potrero, fechaCorte) => {
    const historial = await HistorialCoberturaPotrero.find({ potrero: potrero._id })
        .populate('pastoPrincipal').sort({ fechaInicio: -1 }).lean();
    return obtenerCoberturaEnFecha(historial, fechaCorte)?.pastoPrincipal || potrero.pastoPrincipal;
};

const registrarCorte = async (potreroId, datos, usuarioId) => {
    const potrero = await Potrero.findById(potreroId).populate('pastoPrincipal');
    if (!potrero) return null;
    if (potrero.tipoArea !== 'BANCO_FORRAJERO') throw new Error('Los cortes solo pueden registrarse en bancos forrajeros.');
    const fechaCorte = diaUTC(datos.fechaCorte);
    if (!fechaCorte) throw new Error('La fecha de corte es obligatoria.');
    const responsable = datos.responsable || potrero.responsableCorte;
    await validarUsuarioAsignable(responsable, 'Tareas');
    const forraje = await obtenerForrajeEnFecha(potrero, fechaCorte);
    if (!forraje) throw new Error('Registre la cobertura forrajera antes de guardar un corte.');
    const cantidadForrajeVerdeKg = convertirAKg(
        datos.cantidadForrajeVerde ?? datos.cantidadForrajeVerdeKg,
        datos.unidadCantidad
    );
    const porcentajeMateriaSeca = datos.porcentajeMateriaSeca === '' || datos.porcentajeMateriaSeca == null
        ? null : Number(datos.porcentajeMateriaSeca);
    if (porcentajeMateriaSeca !== null && (!Number.isFinite(porcentajeMateriaSeca) || porcentajeMateriaSeca < 0 || porcentajeMateriaSeca > 100)) {
        throw new Error('El porcentaje de materia seca debe estar entre 0 y 100.');
    }
    const corte = await CorteForraje.create({
        potrero: potrero._id,
        fechaCorte,
        forraje: forraje._id,
        forrajeNombre: forraje.nombre,
        especieBase: forraje.especieBase,
        cultivar: forraje.cultivar,
        areaCortadaHa: datos.areaCortadaHa,
        cantidadForrajeVerdeKg,
        porcentajeMateriaSeca,
        cantidadMateriaSecaKg: porcentajeMateriaSeca === null ? null : cantidadForrajeVerdeKg * porcentajeMateriaSeca / 100,
        destino: datos.destino,
        responsable,
        observaciones: datos.observaciones,
        registradoPor: usuarioId
    });
    const pendiente = await Tarea.findOne({
        potrero: potrero._id,
        moduloOrigen: 'Potreros',
        categoriaAutomatica: CATEGORIA_CORTE,
        creadoAutomaticamente: true,
        estado: { $in: ['Pendiente', 'En proceso'] }
    }).sort({ fechaProgramada: 1 });
    if (pendiente) {
        pendiente.estado = 'Completada';
        pendiente.fechaCompletada = fechaCorte;
        pendiente.observaciones = `Corte registrado: ${corte._id}`;
        await pendiente.save();
    }
    await cancelarDuplicadas(potrero._id, CATEGORIA_CORTE);
    if (potrero.intervaloCorteObjetivoDias) {
        await programarTarea({
            potrero,
            fecha: sumarDias(fechaCorte, potrero.intervaloCorteObjetivoDias),
            responsable,
            usuarioId
        });
    }
    return CorteForraje.findById(corte._id).populate('forraje').populate('responsable', 'nombre apellido correo').lean();
};

const listarCortes = (potreroId, filtros = {}) => {
    const consulta = { ...(potreroId ? { potrero: potreroId } : {}) };
    if (filtros.fechaInicio || filtros.fechaFin) {
        consulta.fechaCorte = {};
        if (filtros.fechaInicio) consulta.fechaCorte.$gte = diaUTC(filtros.fechaInicio);
        if (filtros.fechaFin) consulta.fechaCorte.$lte = sumarDias(filtros.fechaFin, 1);
    }
    return CorteForraje.find(consulta)
        .populate('potrero', 'codigo nombre area intervaloCorteObjetivoDias')
        .populate('forraje')
        .populate('responsable', 'nombre apellido correo')
        .sort({ fechaCorte: -1 }).lean();
};

const enriquecerBancosForrajeros = async (potreros = []) => {
    const bancos = potreros.filter((item) => item.tipoArea === 'BANCO_FORRAJERO');
    if (!bancos.length) return potreros.map((item) => item.toObject ? item.toObject() : item);
    const ids = bancos.map((item) => item._id);
    const [cortes, tareas] = await Promise.all([
        CorteForraje.find({ potrero: { $in: ids } }).sort({ fechaCorte: -1 }).lean(),
        Tarea.find({
            potrero: { $in: ids },
            moduloOrigen: 'Potreros',
            categoriaAutomatica: CATEGORIA_CORTE,
            creadoAutomaticamente: true,
            estado: { $in: ['Pendiente', 'En proceso'] }
        }).sort({ fechaProgramada: 1 }).lean()
    ]);
    const ultimoPorBanco = new Map();
    cortes.forEach((corte) => {
        const id = String(corte.potrero);
        if (!ultimoPorBanco.has(id)) ultimoPorBanco.set(id, corte);
    });
    const tareaPorBanco = new Map();
    tareas.forEach((tarea) => {
        const id = String(tarea.potrero);
        if (!tareaPorBanco.has(id)) tareaPorBanco.set(id, tarea);
    });
    return potreros.map((item) => {
        const plano = item.toObject ? item.toObject() : item;
        const ultimoCorte = ultimoPorBanco.get(String(item._id));
        const proximaTarea = tareaPorBanco.get(String(item._id));
        return {
            ...plano,
            ultimoCorte: ultimoCorte || null,
            proximoCorteEstimado: proximaTarea?.fechaProgramada || null
        };
    });
};

module.exports = {
    CATEGORIA_CORTE,
    convertirAKg,
    enriquecerBancosForrajeros,
    listarCortes,
    programarPrimerCorte,
    programarTarea,
    registrarCorte,
    sumarDias
};
