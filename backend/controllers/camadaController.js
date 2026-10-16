const Camada = require('../models/Camada');
const Animal = require('../models/Animal');
const VentaAnimal = require('../models/VentaAnimal');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const {
    generarCodigoCamada,
    calcularFechasCamada,
    sincronizarTareasCamada,
    cancelarTareasCamada,
    completarTareasDesteteCamada,
    cancelarTareasEstimadasDelRegistro,
    inicializarControlPoblacionCamada,
    registrarEventoCamada,
    saldoColectivoCamada,
    validarCantidadesCamada
} = require('../services/camada-service');
const { upsertEventoCamada } = require('../services/eventoCamada-service');
const { asegurarPuedeCrearAnimal, ejecutarConReservaCuota } = require('../services/plan-service');
const { respuestaErrorPlan } = require('../middleware/plan');

const camadaCtrl = {};

const poblarCamada = (query) => query
    .populate('madre', 'diio identificadorFinca nombre sexo especie categoria')
    .populate('registroReproductivo')
    .populate('asignadoA', 'nombre apellido correo rol estado');

const OBJETIVOS_FINCA = ['REPRODUCCION', 'REEMPLAZO'];

const anexarContadoresInventario = async (camadasEntrada) => {
    const lista = Array.isArray(camadasEntrada) ? camadasEntrada : [camadasEntrada];
    const camadas = lista.filter(Boolean);
    if (camadas.length === 0) return Array.isArray(camadasEntrada) ? [] : camadasEntrada;

    const ids = camadas.map((camada) => camada._id);
    const conteos = await Animal.aggregate([
        {
            $match: {
                especie: 'Porcino',
                camadaOrigen: { $in: ids }
            }
        },
        {
            $group: {
                _id: {
                    camadaOrigen: '$camadaOrigen',
                    objetivoProductivo: '$objetivoProductivo',
                    estado: '$estado'
                },
                cantidad: { $sum: 1 }
            }
        }
    ]);
    const ventasPorCamada = await VentaAnimal.aggregate([
        {
            $match: {
                estado: { $ne: 'Anulada' },
                'camadas.camada': { $in: ids }
            }
        },
        { $unwind: '$camadas' },
        { $match: { 'camadas.camada': { $in: ids } } },
        {
            $group: {
                _id: '$camadas.camada',
                cantidadVendida: { $sum: '$camadas.cantidad' }
            }
        }
    ]);

    const mapa = new Map();
    const mapaVentas = new Map(ventasPorCamada.map((item) => [item._id.toString(), item.cantidadVendida || 0]));
    conteos.forEach((item) => {
        const camadaId = item._id.camadaOrigen.toString();
        const actual = mapa.get(camadaId) || {
            registradosFinca: 0,
            registradosEngorde: 0,
            registradosOtros: 0,
            vendidosIndividuales: 0,
            muertosIndividuales: 0,
            registradosTotal: 0
        };
        const cantidad = item.cantidad || 0;
        const objetivo = item._id.objetivoProductivo;
        const estado = item._id.estado;

        actual.registradosTotal += cantidad;
        if (OBJETIVOS_FINCA.includes(objetivo)) actual.registradosFinca += cantidad;
        else if (objetivo === 'ENGORDE') actual.registradosEngorde += cantidad;
        else actual.registradosOtros += cantidad;

        if (estado === 'Vendido') actual.vendidosIndividuales += cantidad;
        if (estado === 'Muerto') actual.muertosIndividuales += cantidad;
        mapa.set(camadaId, actual);
    });

    const resultado = camadas.map((camada) => {
        const objeto = typeof camada.toObject === 'function' ? camada.toObject() : camada;
        const conteo = mapa.get(objeto._id.toString()) || {
            registradosFinca: 0,
            registradosEngorde: 0,
            registradosOtros: 0,
            vendidosIndividuales: 0,
            muertosIndividuales: 0,
            registradosTotal: 0
        };
        const vendidasPorCamada = mapaVentas.get(objeto._id.toString()) || 0;

        return {
            ...objeto,
            animalesRegistradosFinca: conteo.registradosFinca,
            animalesRegistradosEngorde: conteo.registradosEngorde,
            animalesRegistradosOtros: conteo.registradosOtros,
            animalesRegistradosTotal: conteo.registradosTotal,
            vendidasPorCamada,
            vendidosIndividuales: conteo.vendidosIndividuales,
            muertosIndividuales: conteo.muertosIndividuales,
            pendientesFinca: Math.max((objeto.criasParaFinca || 0) - conteo.registradosFinca, 0),
            pendientesEngorde: Math.max((objeto.criasParaEngorde || 0) - conteo.registradosEngorde, 0),
            pendientesVenta: Math.max((objeto.criasParaVenta || 0) - vendidasPorCamada, 0)
        };
    });

    return Array.isArray(camadasEntrada) ? resultado : resultado[0];
};

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

    return validarCantidadesCamada({
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
    });
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

        res.json(await anexarContadoresInventario(camadas));
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

        res.json(await anexarContadoresInventario(camada));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener camada', error: error.message });
    }
};

camadaCtrl.getCamadasPorMadre = async (req, res) => {
    try {
        const camadas = await poblarCamada(
            Camada.find({ madre: req.params.madreId }).sort({ fechaNacimiento: -1 })
        );

        res.json(await anexarContadoresInventario(camadas));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener camadas de la madre', error: error.message });
    }
};

camadaCtrl.createCamada = async (req, res) => {
    try {
        const madre = await validarMadrePorcina(req.body.madre);
        const registro = req.body.registroReproductivo
            ? await RegistroReproductivo.findById(req.body.registroReproductivo).select('asignadoA')
            : null;
        const datos = await prepararDatosCamada({
            ...req.body,
            asignadoA: req.body.asignadoA || registro?.asignadoA
        });
        const poblacionInicial = Math.max(datos.nacidosVivos - datos.muertosPreDestete, 0);
        const permiso = await asegurarPuedeCrearAnimal({
            organizacionId: req.organizacionId,
            especie: 'Porcino',
            cantidad: poblacionInicial
        });
        const camadaGuardada = await ejecutarConReservaCuota({
            permiso,
            recurso: 'animales',
            organizacionId: req.organizacionId,
            cantidad: poblacionInicial,
            operacion: () => new Camada({
                ...datos,
                controlPoblacionInicializado: true,
                criasIndividualizadas: 0,
                criasVendidas: 0
            }).save()
        });

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
        res.status(201).json(await anexarContadoresInventario(camadaRespuesta));
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al crear camada', error: error.message });
    }
};

camadaCtrl.updateCamada = async (req, res) => {
    try {
        const actual = await Camada.findById(req.params.id);
        if (!actual) {
            return res.status(404).json({ mensaje: 'Camada no encontrada' });
        }

        const actualConciliada = await inicializarControlPoblacionCamada(actual._id);
        const madre = req.body.madre ? await validarMadrePorcina(req.body.madre) : await Animal.findById(actual.madre);
        const datos = await prepararDatosCamada({
            ...actualConciliada.toObject(),
            ...req.body,
            codigoCamada: req.body.codigoCamada || actual.codigoCamada
        });

        const baseVivaNueva = datos.nacidosVivos - datos.muertosPreDestete;
        const comprometidas = Number(actualConciliada.criasIndividualizadas || 0) + Number(actualConciliada.criasVendidas || 0);
        if (comprometidas > baseVivaNueva) {
            return res.status(409).json({
                mensaje: `La camada ya tiene ${comprometidas} cria(s) individualizadas o vendidas; no puede reducir la poblacion viva por debajo de ese valor.`
            });
        }
        const poblacionAnterior = actualConciliada.estado === 'Cancelada' ? 0 : saldoColectivoCamada(actualConciliada);
        const poblacionNueva = datos.estado === 'Cancelada' ? 0 : Math.max(baseVivaNueva - comprometidas, 0);
        const aumentoPoblacion = Math.max(poblacionNueva - poblacionAnterior, 0);

        delete datos._id;
        delete datos.__v;
        delete datos.createdAt;
        delete datos.updatedAt;

        const permiso = await asegurarPuedeCrearAnimal({
            organizacionId: req.organizacionId,
            especie: 'Porcino',
            cantidad: aumentoPoblacion
        });
        const camada = await ejecutarConReservaCuota({
            permiso,
            recurso: 'animales',
            organizacionId: req.organizacionId,
            cantidad: aumentoPoblacion,
            operacion: () => Camada.findOneAndUpdate({
                _id: req.params.id,
                $expr: {
                    $lte: [
                        { $add: [{ $ifNull: ['$criasIndividualizadas', 0] }, { $ifNull: ['$criasVendidas', 0] }] },
                        baseVivaNueva
                    ]
                }
            }, { $set: datos }, { new: true, runValidators: true })
        });
        if (!camada) {
            return res.status(409).json({ mensaje: 'La poblacion de la camada cambio durante la actualizacion. Recarga e intenta nuevamente.' });
        }

        if (camada.estado === 'Activa') {
            await sincronizarTareasCamada({ camada, madre, usuarioId: req.usuario?.id });
        } else {
            await cancelarTareasCamada(camada._id);
        }

        if (actual.destino !== camada.destino) {
            await upsertEventoCamada({
                camada: camada._id,
                tipoEvento: 'Cambio de destino',
                fecha: new Date(),
                titulo: 'Destino de camada actualizado',
                descripcion: `Destino anterior: ${actual.destino || '--'}. Destino nuevo: ${camada.destino || '--'}.`,
                moduloOrigen: 'Camadas',
                creadoPor: req.usuario?.id,
                metadata: {
                    destinoAnterior: actual.destino,
                    destinoNuevo: camada.destino,
                    criasParaFinca: camada.criasParaFinca,
                    criasParaVenta: camada.criasParaVenta,
                    criasParaEngorde: camada.criasParaEngorde
                }
            });
        }

        res.json(await anexarContadoresInventario(await poblarCamada(Camada.findById(camada._id))));
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al actualizar camada', error: error.message });
    }
};

camadaCtrl.registrarDestete = async (req, res) => {
    try {
        const camada = await Camada.findById(req.params.id);
        if (!camada) {
            return res.status(404).json({ mensaje: 'Camada no encontrada' });
        }

        const conciliada = await inicializarControlPoblacionCamada(camada._id);
        const datosPoblacion = validarCantidadesCamada({
            nacidosVivos: conciliada.nacidosVivos,
            criasParaFinca: conciliada.criasParaFinca,
            criasParaVenta: conciliada.criasParaVenta,
            criasParaEngorde: conciliada.criasParaEngorde,
            destetados: normalizarNumero(req.body.destetados, conciliada.destetados),
            muertosPreDestete: normalizarNumero(req.body.muertosPreDestete, conciliada.muertosPreDestete)
        });
        const comprometidas = Number(conciliada.criasIndividualizadas || 0) + Number(conciliada.criasVendidas || 0);
        const baseVivaNueva = datosPoblacion.nacidosVivos - datosPoblacion.muertosPreDestete;
        if (comprometidas > baseVivaNueva || datosPoblacion.destetados > baseVivaNueva) {
            return res.status(409).json({ mensaje: 'El destete o las muertes superan la poblacion disponible de la camada.' });
        }
        const poblacionAnterior = saldoColectivoCamada(conciliada);
        const poblacionNueva = Math.max(baseVivaNueva - comprometidas, 0);
        const aumentoPoblacion = Math.max(poblacionNueva - poblacionAnterior, 0);
        const permiso = await asegurarPuedeCrearAnimal({ organizacionId: req.organizacionId, especie: 'Porcino', cantidad: aumentoPoblacion });
        const guardada = await ejecutarConReservaCuota({
            permiso,
            recurso: 'animales',
            organizacionId: req.organizacionId,
            cantidad: aumentoPoblacion,
            operacion: () => Camada.findOneAndUpdate({
                _id: camada._id,
                $expr: {
                    $lte: [
                        { $add: [{ $ifNull: ['$criasIndividualizadas', 0] }, { $ifNull: ['$criasVendidas', 0] }] },
                        baseVivaNueva
                    ]
                }
            }, {
                $set: {
                    fechaDesteteReal: req.body.fechaDesteteReal || new Date(),
                    destetados: datosPoblacion.destetados,
                    muertosPreDestete: datosPoblacion.muertosPreDestete,
                    pesoPromedioDestete: req.body.pesoPromedioDestete === '' ? conciliada.pesoPromedioDestete : req.body.pesoPromedioDestete,
                    pesoTotalDestete: req.body.pesoTotalDestete === '' ? conciliada.pesoTotalDestete : req.body.pesoTotalDestete,
                    estado: 'Destetada'
                }
            }, { new: true, runValidators: true })
        });
        if (!guardada) return res.status(409).json({ mensaje: 'La poblacion de la camada cambio durante el destete. Recarga e intenta nuevamente.' });
        const madre = await Animal.findById(guardada.madre);
        await completarTareasDesteteCamada(guardada._id, guardada.fechaDesteteReal);
        await sincronizarTareasCamada({ camada: guardada, madre, usuarioId: req.usuario?.id });
        await upsertEventoCamada({
            camada: guardada._id,
            tipoEvento: 'Destete',
            fecha: guardada.fechaDesteteReal,
            titulo: 'Destete registrado',
            descripcion: `Destete registrado para ${guardada.destetados || 0} cría(s).`,
            moduloOrigen: 'Camadas',
            referenciaId: guardada._id,
            creadoPor: req.usuario?.id,
            metadata: {
                destetados: guardada.destetados,
                muertosPreDestete: guardada.muertosPreDestete,
                pesoPromedioDestete: guardada.pesoPromedioDestete,
                pesoTotalDestete: guardada.pesoTotalDestete
            }
        });

        res.json(await anexarContadoresInventario(await poblarCamada(Camada.findById(guardada._id))));
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(error.status || 400).json({ mensaje: 'Error al registrar destete', error: error.message });
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
        await upsertEventoCamada({
            camada: camada._id,
            tipoEvento: 'Cierre',
            fecha: new Date(),
            titulo: 'Camada cerrada',
            descripcion: req.body.observaciones || 'Camada cerrada.',
            moduloOrigen: 'Camadas',
            referenciaId: camada._id,
            creadoPor: req.usuario?.id
        });
        res.json(await anexarContadoresInventario(await poblarCamada(Camada.findById(camada._id))));
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
        await upsertEventoCamada({
            camada: camada._id,
            tipoEvento: 'Cancelacion',
            fecha: new Date(),
            titulo: 'Camada cancelada',
            descripcion: req.body.observaciones || 'Camada cancelada.',
            moduloOrigen: 'Camadas',
            referenciaId: camada._id,
            creadoPor: req.usuario?.id
        });
        res.json(await anexarContadoresInventario(await poblarCamada(Camada.findById(camada._id))));
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
