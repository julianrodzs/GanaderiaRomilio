const Animal = require('../models/Animal');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const VentaAnimal = require('../models/VentaAnimal');
const { eliminarEventosPorReferencia, upsertEventoAnimal } = require('../services/eventoAnimal-service');

const ventaAnimalCtrl = {};

const poblarVenta = (query) => query
    .populate('animales.animal')
    .populate('registradoPor', 'nombre apellido correo rol');

const idsAnimalesVenta = (animales = []) => animales.map((item) => item.animal?.toString?.() || item.animal).filter(Boolean);

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

const validarAnimalesVenta = async (animales = [], ventaIdIgnorada = null) => {
    if (!Array.isArray(animales) || animales.length === 0) {
        return { valido: false, status: 400, mensaje: 'Debe agregar al menos un animal' };
    }

    const ids = idsAnimalesVenta(animales);
    if (ids.length !== new Set(ids).size) {
        return { valido: false, status: 400, mensaje: 'No puedes repetir el mismo animal en una venta' };
    }

    const animalesEncontrados = await Animal.find({ _id: { $in: ids } });
    if (animalesEncontrados.length !== ids.length) {
        return { valido: false, status: 404, mensaje: 'Uno o más animales no existen' };
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

    const ventaDuplicada = await VentaAnimal.findOne(filtroDuplicado);
    if (ventaDuplicada) {
        return { valido: false, status: 400, mensaje: 'Uno o más animales ya están en una venta activa' };
    }

    const detalleInvalido = animales.find((item) => Number(item.pesoVentaKg) <= 0 || Number(item.precioKg) <= 0);
    if (detalleInvalido) {
        return { valido: false, status: 400, mensaje: 'Peso de venta y precio por kg deben ser mayores que cero' };
    }

    return { valido: true };
};

const crearEventosVenta = async (venta, usuarioId) => {
    await Promise.all((venta.animales || []).map((item) => upsertEventoAnimal({
        animal: item.animal,
        tipoEvento: 'Venta',
        fecha: venta.fechaVenta,
        titulo: 'Animal vendido',
        descripcion: `Venta registrada por ₡${Number(item.subtotal || 0).toLocaleString('es-CR')} con peso de ${item.pesoVentaKg} kg`,
        moduloOrigen: 'Ventas',
        referenciaId: venta._id,
        creadoPor: usuarioId,
        metadata: {
            comprador: venta.comprador,
            pesoVentaKg: item.pesoVentaKg,
            precioKg: item.precioKg,
            subtotal: item.subtotal
        }
    })));
};

const aplicarVentaConfirmada = async (venta, usuarioId) => {
    if (venta.estado !== 'Confirmada') return;

    await Promise.all(venta.animales.map((item) => Animal.findByIdAndUpdate(item.animal, {
        estado: 'Vendido',
        fechaVenta: venta.fechaVenta,
        pesoVenta: item.pesoVentaKg,
        precioVentaPorKg: item.precioKg,
        montoVenta: item.subtotal,
        comprador: venta.comprador,
        ventaId: venta._id
    })));

    await crearEventosVenta(venta, usuarioId);
    await MovimientoFinanciero.findOneAndUpdate(
        { referenciaId: venta._id, referenciaModelo: 'VentaAnimal' },
        {
            fecha: venta.fechaVenta,
            tipoMovimiento: 'Venta de animales',
            naturaleza: 'Ingreso',
            categoria: 'Ingresos',
            descripcion: `Venta de animal(es) a ${venta.comprador}`,
            monto: venta.montoTotal,
            moneda: 'CRC',
            comprobante: venta.comprobanteUrl,
            observaciones: venta.observaciones,
            referenciaId: venta._id,
            referenciaModelo: 'VentaAnimal'
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

const revertirVenta = async (venta) => {
    await Promise.all(venta.animales.map((item) => Animal.findOneAndUpdate(
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
        }
    )));

    await MovimientoFinanciero.deleteMany({ referenciaId: venta._id, referenciaModelo: 'VentaAnimal' });
    await eliminarEventosPorReferencia({ moduloOrigen: 'Ventas', referenciaId: venta._id });
};

ventaAnimalCtrl.getVentas = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, comprador, estado } = req.query;
        const filtro = {};

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
        const validacion = await validarAnimalesVenta(animales);
        if (!validacion.valido) return res.status(validacion.status).json({ mensaje: validacion.mensaje });

        const venta = new VentaAnimal({
            ...req.body,
            animales,
            comprobanteUrl: req.file ? `/uploads/ventas/${req.file.filename}` : undefined,
            registradoPor: req.usuario?.id
        });
        const ventaGuardada = await venta.save();
        await aplicarVentaConfirmada(ventaGuardada, req.usuario?.id);

        const ventaPoblada = await poblarVenta(VentaAnimal.findById(ventaGuardada._id));
        res.status(201).json(ventaPoblada);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear venta', error: error.message });
    }
};

ventaAnimalCtrl.actualizarVenta = async (req, res) => {
    try {
        const ventaAnterior = await VentaAnimal.findById(req.params.id);
        if (!ventaAnterior) return res.status(404).json({ mensaje: 'Venta no encontrada' });
        if (ventaAnterior.estado === 'Anulada') {
            return res.status(400).json({ mensaje: 'No se puede editar una venta anulada' });
        }

        await revertirVenta(ventaAnterior);
        const animales = typeof req.body.animales === 'string' ? JSON.parse(req.body.animales) : req.body.animales;
        const validacion = await validarAnimalesVenta(animales, req.params.id);
        if (!validacion.valido) {
            await aplicarVentaConfirmada(ventaAnterior, req.usuario?.id);
            return res.status(validacion.status).json({ mensaje: validacion.mensaje });
        }

        const datos = {
            ...req.body,
            animales,
            comprobanteUrl: req.file ? `/uploads/ventas/${req.file.filename}` : ventaAnterior.comprobanteUrl
        };
        const venta = await VentaAnimal.findByIdAndUpdate(req.params.id, datos, { new: true, runValidators: true });
        await aplicarVentaConfirmada(venta, req.usuario?.id);
        const ventaPoblada = await poblarVenta(VentaAnimal.findById(venta._id));
        res.json(ventaPoblada);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar venta', error: error.message });
    }
};

ventaAnimalCtrl.anularVenta = async (req, res) => {
    try {
        const venta = await VentaAnimal.findById(req.params.id);
        if (!venta) return res.status(404).json({ mensaje: 'Venta no encontrada' });
        if (venta.estado === 'Anulada') return res.json(venta);

        await revertirVenta(venta);
        venta.estado = 'Anulada';
        venta.observaciones = [venta.observaciones, req.body?.motivoAnulacion].filter(Boolean).join(' | ');
        await venta.save();
        const ventaPoblada = await poblarVenta(VentaAnimal.findById(venta._id));
        res.json(ventaPoblada);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al anular venta', error: error.message });
    }
};

ventaAnimalCtrl.deleteVenta = async (req, res) => {
    try {
        const venta = await VentaAnimal.findById(req.params.id);
        if (!venta) return res.status(404).json({ mensaje: 'Venta no encontrada' });

        await revertirVenta(venta);
        await VentaAnimal.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Venta eliminada' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar venta', error: error.message });
    }
};

ventaAnimalCtrl.getResumenVentas = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        const filtro = { estado: 'Confirmada' };
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
        const animalesVendidos = ventas.flatMap((venta) => (venta.animales || []).map((item) => ({
            ...item,
            fechaVenta: venta.fechaVenta,
            comprador: venta.comprador
        })));
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
            mapa[origen].montoTotal += item.subtotal || 0;
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
                precioKg: item.precioKg || 0,
                subtotal: item.subtotal || 0,
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
            totalAnimalesVendidos: animalesVendidos.length,
            ventasPorPeriodo: {
                totalVendido,
                totalKgVendidos,
                totalVentas: ventas.length,
                totalAnimalesVendidos: animalesVendidos.length,
                ventaPromedioPorAnimal: animalesVendidos.length ? totalVendido / animalesVendidos.length : 0,
                ticketPromedioVenta: ventas.length ? totalVendido / ventas.length : 0
            },
            precioKg: {
                promedio: totalKgVendidos ? totalVendido / totalKgVendidos : 0,
                minimo: animalesVendidos.length ? Math.min(...animalesVendidos.map((item) => item.precioKg || 0)) : 0,
                maximo: animalesVendidos.length ? Math.max(...animalesVendidos.map((item) => item.precioKg || 0)) : 0
            },
            ventasPorMes: Object.values(ventasPorMes).map((item) => ({
                ...item,
                precioPromedioKg: item.pesoTotalKg ? item.total / item.pesoTotalKg : 0
            })).sort((a, b) => a.mes.localeCompare(b.mes)),
            compradoresFrecuentes: Object.entries(compradores).map(([comprador, cantidad]) => ({ comprador, cantidad })),
            animalesVendidosPorCategoria: Object.entries(porCategoria).map(([categoria, cantidad]) => ({ categoria, cantidad })),
            ventasPorOrigen: Object.values(ventasPorOrigen).map((item) => ({
                origen: item.origen,
                animales: item.animales,
                pesoTotalKg: redondear(item.pesoTotalKg),
                montoTotal: redondear(item.montoTotal),
                precioPromedioKg: item.pesoTotalKg ? redondear(item.montoTotal / item.pesoTotalKg) : 0,
                mesesPromedioEnFinca: item.animalesConMeses ? redondear(item.mesesTotal / item.animalesConMeses) : 0
            })),
            rotacionInventarioVendido: {
                duracionPromedioMeses: redondear(duracionPromedioMeses),
                animalesConDuracion: rotacionAnimales.length,
                menorDuracion: rotacionAnimales.length ? Math.min(...rotacionAnimales.map((item) => item.mesesEnFinca)) : 0,
                mayorDuracion: rotacionAnimales.length ? Math.max(...rotacionAnimales.map((item) => item.mesesEnFinca)) : 0,
                detalle: rotacionAnimales.sort((a, b) => b.mesesEnFinca - a.mesesEnFinca)
            }
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener resumen de ventas', error: error.message });
    }
};

module.exports = ventaAnimalCtrl;
