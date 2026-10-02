const Animal = require('../models/Animal');
const CompraAnimal = require('../models/CompraAnimal');
const PertenenciaLote = require('../models/PertenenciaLote');
const { urlArchivoOrganizacion } = require('../middleware/uploadOrganizacion');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const { eliminarEventosPorReferencia, upsertEventoAnimal } = require('../services/eventoAnimal-service');
const {
    DESTINO_USO_MOVIMIENTOS_ANIMALES,
    obtenerCategoriaCompraAnimales
} = require('../config/catalogosFinancieros');
const { asegurarPuedeCrearAnimal } = require('../services/plan-service');
const { validarObjetivoProductivoFinca } = require('../services/finca-service');
const { respuestaErrorPlan } = require('../middleware/plan');
const { agregarAnimalesAlLote, crearLoteRapido } = require('../services/lote-service');
const { obtenerCategoriaAnimal } = require('../services/categoriaAnimal-service');
const { prepararObjetivoProductivo } = require('../config/objetivosProductivos');

const compraAnimalCtrl = {};

const poblarCompra = (query) => query
    .populate('animales.animal')
    .populate('loteAsignado', 'codigo nombre especie proposito estado')
    .populate('registradoPor', 'nombre apellido correo rol');

const normalizarTexto = (valor) => String(valor || '').trim();

const parseAnimales = (animales) => {
    if (typeof animales === 'string') return JSON.parse(animales);
    return animales;
};

const parseLoteRapido = (loteRapido) => {
    if (!loteRapido) return null;
    if (typeof loteRapido === 'string') return JSON.parse(loteRapido);
    return loteRapido;
};

const prepararAnimalesCompra = (animales) => parseAnimales(animales).map((item) => ({
    ...item,
    diio: normalizarTexto(item.diio || item.identificadorFinca),
    identificadorFinca: normalizarTexto(item.diio || item.identificadorFinca),
    objetivoProductivo: prepararObjetivoProductivo(item.objetivoProductivo)
}));

const codigosCompra = (animales = [], campo) => animales
    .map((item) => normalizarTexto(item[campo]))
    .filter(Boolean);

const crearFiltroEspecie = (especie) => {
    if (especie === 'Bovino') return { $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] };
    if (especie === 'Porcino') return { especie };
    return {};
};

const validarAnimalesCompra = async (animales = [], compraIdIgnorada = null) => {
    if (!Array.isArray(animales) || animales.length === 0) {
        return { valido: false, status: 400, mensaje: 'Debe agregar al menos un animal' };
    }

    const detalleInvalido = animales.find((item) => (
        !item.sexo
        || Number(item.pesoCompraKg) <= 0
        || Number(item.precioKg) <= 0
        || !normalizarTexto(item.diio)
    ));
    if (detalleInvalido) {
        return {
            valido: false,
            status: 400,
            mensaje: 'Cada animal debe tener DIIO, sexo, objetivo productivo, peso de compra y precio por kg mayor que cero'
        };
    }

    const identificadores = codigosCompra(animales, 'identificadorFinca');
    const diios = codigosCompra(animales, 'diio');
    const identificadoresFinales = animales.map((item) => normalizarTexto(item.identificadorFinca || item.diio)).filter(Boolean);

    if (identificadoresFinales.length !== new Set(identificadoresFinales).size) {
        return { valido: false, status: 400, mensaje: 'No puedes repetir identificadores dentro de la misma compra' };
    }

    if (diios.length && diios.length !== new Set(diios).size) {
        return { valido: false, status: 400, mensaje: 'No puedes repetir DIIO dentro de la misma compra' };
    }

    const filtroDuplicado = {
        $or: [
            ...(identificadoresFinales.length ? [{ identificadorFinca: { $in: identificadoresFinales } }] : []),
            ...(identificadores.length ? [{ identificadorFinca: { $in: identificadores } }] : []),
            ...(diios.length ? [{ diio: { $in: diios } }] : [])
        ]
    };
    if (compraIdIgnorada) filtroDuplicado.compraId = { $ne: compraIdIgnorada };

    const duplicado = await Animal.findOne(filtroDuplicado).select('diio identificadorFinca');

    if (duplicado) {
        return {
            valido: false,
            status: 400,
            mensaje: `Ya existe un animal con identificador ${duplicado.diio || duplicado.identificadorFinca}`
        };
    }

    return { valido: true };
};

const validarLoteRapidoCompra = (animales, loteRapido) => {
    if (!loteRapido) return null;
    const objetivoLote = prepararObjetivoProductivo(loteRapido.objetivoProductivo);
    if (objetivoLote === 'SIN_DEFINIR') {
        const error = new Error('Selecciona un objetivo productivo para crear el lote.');
        error.status = 400;
        throw error;
    }
    if (!normalizarTexto(loteRapido.nombre)) {
        const error = new Error('Indica el nombre del lote.');
        error.status = 400;
        throw error;
    }
    if (animales.some((item) => item.objetivoProductivo !== objetivoLote)) {
        const error = new Error('Todos los animales deben tener el mismo objetivo productivo para crear el lote.');
        error.status = 400;
        throw error;
    }
    return { nombre: normalizarTexto(loteRapido.nombre), objetivoProductivo: objetivoLote };
};

const validarObjetivosCompraEnFinca = async ({ fincaId, especie, animales }) => {
    const objetivos = [...new Set(animales.map((item) => item.objetivoProductivo))];
    await Promise.all(objetivos.map((objetivoProductivo) => validarObjetivoProductivoFinca({
        fincaId,
        especie,
        objetivoProductivo
    })));
};

const crearAnimalesCompra = async (compra, usuarioId) => {
    const animalesActualizados = [];
    const cantidadNuevos = (compra.animales || []).filter((item) => !item.animal).length;
    if (cantidadNuevos > 0) {
        await asegurarPuedeCrearAnimal({
            especie: compra.especie || 'Bovino',
            cantidad: cantidadNuevos
        });
    }

    for (const item of compra.animales || []) {
        const proporcion = compra.montoCalculado ? Number(item.subtotal || 0) / compra.montoCalculado : 0;
        const montoAsignado = compra.montoTotal ? compra.montoTotal * proporcion : item.subtotal;

        if (item.animal) {
            animalesActualizados.push(item);
            continue;
        }

        const identificador = normalizarTexto(item.identificadorFinca || item.diio);
        const animal = await Animal.create({
            identificadorFinca: identificador,
            diio: normalizarTexto(item.diio) || undefined,
            especie: compra.especie || 'Bovino',
            nombre: item.nombre,
            sexo: item.sexo,
            objetivoProductivo: item.objetivoProductivo,
            raza: item.raza,
            fechaNacimiento: item.fechaNacimiento,
            categoria: obtenerCategoriaAnimal({ especie: compra.especie || 'Bovino', sexo: item.sexo, fechaNacimiento: item.fechaNacimiento }),
            pesoCompra: item.pesoCompraKg,
            pesoActual: item.pesoCompraKg,
            precioCompraPorKg: item.precioKg,
            montoCompra: montoAsignado,
            fechaCompra: compra.fechaCompra,
            proveedorCompra: compra.proveedor,
            compraId: compra._id,
            estado: 'Activo',
            origenGenealogico: 'Externo',
            observaciones: item.observaciones
        });

        item.animal = animal._id;
        animalesActualizados.push(item);

        await upsertEventoAnimal({
            animal: animal._id,
            tipoEvento: 'Compra',
            fecha: compra.fechaCompra,
            titulo: 'Animal comprado',
            descripcion: `Compra registrada por ₡${Number(montoAsignado || 0).toLocaleString('es-CR')} con peso de ${item.pesoCompraKg} kg.`,
            moduloOrigen: 'Compras',
            referenciaId: compra._id,
            creadoPor: usuarioId,
            metadata: {
                proveedor: compra.proveedor,
                pesoCompraKg: item.pesoCompraKg,
                precioKg: item.precioKg,
                subtotal: item.subtotal,
                montoAsignado,
                montoFinalCompra: compra.montoFinal,
                ajusteMontoCompra: compra.ajusteMonto,
                compraAnimal: compra._id,
                objetivoProductivo: item.objetivoProductivo
            }
        });
    }

    compra.animales = animalesActualizados;
    await compra.save();
};

const crearMovimientoCompra = async (compra) => {
    if (compra.estado !== 'Confirmada') return;

    await MovimientoFinanciero.findOneAndUpdate(
        { referenciaId: compra._id, referenciaModelo: 'CompraAnimal' },
        {
            fecha: compra.fechaCompra,
            tipoMovimiento: 'Compra de animales',
            naturaleza: 'Egreso',
            categoria: obtenerCategoriaCompraAnimales(compra.especie),
            descripcion: `Compra de ${compra.especie === 'Porcino' ? 'porcino(s)' : 'bovino(s)'} a ${compra.proveedor}`,
            producto: compra.especie === 'Porcino' ? 'Porcinos comprados' : 'Bovinos comprados',
            cantidad: compra.pesoTotalKg,
            unidad: 'KG',
            precioUnitario: compra.pesoTotalKg ? compra.montoTotal / compra.pesoTotalKg : undefined,
            monto: compra.montoTotal,
            moneda: 'CRC',
            proveedor: compra.proveedor,
            destinoUso: DESTINO_USO_MOVIMIENTOS_ANIMALES,
            comprobante: compra.comprobanteUrl,
            observaciones: compra.observaciones,
            referenciaId: compra._id,
            referenciaModelo: 'CompraAnimal'
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

const aplicarCompraConfirmada = async (compra, usuarioId, loteRapido = null) => {
    if (compra.estado !== 'Confirmada') return;
    await crearAnimalesCompra(compra, usuarioId);
    if (loteRapido) {
        if (compra.loteAsignado) {
            const error = new Error('Esta compra ya fue asignada a un lote.');
            error.status = 409;
            throw error;
        }
        const lote = await crearLoteRapido({
            nombre: loteRapido.nombre,
            especie: compra.especie,
            proposito: loteRapido.objetivoProductivo,
            fechaInicio: compra.fechaCompra
        }, usuarioId);
        await agregarAnimalesAlLote(lote._id, {
            animales: compra.animales.map((item) => item.animal).filter(Boolean),
            fechaEntrada: compra.fechaCompra,
            motivoEntrada: `Ingreso desde compra ${compra._id}`,
            permitirMover: false
        }, usuarioId);
        compra.loteAsignado = lote._id;
        await compra.save();
    }
    await crearMovimientoCompra(compra);
};

const asegurarCompraReversible = async (compra) => {
    const ids = (compra.animales || []).map((item) => item.animal).filter(Boolean);
    const pertenencia = ids.length ? await PertenenciaLote.findOne({ animal: { $in: ids } }).populate('lote', 'codigo nombre') : null;
    if (pertenencia) {
        const error = new Error(`No se puede revertir la compra porque sus animales tienen historial en el lote ${pertenencia.lote?.codigo || 'asignado'}.`);
        error.status = 409;
        throw error;
    }
    const bloqueado = await Animal.findOne({
        _id: { $in: ids },
        compraId: compra._id,
        estado: { $in: ['Vendido', 'Muerto'] }
    });

    if (bloqueado) {
        const error = new Error(`No se puede revertir la compra porque el animal ${bloqueado.diio || bloqueado.identificadorFinca} ya fue vendido o marcado como muerto.`);
        error.status = 400;
        throw error;
    }
};

const revertirCompra = async (compra) => {
    await asegurarCompraReversible(compra);
    const ids = (compra.animales || []).map((item) => item.animal).filter(Boolean);

    await Animal.deleteMany({
        _id: { $in: ids },
        compraId: compra._id,
        estado: 'Activo'
    });
    await MovimientoFinanciero.deleteMany({ referenciaId: compra._id, referenciaModelo: 'CompraAnimal' });
    await eliminarEventosPorReferencia({ moduloOrigen: 'Compras', referenciaId: compra._id });
};

compraAnimalCtrl.getCompras = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, proveedor, estado, especie } = req.query;
        const filtro = crearFiltroEspecie(especie);

        if (fechaInicio || fechaFin) {
            filtro.fechaCompra = {};
            if (fechaInicio) filtro.fechaCompra.$gte = new Date(fechaInicio);
            if (fechaFin) {
                const fin = new Date(fechaFin);
                fin.setUTCHours(23, 59, 59, 999);
                filtro.fechaCompra.$lte = fin;
            }
        }
        if (proveedor) filtro.proveedor = { $regex: proveedor, $options: 'i' };
        if (estado) filtro.estado = estado;

        const compras = await poblarCompra(CompraAnimal.find(filtro).sort({ fechaCompra: -1, createdAt: -1 }));
        res.json(compras);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener compras', error: error.message });
    }
};

compraAnimalCtrl.getCompraById = async (req, res) => {
    try {
        const compra = await poblarCompra(CompraAnimal.findById(req.params.id));
        if (!compra) return res.status(404).json({ mensaje: 'Compra no encontrada' });
        res.json(compra);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener compra', error: error.message });
    }
};

compraAnimalCtrl.crearCompra = async (req, res) => {
    try {
        const animales = prepararAnimalesCompra(req.body.animales);
        const loteRapido = validarLoteRapidoCompra(animales, parseLoteRapido(req.body.loteRapido));
        const validacion = await validarAnimalesCompra(animales);
        if (!validacion.valido) return res.status(validacion.status).json({ mensaje: validacion.mensaje });
        await validarObjetivosCompraEnFinca({
            fincaId: req.fincaId,
            especie: req.body.especie || 'Bovino',
            animales
        });

        const compra = new CompraAnimal({
            ...req.body,
            animales,
            comprobanteUrl: urlArchivoOrganizacion('compras', req.file),
            registradoPor: req.usuario?.id
        });
        const compraGuardada = await compra.save();
        await aplicarCompraConfirmada(compraGuardada, req.usuario?.id, loteRapido);

        const compraPoblada = await poblarCompra(CompraAnimal.findById(compraGuardada._id));
        res.status(201).json(compraPoblada);
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al crear compra', error: error.message });
    }
};

compraAnimalCtrl.actualizarCompra = async (req, res) => {
    try {
        const compraAnterior = await CompraAnimal.findById(req.params.id);
        if (!compraAnterior) return res.status(404).json({ mensaje: 'Compra no encontrada' });
        if (compraAnterior.estado === 'Anulada') return res.status(400).json({ mensaje: 'No se puede editar una compra anulada' });

        if (req.body.loteRapido) return res.status(409).json({ mensaje: 'El lote rápido solo puede crearse al registrar una compra nueva.' });
        const animales = prepararAnimalesCompra(req.body.animales);
        const validacion = await validarAnimalesCompra(animales, req.params.id);
        if (!validacion.valido) {
            return res.status(validacion.status).json({ mensaje: validacion.mensaje });
        }
        await validarObjetivosCompraEnFinca({
            fincaId: req.fincaId,
            especie: req.body.especie || compraAnterior.especie || 'Bovino',
            animales
        });

        await revertirCompra(compraAnterior);
        const datos = {
            ...req.body,
            animales,
            comprobanteUrl: urlArchivoOrganizacion('compras', req.file) || compraAnterior.comprobanteUrl
        };
        const compra = await CompraAnimal.findByIdAndUpdate(req.params.id, datos, { new: true, runValidators: true });
        await aplicarCompraConfirmada(compra, req.usuario?.id);
        const compraPoblada = await poblarCompra(CompraAnimal.findById(compra._id));
        res.json(compraPoblada);
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al actualizar compra', error: error.message });
    }
};

compraAnimalCtrl.anularCompra = async (req, res) => {
    try {
        const compra = await CompraAnimal.findById(req.params.id);
        if (!compra) return res.status(404).json({ mensaje: 'Compra no encontrada' });
        if (compra.estado === 'Anulada') return res.json(compra);

        await revertirCompra(compra);
        compra.estado = 'Anulada';
        compra.observaciones = [compra.observaciones, req.body?.motivoAnulacion].filter(Boolean).join(' | ');
        await compra.save();
        const compraPoblada = await poblarCompra(CompraAnimal.findById(compra._id));
        res.json(compraPoblada);
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al anular compra', error: error.message });
    }
};

compraAnimalCtrl.deleteCompra = async (req, res) => {
    try {
        const compra = await CompraAnimal.findById(req.params.id);
        if (!compra) return res.status(404).json({ mensaje: 'Compra no encontrada' });

        await revertirCompra(compra);
        await CompraAnimal.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Compra eliminada' });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: error.message || 'Error al eliminar compra', error: error.message });
    }
};

compraAnimalCtrl.asignarCompraALote = async (req, res) => {
    try {
        const compra = await CompraAnimal.findById(req.params.id);
        if (!compra) return res.status(404).json({ mensaje: 'Compra no encontrada' });
        if (compra.estado !== 'Confirmada') return res.status(409).json({ mensaje: 'Solo una compra confirmada puede asignarse a un lote.' });
        if (compra.loteAsignado) return res.status(409).json({ mensaje: 'Esta compra ya fue asignada a un lote.' });
        const animales = (compra.animales || []).map((item) => item.animal).filter(Boolean);
        const pertenenciaExistente = await PertenenciaLote.findOne({ animal: { $in: animales } });
        if (pertenenciaExistente) return res.status(409).json({ mensaje: 'Esta compra ya tiene animales con historial de lote.' });
        const pertenencias = await agregarAnimalesAlLote(req.body.lote, {
            animales,
            fechaEntrada: req.body.fechaEntrada || compra.fechaCompra,
            motivoEntrada: `Ingreso desde compra ${compra._id}`,
            permitirMover: false
        }, req.usuario?.id);
        compra.loteAsignado = req.body.lote;
        await compra.save();
        res.json(await poblarCompra(CompraAnimal.findById(compra._id)));
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'No fue posible asignar la compra al lote', codigo: error.codigo });
    }
};

compraAnimalCtrl.getResumenCompras = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, especie } = req.query;
        const filtro = { estado: 'Confirmada', ...crearFiltroEspecie(especie) };
        if (fechaInicio || fechaFin) {
            filtro.fechaCompra = {};
            if (fechaInicio) filtro.fechaCompra.$gte = new Date(fechaInicio);
            if (fechaFin) {
                const fin = new Date(fechaFin);
                fin.setUTCHours(23, 59, 59, 999);
                filtro.fechaCompra.$lte = fin;
            }
        }

        const compras = await CompraAnimal.find(filtro).populate('animales.animal').lean();
        const totalComprado = compras.reduce((total, compra) => total + (compra.montoTotal || 0), 0);
        const totalKgComprados = compras.reduce((total, compra) => total + (compra.pesoTotalKg || 0), 0);
        const totalAnimalesComprados = compras.reduce((total, compra) => total + (compra.totalAnimales || 0), 0);

        res.json({
            totalComprado,
            totalKgComprados,
            precioPromedioKg: totalKgComprados ? totalComprado / totalKgComprados : 0,
            totalCompras: compras.length,
            totalAnimalesComprados
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener resumen de compras', error: error.message });
    }
};

module.exports = compraAnimalCtrl;
