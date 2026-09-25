const Animal = require('../models/Animal');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const { eliminarEventosPorReferencia, upsertEventoAnimal } = require('./eventoAnimal-service');

const normalizarIds = (animales = []) => [...new Set(
    animales.map((animal) => (animal?._id || animal)?.toString()).filter(Boolean)
)];

const especieAnimal = (animal) => animal.especie || 'Bovino';

const validarAnimalesSanidad = async (animales = [], especieEsperada, { soloActivos = false } = {}) => {
    const ids = normalizarIds(animales);
    if (!ids.length) {
        const error = new Error('Debe seleccionar al menos un animal');
        error.status = 400;
        throw error;
    }

    const encontrados = await Animal.find({ _id: { $in: ids } })
        .select('_id especie diio identificadorFinca nombre estado');

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
            motivo: aplicacion.motivo,
            planSanitarioId: aplicacion.planSanitario,
            tratamientoId: aplicacion.tratamiento,
            numeroAplicacion: aplicacion.numeroAplicacion,
            totalAplicaciones: aplicacion.totalAplicaciones
        }
    });

const crearEventosAplicacion = async (aplicacion, usuarioId) => {
    const datosBase = construirDatosEventoAplicacion(aplicacion, usuarioId);

    await Promise.all(aplicacion.animales.map((animal) => upsertEventoAnimal({
        ...datosBase,
        animal: animal?._id || animal
    })));
};

const crearAplicacionSanitaria = async (datos, usuarioId, { soloActivos = false } = {}) => {
    const validacion = await validarAnimalesSanidad(datos.animales, datos.especie, { soloActivos });
    const aplicacion = await AplicacionSanitaria.create({
        ...datos,
        animales: validacion.ids,
        especie: validacion.especie,
        registradoPor: usuarioId
    });

    try {
        await crearEventosAplicacion(aplicacion, usuarioId);
        return aplicacion;
    } catch (error) {
        await eliminarEventosPorReferencia({ moduloOrigen: 'Sanidad', referenciaId: aplicacion._id });
        await AplicacionSanitaria.findByIdAndDelete(aplicacion._id);
        throw error;
    }
};

const eliminarAplicacionSanitariaCreada = async (aplicacionId) => {
    if (!aplicacionId) return;
    await eliminarEventosPorReferencia({ moduloOrigen: 'Sanidad', referenciaId: aplicacionId });
    await AplicacionSanitaria.findByIdAndDelete(aplicacionId);
};

module.exports = {
    construirDatosEventoAplicacion,
    crearAplicacionSanitaria,
    eliminarAplicacionSanitariaCreada,
    etiquetaNaturaleza,
    normalizarIds,
    validarAnimalesSanidad
};
