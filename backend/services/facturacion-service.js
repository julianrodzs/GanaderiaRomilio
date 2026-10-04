const Stripe = require('stripe');
const EventoFacturacion = require('../models/EventoFacturacion');
const Organizacion = require('../models/Organizacion');
const { planesConfig } = require('../config/planes');

const codigosPlan = Object.keys(planesConfig);
const obtenerStripe = () => {
    if (!process.env.STRIPE_SECRET_KEY) {
        const error = new Error('Stripe no está configurado todavía.');
        error.status = 503;
        error.code = 'BILLING_NOT_CONFIGURED';
        throw error;
    }
    return new Stripe(process.env.STRIPE_SECRET_KEY);
};

const variablePrecio = (codigo) => `STRIPE_PRICE_${codigo}`;
const precioPlan = (codigo) => process.env[variablePrecio(codigo)] || '';
const planPorPrecio = (precioId) => codigosPlan.find((codigo) => precioPlan(codigo) === precioId);

const crearSesionCheckout = async ({ organizacion, usuario, codigoPlan }) => {
    if (!codigosPlan.includes(codigoPlan)) {
        const error = new Error('Plan solicitado no válido.'); error.status = 422; throw error;
    }
    if (organizacion.plan?.suscripcionPagoId) {
        const error = new Error('La organización ya tiene una suscripción. Administra el cambio desde el portal de pagos.');
        error.status = 409;
        error.code = 'BILLING_USE_PORTAL';
        throw error;
    }
    const precio = precioPlan(codigoPlan);
    if (!precio) {
        const error = new Error(`El precio de ${codigoPlan} no está configurado en Stripe.`); error.status = 503; error.code = 'BILLING_PRICE_NOT_CONFIGURED'; throw error;
    }
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
    const stripe = obtenerStripe();
    return stripe.checkout.sessions.create({
        mode: 'subscription',
        client_reference_id: String(organizacion._id),
        ...(organizacion.plan?.clientePagoId ? { customer: organizacion.plan.clientePagoId } : { customer_email: usuario.correo }),
        line_items: [{ price: precio, quantity: 1 }],
        success_url: `${frontend}/?facturacion=exito&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontend}/?facturacion=cancelada`,
        allow_promotion_codes: true,
        metadata: { organizacionId: String(organizacion._id), planCodigo: codigoPlan },
        subscription_data: { metadata: { organizacionId: String(organizacion._id), planCodigo: codigoPlan } }
    });
};

const crearSesionPortal = async (organizacion) => {
    if (!organizacion.plan?.clientePagoId) {
        const error = new Error('La organización todavía no tiene una suscripción administrable.'); error.status = 409; throw error;
    }
    return obtenerStripe().billingPortal.sessions.create({
        customer: organizacion.plan.clientePagoId,
        return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/?facturacion=portal`
    });
};

const estadoPlanStripe = (estado) => {
    if (estado === 'trialing') return 'Prueba';
    if (['active'].includes(estado)) return 'Activo';
    if (['canceled', 'incomplete_expired'].includes(estado)) return 'Cancelado';
    return 'Suspendido';
};

const fechaUnix = (valor) => Number(valor) > 0 ? new Date(Number(valor) * 1000) : null;
const obtenerFinPeriodo = (suscripcion) => suscripcion.current_period_end
    || suscripcion.items?.data?.map((item) => item.current_period_end).filter(Boolean).sort((a, b) => b - a)[0];

const resolverOrganizacionEvento = async (objeto) => {
    const organizacionId = objeto.metadata?.organizacionId || objeto.client_reference_id;
    if (organizacionId) return Organizacion.findById(organizacionId);
    const suscripcionAnidada = objeto.parent?.subscription_details?.subscription;
    const suscripcionId = typeof objeto.subscription === 'string'
        ? objeto.subscription
        : typeof suscripcionAnidada === 'string'
            ? suscripcionAnidada
            : objeto.id?.startsWith('sub_') ? objeto.id : null;
    const clienteId = typeof objeto.customer === 'string' ? objeto.customer : null;
    const candidatos = [
        ...(suscripcionId ? [{ 'plan.suscripcionPagoId': suscripcionId }] : []),
        ...(clienteId ? [{ 'plan.clientePagoId': clienteId }] : [])
    ];
    return candidatos.length ? Organizacion.findOne({ $or: candidatos }) : null;
};

const aplicarEvento = async (evento) => {
    const objeto = evento.data?.object || {};
    const organizacion = await resolverOrganizacionEvento(objeto);
    if (!organizacion) return { ignorado: true, motivo: 'Organización no localizada.' };
    const tipo = evento.type;
    if (tipo === 'checkout.session.completed') {
        organizacion.plan.proveedorPago = 'Stripe';
        organizacion.plan.clientePagoId = objeto.customer || organizacion.plan.clientePagoId;
        organizacion.plan.suscripcionPagoId = objeto.subscription || organizacion.plan.suscripcionPagoId;
        if (codigosPlan.includes(objeto.metadata?.planCodigo)) organizacion.plan.codigo = objeto.metadata.planCodigo;
    } else if (['customer.subscription.created', 'customer.subscription.updated', 'subscription.created', 'subscription.updated'].includes(tipo)) {
        const codigo = objeto.metadata?.planCodigo || planPorPrecio(objeto.items?.data?.[0]?.price?.id);
        if (codigosPlan.includes(codigo)) organizacion.plan.codigo = codigo;
        organizacion.plan.proveedorPago = 'Stripe';
        organizacion.plan.clientePagoId = objeto.customer || organizacion.plan.clientePagoId;
        organizacion.plan.suscripcionPagoId = objeto.id;
        organizacion.plan.estado = estadoPlanStripe(objeto.status);
        organizacion.plan.fechaRenovacion = fechaUnix(obtenerFinPeriodo(objeto));
        organizacion.plan.fechaExpiracion = fechaUnix(objeto.cancel_at || obtenerFinPeriodo(objeto));
    } else if (['customer.subscription.deleted', 'subscription.deleted'].includes(tipo)) {
        organizacion.plan.estado = 'Cancelado';
        organizacion.plan.fechaExpiracion = fechaUnix(objeto.ended_at || objeto.canceled_at) || new Date();
    } else if (['invoice.payment_failed', 'payment.failed'].includes(tipo)) {
        organizacion.plan.estado = 'Suspendido';
        organizacion.plan.ultimoPagoFallido = new Date();
    } else {
        return { ignorado: true, organizacionId: organizacion._id, motivo: 'Evento sin efecto configurado.' };
    }
    await organizacion.save();
    return { ignorado: false, organizacionId: organizacion._id, estado: organizacion.plan.estado, codigo: organizacion.plan.codigo };
};

const procesarWebhookStripe = async ({ cuerpo, firma }) => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        const error = new Error('STRIPE_WEBHOOK_SECRET no configurado.'); error.status = 503; throw error;
    }
    const evento = obtenerStripe().webhooks.constructEvent(cuerpo, firma, process.env.STRIPE_WEBHOOK_SECRET);
    let registro;
    try {
        registro = await EventoFacturacion.create({ proveedor: 'Stripe', eventoId: evento.id, tipo: evento.type });
    } catch (error) {
        if (error?.code !== 11000) throw error;
        const limiteAbandono = new Date(Date.now() - 10 * 60 * 1000);
        registro = await EventoFacturacion.findOneAndUpdate(
            {
                proveedor: 'Stripe',
                eventoId: evento.id,
                $or: [
                    { estado: 'Error' },
                    { estado: 'Procesando', updatedAt: { $lte: limiteAbandono } }
                ]
            },
            {
                $set: { estado: 'Procesando', tipo: evento.type, error: '' },
                $inc: { intentos: 1 }
            },
            { new: true }
        );
        if (!registro) return { duplicado: true, eventoId: evento.id };
    }
    try {
        const resultado = await aplicarEvento(evento);
        registro.organizacionId = resultado.organizacionId;
        registro.estado = resultado.ignorado ? 'Ignorado' : 'Procesado';
        registro.procesadoEn = new Date();
        registro.error = resultado.motivo || '';
        await registro.save();
        return { eventoId: evento.id, tipo: evento.type, ...resultado };
    } catch (error) {
        registro.estado = 'Error'; registro.error = error.message; await registro.save(); throw error;
    }
};

const catalogoFacturacion = () => codigosPlan.map((codigo) => ({
    codigo,
    nombre: planesConfig[codigo].nombre,
    precioMensualUSD: planesConfig[codigo].precioMensualUSD,
    checkoutDisponible: Boolean(precioPlan(codigo))
}));

module.exports = {
    aplicarEvento,
    catalogoFacturacion,
    crearSesionCheckout,
    crearSesionPortal,
    estadoPlanStripe,
    procesarWebhookStripe
};
