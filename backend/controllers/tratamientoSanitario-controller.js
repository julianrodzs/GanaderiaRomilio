const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const { TratamientoSanitario } = require('../models/TratamientoSanitario');
const {
    crearAplicacionSanitaria,
    eliminarAplicacionSanitariaCreada,
    normalizarIds,
    validarAnimalesSanidad
} = require('../services/aplicacionSanitaria-service');
const { actualizarEstadoSanitarioAnimales } = require('../services/estadoSanitario-service');
const {
    cancelarTareasSanitariasPendientes,
    completarTareasSanitariasPendientes,
    sincronizarTareaTratamiento
} = require('../services/sanidad-tarea-service');
const { nombreUsuario, notificarAccionSegura } = require('../services/notificacion-service');
const { validarUsuarioAsignable } = require('../services/usuarioAsignable-service');

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
    .populate('registradoPor', 'nombre apellido correo')
    .populate('asignadoA', 'nombre apellido correo rol estado');

const actualizarEstadoDesdeTratamiento = async (tratamiento, datos, usuarioId, campo = 'estadoSanitario') => {
    const estadoNuevo = datos[campo];
    if (!estadoNuevo || estadoNuevo === 'No modificar') return [];

    return actualizarEstadoSanitarioAnimales(
        tratamiento.animales,
        estadoNuevo,
        datos.motivoCambioEstadoSanitario || `Actualización asociada al tratamiento con ${tratamiento.producto}.`,
        usuarioId,
        tratamiento._id
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

const registrarAplicacion = async (tratamiento, datos, usuarioId) => {
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

    const fechaAplicacion = datos.fechaAplicacion || new Date();
    const numeroAplicacion = tratamiento.aplicacionesRealizadas + 1;
    const aplicacion = await crearAplicacionSanitaria({
        animales: tratamiento.animales,
        especie: tratamiento.especie,
        fechaAplicacion,
        producto: tratamiento.producto,
        tipo: 'Tratamiento veterinario',
        dosis: datos.dosis || tratamiento.dosis,
        viaAplicacion: datos.viaAplicacion || tratamiento.viaAplicacion,
        responsable: datos.responsable || tratamiento.responsable,
        motivo: tratamiento.motivo,
        observaciones: datos.observaciones,
        naturaleza: 'Tratamiento',
        tratamiento: tratamiento._id,
        numeroAplicacion,
        totalAplicaciones: tratamiento.cantidadAplicaciones
    }, usuarioId, { soloActivos: true });

    try {
        tratamiento.aplicacionesRealizadas = numeroAplicacion;
        if (numeroAplicacion >= tratamiento.cantidadAplicaciones) {
            tratamiento.estado = 'Completado';
            tratamiento.fechaFin = fechaAplicacion;
            tratamiento.proximaAplicacion = null;
        } else {
            tratamiento.proximaAplicacion = sumarDias(fechaAplicacion, tratamiento.intervaloDias);
        }
        await tratamiento.save();
    } catch (error) {
        await eliminarAplicacionSanitariaCreada(aplicacion._id);
        throw error;
    }

    return aplicacion;
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
    let tratamiento;

    try {
        await validarUsuarioAsignable(req.body.asignadoA, 'Sanidad');
        const validacion = await validarAnimalesSanidad(req.body.animales, req.body.especie, { soloActivos: true });
        tratamiento = new TratamientoSanitario({
            ...req.body,
            animales: validacion.ids,
            especie: validacion.especie,
            aplicacionesRealizadas: 0,
            proximaAplicacion: null,
            fechaFin: null,
            estado: 'Activo',
            registradoPor: req.usuario?.id
        });
        await tratamiento.save();

        let aplicacion = null;
        if (req.body.registrarPrimeraAplicacion === true) {
            aplicacion = await registrarAplicacion(tratamiento, {
                fechaAplicacion: req.body.fechaPrimeraAplicacion || req.body.fechaInicio,
                dosis: req.body.dosis,
                viaAplicacion: req.body.viaAplicacion,
                responsable: req.body.responsable,
                observaciones: req.body.observacionesPrimeraAplicacion
            }, req.usuario?.id);
        }

        if (req.body.actualizarEstadoSanitario === true) {
            await actualizarEstadoDesdeTratamiento(tratamiento, {
                estadoSanitario: req.body.estadoSanitario || 'Enfermo',
                motivoCambioEstadoSanitario: req.body.motivoCambioEstadoSanitario || req.body.motivo
            }, req.usuario?.id);
        }

        await sincronizarTareaTratamiento(tratamiento, req.usuario?.id);
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
        if (tratamiento?._id) {
            const aplicaciones = await AplicacionSanitaria.find({ tratamiento: tratamiento._id }).select('_id');
            await Promise.all(aplicaciones.map((aplicacion) => eliminarAplicacionSanitariaCreada(aplicacion._id)));
            await TratamientoSanitario.findByIdAndDelete(tratamiento._id);
        }
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al crear tratamiento', error: error.message });
    }
};

tratamientoSanitarioCtrl.updateTratamiento = async (req, res) => {
    try {
        const tratamiento = await TratamientoSanitario.findById(req.params.id);
        if (!tratamiento) return res.status(404).json({ mensaje: 'Tratamiento sanitario no encontrado' });
        if (tratamiento.estado === 'Cancelado') {
            return res.status(400).json({ mensaje: 'No se puede editar un tratamiento cancelado' });
        }

        const campos = [
            'animales', 'motivo', 'diagnostico', 'producto', 'dosis', 'viaAplicacion',
            'fechaInicio', 'cantidadAplicaciones', 'intervaloDias', 'responsable',
            'veterinario', 'observaciones', 'asignadoA'
        ];

        if (Object.prototype.hasOwnProperty.call(req.body, 'asignadoA')) {
            await validarUsuarioAsignable(req.body.asignadoA, 'Sanidad');
        }

        if (req.body.animales) {
            const idsActuales = normalizarIds(tratamiento.animales).sort().join(',');
            const idsNuevos = normalizarIds(req.body.animales).sort().join(',');
            if (tratamiento.aplicacionesRealizadas > 0 && idsActuales !== idsNuevos) {
                return res.status(400).json({
                    mensaje: 'No se pueden cambiar los animales después de registrar aplicaciones'
                });
            }
            const validacion = await validarAnimalesSanidad(req.body.animales, tratamiento.especie, { soloActivos: true });
            req.body.animales = validacion.ids;
        }

        campos.forEach((campo) => {
            if (Object.prototype.hasOwnProperty.call(req.body, campo)) tratamiento[campo] = req.body[campo];
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
        const tratamiento = await TratamientoSanitario.findById(req.params.id);
        if (!tratamiento) return res.status(404).json({ mensaje: 'Tratamiento sanitario no encontrado' });

        const aplicacion = await registrarAplicacion(tratamiento, req.body, req.usuario?.id);
        await completarTareasSanitariasPendientes(tratamiento._id, 'Tratamiento sanitario', aplicacion.fechaAplicacion);
        await sincronizarTareaTratamiento(tratamiento, req.usuario?.id);
        if (tratamiento.estado === 'Completado') {
            await actualizarEstadoDesdeTratamiento(
                tratamiento,
                req.body,
                req.usuario?.id,
                'estadoSanitarioFinal'
            );
        }
        await notificarTratamiento(
            req,
            tratamiento,
            'APLICACION_SANITARIA_REGISTRADA',
            'Aplicación de tratamiento registrada',
            `${nombreUsuario(req.usuario)} registró la aplicación ${aplicacion.numeroAplicacion} de ${tratamiento.cantidadAplicaciones} del tratamiento con ${tratamiento.producto}.`,
            { aplicacionId: aplicacion._id, numeroAplicacion: aplicacion.numeroAplicacion }
        );
        const actualizado = await poblarTratamiento(TratamientoSanitario.findById(tratamiento._id));
        res.status(201).json({ tratamiento: actualizado, aplicacion });
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
        const tratamiento = await TratamientoSanitario.findById(req.params.id);
        if (!tratamiento) return res.status(404).json({ mensaje: 'Tratamiento sanitario no encontrado' });
        if (tratamiento.estado === 'Cancelado') {
            return res.status(400).json({ mensaje: 'Un tratamiento cancelado no puede completarse' });
        }

        tratamiento.estado = 'Completado';
        tratamiento.fechaFin = req.body.fechaFin || new Date();
        tratamiento.proximaAplicacion = null;
        if (req.body.observaciones) {
            tratamiento.observaciones = [tratamiento.observaciones, req.body.observaciones].filter(Boolean).join(' | ');
        }
        await tratamiento.save();
        await cancelarTareasSanitariasPendientes(
            tratamiento._id,
            'Tratamiento sanitario',
            'Cancelada porque el tratamiento fue completado.'
        );
        await actualizarEstadoDesdeTratamiento(
            tratamiento,
            req.body,
            req.usuario?.id,
            'estadoSanitarioFinal'
        );
        await notificarTratamiento(
            req,
            tratamiento,
            'TRATAMIENTO_COMPLETADO',
            'Tratamiento sanitario completado',
            `${nombreUsuario(req.usuario)} completó el tratamiento con ${tratamiento.producto}.`
        );
        res.json(await poblarTratamiento(TratamientoSanitario.findById(tratamiento._id)));
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al completar tratamiento', error: error.message });
    }
};

tratamientoSanitarioCtrl.cancelarTratamiento = async (req, res) => {
    try {
        const tratamiento = await TratamientoSanitario.findById(req.params.id);
        if (!tratamiento) return res.status(404).json({ mensaje: 'Tratamiento sanitario no encontrado' });
        if (tratamiento.estado === 'Completado') {
            return res.status(400).json({ mensaje: 'Un tratamiento completado no puede cancelarse' });
        }

        tratamiento.estado = 'Cancelado';
        tratamiento.fechaFin = req.body.fechaFin || new Date();
        tratamiento.proximaAplicacion = null;
        if (req.body.motivo) {
            tratamiento.observaciones = [tratamiento.observaciones, `Cancelado: ${req.body.motivo}`].filter(Boolean).join(' | ');
        }
        await tratamiento.save();
        await cancelarTareasSanitariasPendientes(
            tratamiento._id,
            'Tratamiento sanitario',
            'Cancelada junto con el tratamiento sanitario.'
        );
        await notificarTratamiento(
            req,
            tratamiento,
            'TRATAMIENTO_CANCELADO',
            'Tratamiento sanitario cancelado',
            `${nombreUsuario(req.usuario)} canceló el tratamiento con ${tratamiento.producto}.`,
            { motivo: req.body.motivo }
        );
        res.json(await poblarTratamiento(TratamientoSanitario.findById(tratamiento._id)));
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al cancelar tratamiento', error: error.message });
    }
};

module.exports = tratamientoSanitarioCtrl;
