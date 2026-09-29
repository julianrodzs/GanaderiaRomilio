const ConteoDrone = require('../models/ConteoDrone');
const { urlArchivoOrganizacion } = require('../middleware/uploadOrganizacion');
const Potrero = require('../models/Potrero');
const { procesarImagenConteo } = require('../services/iaConteoService');
const { randomUUID } = require('crypto');
const {
    incrementarUsoDrone,
    liberarReservaDrone,
    reservarUsoDrone
} = require('../services/plan-service');
const { respuestaErrorPlan } = require('../middleware/plan');

const conteoDroneCtrl = {};

conteoDroneCtrl.getConteos = async (req, res) => {
    try {
        const conteos = await ConteoDrone.find()
            .populate('potrero')
            .sort({ fechaVuelo: -1 });

        res.json(conteos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener conteos por drone', error: error.message });
    }
};

conteoDroneCtrl.procesarConteo = async (req, res) => {
    let reservaActiva = false;
    try {
        const { potrero, cantidadEsperada, observaciones } = req.body;

        if (!req.file) {
            return res.status(400).json({ mensaje: 'Debes subir una imagen en el campo imagen' });
        }

        if (!potrero) {
            return res.status(400).json({ mensaje: 'El potrero es requerido' });
        }

        const potreroEncontrado = await Potrero.findById(potrero);

        if (!potreroEncontrado) {
            return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        }

        const cantidadEsperadaNumero = Number(cantidadEsperada);

        if (!Number.isFinite(cantidadEsperadaNumero)) {
            return res.status(400).json({ mensaje: 'cantidadEsperada debe ser un numero valido' });
        }

        const claveOperacion = String(
            req.get('Idempotency-Key') || req.body.claveOperacion || randomUUID()
        ).trim();
        const conteoExistente = await ConteoDrone.findOne({ claveOperacion }).populate('potrero');
        if (conteoExistente) {
            await incrementarUsoDrone({ conteoId: conteoExistente._id });
            return res.status(200).json(conteoExistente);
        }

        await reservarUsoDrone({ organizacionId: req.organizacionId });
        reservaActiva = true;

        const imagenOriginalUrl = urlArchivoOrganizacion('conteo-drone', req.file);
        const resultadoIA = await procesarImagenConteo({
            imagenPath: req.file.path,
            imagenUrl: imagenOriginalUrl
        });
        const diferencia = resultadoIA.cantidadDetectada - cantidadEsperadaNumero;

        const nuevoConteo = new ConteoDrone({
            potrero,
            imagenOriginalUrl,
            imagenProcesadaUrl: resultadoIA.imagenProcesadaUrl,
            cantidadDetectada: resultadoIA.cantidadDetectada,
            cantidadEsperada: cantidadEsperadaNumero,
            diferencia,
            confianzaPromedio: resultadoIA.confianzaPromedio,
            detecciones: resultadoIA.detecciones,
            claveOperacion,
            estado: diferencia === 0 ? 'Correcto' : 'Revisar',
            observaciones
        });

        const conteoGuardado = await nuevoConteo.save();
        await incrementarUsoDrone({ conteoId: conteoGuardado._id, liberarReserva: true });
        reservaActiva = false;
        const conteoConPotrero = await ConteoDrone.findById(conteoGuardado._id).populate('potrero');

        res.status(201).json(conteoConPotrero);
    } catch (error) {
        if (reservaActiva) await liberarReservaDrone().catch(() => null);
        if (error?.code === 11000) {
            const claveOperacion = String(req.get('Idempotency-Key') || req.body.claveOperacion || '').trim();
            const existente = claveOperacion
                ? await ConteoDrone.findOne({ claveOperacion }).populate('potrero')
                : null;
            if (existente) return res.status(200).json(existente);
        }
        if (respuestaErrorPlan(error, res)) return;
        res.status(400).json({ mensaje: error.message || 'Error al procesar conteo por drone', error: error.message });
    }
};

conteoDroneCtrl.getConteo = async (req, res) => {
    try {
        const conteo = await ConteoDrone.findById(req.params.id).populate('potrero');

        if (!conteo) {
            return res.status(404).json({ mensaje: 'Conteo por drone no encontrado' });
        }

        res.json(conteo);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener conteo por drone', error: error.message });
    }
};

conteoDroneCtrl.deleteConteo = async (req, res) => {
    try {
        const conteo = await ConteoDrone.findByIdAndDelete(req.params.id);

        if (!conteo) {
            return res.status(404).json({ mensaje: 'Conteo por drone no encontrado' });
        }

        res.json({ mensaje: 'Conteo por drone eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar conteo por drone', error: error.message });
    }
};

module.exports = conteoDroneCtrl;
