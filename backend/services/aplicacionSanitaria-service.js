const Animal = require('../models/Animal');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const { eliminarEventosPorReferencia, upsertEventoAnimal } = require('./eventoAnimal-service');
const EventoLote = require('../models/EventoLote');
const Lote = require('../models/Lote');
const PertenenciaLote = require('../models/PertenenciaLote');

const normalizarIds = (animales = []) => [...new Set(
    animales.map((animal) => (animal?._id || animal)?.toString()).filter(Boolean)
)];

const especieAnimal = (animal) => animal.especie || 'Bovino';

const obtenerLoteSanidad = async (loteId, especieEsperada, { requiereActivo = false } = {}) => {
    if (!loteId) return null;
    const lote = await Lote.findById(loteId).select('_id codigo nombre especie estado');
    if (!lote) {
        const error = new Error('El lote seleccionado no existe');
        error.status = 404;
        throw error;
    }
    if (especieEsperada && lote.especie !== especieEsperada) {
        const error = new Error('El lote no pertenece a la especie seleccionada');
        error.status = 400;
        throw error;
    }
    if (requiereActivo && lote.estado !== 'ACTIVO') {
        const error = new Error('Solo se pueden usar lotes activos en una nueva operación sanitaria');
        error.status = 409;
        throw error;
    }
    return lote;
};

const validarAnimalesSanidad = async (animales = [], especieEsperada, { soloActivos = false } = {}) => {
    const ids = normalizarIds(animales);
    if (!ids.length) {
        const error = new Error('Debe seleccionar al menos un animal');
        error.status = 400;
        throw error;
    }

    const encontrados = await Animal.find({ _id: { $in: ids } })
        .select('_id especie diio identificadorFinca nombre estado loteActual');

    if (encontrados.length !== ids.length) {
        const error = new Error('Uno o más animales seleccionados no existen');
        error.status = 404;
        throw error;
    }

    const especies = [...new Set(encontrados.map(especieAnimal))];
    if (especies.length !== 1 || (especieEsperada && especies[0] !== especieEsperada)) {
        const error = new Error('Todos los animales deben pertenecer a la especie seleccionada');
        error.status = 400;
        throw error;
    }

    if (soloActivos && encontrados.some((animal) => ['Muerto', 'Vendido'].includes(animal.estado))) {
        const error = new Error('Solo se pueden seleccionar animales activos para una nueva operación sanitaria');
        error.status = 400;
        throw error;
    }

    return { animales: encontrados, ids, especie: especies[0] };
};

const resolverAlcanceSanitario = async ({ animales = [], lote, especie }, { soloActivos = false } = {}) => {
    if (!lote) {
        const validacion = await validarAnimalesSanidad(animales, especie, { soloActivos });
        return { ...validacion, lote: null };
    }

    const loteEncontrado = await obtenerLoteSanidad(lote, especie, { requiereActivo: true });
    const pertenencias = await PertenenciaLote.find({ lote: loteEncontrado._id, activo: true })
        .select('animal')
        .lean();
    const ids = pertenencias.map((pertenencia) => pertenencia.animal);
    if (!ids.length) {
        const error = new Error('El lote seleccionado no tiene animales activos');
        error.status = 409;
        throw error;
    }
    const validacion = await validarAnimalesSanidad(ids, especie, { soloActivos });
    return { ...validacion, lote: loteEncontrado };
};

const etiquetaNaturaleza = (naturaleza) => (
    naturaleza === 'Aplicacion unica' ? 'Aplicación única' : naturaleza
);

const crearDescripcionEvento = (aplicacion) => {
    let descripcion;

    if (aplicacion.naturaleza === 'Plan sanitario') {
        descripcion = `Aplicación de ${aplicacion.producto} correspondiente al Plan Sanitario.`;
    } else if (aplicacion.naturaleza === 'Tratamiento') {
        descripcion = `Aplicación ${aplicacion.numeroAplicacion || 1} de ${aplicacion.totalAplicaciones || 1} del tratamiento con ${aplicacion.producto}.`;
    } else {
        descripcion = `Aplicación sanitaria puntual de ${aplicacion.producto}.`;
    }

    if (aplicacion.dosis) descripcion += ` Dosis: ${aplicacion.dosis}.`;
    if (aplicacion.viaAplicacion) descripcion += ` Vía: ${aplicacion.viaAplicacion}.`;
    if (aplicacion.observaciones) descripcion += ` ${aplicacion.observaciones}`;
    if (aplicacion.loteCodigo) descripcion += ` Lote: ${aplicacion.loteCodigo}.`;
    return descripcion;
};

const construirDatosEventoAplicacion = (aplicacion, usuarioId) => ({
        tipoEvento: aplicacion.naturaleza === 'Tratamiento' ? 'Tratamiento' : 'Sanidad',
        fecha: aplicacion.fechaAplicacion,
        titulo: 'Aplicación sanitaria',
        descripcion: crearDescripcionEvento(aplicacion),
        moduloOrigen: 'Sanidad',
        referenciaId: aplicacion._id,
        creadoPor: usuarioId || aplicacion.registradoPor,
        metadata: {
            naturaleza: etiquetaNaturaleza(aplicacion.naturaleza),
            producto: aplicacion.producto,
            tipo: aplicacion.tipo,
            dosis: aplicacion.dosis,
            viaAplicacion: aplicacion.viaAplicacion,
            responsable: aplicacion.responsable,
            responsableUsuario: aplicacion.responsableUsuario,
            motivo: aplicacion.motivo,
            planSanitarioId: aplicacion.planSanitario,
            tratamientoId: aplicacion.tratamiento,
            numeroAplicacion: aplicacion.numeroAplicacion,
            totalAplicaciones: aplicacion.totalAplicaciones,
            loteId: aplicacion.lote,
            loteCodigo: aplicacion.loteCodigo
        }
    });

const crearEventosAplicacion = async (aplicacion, usuarioId) => {
    const datosBase = construirDatosEventoAplicacion(aplicacion, usuarioId);

    await Promise.all(aplicacion.animales.map((animal) => upsertEventoAnimal({
        ...datosBase,
        animal: animal?._id || animal
    })));
};

const crearEventosLoteAplicacion = async (aplicacion, animales, usuarioId) => {
    const lotes = aplicacion.lote
        ? [String(aplicacion.lote)]
        : [...new Set(animales.map((animal) => String(animal.loteActual || '')).filter(Boolean))];
    await Promise.all(lotes.map((lote) => EventoLote.create({
        lote,
        tipo: 'APLICACION_SANITARIA',
        fecha: aplicacion.fechaAplicacion,
        titulo: 'Aplicación sanitaria',
        descripcion: `${aplicacion.producto} · ${etiquetaNaturaleza(aplicacion.naturaleza)}`,
        referenciaId: aplicacion._id,
        entidadTipo: 'AplicacionSanitaria',
        registradoPor: usuarioId,
        metadata: { producto: aplicacion.producto, animales: aplicacion.animales, loteCodigo: aplicacion.loteCodigo }
    })));
};

const crearAplicacionSanitaria = async (datos, usuarioId, { soloActivos = false } = {}) => {
    const validacion = await validarAnimalesSanidad(datos.animales, datos.especie, { soloActivos });
    const lote = datos.lote ? await obtenerLoteSanidad(datos.lote, validacion.especie) : null;
    const aplicacion = await AplicacionSanitaria.create({
        ...datos,
        animales: validacion.ids,
        especie: validacion.especie,
        lote: lote?._id || null,
        loteCodigo: datos.loteCodigo || lote?.codigo,
        registradoPor: usuarioId
    });

    try {
        await crearEventosAplicacion(aplicacion, usuarioId);
        await crearEventosLoteAplicacion(aplicacion, validacion.animales, usuarioId);
        return aplicacion;
    } catch (error) {
        await eliminarEventosPorReferencia({ moduloOrigen: 'Sanidad', referenciaId: aplicacion._id });
        await EventoLote.deleteMany({ entidadTipo: 'AplicacionSanitaria', referenciaId: aplicacion._id });
        await AplicacionSanitaria.findByIdAndDelete(aplicacion._id);
        throw error;
    }
};

const eliminarAplicacionSanitariaCreada = async (aplicacionId) => {
    if (!aplicacionId) return;
    await eliminarEventosPorReferencia({ moduloOrigen: 'Sanidad', referenciaId: aplicacionId });
    await EventoLote.deleteMany({ entidadTipo: 'AplicacionSanitaria', referenciaId: aplicacionId });
    await AplicacionSanitaria.findByIdAndDelete(aplicacionId);
};

module.exports = {
    construirDatosEventoAplicacion,
    crearAplicacionSanitaria,
    eliminarAplicacionSanitariaCreada,
    etiquetaNaturaleza,
    normalizarIds,
    obtenerLoteSanidad,
    resolverAlcanceSanitario,
    validarAnimalesSanidad
};
