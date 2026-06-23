const rotacionCtrl = {};

const RotacionPotrero = require('../models/RotacionPotrero');
const Potrero = require('../models/Potrero');

const MILISEGUNDOS_DIA = 1000 * 60 * 60 * 24;

const calcularDiasEntreFechas = (fechaInicio, fechaFin) => {
    if (!fechaInicio || !fechaFin) return null;

    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null;

    return Math.max(Math.round((fin - inicio) / MILISEGUNDOS_DIA), 0);
};

const prepararDatosRotacion = async (datos, rotacionId = null) => {
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

        const rotacionAnterior = await RotacionPotrero.findOne(filtro).sort({ fechaSalida: -1 });

        if (rotacionAnterior?.fechaSalida) {
            datosPreparados.diasDescansoPrevio = calcularDiasEntreFechas(rotacionAnterior.fechaSalida, datosPreparados.fechaEntrada);
        }
    }

    return datosPreparados;
};

const validarRotacionActivaUnica = async ({ potrero, estado }, rotacionId = null) => {
    if (estado !== 'Activa' || !potrero) return;

    const filtro = {
        potrero,
        estado: 'Activa'
    };

    if (rotacionId) {
        filtro._id = { $ne: rotacionId };
    }

    const rotacionActiva = await RotacionPotrero.findOne(filtro).select('_id');

    if (rotacionActiva) {
        const error = new Error('Este potrero ya tiene una rotacion activa');
        error.statusCode = 409;
        throw error;
    }
};

const actualizarEstadoPotrero = async (potreroId, estado) => {
    if (!potreroId) return;

    const potrero = await Potrero.findById(potreroId);

    if (!potrero || potrero.estado === 'Mantenimiento') return;
    if (potrero.estado === estado) return;

    potrero.estado = estado;
    await potrero.save();
};

const sincronizarPotreroPorRotacion = async ({ potreroId, estadoRotacion }) => {
    if (estadoRotacion === 'Activa') {
        await actualizarEstadoPotrero(potreroId, 'Ocupado');
        return;
    }

    if (estadoRotacion === 'Finalizada') {
        await actualizarEstadoPotrero(potreroId, 'Descanso');
    }
};

const sincronizarPotreroAnterior = async (potreroId) => {
    if (!potreroId) return;

    const activa = await RotacionPotrero.findOne({
        potrero: potreroId,
        estado: 'Activa'
    }).select('_id');

    if (activa) {
        await actualizarEstadoPotrero(potreroId, 'Ocupado');
        return;
    }

    await actualizarEstadoPotrero(potreroId, 'Descanso');
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
        const datosRotacion = await prepararDatosRotacion(req.body);
        await validarRotacionActivaUnica(datosRotacion);
        const nuevaRotacion = new RotacionPotrero(datosRotacion);
        const rotacionGuardada = await nuevaRotacion.save();
        await sincronizarPotreroPorRotacion({
            potreroId: rotacionGuardada.potrero,
            estadoRotacion: rotacionGuardada.estado
        });
        const rotacion = await RotacionPotrero.findById(rotacionGuardada._id).populate('potrero');

        res.status(201).json(rotacion);
    } catch (error) {
        res.status(error.statusCode || 400).json({ mensaje: 'Error al crear rotacion', error: error.message });
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
        const rotacionExistente = await RotacionPotrero.findById(req.params.id);

        if (!rotacionExistente) {
            return res.status(404).json({ mensaje: 'Rotacion no encontrada' });
        }

        const datosRotacion = await prepararDatosRotacion({
            ...rotacionExistente.toObject(),
            ...req.body
        }, req.params.id);

        delete datosRotacion._id;
        delete datosRotacion.__v;
        delete datosRotacion.createdAt;
        delete datosRotacion.updatedAt;

        await validarRotacionActivaUnica(datosRotacion, req.params.id);

        const rotacion = await RotacionPotrero.findByIdAndUpdate(req.params.id, datosRotacion, {
            new: true,
            runValidators: true
        }).populate('potrero');

        const potreroAnteriorId = obtenerPotreroId(rotacionExistente);
        const potreroActualId = obtenerPotreroId(rotacion);

        const estadoAnterior = rotacionExistente.estado;
        const estadoActual = rotacion.estado;
        const cambioPotrero = potreroAnteriorId && potreroAnteriorId !== potreroActualId;

        if (cambioPotrero && estadoAnterior === 'Activa') {
            await sincronizarPotreroAnterior(potreroAnteriorId);
        }

        if (estadoActual === 'Activa') {
            await sincronizarPotreroPorRotacion({
                potreroId: potreroActualId,
                estadoRotacion: 'Activa'
            });
        } else if (estadoAnterior === 'Activa' && estadoActual === 'Finalizada') {
            await sincronizarPotreroPorRotacion({
                potreroId: potreroActualId,
                estadoRotacion: 'Finalizada'
            });
        } else if (estadoAnterior === 'Activa' && estadoActual !== 'Activa') {
            await sincronizarPotreroAnterior(potreroActualId);
        }

        res.json(rotacion);
    } catch (error) {
        res.status(error.statusCode || 400).json({ mensaje: 'Error al actualizar rotacion', error: error.message });
    }
};

rotacionCtrl.deleteRotacion = async (req, res) => {
    try {
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
