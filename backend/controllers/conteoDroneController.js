const ConteoDrone = require('../models/ConteoDrone');
const Potrero = require('../models/Potrero');
const { procesarImagenConteo } = require('../services/iaConteoService');

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

        const imagenOriginalUrl = `/uploads/conteo-drone/${req.file.filename}`;
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
            estado: diferencia === 0 ? 'Correcto' : 'Revisar',
            observaciones
        });

        const conteoGuardado = await nuevoConteo.save();
        const conteoConPotrero = await ConteoDrone.findById(conteoGuardado._id).populate('potrero');

        res.status(201).json(conteoConPotrero);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al procesar conteo por drone', error: error.message });
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
