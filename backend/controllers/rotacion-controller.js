const rotacionCtrl = {};

const RotacionPotrero = require('../models/RotacionPotrero');
const Potrero = require('../models/Potrero');
const {
    crearErrorIntegridad,
    sanitizarRotacion,
    validarDestinoPastoreo,
    validarPeriodoRotacion
} = require('../services/potrero-integridad-service');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');

const MILISEGUNDOS_DIA = 1000 * 60 * 60 * 24;

const calcularDiasEntreFechas = (fechaInicio, fechaFin) => {
    if (!fechaInicio || !fechaFin) return null;

    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null;

    return Math.round((fin - inicio) / MILISEGUNDOS_DIA);
};

const prepararDatosRotacion = async (datos, rotacionId = null, session = null) => {
    const datosPreparados = { ...datos };
    datosPreparados.diasOcupado = calcularDiasEntreFechas(datosPreparados.fechaEntrada, datosPreparados.fechaSalida);
    datosPreparados.diasDescansoPrevio = null;

    if (datosPreparados.potrero && datosPreparados.fechaEntrada) {
        const filtro = {
            potrero: datosPreparados.potrero,
            fechaSalida: { $lte: datosPreparados.fechaEntrada }
        };

        if (rotacionId) {
            filtro._id = { $ne: rotacionId };
        }

        const rotacionAnterior = await RotacionPotrero.findOne(filtro).sort({ fechaSalida: -1 }).session(session);

        if (rotacionAnterior?.fechaSalida) {
            datosPreparados.diasDescansoPrevio = calcularDiasEntreFechas(rotacionAnterior.fechaSalida, datosPreparados.fechaEntrada);
        }
    }

    return datosPreparados;
};

const validarRotacionActivaUnica = async ({ potrero, estado }, rotacionId = null, session = null) => {
    if (estado !== 'Activa' || !potrero) return;

    const filtro = {
        potrero,
        estado: 'Activa'
    };

    if (rotacionId) {
        filtro._id = { $ne: rotacionId };
    }

    const rotacionActiva = await RotacionPotrero.findOne(filtro).select('_id').session(session);

    if (rotacionActiva) {
        const error = new Error('Este potrero ya tiene una rotacion activa');
        error.statusCode = 409;
        throw error;
    }
};

const validarPotreroDestino = async (potreroId, session = null) => {
    const potrero = await Potrero.findById(potreroId).session(session);
    return validarDestinoPastoreo(potrero);
};

const actualizarEstadoPotrero = async (potreroId, estado, session = null) => {
    if (!potreroId) return;

    const potrero = await Potrero.findById(potreroId).session(session);

    if (!potrero || potrero.estado === 'Mantenimiento') return;
    if (potrero.estado === estado) return;

    potrero.estado = estado;
    await potrero.save(session ? { session } : {});
};

const sincronizarPotreroPorRotacion = async ({ potreroId, estadoRotacion, session = null }) => {
    if (estadoRotacion === 'Activa') {
        await actualizarEstadoPotrero(potreroId, 'Ocupado', session);
        return;
    }

    if (estadoRotacion === 'Finalizada') {
        await actualizarEstadoPotrero(potreroId, 'Descanso', session);
    }
};

const sincronizarPotreroAnterior = async (potreroId, session = null) => {
    if (!potreroId) return;

    const activa = await RotacionPotrero.findOne({
        potrero: potreroId,
        estado: 'Activa'
    }).select('_id').session(session);

    if (activa) {
        await actualizarEstadoPotrero(potreroId, 'Ocupado', session);
        return;
    }

    await actualizarEstadoPotrero(potreroId, 'Descanso', session);
};

const obtenerPotreroId = (rotacion) => {
    if (!rotacion.potrero) return '';
    return String(rotacion.potrero._id || rotacion.potrero);
};

const enriquecerRotacionesParaRespuesta = (rotaciones) => {
    const rotacionesPorPotrero = rotaciones.reduce((acumulado, rotacion) => {
        const potreroId = obtenerPotreroId(rotacion);
        if (!acumulado[potreroId]) {
            acumulado[potreroId] = [];
        }
        acumulado[potreroId].push(rotacion);
        return acumulado;
    }, {});

    Object.values(rotacionesPorPotrero).forEach((grupo) => {
        grupo.sort((a, b) => new Date(a.fechaEntrada) - new Date(b.fechaEntrada));

        let ultimaSalida = null;
        grupo.forEach((rotacion) => {
            rotacion.diasOcupado = rotacion.diasOcupado ?? calcularDiasEntreFechas(rotacion.fechaEntrada, rotacion.fechaSalida);
            rotacion.diasDescansoPrevio = rotacion.diasDescansoPrevio ?? calcularDiasEntreFechas(ultimaSalida, rotacion.fechaEntrada);

            if (rotacion.fechaSalida) {
                ultimaSalida = rotacion.fechaSalida;
            }
        });
    });

    return rotaciones.sort((a, b) => new Date(b.fechaEntrada) - new Date(a.fechaEntrada));
};

rotacionCtrl.getRotaciones = async (req, res) => {
    try {
        const rotaciones = await RotacionPotrero.find().populate('potrero').lean();
        res.json(enriquecerRotacionesParaRespuesta(rotaciones));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener rotaciones', error: error.message });
    }
};

rotacionCtrl.createRotacion = async (req, res) => {
    try {
        const entrada = sanitizarRotacion(req.body, { aplicarDefaults: true });
        if (entrada.loteRef) {
            throw crearErrorIntegridad('Las rotaciones asociadas a lotes se crean desde el modulo de Lotes.', 409, 'ROTACION_LOTE_REQUIERE_FLUJO');
        }
        let rotacionId;
        await ejecutarEnTransaccion(async (session) => {
            validarPeriodoRotacion(entrada);
            await validarPotreroDestino(entrada.potrero, session);
            const datosRotacion = await prepararDatosRotacion(entrada, null, session);
            await validarRotacionActivaUnica(datosRotacion, null, session);
            const nuevaRotacion = new RotacionPotrero(datosRotacion);
            const rotacionGuardada = await nuevaRotacion.save({ session });
            await sincronizarPotreroPorRotacion({
                potreroId: rotacionGuardada.potrero,
                estadoRotacion: rotacionGuardada.estado,
                session
            });
            rotacionId = rotacionGuardada._id;
        });
        const rotacion = await RotacionPotrero.findById(rotacionId).populate('potrero');

        res.status(201).json(rotacion);
    } catch (error) {
        const conflicto = error?.code === 11000;
        res.status(conflicto ? 409 : (error.statusCode || error.status || 400)).json({
            mensaje: conflicto ? 'Este potrero ya tiene una rotacion activa' : error.message,
            codigo: conflicto ? 'POTRERO_YA_OCUPADO' : error.codigo
        });
    }
};

rotacionCtrl.getRotacion = async (req, res) => {
    try {
        const rotacion = await RotacionPotrero.findById(req.params.id).populate('potrero');

        if (!rotacion) {
            return res.status(404).json({ mensaje: 'Rotacion no encontrada' });
        }

        const rotacionConPotrero = await RotacionPotrero.findById(rotacion._id).populate('potrero');

        res.json(rotacionConPotrero);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener rotacion', error: error.message });
    }
};

rotacionCtrl.updateRotacion = async (req, res) => {
    try {
        const cambios = sanitizarRotacion(req.body);
        let rotacionActualizadaId;
        await ejecutarEnTransaccion(async (session) => {
        const rotacionExistente = await RotacionPotrero.findById(req.params.id).session(session);

        if (!rotacionExistente) {
            throw crearErrorIntegridad('Rotacion no encontrada', 404, 'ROTACION_NO_ENCONTRADA');
        }
        if (rotacionExistente.loteRef) {
            throw crearErrorIntegridad('Las rotaciones de lotes se administran desde el movimiento del lote.', 409, 'ROTACION_LOTE_REQUIERE_FLUJO');
        }

        const datosRotacion = await prepararDatosRotacion({
            ...rotacionExistente.toObject(),
            ...cambios
        }, req.params.id, session);

        delete datosRotacion._id;
        delete datosRotacion.__v;
        delete datosRotacion.createdAt;
        delete datosRotacion.updatedAt;

        validarPeriodoRotacion(datosRotacion);
        await validarPotreroDestino(datosRotacion.potrero, session);
        await validarRotacionActivaUnica(datosRotacion, req.params.id, session);

        const rotacion = await RotacionPotrero.findByIdAndUpdate(req.params.id, datosRotacion, {
            new: true,
            runValidators: true,
            session
        });

        const potreroAnteriorId = obtenerPotreroId(rotacionExistente);
        const potreroActualId = obtenerPotreroId(rotacion);

        const estadoAnterior = rotacionExistente.estado;
        const estadoActual = rotacion.estado;
        const cambioPotrero = potreroAnteriorId && potreroAnteriorId !== potreroActualId;

        if (cambioPotrero && estadoAnterior === 'Activa') {
            await sincronizarPotreroAnterior(potreroAnteriorId, session);
        }

        if (estadoActual === 'Activa') {
            await sincronizarPotreroPorRotacion({
                potreroId: potreroActualId,
                estadoRotacion: 'Activa',
                session
            });
        } else if (estadoAnterior === 'Activa' && estadoActual === 'Finalizada') {
            await sincronizarPotreroPorRotacion({
                potreroId: potreroActualId,
                estadoRotacion: 'Finalizada',
                session
            });
        } else if (estadoAnterior === 'Activa' && estadoActual !== 'Activa') {
            await sincronizarPotreroAnterior(potreroActualId, session);
        }

        rotacionActualizadaId = rotacion._id;
        });
        const rotacionActualizada = await RotacionPotrero.findById(rotacionActualizadaId).populate('potrero');
        res.json(rotacionActualizada);
    } catch (error) {
        const conflicto = error?.code === 11000;
        res.status(conflicto ? 409 : (error.statusCode || error.status || 400)).json({
            mensaje: conflicto ? 'Este potrero ya tiene una rotacion activa' : error.message,
            codigo: conflicto ? 'POTRERO_YA_OCUPADO' : error.codigo
        });
    }
};

rotacionCtrl.deleteRotacion = async (req, res) => {
    try {
        const existente = await RotacionPotrero.findById(req.params.id);
        if (!existente) return res.status(404).json({ mensaje: 'Rotacion no encontrada' });
        if (existente.loteRef) {
            return res.status(409).json({
                mensaje: 'La rotacion pertenece a un lote y debe conservarse como historial.',
                codigo: 'ROTACION_LOTE_PROTEGIDA'
            });
        }
        const rotacion = await RotacionPotrero.findByIdAndDelete(req.params.id);

        if (!rotacion) {
            return res.status(404).json({ mensaje: 'Rotacion no encontrada' });
        }

        if (rotacion.estado === 'Activa') {
            await sincronizarPotreroAnterior(rotacion.potrero);
        }

        res.json({ mensaje: 'Rotacion eliminada' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar rotacion', error: error.message });
    }
};

module.exports = rotacionCtrl;
