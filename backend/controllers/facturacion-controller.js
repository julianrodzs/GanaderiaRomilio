const Organizacion = require('../models/Organizacion');
const {
    catalogoFacturacion,
    crearSesionCheckout,
    crearSesionPortal,
    procesarWebhookStripe
} = require('../services/facturacion-service');

const obtenerEstadoFacturacion = async (req, res) => {
    try {
        const organizacion = await Organizacion.findById(req.organizacionId).lean();
        res.json({
            plan: {
                codigo: organizacion.plan?.codigo,
                estado: organizacion.plan?.estado,
                proveedorPago: organizacion.plan?.proveedorPago || null,
                fechaRenovacion: organizacion.plan?.fechaRenovacion || null,
                fechaExpiracion: organizacion.plan?.fechaExpiracion || null,
                administrable: Boolean(organizacion.plan?.clientePagoId)
            },
            catalogo: catalogoFacturacion(),
            stripeConfigurado: Boolean(process.env.STRIPE_SECRET_KEY)
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'No se pudo consultar la facturación.', error: error.message });
    }
};

const iniciarCheckout = async (req, res) => {
    try {
        const organizacion = await Organizacion.findById(req.organizacionId);
        const sesion = await crearSesionCheckout({
            organizacion,
            usuario: req.usuario,
            codigoPlan: String(req.body.codigoPlan || '').toUpperCase()
        });
        res.status(201).json({ id: sesion.id, url: sesion.url });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: error.message, code: error.code });
    }
};

const abrirPortal = async (req, res) => {
    try {
        const organizacion = await Organizacion.findById(req.organizacionId);
        const sesion = await crearSesionPortal(organizacion);
        res.status(201).json({ url: sesion.url });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: error.message, code: error.code });
    }
};

const webhookStripe = async (req, res) => {
    try {
        const resultado = await procesarWebhookStripe({
            cuerpo: req.body,
            firma: req.get('stripe-signature')
        });
        res.json({ recibido: true, ...resultado });
    } catch (error) {
        const firmaInvalida = /signature|payload/i.test(error.message || '');
        res.status(error.status || (firmaInvalida ? 400 : 500)).json({ mensaje: error.message });
    }
};

module.exports = { abrirPortal, iniciarCheckout, obtenerEstadoFacturacion, webhookStripe };
