const { createHash } = require('crypto');
const Organizacion = require('../models/Organizacion');
const Usuario = require('../models/Usuario');
const { Membresia } = require('../models/Membresia');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { ejecutarEnTransaccion } = require('./mongo-transaccion-service');
const { resolverSuscripcion, modoFacturacion } = require('./suscripcion-estado-service');
const { auditar } = require('./suscripcionManual-service');
const { enviarCorreoResend } = require('./correoElectronico-service');
const { escaparHtml: h } = require('./htmlSeguro-service');
const { enlacePanel } = require('./resumenEmail-plantilla-service');

const procesarSuscripcionesManuales = async ({ ahora = new Date(), comprobarBloqueo = async () => {}, alProgreso = () => {} } = {}) => {
    const resultados = [], pendientesOperador = [];
    const cursor = Organizacion.find({ estado: 'Activa', fechaProximoVencimiento: { $ne: null },
        modoFacturacion: { $ne: 'STRIPE' }, 'plan.proveedorPago': { $ne: 'Stripe' } }).select('_id').lean().cursor({ batchSize: 100 });
    for await (const item of cursor) {
        await comprobarBloqueo();
        try {
            await ejecutarConOrganizacion(item._id, async () => {
                const org = await ejecutarEnTransaccion(async (session) => {
                    const o = await Organizacion.findById(item._id).session(session);
                    if (!o || modoFacturacion(o) !== 'MANUAL') return null;
                    const s = resolverSuscripcion(o, ahora);
                    if (s.estadoSuscripcion !== o.estadoSuscripcion) {
                        const antes = o.estadoSuscripcion;
                        o.estadoSuscripcion = s.estadoSuscripcion;
                        if (s.estadoSuscripcion === 'VENCIDA') o.plan.estado = 'Suspendido';
                        await o.save({ session });
                        await auditar(o, null, 'Estado automático de suscripción', { estado: antes }, { estado: s.estadoSuscripcion }, session);
                    }
                    return o;
                });
                if (!org) return;
                const s = resolverSuscripcion(org, ahora), fila = { organizacionId: org._id, estado: s.estadoSuscripcion, enviadas: 0 };
                const avisar = s.diasParaVencer !== null && s.diasParaVencer <= 5 && !['SUSPENDIDA', 'CANCELADA'].includes(s.estadoSuscripcion);
                const ciclo = s.fechaProximoVencimiento?.toISOString();
                if (avisar && org.avisoCarteraCiclo !== ciclo) pendientesOperador.push({ _id: org._id, nombre: org.nombre, ciclo, estado: s.estadoSuscripcion });
                if (avisar && org.avisoVencimientoCiclo !== ciclo) {
                    const miembros = await Membresia.find({ organizacionId: org._id, estado: 'Activo', rol: 'Administrador' })
                        .populate({ path: 'usuario', model: Usuario, match: { estado: 'Activo' }, select: 'correo' }).lean();
                    const destinatarios = [...new Set(miembros.map((m) => m.usuario?.correo).filter(Boolean))];
                    if (destinatarios.length) {
                        const fin = new Intl.DateTimeFormat('es-CR', { timeZone: org.zonaHoraria || 'America/Costa_Rica', dateStyle: 'long' }).format(s.fechaProximoVencimiento);
                        const mensaje = `${org.nombre}: tu suscripción tiene vencimiento el ${fin}. Revisa Mi plan para coordinar la renovación. Período de gracia: ${s.diasGracia} días.`;
                        await comprobarBloqueo();
                        const r = await enviarCorreoResend({ to: destinatarios, subject: 'Renovación de suscripción - CIR Ganadero', text: `${mensaje}\n${enlacePanel()}`,
                            html: `<h2>CIR Ganadero</h2><p>${h(mensaje)}</p><p><a href="${h(enlacePanel())}">Ir a CIR Ganadero</a></p>`, claveIdempotencia: `vigencia:${org._id}:${ciclo}` });
                        if (r.enviado) {
                            await ejecutarEnTransaccion((session) => Organizacion.updateOne({ _id: org._id, fechaProximoVencimiento: s.fechaProximoVencimiento },
                                { $set: { avisoVencimientoCiclo: ciclo } }, { session }));
                            fila.enviadas = 1;
                        }
                    }
                }
                resultados.push(fila);
            });
        } catch (e) {
            if (e.code === 'JOB_LOCK_LOST') throw e;
            resultados.push({ organizacionId: item._id, error: e.message, enviadas: 0 });
        }
        alProgreso();
    }
    if (pendientesOperador.length && process.env.EMAIL_ADMIN) {
        try {
            await comprobarBloqueo();
            const orden = pendientesOperador.sort((a, b) => String(a._id).localeCompare(String(b._id)));
            const texto = orden.map((o) => `${o.nombre} | ${o.estado} | Vencimiento: ${o.ciclo}`).join('\n');
            const clave = createHash('sha256').update(orden.map((o) => `${o._id}:${o.ciclo}`).join('|')).digest('hex');
            const r = await enviarCorreoResend({ to: process.env.EMAIL_ADMIN.split(',').map((c) => c.trim()).filter(Boolean),
                subject: 'Cartera de renovaciones - CIR Ganadero', text: texto, html: `<h2>Cartera CIR Ganadero</h2><pre>${h(texto)}</pre>`, claveIdempotencia: `cartera:${clave}` });
            if (r.enviado) {
                await ejecutarEnTransaccion(async (session) => {
                    for (const o of orden) await Organizacion.updateOne({ _id: o._id, fechaProximoVencimiento: new Date(o.ciclo) }, { $set: { avisoCarteraCiclo: o.ciclo } }, { session });
                });
                resultados.push({ organizacionId: null, resumenOperador: true, enviadas: 1 });
            }
        } catch (e) { resultados.push({ organizacionId: null, error: e.message, enviadas: 0 }); }
    }
    return resultados;
};
module.exports = { procesarSuscripcionesManuales };
