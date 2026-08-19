const Camada = require('../models/Camada');
const Animal = require('../models/Animal');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const {
    generarCodigoCamada,
    calcularFechasCamada,
    sincronizarTareasCamada,
    cancelarTareasCamada,
    completarTareasDesteteCamada,
    cancelarTareasEstimadasDelRegistro,
    registrarEventoCamada
} = require('../services/camada-service');

const camadaCtrl = {};

const poblarCamada = (query) => query
    .populate('madre', 'diio identificadorFinca nombre sexo especie categoria')
    .populate('registroReproductivo');

const normalizarNumero = (valor, defecto = 0) => {
    if (valor === '' || valor === null || valor === undefined) return defecto;
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : defecto;
};

const validarMadrePorcina = async (madreId) => {
    const madre = await Animal.findById(madreId);

    if (!madre) {
        const error = new Error('Madre no encontrada');
        error.status = 404;
        throw error;
    }

    if (madre.especie !== 'Porcino') {
        const error = new Error('La camada solo puede registrarse para una madre porcina');
        error.status = 400;
        throw error;
    }

    if (madre.sexo !== 'Hembra') {
        const error = new Error('La madre de la camada debe ser Hembra');
        error.status = 400;
        throw error;
    }

    return madre;
};

const prepararDatosCamada = async (body) => {
    const fechaNacimiento = body.fechaNacimiento || body.fechaPartoReal || new Date();
    const fechas = calcularFechasCamada({
        ...body,
        fechaNacimiento
    });
    const criasParaFinca = normalizarNumero(body.criasParaFinca);
    const criasParaVenta = normalizarNumero(body.criasParaVenta);
    const criasParaEngorde = normalizarNumero(body.criasParaEngorde);
    const nacidosVivos = normalizarNumero(body.nacidosVivos);
    const totalDestino = criasParaFinca + criasParaVenta + criasParaEngorde;

    if (nacidosVivos > 0 && totalDestino > nacidosVivos) {
        const error = new Error('La suma de crias por destino no puede superar los nacidos vivos');
        error.status = 400;
        throw error;
    }

    return {
        ...body,
        codigoCamada: body.codigoCamada || await generarCodigoCamada(fechaNacimiento),
        fechaNacimiento,
        fechaDesteteEstimada: body.fechaDesteteEstimada || fechas.fechaDesteteEstimada,
        nacidosTotales: normalizarNumero(body.nacidosTotales),
        nacidosVivos,
        nacidosMuertos: normalizarNumero(body.nacidosMuertos),
        momias: normalizarNumero(body.momias),
        destetados: normalizarNumero(body.destetados),
        muertosPreDestete: normalizarNumero(body.muertosPreDestete),
        criasParaFinca,
        criasParaVenta,
        criasParaEngorde,
        pesoPromedioNacimiento: body.pesoPromedioNacimiento === '' ? null : body.pesoPromedioNacimiento,
        pesoPromedioDestete: body.pesoPromedioDestete === '' ? null : body.pesoPromedioDestete,
        pesoTotalDestete: body.pesoTotalDestete === '' ? null : body.pesoTotalDestete
    };
};

camadaCtrl.getCamadas = async (req, res) => {
    try {
        const filtro = {};
        if (req.query.estado) filtro.estado = req.query.estado;
        if (req.query.destino) filtro.destino = req.query.destino;
        if (req.query.madre) filtro.madre = req.query.madre;

        const camadas = await poblarCamada(
            Camada.find(filtro).sort({ fechaNacimiento: -1, createdAt: -1 })
        );

        res.json(camadas);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener camadas', error: error.message });
    }
};

camadaCtrl.getCamada = async (req, res) => {
    try {
        const camada = await poblarCamada(Camada.findById(req.params.id));

        if (!camada) {
            return res.status(404).json({ mensaje: 'Camada no encontrada' });
        }

        res.json(camada);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener camada', error: error.message });
    }
};

camadaCtrl.getCamadasPorMadre = async (req, res) => {
    try {
        const camadas = await poblarCamada(
            Camada.find({ madre: req.params.madreId }).sort({ fechaNacimiento: -1 })
        );

        res.json(camadas);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener camadas de la madre', error: error.message });
    }
};

camadaCtrl.createCamada = async (req, res) => {
    try {
        const madre = await validarMadrePorcina(req.body.madre);
        const datos = await prepararDatosCamada(req.body);
        const camada = new Camada(datos);
        const camadaGuardada = await camada.save();

        if (camadaGuardada.registroReproductivo) {
            await RegistroReproductivo.findByIdAndUpdate(camadaGuardada.registroReproductivo, {
                fechaPartoReal: camadaGuardada.fechaNacimiento,
                fechaDestete: camadaGuardada.fechaDesteteEstimada
            });
            await cancelarTareasEstimadasDelRegistro(camadaGuardada.registroReproductivo);
        }

        await registrarEventoCamada({ camada: camadaGuardada, madre, usuarioId: req.usuario?.id });
        await sincronizarTareasCamada({ camada: camadaGuardada, madre, usuarioId: req.usuario?.id });

        const camadaRespuesta = await poblarCamada(Camada.findById(camadaGuardada._id));
        res.status(201).json(camadaRespuesta);
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al crear camada', error: error.message });
    }
};

camadaCtrl.updateCamada = async (req, res) => {
    try {
        const actual = await Camada.findById(req.params.id);
        if (!actual) {
            return res.status(404).json({ mensaje: 'Camada no encontrada' });
        }

        const madre = req.body.madre ? await validarMadrePorcina(req.body.madre) : await Animal.findById(actual.madre);
        const datos = await prepararDatosCamada({
            ...actual.toObject(),
            ...req.body,
            codigoCamada: req.body.codigoCamada || actual.codigoCamada
        });

        delete datos._id;
        delete datos.__v;
        delete datos.createdAt;
        delete datos.updatedAt;

        const camada = await Camada.findByIdAndUpdate(req.params.id, datos, {
            new: true,
            runValidators: true
        });

        if (camada.estado === 'Activa') {
            await sincronizarTareasCamada({ camada, madre, usuarioId: req.usuario?.id });
        } else {
            await cancelarTareasCamada(camada._id);
        }

        res.json(await poblarCamada(Camada.findById(camada._id)));
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al actualizar camada', error: error.message });
    }
};

camadaCtrl.registrarDestete = async (req, res) => {
    try {
        const camada = await Camada.findById(req.params.id);
        if (!camada) {
            return res.status(404).json({ mensaje: 'Camada no encontrada' });
        }

        camada.fechaDesteteReal = req.body.fechaDesteteReal || new Date();
        camada.destetados = normalizarNumero(req.body.destetados, camada.destetados);
        camada.muertosPreDestete = normalizarNumero(req.body.muertosPreDestete, camada.muertosPreDestete);
        camada.pesoPromedioDestete = req.body.pesoPromedioDestete === '' ? camada.pesoPromedioDestete : req.body.pesoPromedioDestete;
        camada.pesoTotalDestete = req.body.pesoTotalDestete === '' ? camada.pesoTotalDestete : req.body.pesoTotalDestete;
        camada.estado = 'Destetada';

        const guardada = await camada.save();
        const madre = await Animal.findById(guardada.madre);
        await completarTareasDesteteCamada(guardada._id, guardada.fechaDesteteReal);
        await sincronizarTareasCamada({ camada: guardada, madre, usuarioId: req.usuario?.id });

        res.json(await poblarCamada(Camada.findById(guardada._id)));
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al registrar destete', error: error.message });
    }
};

camadaCtrl.cerrarCamada = async (req, res) => {
    try {
        const camada = await Camada.findByIdAndUpdate(
            req.params.id,
            { estado: 'Cerrada', observaciones: req.body.observaciones },
            { new: true, runValidators: true }
        );

        if (!camada) {
            return res.status(404).json({ mensaje: 'Camada no encontrada' });
        }

        await cancelarTareasCamada(camada._id, 'Camada cerrada.');
        res.json(await poblarCamada(Camada.findById(camada._id)));
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al cerrar camada', error: error.message });
    }
};

camadaCtrl.cancelarCamada = async (req, res) => {
    try {
        const camada = await Camada.findByIdAndUpdate(
            req.params.id,
            { estado: 'Cancelada', observaciones: req.body.observaciones },
            { new: true, runValidators: true }
        );

        if (!camada) {
            return res.status(404).json({ mensaje: 'Camada no encontrada' });
        }

        await cancelarTareasCamada(camada._id, 'Camada cancelada.');
        res.json(await poblarCamada(Camada.findById(camada._id)));
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al cancelar camada', error: error.message });
    }
};

camadaCtrl.deleteCamada = async (req, res) => {
    try {
        const camada = await Camada.findByIdAndDelete(req.params.id);

        if (!camada) {
            return res.status(404).json({ mensaje: 'Camada no encontrada' });
        }

        await cancelarTareasCamada(camada._id, 'Camada eliminada.');
        res.json({ mensaje: 'Camada eliminada' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar camada', error: error.message });
    }
};

module.exports = camadaCtrl;
