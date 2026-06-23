const Animal = require('../models/Animal');
const CompraAnimal = require('../models/CompraAnimal');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const { eliminarEventosPorReferencia, upsertEventoAnimal } = require('../services/eventoAnimal-service');

const compraAnimalCtrl = {};

const poblarCompra = (query) => query
    .populate('animales.animal')
    .populate('registradoPor', 'nombre apellido correo rol');

const normalizarTexto = (valor) => String(valor || '').trim();

const parseAnimales = (animales) => {
    if (typeof animales === 'string') return JSON.parse(animales);
    return animales;
};

const codigosCompra = (animales = [], campo) => animales
    .map((item) => normalizarTexto(item[campo]))
    .filter(Boolean);

const validarAnimalesCompra = async (animales = [], compraIdIgnorada = null) => {
    if (!Array.isArray(animales) || animales.length === 0) {
        return { valido: false, status: 400, mensaje: 'Debe agregar al menos un animal' };
    }

    const detalleInvalido = animales.find((item) => (
        !item.sexo
        || Number(item.pesoCompraKg) <= 0
        || Number(item.precioKg) <= 0
        || !normalizarTexto(item.identificadorFinca || item.diio)
    ));
    if (detalleInvalido) {
        return {
            valido: false,
            status: 400,
            mensaje: 'Cada animal debe tener identificador o DIIO, sexo, peso de compra y precio por kg mayor que cero'
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

const crearAnimalesCompra = async (compra, usuarioId) => {
    const animalesActualizados = [];

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
            nombre: item.nombre,
            sexo: item.sexo,
            raza: item.raza,
            fechaNacimiento: item.fechaNacimiento,
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
            moduloOrigen: 'Finanzas',
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
                compraAnimal: compra._id
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
            categoria: 'Compra de animales',
            descripcion: `Compra de animal(es) a ${compra.proveedor}`,
            monto: compra.montoTotal,
            moneda: 'CRC',
            proveedor: compra.proveedor,
            comprobante: compra.comprobanteUrl,
            observaciones: compra.observaciones,
            referenciaId: compra._id,
            referenciaModelo: 'CompraAnimal'
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

const aplicarCompraConfirmada = async (compra, usuarioId) => {
    if (compra.estado !== 'Confirmada') return;
    await crearAnimalesCompra(compra, usuarioId);
    await crearMovimientoCompra(compra);
};

const asegurarCompraReversible = async (compra) => {
    const ids = (compra.animales || []).map((item) => item.animal).filter(Boolean);
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
    await eliminarEventosPorReferencia({ moduloOrigen: 'Finanzas', referenciaId: compra._id });
};

compraAnimalCtrl.getCompras = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, proveedor, estado } = req.query;
        const filtro = {};

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
        const animales = parseAnimales(req.body.animales);
        const validacion = await validarAnimalesCompra(animales);
        if (!validacion.valido) return res.status(validacion.status).json({ mensaje: validacion.mensaje });

        const compra = new CompraAnimal({
            ...req.body,
            animales,
            comprobanteUrl: req.file ? `/uploads/compras/${req.file.filename}` : undefined,
            registradoPor: req.usuario?.id
        });
        const compraGuardada = await compra.save();
        await aplicarCompraConfirmada(compraGuardada, req.usuario?.id);

        const compraPoblada = await poblarCompra(CompraAnimal.findById(compraGuardada._id));
        res.status(201).json(compraPoblada);
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al crear compra', error: error.message });
    }
};

compraAnimalCtrl.actualizarCompra = async (req, res) => {
    try {
        const compraAnterior = await CompraAnimal.findById(req.params.id);
        if (!compraAnterior) return res.status(404).json({ mensaje: 'Compra no encontrada' });
        if (compraAnterior.estado === 'Anulada') return res.status(400).json({ mensaje: 'No se puede editar una compra anulada' });

        const animales = parseAnimales(req.body.animales);
        const validacion = await validarAnimalesCompra(animales, req.params.id);
        if (!validacion.valido) {
            return res.status(validacion.status).json({ mensaje: validacion.mensaje });
        }

        await revertirCompra(compraAnterior);
        const datos = {
            ...req.body,
            animales,
            comprobanteUrl: req.file ? `/uploads/compras/${req.file.filename}` : compraAnterior.comprobanteUrl
        };
        const compra = await CompraAnimal.findByIdAndUpdate(req.params.id, datos, { new: true, runValidators: true });
        await aplicarCompraConfirmada(compra, req.usuario?.id);
        const compraPoblada = await poblarCompra(CompraAnimal.findById(compra._id));
        res.json(compraPoblada);
    } catch (error) {
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

compraAnimalCtrl.getResumenCompras = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        const filtro = { estado: 'Confirmada' };
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
