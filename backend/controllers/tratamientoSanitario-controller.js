const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const Animal = require('../models/Animal');
const { TratamientoSanitario } = require('../models/TratamientoSanitario');
const {
    crearAplicacionSanitaria,
    normalizarIds,
    resolverAlcanceSanitario
} = require('../services/aplicacionSanitaria-service');
const { actualizarEstadoSanitarioAnimales } = require('../services/estadoSanitario-service');
const {
    cancelarTareasSanitariasPendientes,
    completarTareasSanitariasPendientes,
    sincronizarTareaTratamiento
} = require('../services/sanidad-tarea-service');
const { nombreUsuario, notificarAccionSegura } = require('../services/notificacion-service');
const { validarUsuarioAsignable } = require('../services/usuarioAsignable-service');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const {
    sanitizarAplicacionSanitaria,
    sanitizarCierreTratamiento,
    sanitizarTratamientoSanitario
} = require('../services/sanidad-dto-service');

const tratamientoSanitarioCtrl = {};

const notificarTratamiento = (req, tratamiento, tipo, titulo, mensaje, metadata = {}) => notificarAccionSegura({
    actor: req.usuario,
    naturaleza: 'Informativa',
    tipo,
    titulo,
    mensaje,
    moduloOrigen: 'Sanidad',
    entidadTipo: 'TratamientoSanitario',
    entidadId: tratamiento._id,
    url: `/sanidad/tratamientos/${tratamiento._id}`,
    metadata
});

const poblarTratamiento = (query) => query
    .populate('animales', 'diio identificadorFinca nombre especie estado estadoSanitario categoria')
    .populate('lote', 'codigo nombre especie estado')
    .populate('registradoPor', 'nombre apellido correo')
    .populate('asignadoA', 'nombre apellido correo rol estado');

const actualizarEstadoDesdeTratamiento = async (
    tratamiento,
    datos,
    usuarioId,
    campo = 'estadoSanitario',
    opciones = {}
) => {
    const estadoNuevo = datos[campo];
    if (!estadoNuevo || estadoNuevo === 'No modificar') return [];

    return actualizarEstadoSanitarioAnimales(
        tratamiento.animales,
        estadoNuevo,
        datos.motivoCambioEstadoSanitario || `Actualización asociada al tratamiento con ${tratamiento.producto}.`,
        usuarioId,
        tratamiento._id,
        opciones
    );
};

const sumarDias = (fecha, dias = 0) => {
    const resultado = new Date(fecha);
    resultado.setUTCDate(resultado.getUTCDate() + Number(dias || 0));
    return resultado;
};

const crearFiltroFecha = (fechaInicio, fechaFin) => {
    if (!fechaInicio && !fechaFin) return {};
    const filtro = {};
    if (fechaInicio) filtro.$gte = new Date(fechaInicio);
    if (fechaFin) {
        const fin = new Date(fechaFin);
        fin.setUTCHours(23, 59, 59, 999);
        filtro.$lte = fin;
    }
    return { fechaInicio: filtro };
};

const resolverAnimalesActivosTratamiento = async (tratamiento, session) => {
    const animales = await Animal.find({ _id: { $in: tratamiento.animales } })
        .select('_id estado diio identificadorFinca nombre')
        .session(session);
    const activos = animales.filter((animal) => animal.estado === 'Activo');
    const excluidos = animales.filter((animal) => animal.estado !== 'Activo');
    if (!activos.length) {
        const error = new Error('El tratamiento no tiene animales activos disponibles para esta aplicación');
        error.status = 409;
        throw error;
    }
    return { activos, excluidos };
};

const notaAnimalesExcluidos = (animales = []) => {
    if (!animales.length) return '';
    const detalle = animales.map((animal) => (
        `${animal.diio || animal.identificadorFinca || animal.nombre || animal._id} (${animal.estado})`
    )).join(', ');
    return `No recibieron esta dosis por no estar activos: ${detalle}.`;
};

const registrarAplicacion = async (tratamiento, datos, usuarioId, session, claveIdempotencia = '') => {
    if (tratamiento.estado !== 'Activo') {
        const error = new Error('Solo se pueden registrar aplicaciones en tratamientos activos');
        error.status = 400;
        throw error;
    }

    if (tratamiento.aplicacionesRealizadas >= tratamiento.cantidadAplicaciones) {
        const error = new Error('El tratamiento ya tiene todas sus aplicaciones registradas');
        error.status = 400;
        throw error;
    }

    if (claveIdempotencia) {
        const existente = await AplicacionSanitaria.findOne({ claveIdempotencia })
            .select('+claveIdempotencia')
            .session(session);
        if (existente) {
            if (String(existente.tratamiento || '') !== String(tratamiento._id)) {
                const error = new Error('La clave de idempotencia ya fue utilizada en otra operación sanitaria');
                error.status = 409;
                throw error;
            }
            return { aplicacion: existente, replay: true };
        }
    }

    const fechaAplicacion = datos.fechaAplicacion || new Date();
    const numeroAplicacion = tratamiento.aplicacionesRealizadas + 1;
    const responsable = await validarUsuarioAsignable(
        datos.responsableUsuario || tratamiento.asignadoA?._id || tratamiento.asignadoA,
        'Sanidad'
    );
    const responsableNombre = [responsable.nombre, responsable.apellido].filter(Boolean).join(' ') || responsable.correo;
    const { activos, excluidos } = await resolverAnimalesActivosTratamiento(tratamiento, session);
    const observaciones = [datos.observaciones, notaAnimalesExcluidos(excluidos)].filter(Boolean).join(' | ');
    const aplicacion = await crearAplicacionSanitaria({
        animales: activos.map((animal) => animal._id),
        especie: tratamiento.especie,
        fechaAplicacion,
        producto: tratamiento.producto,
        tipo: 'Tratamiento veterinario',
        dosis: datos.dosis || tratamiento.dosis,
        viaAplicacion: datos.viaAplicacion || tratamiento.viaAplicacion,
        responsable: responsableNombre,
        responsableUsuario: responsable._id,
        motivo: tratamiento.motivo,
        observaciones,
        diasRetiroCarne: datos.diasRetiroCarne ?? tratamiento.diasRetiroCarne,
        naturaleza: 'Tratamiento',
        tratamiento: tratamiento._id,
        lote: tratamiento.lote?._id || tratamiento.lote,
        numeroAplicacion,
        totalAplicaciones: tratamiento.cantidadAplicaciones,
        claveIdempotencia: claveIdempotencia || undefined
    }, usuarioId, { soloActivos: true, session });

    tratamiento.aplicacionesRealizadas = numeroAplicacion;
    tratamiento.fechaFinRetiroCarne = aplicacion.fechaFinRetiroCarne && (
        !tratamiento.fechaFinRetiroCarne || aplicacion.fechaFinRetiroCarne > tratamiento.fechaFinRetiroCarne
    ) ? aplicacion.fechaFinRetiroCarne : tratamiento.fechaFinRetiroCarne;
    if (numeroAplicacion >= tratamiento.cantidadAplicaciones) {
        tratamiento.estado = 'Completado';
        tratamiento.fechaFin = fechaAplicacion;
        tratamiento.proximaAplicacion = null;
    } else {
        tratamiento.proximaAplicacion = sumarDias(fechaAplicacion, tratamiento.intervaloDias);
    }
    await tratamiento.save({ session });

    return { aplicacion, replay: false, excluidos };
};

tratamientoSanitarioCtrl.getTratamientos = async (req, res) => {
    try {
        const { especie, estado, animal, producto, fechaInicio, fechaFin } = req.query;
        const filtro = { ...crearFiltroFecha(fechaInicio, fechaFin) };
        if (especie) filtro.especie = especie;
        if (estado) filtro.estado = estado;
        if (animal) filtro.animales = animal;
        if (producto) filtro.producto = { $regex: producto, $options: 'i' };

        const tratamientos = await poblarTratamiento(
            TratamientoSanitario.find(filtro).sort({ proximaAplicacion: 1, fechaInicio: -1 })
        );
        res.json(tratamientos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener tratamientos sanitarios', error: error.message });
    }
};

tratamientoSanitarioCtrl.getTratamientoById = async (req, res) => {
    try {
        const tratamiento = await poblarTratamiento(TratamientoSanitario.findById(req.params.id));
        if (!tratamiento) return res.status(404).json({ mensaje: 'Tratamiento sanitario no encontrado' });

        const aplicaciones = await AplicacionSanitaria.find({ tratamiento: tratamiento._id })
            .populate('registradoPor', 'nombre apellido correo')
            .sort({ numeroAplicacion: 1, fechaAplicacion: 1 });
        res.json({ tratamiento, aplicaciones });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener el tratamiento', error: error.message });
    }
};

tratamientoSanitarioCtrl.createTratamiento = async (req, res) => {
    try {
        const datos = sanitizarTratamientoSanitario(req.body);
        await validarUsuarioAsignable(datos.asignadoA, 'Sanidad');
        const resultado = await ejecutarEnTransaccion(async (session) => {
            const validacion = await resolverAlcanceSanitario({
                animales: datos.animales,
                lote: datos.lote,
                especie: datos.especie
            }, { soloActivos: true, session });
            const [tratamiento] = await TratamientoSanitario.create([{
                ...datos,
                animales: validacion.ids,
                especie: validacion.especie,
                lote: validacion.lote?._id || null,
                aplicacionesRealizadas: 0,
                proximaAplicacion: null,
                fechaFin: null,
                estado: 'Activo',
                registradoPor: req.usuario?.id
            }], { session });

            let aplicacion = null;
            if (datos.registrarPrimeraAplicacion === true) {
                const registro = await registrarAplicacion(tratamiento, {
                    fechaAplicacion: datos.fechaPrimeraAplicacion || datos.fechaInicio,
                    dosis: datos.dosis,
                    viaAplicacion: datos.viaAplicacion,
                    diasRetiroCarne: datos.diasRetiroCarne,
                    responsableUsuario: datos.asignadoA,
                    observaciones: datos.observacionesPrimeraAplicacion
                }, req.usuario?.id, session, `tratamiento-inicial:${tratamiento._id}`);
                aplicacion = registro.aplicacion;
            }

            if (datos.actualizarEstadoSanitario === true) {
                await actualizarEstadoDesdeTratamiento(tratamiento, {
                    estadoSanitario: datos.estadoSanitario || 'Enfermo',
                    motivoCambioEstadoSanitario: datos.motivoCambioEstadoSanitario || datos.motivo
                }, req.usuario?.id, 'estadoSanitario', { session, omitirNotificacion: true });
            }

            await sincronizarTareaTratamiento(tratamiento, req.usuario?.id, {
                session,
                omitirNotificacion: true
            });
            return { tratamiento, aplicacion };
        });
        const { tratamiento, aplicacion } = resultado;
        await notificarTratamiento(
            req,
            tratamiento,
            'TRATAMIENTO_CREADO',
            'Tratamiento sanitario registrado',
            `${nombreUsuario(req.usuario)} registró un tratamiento con ${tratamiento.producto} para ${tratamiento.animales.length} animal${tratamiento.animales.length === 1 ? '' : 'es'}.`,
            { producto: tratamiento.producto, cantidadAnimales: tratamiento.animales.length }
        );
        if (aplicacion) {
            await notificarTratamiento(
                req,
                tratamiento,
                'APLICACION_SANITARIA_REGISTRADA',
                'Primera aplicación registrada',
                `${nombreUsuario(req.usuario)} registró la primera aplicación del tratamiento con ${tratamiento.producto}.`,
                { aplicacionId: aplicacion._id, numeroAplicacion: aplicacion.numeroAplicacion }
            );
        }

        const guardado = await poblarTratamiento(TratamientoSanitario.findById(tratamiento._id));
        res.status(201).json({ tratamiento: guardado, aplicacion });
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al crear tratamiento', error: error.message });
    }
};

tratamientoSanitarioCtrl.updateTratamiento = async (req, res) => {
    try {
        const datos = sanitizarTratamientoSanitario(req.body);
        const tratamiento = await TratamientoSanitario.findById(req.params.id);
        if (!tratamiento) return res.status(404).json({ mensaje: 'Tratamiento sanitario no encontrado' });
        if (tratamiento.estado === 'Cancelado') {
            return res.status(400).json({ mensaje: 'No se puede editar un tratamiento cancelado' });
        }

        const campos = [
            'animales', 'lote', 'motivo', 'diagnostico', 'producto', 'dosis', 'viaAplicacion',
            'diasRetiroCarne', 'fechaInicio', 'cantidadAplicaciones', 'intervaloDias', 'responsable',
            'veterinario', 'observaciones', 'asignadoA'
        ];

        if (Object.prototype.hasOwnProperty.call(datos, 'asignadoA')) {
            await validarUsuarioAsignable(datos.asignadoA, 'Sanidad');
        }

        const modificaAlcance = Object.prototype.hasOwnProperty.call(datos, 'animales')
            || Object.prototype.hasOwnProperty.call(datos, 'lote');
        if (modificaAlcance && tratamiento.aplicacionesRealizadas > 0) {
            const idsActuales = normalizarIds(tratamiento.animales).sort().join(',');
            const idsNuevos = normalizarIds(datos.animales || tratamiento.animales).sort().join(',');
            const loteActual = String(tratamiento.lote || '');
            const loteNuevo = String(datos.lote || '');
            if (idsActuales !== idsNuevos || loteActual !== loteNuevo) {
                return res.status(400).json({
                    mensaje: 'No se puede cambiar el lote ni los animales después de registrar aplicaciones'
                });
            }
        } else if (modificaAlcance) {
            const validacion = await resolverAlcanceSanitario({
                animales: datos.animales || tratamiento.animales,
                lote: datos.lote,
                especie: tratamiento.especie
            }, { soloActivos: true });
            datos.animales = validacion.ids;
            datos.lote = validacion.lote?._id || null;
        }

        campos.forEach((campo) => {
            if (Object.prototype.hasOwnProperty.call(datos, campo)) tratamiento[campo] = datos[campo];
        });

        const ultimaAplicacion = tratamiento.aplicacionesRealizadas
            ? await AplicacionSanitaria.findOne({ tratamiento: tratamiento._id }).sort({ fechaAplicacion: -1 })
            : null;

        if (tratamiento.aplicacionesRealizadas >= tratamiento.cantidadAplicaciones) {
            tratamiento.estado = 'Completado';
            tratamiento.fechaFin = ultimaAplicacion?.fechaAplicacion || tratamiento.fechaFin || new Date();
            tratamiento.proximaAplicacion = null;
        } else if (tratamiento.estado === 'Completado') {
            tratamiento.estado = 'Activo';
            tratamiento.fechaFin = null;
            tratamiento.proximaAplicacion = ultimaAplicacion
                ? sumarDias(ultimaAplicacion.fechaAplicacion, tratamiento.intervaloDias)
                : null;
        } else if (ultimaAplicacion) {
            tratamiento.proximaAplicacion = sumarDias(ultimaAplicacion.fechaAplicacion, tratamiento.intervaloDias);
        }

        await tratamiento.save();
        await sincronizarTareaTratamiento(tratamiento, req.usuario?.id);
        await notificarTratamiento(
            req,
            tratamiento,
            'TRATAMIENTO_MODIFICADO',
            'Tratamiento sanitario actualizado',
            `${nombreUsuario(req.usuario)} actualizó el tratamiento con ${tratamiento.producto}.`
        );
        res.json(await poblarTratamiento(TratamientoSanitario.findById(tratamiento._id)));
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al actualizar tratamiento', error: error.message });
    }
};

tratamientoSanitarioCtrl.registrarAplicacionTratamiento = async (req, res) => {
    try {
        const datos = sanitizarAplicacionSanitaria(req.body);
        const claveIdempotencia = String(req.get('Idempotency-Key') || '').trim();
        if (claveIdempotencia.length > 160) {
            return res.status(400).json({ mensaje: 'La clave de idempotencia no es válida' });
        }
        const resultado = await ejecutarEnTransaccion(async (session) => {
            const tratamiento = await TratamientoSanitario.findById(req.params.id).session(session);
            if (!tratamiento) {
                const error = new Error('Tratamiento sanitario no encontrado');
                error.status = 404;
                throw error;
            }

            const registro = await registrarAplicacion(
                tratamiento,
                datos,
                req.usuario?.id,
                session,
                claveIdempotencia
            );
            if (registro.replay) return { tratamiento, ...registro };

            await completarTareasSanitariasPendientes(
                tratamiento._id,
                'Tratamiento sanitario',
                registro.aplicacion.fechaAplicacion,
                { session }
            );
            await sincronizarTareaTratamiento(tratamiento, req.usuario?.id, {
                session,
                omitirNotificacion: true
            });
            if (tratamiento.estado === 'Completado') {
                await actualizarEstadoDesdeTratamiento(
                    tratamiento,
                    datos,
                    req.usuario?.id,
                    'estadoSanitarioFinal',
                    { session, omitirNotificacion: true }
                );
            }
            return { tratamiento, ...registro };
        });
        const { tratamiento, aplicacion, replay } = resultado;
        if (replay) res.set('X-Idempotent-Replay', 'true');
        if (!replay) {
            await notificarTratamiento(
                req,
                tratamiento,
                'APLICACION_SANITARIA_REGISTRADA',
                'Aplicación de tratamiento registrada',
                `${nombreUsuario(req.usuario)} registró la aplicación ${aplicacion.numeroAplicacion} de ${tratamiento.cantidadAplicaciones} del tratamiento con ${tratamiento.producto}.`,
                { aplicacionId: aplicacion._id, numeroAplicacion: aplicacion.numeroAplicacion }
            );
        }
        const actualizado = await poblarTratamiento(TratamientoSanitario.findById(tratamiento._id));
        res.status(replay ? 200 : 201).json({ tratamiento: actualizado, aplicacion });
    } catch (error) {
        const duplicada = error?.code === 11000;
        res.status(error.status || (duplicada ? 409 : 400)).json({
            mensaje: duplicada ? 'Esta aplicación ya fue registrada' : (error.message || 'Error al registrar aplicación'),
            error: error.message
        });
    }
};

tratamientoSanitarioCtrl.completarTratamiento = async (req, res) => {
    try {
        const datos = sanitizarCierreTratamiento(req.body);
        const tratamiento = await ejecutarEnTransaccion(async (session) => {
            const encontrado = await TratamientoSanitario.findById(req.params.id).session(session);
            if (!encontrado) {
                const error = new Error('Tratamiento sanitario no encontrado');
                error.status = 404;
                throw error;
            }
            if (encontrado.estado === 'Cancelado') {
                const error = new Error('Un tratamiento cancelado no puede completarse');
                error.status = 400;
                throw error;
            }

            encontrado.estado = 'Completado';
            encontrado.fechaFin = datos.fechaFin || new Date();
            encontrado.proximaAplicacion = null;
            if (datos.observaciones) {
                encontrado.observaciones = [encontrado.observaciones, datos.observaciones].filter(Boolean).join(' | ');
            }
            await encontrado.save({ session });
            await cancelarTareasSanitariasPendientes(
                encontrado._id,
                'Tratamiento sanitario',
                'Cancelada porque el tratamiento fue completado.',
                { session }
            );
            await actualizarEstadoDesdeTratamiento(
                encontrado,
                datos,
                req.usuario?.id,
                'estadoSanitarioFinal',
                { session, omitirNotificacion: true }
            );
            return encontrado;
        });
        await notificarTratamiento(
            req,
            tratamiento,
            'TRATAMIENTO_COMPLETADO',
            'Tratamiento sanitario completado',
            `${nombreUsuario(req.usuario)} completó el tratamiento con ${tratamiento.producto}.`
        );
        res.json(await poblarTratamiento(TratamientoSanitario.findById(tratamiento._id)));
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al completar tratamiento', error: error.message });
    }
};

tratamientoSanitarioCtrl.cancelarTratamiento = async (req, res) => {
    try {
        const datos = sanitizarCierreTratamiento(req.body);
        const tratamiento = await ejecutarEnTransaccion(async (session) => {
            const encontrado = await TratamientoSanitario.findById(req.params.id).session(session);
            if (!encontrado) {
                const error = new Error('Tratamiento sanitario no encontrado');
                error.status = 404;
                throw error;
            }
            if (encontrado.estado === 'Completado') {
                const error = new Error('Un tratamiento completado no puede cancelarse');
                error.status = 400;
                throw error;
            }

            encontrado.estado = 'Cancelado';
            encontrado.fechaFin = datos.fechaFin || new Date();
            encontrado.proximaAplicacion = null;
            if (datos.motivo) {
                encontrado.observaciones = [encontrado.observaciones, `Cancelado: ${datos.motivo}`].filter(Boolean).join(' | ');
            }
            await encontrado.save({ session });
            await cancelarTareasSanitariasPendientes(
                encontrado._id,
                'Tratamiento sanitario',
                'Cancelada junto con el tratamiento sanitario.',
                { session }
            );
            return encontrado;
        });
        await notificarTratamiento(
            req,
            tratamiento,
            'TRATAMIENTO_CANCELADO',
            'Tratamiento sanitario cancelado',
            `${nombreUsuario(req.usuario)} canceló el tratamiento con ${tratamiento.producto}.`,
            { motivo: datos.motivo }
        );
        res.json(await poblarTratamiento(TratamientoSanitario.findById(tratamiento._id)));
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al cancelar tratamiento', error: error.message });
    }
};

module.exports = tratamientoSanitarioCtrl;
