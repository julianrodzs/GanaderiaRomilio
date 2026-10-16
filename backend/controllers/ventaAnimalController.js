const Animal = require('../models/Animal');
const Camada = require('../models/Camada');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const VentaAnimal = require('../models/VentaAnimal');
const { eliminarEventosPorReferencia, upsertEventoAnimal } = require('../services/eventoAnimal-service');
const { eliminarEventosCamadaPorReferencia, upsertEventoCamada } = require('../services/eventoCamada-service');
const { DESTINO_USO_MOVIMIENTOS_ANIMALES } = require('../config/catalogosFinancieros');
const {
    asegurarPuedeCrearAnimal,
    ejecutarConReservaCuota,
    liberarReservaCuotaPlan,
    reservarCuotaPlan,
    tieneFeature
} = require('../services/plan-service');
const PertenenciaLote = require('../models/PertenenciaLote');
const { cerrarPertenencia } = require('../services/lote-service');
const { respuestaErrorPlan } = require('../middleware/plan');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const {
    inicializarControlPoblacionCamada,
    liberarCriasCamada,
    reservarCriasCamada
} = require('../services/camada-service');

const ventaAnimalCtrl = {};

const poblarVenta = (query) => query
    .populate('animales.animal')
    .populate({
        path: 'camadas.camada',
        populate: { path: 'madre', select: 'diio identificadorFinca nombre sexo especie categoria' }
    })
    .populate('registradoPor', 'nombre apellido correo rol');

const idsAnimalesVenta = (animales = []) => animales.map((item) => item.animal?.toString?.() || item.animal).filter(Boolean);
const idsCamadasVenta = (camadas = []) => camadas.map((item) => item.camada?.toString?.() || item.camada).filter(Boolean);

const redondear = (valor, decimales = 2) => Number((valor || 0).toFixed(decimales));

const calcularMesesEntre = (fechaInicio, fechaFin) => {
    if (!fechaInicio || !fechaFin) return null;
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null;
    const dias = Math.max((fin - inicio) / (1000 * 60 * 60 * 24), 0);
    return redondear(dias / 30.4375);
};

const obtenerOrigenAnimal = (animal = {}) => animal.fechaCompra ? 'Comprado' : 'Nacido en finca';

const obtenerFechaIngresoAnimal = (animal = {}) => animal.fechaCompra || animal.fechaNacimiento || animal.createdAt;

const calcularMontoAsignadoVenta = (venta, subtotal = 0) => {
    const montoCalculado = Number(venta.montoCalculado || 0);
    if (!montoCalculado) return Number(subtotal || 0);
    return Number(venta.montoTotal || 0) * (Number(subtotal || 0) / montoCalculado);
};

const crearFiltroEspecieAnimal = async (especie) => {
    if (!['Bovino', 'Porcino'].includes(especie)) return {};
    const filtroEspecie = especie === 'Bovino'
        ? { $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] }
        : { especie };
    const animales = await Animal.find(filtroEspecie).select('_id');
    return {
        $or: [
            { especie },
            {
                especie: { $exists: false },
                'animales.animal': { $in: animales.map((animal) => animal._id) }
            }
        ]
    };
};

const obtenerCantidadesVendidasPorCamada = async (camadaIds = [], ventaIdIgnorada = null, session = null) => {
    if (camadaIds.length === 0) return new Map();

    const filtro = {
        estado: { $ne: 'Anulada' },
        'camadas.camada': { $in: camadaIds }
    };
    if (ventaIdIgnorada) filtro._id = { $ne: ventaIdIgnorada };

    const ventas = await VentaAnimal.aggregate([
        { $match: filtro },
        { $unwind: '$camadas' },
        { $match: { 'camadas.camada': { $in: camadaIds } } },
        {
            $group: {
                _id: '$camadas.camada',
                cantidadVendida: { $sum: '$camadas.cantidad' }
            }
        }
    ]).session(session);

    return new Map(ventas.map((item) => [item._id.toString(), item.cantidadVendida || 0]));
};

const validarCamadasVenta = async (camadas = [], ventaIdIgnorada = null, session = null) => {
    if (!Array.isArray(camadas) || camadas.length === 0) {
        return { valido: true };
    }

    const ids = idsCamadasVenta(camadas);
    if (ids.length !== new Set(ids).size) {
        return { valido: false, status: 400, mensaje: 'No puedes repetir la misma camada en una venta' };
    }

    const camadasEncontradas = await Camada.find({ _id: { $in: ids } }).session(session);
    if (camadasEncontradas.length !== ids.length) {
        return { valido: false, status: 404, mensaje: 'Una o más camadas no existen' };
    }

    const camadaCancelada = camadasEncontradas.find((camada) => camada.estado === 'Cancelada');
    if (camadaCancelada) {
        return {
            valido: false,
            status: 400,
            mensaje: `La camada ${camadaCancelada.codigoCamada} está cancelada y no puede venderse`
        };
    }

    await Promise.all(ids.map((id) => inicializarControlPoblacionCamada(id, session)));
    const vendidasPorCamada = await obtenerCantidadesVendidasPorCamada(ids, ventaIdIgnorada, session);

    for (const item of camadas) {
        const camadaId = item.camada?.toString?.() || item.camada;
        const camada = camadasEncontradas.find((registro) => registro._id.toString() === camadaId);
        const cantidad = Number(item.cantidad || 0);
        const pesoTotalKg = Number(item.pesoTotalKg || 0);
        const precioKg = Number(item.precioKg || 0);

        if (!Number.isInteger(cantidad) || cantidad <= 0) {
            return { valido: false, status: 400, mensaje: 'La cantidad vendida por camada debe ser un entero mayor que cero' };
        }
        if (pesoTotalKg <= 0 || precioKg <= 0) {
            return { valido: false, status: 400, mensaje: 'Peso total y precio por kg de camada deben ser mayores que cero' };
        }

        const disponible = Math.max((camada.criasParaVenta || 0) - (vendidasPorCamada.get(camadaId) || 0), 0);
        if (cantidad > disponible) {
            return {
                valido: false,
                status: 400,
                mensaje: `La camada ${camada.codigoCamada} solo tiene ${disponible} cría(s) disponibles para venta`
            };
        }
    }

    return { valido: true };
};

const reservarVentaCamadas = async (camadas = [], session = null) => {
    for (const item of camadas || []) {
        await reservarCriasCamada({
            camadaId: item.camada?._id || item.camada,
            cantidad: Number(item.cantidad),
            destino: 'venta',
            session
        });
    }
};

const liberarVentaCamadas = async (camadas = [], session = null) => {
    for (const item of camadas || []) {
        await inicializarControlPoblacionCamada(item.camada?._id || item.camada, session);
        await liberarCriasCamada({
            camadaId: item.camada?._id || item.camada,
            cantidad: Number(item.cantidad),
            destino: 'venta',
            session
        });
    }
};

const validarAnimalesVenta = async (animales = [], ventaIdIgnorada = null, especieVenta = null, session = null) => {
    if (!Array.isArray(animales) || animales.length === 0) {
        return { valido: true, especie: especieVenta || 'Bovino' };
    }

    const ids = idsAnimalesVenta(animales);
    if (ids.length !== new Set(ids).size) {
        return { valido: false, status: 400, mensaje: 'No puedes repetir el mismo animal en una venta' };
    }

    const animalesEncontrados = await Animal.find({ _id: { $in: ids } }).session(session);
    if (animalesEncontrados.length !== ids.length) {
        return { valido: false, status: 404, mensaje: 'Uno o más animales no existen' };
    }

    if (especieVenta && animalesEncontrados.some((animal) => (animal.especie || 'Bovino') !== especieVenta)) {
        return { valido: false, status: 400, mensaje: `Todos los animales de la venta deben ser ${especieVenta}` };
    }

    const animalNoDisponible = animalesEncontrados.find((animal) => ['Vendido', 'Muerto'].includes(animal.estado));
    if (animalNoDisponible) {
        return {
            valido: false,
            status: 400,
            mensaje: `El animal ${animalNoDisponible.diio || animalNoDisponible.identificadorFinca} no está disponible para venta`
        };
    }

    const filtroDuplicado = {
        estado: { $ne: 'Anulada' },
        'animales.animal': { $in: ids }
    };
    if (ventaIdIgnorada) filtroDuplicado._id = { $ne: ventaIdIgnorada };

    const ventaDuplicada = await VentaAnimal.findOne(filtroDuplicado).session(session);
    if (ventaDuplicada) {
        return { valido: false, status: 400, mensaje: 'Uno o más animales ya están en una venta activa' };
    }

    const detalleInvalido = animales.find((item) => Number(item.pesoVentaKg) <= 0 || Number(item.precioKg) <= 0);
    if (detalleInvalido) {
        return { valido: false, status: 400, mensaje: 'Peso de venta y precio por kg deben ser mayores que cero' };
    }

    return { valido: true, especie: especieVenta || animalesEncontrados[0]?.especie || 'Bovino' };
};

const crearEventosVenta = async (venta, usuarioId, session) => {
    await Promise.all([
        ...(venta.animales || []).map((item) => {
            const montoAsignado = calcularMontoAsignadoVenta(venta, item.subtotal);

            return upsertEventoAnimal({
                animal: item.animal,
                tipoEvento: 'Venta',
                fecha: venta.fechaVenta,
                titulo: 'Animal vendido',
                descripcion: `Venta registrada por ₡${Number(montoAsignado || 0).toLocaleString('es-CR')} con peso de ${item.pesoVentaKg} kg`,
                moduloOrigen: 'Ventas',
                referenciaId: venta._id,
                creadoPor: usuarioId,
                metadata: {
                    comprador: venta.comprador,
                    pesoVentaKg: item.pesoVentaKg,
                    precioKg: item.precioKg,
                    subtotal: item.subtotal,
                    montoAsignado,
                    montoFinalVenta: venta.montoFinal,
                    ajusteMontoVenta: venta.ajusteMonto
                }
            }, { session });
        }),
        ...(venta.camadas || []).map((item) => {
            const montoAsignado = calcularMontoAsignadoVenta(venta, item.subtotal);

            return upsertEventoCamada({
                camada: item.camada?._id || item.camada,
                tipoEvento: 'Venta',
                fecha: venta.fechaVenta,
                titulo: 'Venta de crías de camada',
                descripcion: `Venta agrupada de ${item.cantidad || 0} cría(s) por ₡${Number(montoAsignado || 0).toLocaleString('es-CR')}.`,
                moduloOrigen: 'Ventas',
                referenciaId: venta._id,
                creadoPor: usuarioId,
                metadata: {
                    comprador: venta.comprador,
                    cantidad: item.cantidad,
                    pesoTotalKg: item.pesoTotalKg,
                    precioKg: item.precioKg,
                    subtotal: item.subtotal,
                    montoAsignado,
                    montoFinalVenta: venta.montoFinal,
                    ajusteMontoVenta: venta.ajusteMonto
                }
            }, { session });
        })
    ]);
};

const aplicarVentaConfirmada = async (venta, usuarioId, session) => {
    if (venta.estado !== 'Confirmada') return;

    await Promise.all((venta.animales || []).map((item) => {
        const montoAsignado = calcularMontoAsignadoVenta(venta, item.subtotal);

        return Animal.findOneAndUpdate(
            { _id: item.animal, estado: 'Activo' },
            { $set: {
                estado: 'Vendido',
                fechaVenta: venta.fechaVenta,
                pesoVenta: item.pesoVentaKg,
                precioVentaPorKg: item.pesoVentaKg ? montoAsignado / item.pesoVentaKg : item.precioKg,
                montoVenta: montoAsignado,
                comprador: venta.comprador,
                ventaId: venta._id
            } },
            { session, new: true, runValidators: true }
        ).then((animal) => {
            if (!animal) {
                const error = new Error('Uno o más animales dejaron de estar disponibles durante la venta.');
                error.status = 409;
                throw error;
            }
            return animal;
        });
    }));

    const pertenencias = await PertenenciaLote.find({ animal: { $in: idsAnimalesVenta(venta.animales) }, activo: true }).session(session);
    await Promise.all(pertenencias.map((pertenencia) => cerrarPertenencia(pertenencia, {
        fechaSalida: venta.fechaVenta,
        motivoSalida: 'VENTA',
        usuarioId,
        session
    })));

    await crearEventosVenta(venta, usuarioId, session);
    await MovimientoFinanciero.findOneAndUpdate(
        { referenciaId: venta._id, referenciaModelo: 'VentaAnimal' },
        {
            fecha: venta.fechaVenta,
            tipoMovimiento: 'Venta de animales',
            naturaleza: 'Ingreso',
            categoria: 'Ventas',
            descripcion: `Venta de ${venta.especie === 'Porcino' ? 'porcino(s)' : 'bovino(s)'} a ${venta.comprador}`,
            producto: venta.especie === 'Porcino' ? 'Porcinos vendidos' : 'Bovinos vendidos',
            cantidad: venta.pesoTotalKg,
            unidad: 'KG',
            precioUnitario: venta.pesoTotalKg ? venta.montoTotal / venta.pesoTotalKg : undefined,
            monto: venta.montoTotal,
            moneda: 'CRC',
            proveedor: venta.comprador,
            destinoUso: DESTINO_USO_MOVIMIENTOS_ANIMALES,
            observaciones: venta.observaciones,
            referenciaId: venta._id,
            referenciaModelo: 'VentaAnimal'
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );
};

const restaurarPertenenciasCerradasPorVenta = async (venta, session, usuarioId) => {
    const animales = idsAnimalesVenta(venta.animales);
    if (!animales.length) return;

    const activas = await PertenenciaLote.find({ animal: { $in: animales }, activo: true })
        .select('animal')
        .session(session);
    const animalesConPertenencia = new Set(activas.map((item) => String(item.animal)));
    const cerradas = await PertenenciaLote.find({
        animal: { $in: animales },
        activo: false,
        motivoSalida: 'VENTA',
        fechaSalida: venta.fechaVenta
    })
        .sort({ fechaSalida: -1, updatedAt: -1 })
        .populate('lote', 'codigo nombre')
        .session(session);

    for (const pertenencia of cerradas) {
        const animalId = String(pertenencia.animal);
        if (animalesConPertenencia.has(animalId)) continue;

        pertenencia.activo = true;
        pertenencia.fechaSalida = undefined;
        pertenencia.motivoSalida = undefined;
        await pertenencia.save({ session });
        await Animal.updateOne(
            { _id: pertenencia.animal, estado: 'Activo' },
            { $set: { loteActual: pertenencia.lote?._id || pertenencia.lote } },
            { session }
        );
        await upsertEventoAnimal({
            animal: pertenencia.animal,
            tipoEvento: 'Cambio de lote',
            fecha: new Date(),
            titulo: 'Pertenencia al lote restaurada',
            descripcion: `Se restauró la pertenencia al lote ${pertenencia.lote?.codigo || pertenencia.lote} al revertir la venta.`,
            moduloOrigen: 'Lotes',
            referenciaId: pertenencia._id,
            creadoPor: usuarioId || venta.registradoPor,
            metadata: {
                accion: 'REVERSION_VENTA',
                loteId: pertenencia.lote?._id || pertenencia.lote,
                codigoLote: pertenencia.lote?.codigo,
                ventaId: venta._id
            }
        }, { session });
        animalesConPertenencia.add(animalId);
    }
};

const revertirVenta = async (venta, session, usuarioId) => {
    if (venta.estado !== 'Anulada') {
        await Promise.all((venta.animales || []).map((item) => Animal.findOneAndUpdate(
            { _id: item.animal, ventaId: venta._id },
            {
                $set: { estado: 'Activo' },
                $unset: {
                    fechaVenta: '',
                    pesoVenta: '',
                    precioVentaPorKg: '',
                    montoVenta: '',
                    comprador: '',
                    ventaId: ''
                }
            },
            { session, runValidators: true }
        )));

        await restaurarPertenenciasCerradasPorVenta(venta, session, usuarioId);
        await liberarVentaCamadas(venta.camadas, session);
    }

    await MovimientoFinanciero.deleteMany({ referenciaId: venta._id, referenciaModelo: 'VentaAnimal' }, { session });
    await eliminarEventosPorReferencia({ moduloOrigen: 'Ventas', referenciaId: venta._id, session });
    await eliminarEventosCamadaPorReferencia({ moduloOrigen: 'Ventas', referenciaId: venta._id, session });
};

const extraerDatosVenta = (body = {}) => ({
    fechaVenta: body.fechaVenta,
    comprador: body.comprador,
    identificacionComprador: body.identificacionComprador,
    telefonoComprador: body.telefonoComprador,
    observaciones: body.observaciones,
    montoFinal: body.montoFinal
});

const errorValidacion = (validacion) => Object.assign(new Error(validacion.mensaje), {
    status: validacion.status || 400
});

ventaAnimalCtrl.getVentas = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, comprador, estado, especie } = req.query;
        const filtro = await crearFiltroEspecieAnimal(especie);

        if (fechaInicio || fechaFin) {
            filtro.fechaVenta = {};
            if (fechaInicio) filtro.fechaVenta.$gte = new Date(fechaInicio);
            if (fechaFin) {
                const fin = new Date(fechaFin);
                fin.setUTCHours(23, 59, 59, 999);
                filtro.fechaVenta.$lte = fin;
            }
        }
        if (comprador) filtro.comprador = { $regex: comprador, $options: 'i' };
        if (estado) filtro.estado = estado;

        const ventas = await poblarVenta(VentaAnimal.find(filtro).sort({ fechaVenta: -1, createdAt: -1 }));
        res.json(ventas);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener ventas', error: error.message });
    }
};

ventaAnimalCtrl.getVentaById = async (req, res) => {
    try {
        const venta = await poblarVenta(VentaAnimal.findById(req.params.id));
        if (!venta) return res.status(404).json({ mensaje: 'Venta no encontrada' });
        res.json(venta);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener venta', error: error.message });
    }
};

ventaAnimalCtrl.crearVenta = async (req, res) => {
    try {
        const animales = typeof req.body.animales === 'string' ? JSON.parse(req.body.animales) : req.body.animales;
        const camadas = typeof req.body.camadas === 'string' ? JSON.parse(req.body.camadas) : req.body.camadas;
        if ((!Array.isArray(animales) || animales.length === 0) && (!Array.isArray(camadas) || camadas.length === 0)) {
            return res.status(400).json({ mensaje: 'Debe agregar al menos un animal o una camada' });
        }
        if (Array.isArray(camadas) && camadas.length > 0 && req.body.especie !== 'Porcino') {
            return res.status(400).json({ mensaje: 'Las ventas por camada solo aplican para porcinos' });
        }
        const ventaId = await ejecutarEnTransaccion(async (session) => {
            const validacion = await validarAnimalesVenta(animales, null, req.body.especie, session);
            if (!validacion.valido) throw errorValidacion(validacion);
            const validacionCamadas = await validarCamadasVenta(camadas, null, session);
            if (!validacionCamadas.valido) throw errorValidacion(validacionCamadas);
            await reservarVentaCamadas(camadas, session);

            const [ventaGuardada] = await VentaAnimal.create([{
                ...extraerDatosVenta(req.body),
                especie: req.body.especie || validacion.especie || 'Bovino',
                animales: animales || [],
                camadas: camadas || [],
                estado: 'Confirmada',
                registradoPor: req.usuario?.id,
                organizacionId: req.organizacionId,
                fincaId: req.fincaId
            }], { session });
            await aplicarVentaConfirmada(ventaGuardada, req.usuario?.id, session);
            return ventaGuardada._id;
        });

        const ventaPoblada = await poblarVenta(VentaAnimal.findById(ventaId));
        res.status(201).json(ventaPoblada);
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al crear venta', error: error.message });
    }
};

ventaAnimalCtrl.actualizarVenta = async (req, res) => {
    let reservaCuota = null;

    try {
        const ventaAnterior = await VentaAnimal.findById(req.params.id);
        if (!ventaAnterior) return res.status(404).json({ mensaje: 'Venta no encontrada' });
        if (ventaAnterior.estado === 'Anulada') {
            return res.status(400).json({ mensaje: 'No se puede editar una venta anulada' });
        }

        const animales = typeof req.body.animales === 'string' ? JSON.parse(req.body.animales) : req.body.animales;
        const camadas = typeof req.body.camadas === 'string' ? JSON.parse(req.body.camadas) : req.body.camadas;
        const totalAnterior = idsAnimalesVenta(ventaAnterior.animales).length
            + (ventaAnterior.camadas || []).reduce((total, item) => total + Number(item.cantidad || 0), 0);
        const totalNuevo = idsAnimalesVenta(animales).length
            + (camadas || []).reduce((total, item) => total + Number(item.cantidad || 0), 0);
        const cantidadReactivadaNeta = Math.max(totalAnterior - totalNuevo, 0);
        if (cantidadReactivadaNeta > 0) {
            const permiso = await asegurarPuedeCrearAnimal({
                organizacionId: req.organizacionId,
                especie: ventaAnterior.especie || 'Bovino',
                cantidad: cantidadReactivadaNeta
            });
            reservaCuota = await reservarCuotaPlan({
                organizacionId: req.organizacionId,
                recurso: 'animales', cantidad: cantidadReactivadaNeta,
                actual: permiso.actual, limite: permiso.limite, permiso
            });
        }

        if ((!Array.isArray(animales) || animales.length === 0) && (!Array.isArray(camadas) || camadas.length === 0)) {
            return res.status(400).json({ mensaje: 'Debe agregar al menos un animal o una camada' });
        }
        if (Array.isArray(camadas) && camadas.length > 0 && (req.body.especie || ventaAnterior.especie) !== 'Porcino') {
            return res.status(400).json({ mensaje: 'Las ventas por camada solo aplican para porcinos' });
        }

        const ventaId = await ejecutarEnTransaccion(async (session) => {
            const ventaVigente = await VentaAnimal.findById(req.params.id).session(session);
            if (!ventaVigente || ventaVigente.estado === 'Anulada') {
                const error = new Error(ventaVigente ? 'No se puede editar una venta anulada' : 'Venta no encontrada');
                error.status = ventaVigente ? 400 : 404;
                throw error;
            }
            await revertirVenta(ventaVigente, session, req.usuario?.id);
            const validacion = await validarAnimalesVenta(animales, req.params.id, req.body.especie || ventaVigente.especie, session);
            if (!validacion.valido) throw errorValidacion(validacion);
            const validacionCamadas = await validarCamadasVenta(camadas, req.params.id, session);
            if (!validacionCamadas.valido) throw errorValidacion(validacionCamadas);
            await reservarVentaCamadas(camadas, session);

            const venta = await VentaAnimal.findByIdAndUpdate(req.params.id, {
                $set: {
                    ...extraerDatosVenta(req.body),
                    montoFinal: Object.prototype.hasOwnProperty.call(req.body, 'montoFinal')
                        ? req.body.montoFinal
                        : ventaVigente.montoFinal,
                    especie: req.body.especie || validacion.especie || ventaVigente.especie,
                    animales: animales || [],
                    camadas: camadas || []
                }
            }, { new: true, runValidators: true, session });
            await aplicarVentaConfirmada(venta, req.usuario?.id, session);
            return venta._id;
        });
        const ventaPoblada = await poblarVenta(VentaAnimal.findById(ventaId));
        res.json(ventaPoblada);
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al actualizar venta', error: error.message });
    } finally {
        await liberarReservaCuotaPlan(reservaCuota).catch(() => null);
    }
};

ventaAnimalCtrl.anularVenta = async (req, res) => {
    try {
        const ventaActual = await VentaAnimal.findById(req.params.id);
        if (!ventaActual) return res.status(404).json({ mensaje: 'Venta no encontrada' });
        if (ventaActual.estado === 'Anulada') return res.json(await poblarVenta(VentaAnimal.findById(ventaActual._id)));

        const cantidad = (ventaActual.animales || []).length
            + (ventaActual.camadas || []).reduce((total, item) => total + Number(item.cantidad || 0), 0);
        const operacion = () => ejecutarEnTransaccion(async (session) => {
            const venta = await VentaAnimal.findById(req.params.id).session(session);
            if (!venta) {
                const error = new Error('Venta no encontrada');
                error.status = 404;
                throw error;
            }
            if (venta.estado === 'Anulada') return venta._id;
            await revertirVenta(venta, session, req.usuario?.id);
            venta.estado = 'Anulada';
            venta.observaciones = [venta.observaciones, req.body?.motivoAnulacion].filter(Boolean).join(' | ');
            await venta.save({ session });
            return venta._id;
        });
        let ventaId;
        if (cantidad) {
            const permiso = await asegurarPuedeCrearAnimal({ organizacionId: req.organizacionId, especie: ventaActual.especie || 'Bovino', cantidad });
            ventaId = await ejecutarConReservaCuota({ permiso, recurso: 'animales', organizacionId: req.organizacionId, cantidad, operacion });
        } else ventaId = await operacion();
        const ventaPoblada = await poblarVenta(VentaAnimal.findById(ventaId));
        res.json(ventaPoblada);
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(400).json({ mensaje: 'Error al anular venta', error: error.message });
    }
};

ventaAnimalCtrl.deleteVenta = async (req, res) => {
    try {
        const ventaActual = await VentaAnimal.findById(req.params.id);
        if (!ventaActual) return res.status(404).json({ mensaje: 'Venta no encontrada' });

        const cantidad = ventaActual.estado === 'Anulada' ? 0 : (ventaActual.animales || []).length
            + (ventaActual.camadas || []).reduce((total, item) => total + Number(item.cantidad || 0), 0);
        const operacion = () => ejecutarEnTransaccion(async (session) => {
            const venta = await VentaAnimal.findById(req.params.id).session(session);
            if (!venta) {
                const error = new Error('Venta no encontrada');
                error.status = 404;
                throw error;
            }
            await revertirVenta(venta, session, req.usuario?.id);
            await VentaAnimal.deleteOne({ _id: venta._id }, { session });
        });
        if (cantidad) {
            const permiso = await asegurarPuedeCrearAnimal({ organizacionId: req.organizacionId, especie: ventaActual.especie || 'Bovino', cantidad });
            await ejecutarConReservaCuota({ permiso, recurso: 'animales', organizacionId: req.organizacionId, cantidad, operacion });
        } else await operacion();
        res.json({ mensaje: 'Venta eliminada' });
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(500).json({ mensaje: 'Error al eliminar venta', error: error.message });
    }
};

ventaAnimalCtrl.getResumenVentas = async (req, res) => {
    try {
        const incluyeAnaliticaEconomica = await tieneFeature('analiticaEconomica', req.organizacionId);
        const { fechaInicio, fechaFin, especie } = req.query;
        const filtro = { estado: 'Confirmada', ...(await crearFiltroEspecieAnimal(especie)) };
        if (fechaInicio || fechaFin) {
            filtro.fechaVenta = {};
            if (fechaInicio) filtro.fechaVenta.$gte = new Date(fechaInicio);
            if (fechaFin) {
                const fin = new Date(fechaFin);
                fin.setUTCHours(23, 59, 59, 999);
                filtro.fechaVenta.$lte = fin;
            }
        }

        const ventas = await VentaAnimal.find(filtro).populate('animales.animal').lean();
        const totalVendido = ventas.reduce((total, venta) => total + (venta.montoTotal || 0), 0);
        const totalKgVendidos = ventas.reduce((total, venta) => total + (venta.pesoTotalKg || 0), 0);
        const totalUnidadesVendidas = ventas.reduce((total, venta) => total + (venta.totalAnimales || 0), 0);
        const animalesVendidos = ventas.flatMap((venta) => (venta.animales || []).map((item) => {
            const montoAsignado = calcularMontoAsignadoVenta(venta, item.subtotal);

            return {
                ...item,
                montoAsignado,
                precioKgFinal: item.pesoVentaKg ? montoAsignado / item.pesoVentaKg : item.precioKg,
                fechaVenta: venta.fechaVenta,
                comprador: venta.comprador
            };
        }));
        const camadasVendidas = ventas.flatMap((venta) => (venta.camadas || []).map((item) => {
            const montoAsignado = calcularMontoAsignadoVenta(venta, item.subtotal);

            return {
                ...item,
                montoAsignado,
                precioKgFinal: item.pesoTotalKg ? montoAsignado / item.pesoTotalKg : item.precioKg,
                fechaVenta: venta.fechaVenta,
                comprador: venta.comprador
            };
        }));
        const ventasPorMes = ventas.reduce((mapa, venta) => {
            const fecha = new Date(venta.fechaVenta);
            const clave = `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
            if (!mapa[clave]) {
                mapa[clave] = { mes: clave, total: 0, pesoTotalKg: 0, animales: 0, ventas: 0 };
            }
            mapa[clave].total += venta.montoTotal || 0;
            mapa[clave].pesoTotalKg += venta.pesoTotalKg || 0;
            mapa[clave].animales += venta.totalAnimales || 0;
            mapa[clave].ventas += 1;
            return mapa;
        }, {});
        const compradores = ventas.reduce((mapa, venta) => {
            mapa[venta.comprador] = (mapa[venta.comprador] || 0) + 1;
            return mapa;
        }, {});
        const porCategoria = animalesVendidos.reduce((mapa, item) => {
            const animal = item.animal || {};
            const categoria = animal.sexo === 'Hembra' ? 'Hembras' : animal.sexo === 'Macho' ? 'Machos' : 'Sin definir';
            mapa[categoria] = (mapa[categoria] || 0) + 1;
            return mapa;
        }, {});
        const porCategoriaConCamadas = camadasVendidas.reduce((mapa, item) => {
            mapa['Camadas porcinas'] = (mapa['Camadas porcinas'] || 0) + Number(item.cantidad || 0);
            return mapa;
        }, porCategoria);
        const ventasPorOrigen = animalesVendidos.reduce((mapa, item) => {
            const animal = item.animal || {};
            const origen = obtenerOrigenAnimal(animal);
            if (!mapa[origen]) {
                mapa[origen] = { origen, animales: 0, pesoTotalKg: 0, montoTotal: 0, mesesTotal: 0, animalesConMeses: 0 };
            }
            const fechaIngreso = obtenerFechaIngresoAnimal(animal);
            const mesesEnFinca = calcularMesesEntre(fechaIngreso, item.fechaVenta);
            mapa[origen].animales += 1;
            mapa[origen].pesoTotalKg += item.pesoVentaKg || 0;
            mapa[origen].montoTotal += item.montoAsignado || item.subtotal || 0;
            if (mesesEnFinca !== null) {
                mapa[origen].mesesTotal += mesesEnFinca;
                mapa[origen].animalesConMeses += 1;
            }
            return mapa;
        }, {});
        const rotacionAnimales = animalesVendidos.map((item) => {
            const animal = item.animal || {};
            const fechaIngreso = obtenerFechaIngresoAnimal(animal);
            const mesesEnFinca = calcularMesesEntre(fechaIngreso, item.fechaVenta);

            return {
                animalId: animal._id,
                diio: animal.diio || animal.identificadorFinca || '--',
                nombre: animal.nombre || '',
                origen: obtenerOrigenAnimal(animal),
                fechaIngreso: fechaIngreso || null,
                fechaVenta: item.fechaVenta,
                mesesEnFinca,
                pesoVentaKg: item.pesoVentaKg || 0,
                precioKg: item.precioKgFinal || item.precioKg || 0,
                subtotal: item.montoAsignado || item.subtotal || 0,
                comprador: item.comprador
            };
        }).filter((item) => item.mesesEnFinca !== null);
        const duracionPromedioMeses = rotacionAnimales.length
            ? rotacionAnimales.reduce((total, item) => total + item.mesesEnFinca, 0) / rotacionAnimales.length
            : 0;

        res.json({
            totalVendido,
            totalKgVendidos,
            precioPromedioKg: totalKgVendidos ? totalVendido / totalKgVendidos : 0,
            ingresosGenerados: totalVendido,
            totalVentas: ventas.length,
            totalAnimalesVendidos: totalUnidadesVendidas,
            ventasPorPeriodo: {
                totalVendido,
                totalKgVendidos,
                totalVentas: ventas.length,
                totalAnimalesVendidos: totalUnidadesVendidas,
                ventaPromedioPorAnimal: totalUnidadesVendidas ? totalVendido / totalUnidadesVendidas : 0,
                ticketPromedioVenta: ventas.length ? totalVendido / ventas.length : 0
            },
            precioKg: {
                promedio: totalKgVendidos ? totalVendido / totalKgVendidos : 0,
                minimo: [...animalesVendidos, ...camadasVendidas].length ? Math.min(...[...animalesVendidos, ...camadasVendidas].map((item) => item.precioKgFinal || item.precioKg || 0)) : 0,
                maximo: [...animalesVendidos, ...camadasVendidas].length ? Math.max(...[...animalesVendidos, ...camadasVendidas].map((item) => item.precioKgFinal || item.precioKg || 0)) : 0
            },
            ventasPorMes: Object.values(ventasPorMes).map((item) => ({
                ...item,
                precioPromedioKg: item.pesoTotalKg ? item.total / item.pesoTotalKg : 0
            })).sort((a, b) => a.mes.localeCompare(b.mes)),
            compradoresFrecuentes: Object.entries(compradores).map(([comprador, cantidad]) => ({ comprador, cantidad })),
            animalesVendidosPorCategoria: Object.entries(porCategoriaConCamadas).map(([categoria, cantidad]) => ({ categoria, cantidad })),
            ventasPorOrigen: incluyeAnaliticaEconomica ? Object.values(ventasPorOrigen).map((item) => ({
                origen: item.origen,
                animales: item.animales,
                pesoTotalKg: redondear(item.pesoTotalKg),
                montoTotal: redondear(item.montoTotal),
                precioPromedioKg: item.pesoTotalKg ? redondear(item.montoTotal / item.pesoTotalKg) : 0,
                mesesPromedioEnFinca: item.animalesConMeses ? redondear(item.mesesTotal / item.animalesConMeses) : 0
            })) : { bloqueado: true, feature: 'analiticaEconomica' },
            rotacionInventarioVendido: incluyeAnaliticaEconomica ? {
                duracionPromedioMeses: redondear(duracionPromedioMeses),
                animalesConDuracion: rotacionAnimales.length,
                menorDuracion: rotacionAnimales.length ? Math.min(...rotacionAnimales.map((item) => item.mesesEnFinca)) : 0,
                mayorDuracion: rotacionAnimales.length ? Math.max(...rotacionAnimales.map((item) => item.mesesEnFinca)) : 0,
                detalle: rotacionAnimales.sort((a, b) => b.mesesEnFinca - a.mesesEnFinca)
            } : { bloqueado: true, feature: 'analiticaEconomica' }
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener resumen de ventas', error: error.message });
    }
};

module.exports = ventaAnimalCtrl;
