const Animal = require('../models/Animal');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const { eliminarEventosPorReferencia, upsertEventoAnimal } = require('./eventoAnimal-service');
const EventoLote = require('../models/EventoLote');
const Lote = require('../models/Lote');
const PertenenciaLote = require('../models/PertenenciaLote');
const { ejecutarEnTransaccion } = require('./mongo-transaccion-service');
const { aplicarRetiroCarneAnimales, calcularFechaFinRetiroCarne } = require('./retiro-carne-service');

const conSession = (query, session) => session ? query.session(session) : query;

const normalizarIds = (animales = []) => [...new Set(
    animales.map((animal) => (animal?._id || animal)?.toString()).filter(Boolean)
)];

const especieAnimal = (animal) => animal.especie || 'Bovino';

const obtenerLoteSanidad = async (loteId, especieEsperada, { requiereActivo = false, session = null } = {}) => {
    if (!loteId) return null;
    const lote = await conSession(Lote.findById(loteId).select('_id codigo nombre especie estado'), session);
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

const validarAnimalesSanidad = async (animales = [], especieEsperada, { soloActivos = false, session = null } = {}) => {
    const ids = normalizarIds(animales);
    if (!ids.length) {
        const error = new Error('Debe seleccionar al menos un animal');
        error.status = 400;
        throw error;
    }

    const encontrados = await conSession(
        Animal.find({ _id: { $in: ids } })
            .select('_id especie diio identificadorFinca nombre estado loteActual'),
        session
    );

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

const resolverAlcanceSanitario = async ({ animales = [], lote, especie }, { soloActivos = false, session = null } = {}) => {
    if (!lote) {
        const validacion = await validarAnimalesSanidad(animales, especie, { soloActivos, session });
        return { ...validacion, lote: null };
    }

    const loteEncontrado = await obtenerLoteSanidad(lote, especie, { requiereActivo: true, session });
    const pertenencias = await conSession(
        PertenenciaLote.find({ lote: loteEncontrado._id, activo: true }).select('animal'),
        session
    ).lean();
    const ids = pertenencias.map((pertenencia) => pertenencia.animal);
    if (!ids.length) {
        const error = new Error('El lote seleccionado no tiene animales activos');
        error.status = 409;
        throw error;
    }
    const validacion = await validarAnimalesSanidad(ids, especie, { soloActivos, session });
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
    if (aplicacion.diasRetiroCarne > 0) {
        descripcion += ` Retiro de carne: ${aplicacion.diasRetiroCarne} días, hasta ${new Date(aplicacion.fechaFinRetiroCarne).toLocaleDateString('es-CR')}.`;
    }
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
            loteCodigo: aplicacion.loteCodigo,
            diasRetiroCarne: aplicacion.diasRetiroCarne,
            fechaFinRetiroCarne: aplicacion.fechaFinRetiroCarne
        }
    });

const crearEventosAplicacion = async (aplicacion, usuarioId, session = null) => {
    const datosBase = construirDatosEventoAplicacion(aplicacion, usuarioId);

    await Promise.all(aplicacion.animales.map((animal) => upsertEventoAnimal({
        ...datosBase,
        animal: animal?._id || animal
    }, { session })));
};

const crearEventosLoteAplicacion = async (aplicacion, animales, usuarioId, session = null) => {
    const lotes = aplicacion.lote
        ? [String(aplicacion.lote)]
        : [...new Set(animales.map((animal) => String(animal.loteActual || '')).filter(Boolean))];
    await Promise.all(lotes.map(async (lote) => {
        const [evento] = await EventoLote.create([{
        lote,
        tipo: 'APLICACION_SANITARIA',
        fecha: aplicacion.fechaAplicacion,
        titulo: 'Aplicación sanitaria',
        descripcion: `${aplicacion.producto} · ${etiquetaNaturaleza(aplicacion.naturaleza)}`,
        referenciaId: aplicacion._id,
        entidadTipo: 'AplicacionSanitaria',
        registradoPor: usuarioId,
        metadata: { producto: aplicacion.producto, animales: aplicacion.animales, loteCodigo: aplicacion.loteCodigo }
        }], session ? { session } : {});
        return evento;
    }));
};

const crearAplicacionSanitaria = async (datos, usuarioId, opciones = {}) => {
    const ejecutar = async (session) => {
        if (datos.claveIdempotencia) {
            const existente = await conSession(
                AplicacionSanitaria.findOne({ claveIdempotencia: datos.claveIdempotencia }).select('+claveIdempotencia'),
                session
            );
            if (existente) return existente;
        }

        const validacion = await validarAnimalesSanidad(datos.animales, datos.especie, {
            soloActivos: opciones.soloActivos,
            session
        });
        const lote = datos.lote
            ? await obtenerLoteSanidad(datos.lote, validacion.especie, { session })
            : null;
        const fechaFinRetiroCarne = calcularFechaFinRetiroCarne(datos.fechaAplicacion, datos.diasRetiroCarne);
        const [aplicacion] = await AplicacionSanitaria.create([{
            ...datos,
            animales: validacion.ids,
            especie: validacion.especie,
            lote: lote?._id || null,
            loteCodigo: datos.loteCodigo || lote?.codigo,
            diasRetiroCarne: Number(datos.diasRetiroCarne || 0),
            fechaFinRetiroCarne,
            registradoPor: usuarioId
        }], { session });

        await crearEventosAplicacion(aplicacion, usuarioId, session);
        await crearEventosLoteAplicacion(aplicacion, validacion.animales, usuarioId, session);
        await aplicarRetiroCarneAnimales({
            animales: validacion.ids,
            producto: aplicacion.producto,
            fechaAplicacion: aplicacion.fechaAplicacion,
            diasRetiroCarne: aplicacion.diasRetiroCarne,
            session
        });
        return aplicacion;
    };

    return opciones.session ? ejecutar(opciones.session) : ejecutarEnTransaccion(ejecutar);
};

const eliminarAplicacionSanitariaCreada = async (aplicacionId, session = null) => {
    if (!aplicacionId) return;
    await eliminarEventosPorReferencia({ moduloOrigen: 'Sanidad', referenciaId: aplicacionId, session });
    await EventoLote.deleteMany({ entidadTipo: 'AplicacionSanitaria', referenciaId: aplicacionId }, session ? { session } : {});
    await AplicacionSanitaria.findByIdAndDelete(aplicacionId, session ? { session } : {});
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
