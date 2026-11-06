const { claveDiaEnZona, obtenerPartes, fechaCivilEnZonaAUTC } = require('./fechaZonaHoraria-service');

const DIA = 86400000;
const modoFacturacion = (org) => org.modoFacturacion === 'STRIPE' || org.plan?.proveedorPago === 'Stripe' ? 'STRIPE' : 'MANUAL';
const sumarMeses = (fecha, meses, zona = 'America/Costa_Rica') => {
    const original = new Date(fecha), p = obtenerPartes(original, zona);
    const f = new Date(Date.UTC(p.year, p.month - 1 + meses, 1)), dia = p.day;
    const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
    f.setUTCDate(Math.min(dia, ultimo));
    return new Date(+fechaCivilEnZonaAUTC({ year: f.getUTCFullYear(), month: f.getUTCMonth() + 1, day: f.getUTCDate(),
        hour: p.hour, minute: p.minute, second: p.second }, zona) + original.getUTCMilliseconds());
};
const resolverSuscripcion = (org, ahora = new Date()) => {
    const modo = modoFacturacion(org), plan = org.plan || {};
    const fin = org.fechaProximoVencimiento || org.fechaFinPeriodoActual || (modo === 'STRIPE' ? plan.fechaRenovacion : null);
    const fecha = fin ? new Date(fin) : null;
    const zona = org.zonaHoraria || 'America/Costa_Rica';
    const diasParaVencer = fecha ? Math.round((Date.parse(claveDiaEnZona(fecha, zona)) - Date.parse(claveDiaEnZona(ahora, zona))) / DIA) : null;
    let estado = plan.estado === 'Prueba' ? 'PRUEBA' : 'ACTIVA';
    if (plan.estado === 'Cancelado' || org.estadoSuscripcion === 'CANCELADA') estado = 'CANCELADA';
    else if (org.estadoSuscripcion === 'SUSPENDIDA' || (plan.estado === 'Suspendido' && org.estadoSuscripcion !== 'VENCIDA')) estado = 'SUSPENDIDA';
    else if (modo === 'MANUAL' && fecha) {
        const gracia = Number(org.diasGracia ?? 5);
        if (+ahora > +fecha + gracia * DIA) estado = 'VENCIDA';
        else if (+ahora > +fecha) estado = 'EN_GRACIA';
        else if (estado !== 'PRUEBA' && diasParaVencer <= 5) estado = 'POR_VENCER';
    }
    return { modoFacturacion: modo, estadoSuscripcion: estado, fechaInicioPeriodoActual: org.fechaInicioPeriodoActual || null,
        fechaProximoVencimiento: fecha, fechaFinPeriodoActual: fecha, diasParaVencer, diasGracia: Number(org.diasGracia ?? 5),
        vigenciaPendiente: modo === 'MANUAL' && !fecha,
        permiteOperar: org.estado === 'Activa' && !['VENCIDA', 'SUSPENDIDA', 'CANCELADA'].includes(estado) };
};
const establecerPeriodo = (org, inicio, fin, estado = 'Activo') => {
    org.modoFacturacion = 'MANUAL';
    org.fechaInicioPeriodoActual = inicio;
    org.fechaFinPeriodoActual = fin;
    org.fechaProximoVencimiento = fin;
    org.plan.estado = estado;
    org.plan.fechaRenovacion = fin;
    org.plan.fechaExpiracion = fin;
    org.estadoSuscripcion = estado === 'Prueba' ? 'PRUEBA' : 'ACTIVA';
};

module.exports = { resolverSuscripcion, modoFacturacion, sumarMeses, establecerPeriodo, DIA };
