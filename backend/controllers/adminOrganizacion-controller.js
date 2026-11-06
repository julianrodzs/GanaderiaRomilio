const Finca = require('../models/Finca');
const { Membresia } = require('../models/Membresia');
const Organizacion = require('../models/Organizacion');
const Pago = require('../models/PagoSuscripcion');
const suscripciones = require('../services/suscripcionManual-service');
const { resolverSuscripcion } = require('../services/suscripcion-estado-service');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const {
    ErrorAprovisionamiento,
    aprovisionarOrganizacion
} = require('../services/aprovisionamientoOrganizacion-service');

const listarOrganizaciones = async (req, res) => {
    try {
        const organizaciones = await Organizacion.find({})
            .populate('fincaPrincipal', 'nombre codigo ubicacion lineasProductivas estado')
            .sort({ createdAt: -1 })
            .lean();

        const ids = organizaciones.map((item) => item._id);
        const [membresias, fincas] = await Promise.all([
            Membresia.aggregate([
                { $match: { organizacionId: { $in: ids }, estado: 'Activo' } },
                { $group: { _id: '$organizacionId', total: { $sum: 1 } } }
            ]),
            Finca.aggregate([
                { $match: { organizacionId: { $in: ids }, estado: 'Activa' } },
                { $group: { _id: '$organizacionId', total: { $sum: 1 } } }
            ]).option({ omitirAislamientoOrganizacion: true })
        ]);
        const usuariosPorOrganizacion = new Map(membresias.map((item) => [String(item._id), item.total]));
        const fincasPorOrganizacion = new Map(fincas.map((item) => [String(item._id), item.total]));

        const pagos = await Pago.aggregate([
            { $match: { organizacionId: { $in: ids }, estado: 'REGISTRADO' } },
            { $sort: { fechaPago: -1, _id: -1 } },
            { $group: { _id: '$organizacionId', ultimo: { $first: { fechaPago: '$fechaPago', monto: '$monto', moneda: '$moneda', metodoPago: '$metodoPago' } } } }
        ]).option({ omitirAislamientoOrganizacion: true });
        const pagoPorOrg = new Map(pagos.map((p) => [String(p._id), p.ultimo]));
        res.json(organizaciones.map((organizacion) => ({
            ...organizacion,
            suscripcion: resolverSuscripcion(organizacion),
            ultimoPagoRegistrado: pagoPorOrg.get(String(organizacion._id)) || null,
            usuariosActivos: usuariosPorOrganizacion.get(String(organizacion._id)) || 0,
            fincasActivas: fincasPorOrganizacion.get(String(organizacion._id)) || 0
        })));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al consultar las organizaciones', error: error.message });
    }
};

const crearOrganizacion = async (req, res) => {
    try {
        const resultado = await aprovisionarOrganizacion(req.body, req.usuarioPlataforma.id);
        req.auditoriaOrganizacionId = resultado.organizacion._id.toString();
        req.auditoriaEvento = 'Organización cliente creada';
        req.auditoriaDespues = {
            organizacionId: resultado.organizacion._id,
            plan: resultado.organizacion.plan?.codigo,
            fincaPrincipal: resultado.finca?._id
        };
        res.status(201).json({
            mensaje: 'Cliente SaaS creado correctamente.',
            ...resultado
        });
    } catch (error) {
        const status = error.status || (error instanceof ErrorAprovisionamiento ? error.status : 500);
        res.status(status).json({
            mensaje: error.status || error instanceof ErrorAprovisionamiento
                ? error.message
                : 'No se pudo crear el cliente SaaS.',
            code: error.code,
            detalles: error.detalles,
            ...(process.env.NODE_ENV !== 'production' ? { error: error.message } : {})
        });
    }
};

const responderError = (res, error) => res.status(error.status || (error.code === 11000 ? 409 : 500)).json({
    mensaje: error.status ? error.message : error.code === 11000 ? 'Este comprobante u operación ya está registrado.' : 'No se pudo procesar la suscripción.',
    code: error.code, detalles: error.detalles
});
const registrarPago = async (req, res) => {
    try { const resultado = await suscripciones.registrarPago(req.params.id, req.body, req.usuarioPlataforma.id); res.status(resultado.duplicado ? 200 : 201).json(resultado); }
    catch (e) { responderError(res, e); }
};
const cambiarSuscripcion = async (req, res) => {
    try { res.json({ organizacion: await suscripciones.cambiarSuscripcion(req.params.id, req.body, req.usuarioPlataforma.id) }); }
    catch (e) { responderError(res, e); }
};
const anularPago = async (req, res) => {
    try { res.json(await suscripciones.anularPago(req.params.id, req.params.pagoId, req.body, req.usuarioPlataforma.id)); }
    catch (e) { responderError(res, e); }
};
const listarPagos = async (req, res) => {
    try {
        const datos = await suscripciones.listarPagos(req.params.id, req.query);
        if (!await Organizacion.exists({ _id: req.params.id })) return res.status(404).json({ mensaje: 'Organización no encontrada.' });
        res.json(datos);
    } catch (e) { responderError(res, e); }
};
const resumenCartera = async (req, res) => {
    try {
        const orgs = await Organizacion.find({}).lean(), ahora = new Date();
        const { limitesDiaEnZona, claveDiaEnZona } = require('../services/fechaZonaHoraria-service');
        const dia = claveDiaEnZona(ahora, 'America/Costa_Rica');
        const inicioMes = limitesDiaEnZona(new Date(`${dia.slice(0, 7)}-01T12:00:00Z`), 'America/Costa_Rica').inicio;
        const ingresos = await Pago.aggregate([{ $match: { organizacionId: { $in: orgs.map((o) => o._id) }, estado: 'REGISTRADO', fechaPago: { $gte: inicioMes, $lte: ahora } } },
            { $group: { _id: '$moneda', monto: { $sum: '$monto' } } }]).option({ omitirAislamientoOrganizacion: true });
        const estados = orgs.filter((o) => o.estado === 'Activa').map((o) => resolverSuscripcion(o, ahora));
        res.json({ activas: estados.filter((s) => s.estadoSuscripcion === 'ACTIVA').length,
            prueba: estados.filter((s) => s.estadoSuscripcion === 'PRUEBA').length,
            porVencer: estados.filter((s) => s.diasParaVencer !== null && s.diasParaVencer >= 0 && s.diasParaVencer <= 7 && s.permiteOperar).length,
            vencidas: estados.filter((s) => ['EN_GRACIA', 'VENCIDA'].includes(s.estadoSuscripcion)).length,
            ingresos: { CRC: ingresos.find((r) => r._id === 'CRC')?.monto || 0, USD: ingresos.find((r) => r._id === 'USD')?.monto || 0 } });
    } catch (e) { responderError(res, e); }
};

const cambiarEstadoOrganizacion = async (req, res) => {
    try {
        const { estado } = req.body;
        if (!['Activa', 'Suspendida', 'Inactiva'].includes(estado)) {
            return res.status(400).json({ mensaje: 'Estado de organización no válido.' });
        }

        let anterior;
        const organizacion = await ejecutarEnTransaccion(async (session) => {
            const o = await Organizacion.findById(req.params.id).session(session);
            if (!o) throw suscripciones.error('Organización no encontrada.', 404);
            anterior = { estado: o.estado }; o.estado = estado;
            await o.save({ session });
            await suscripciones.auditar(o, req.usuarioPlataforma.id, 'Estado de organización actualizado', anterior, { estado }, session);
            return o;
        });
        req.auditoriaOrganizacionId = organizacion._id.toString();
        req.auditoriaEvento = 'Estado de organización actualizado';
        req.auditoriaAntes = { estado: anterior.estado };
        req.auditoriaDespues = { estado: organizacion.estado };

        res.json({ mensaje: `Organización ${estado.toLowerCase()}.`, organizacion });
    } catch (error) {
        responderError(res, error);
    }
};

module.exports = {
    cambiarEstadoOrganizacion,
    registrarPago, cambiarSuscripcion, anularPago, listarPagos, resumenCartera,
    crearOrganizacion,
    listarOrganizaciones
};
