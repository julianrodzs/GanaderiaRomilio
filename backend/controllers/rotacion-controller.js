const rotacionCtrl = {};

const RotacionPotrero = require('../models/RotacionPotrero');

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
        const nuevaRotacion = new RotacionPotrero(datosRotacion);
        const rotacionGuardada = await nuevaRotacion.save();
        const rotacion = await RotacionPotrero.findById(rotacionGuardada._id).populate('potrero');

        res.status(201).json(rotacion);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear rotacion', error: error.message });
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

        const rotacion = await RotacionPotrero.findByIdAndUpdate(req.params.id, datosRotacion, {
            new: true,
            runValidators: true
        }).populate('potrero');

        res.json(rotacion);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar rotacion', error: error.message });
    }
};

rotacionCtrl.deleteRotacion = async (req, res) => {
    try {
        const rotacion = await RotacionPotrero.findByIdAndDelete(req.params.id);

        if (!rotacion) {
            return res.status(404).json({ mensaje: 'Rotacion no encontrada' });
        }

        res.json({ mensaje: 'Rotacion eliminada' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar rotacion', error: error.message });
    }
};

module.exports = rotacionCtrl;
