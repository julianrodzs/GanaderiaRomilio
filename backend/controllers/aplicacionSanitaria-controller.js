const { AplicacionSanitaria, NATURALEZAS_APLICACION } = require('../models/AplicacionSanitaria');
const { crearAplicacionSanitaria, resolverAlcanceSanitario } = require('../services/aplicacionSanitaria-service');
const { nombreUsuario, notificarAccionSegura } = require('../services/notificacion-service');
const { validarUsuarioAsignable } = require('../services/usuarioAsignable-service');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const { sanitizarAplicacionSanitaria } = require('../services/sanidad-dto-service');

const aplicacionSanitariaCtrl = {};

const poblarAplicacion = (query) => query
    .populate('animales', 'diio identificadorFinca nombre especie categoria estado')
    .populate('lote', 'codigo nombre especie estado')
    .populate('planSanitario', 'actividad producto grupoGanado')
    .populate('tratamiento', 'motivo producto estado')
    .populate('responsableUsuario', 'nombre apellido correo estado')
    .populate('registradoPor', 'nombre apellido correo');

aplicacionSanitariaCtrl.getAplicaciones = async (req, res) => {
    try {
        const { animal, lote, naturaleza, fechaInicio, fechaFin, producto, responsable, especie } = req.query;
        const filtro = {};
        if (animal) filtro.animales = animal;
        if (lote) filtro.lote = lote;
        if (naturaleza && NATURALEZAS_APLICACION.includes(naturaleza)) filtro.naturaleza = naturaleza;
        if (especie) filtro.especie = especie;
        if (producto) filtro.producto = { $regex: producto, $options: 'i' };
        if (responsable) filtro.responsable = { $regex: responsable, $options: 'i' };
        if (fechaInicio || fechaFin) {
            filtro.fechaAplicacion = {};
            if (fechaInicio) filtro.fechaAplicacion.$gte = new Date(fechaInicio);
            if (fechaFin) {
                const fin = new Date(fechaFin);
                fin.setUTCHours(23, 59, 59, 999);
                filtro.fechaAplicacion.$lte = fin;
            }
        }

        const aplicaciones = await poblarAplicacion(
            AplicacionSanitaria.find(filtro).sort({ fechaAplicacion: -1, createdAt: -1 })
        );
        res.json(aplicaciones);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener aplicaciones sanitarias', error: error.message });
    }
};

aplicacionSanitariaCtrl.getAplicacionById = async (req, res) => {
    try {
        const aplicacion = await poblarAplicacion(AplicacionSanitaria.findById(req.params.id));
        if (!aplicacion) return res.status(404).json({ mensaje: 'Aplicación sanitaria no encontrada' });
        res.json(aplicacion);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener aplicación sanitaria', error: error.message });
    }
};

aplicacionSanitariaCtrl.createAplicacionUnica = async (req, res) => {
    try {
        const datos = sanitizarAplicacionSanitaria(req.body);
        const claveIdempotencia = String(req.get('Idempotency-Key') || '').trim();
        if (claveIdempotencia.length > 160) {
            return res.status(400).json({ mensaje: 'La clave de idempotencia no es válida' });
        }
        if (claveIdempotencia) {
            const existente = await AplicacionSanitaria.findOne({ claveIdempotencia }).select('+claveIdempotencia');
            if (existente) {
                if (existente.naturaleza !== 'Aplicacion unica') {
                    return res.status(409).json({ mensaje: 'La clave de idempotencia ya fue utilizada en otra operación sanitaria' });
                }
                res.set('X-Idempotent-Replay', 'true');
                return res.json(await poblarAplicacion(AplicacionSanitaria.findById(existente._id)));
            }
        }
        const responsable = await validarUsuarioAsignable(datos.responsableUsuario, 'Sanidad');
        const responsableNombre = [responsable.nombre, responsable.apellido].filter(Boolean).join(' ') || responsable.correo;
        const resultado = await ejecutarEnTransaccion(async (session) => {
            const alcance = await resolverAlcanceSanitario({
                animales: datos.animales,
                lote: datos.lote,
                especie: datos.especie
            }, { soloActivos: true, session });
            const aplicacion = await crearAplicacionSanitaria({
                animales: alcance.ids,
                especie: alcance.especie,
                lote: alcance.lote?._id || null,
                loteCodigo: alcance.lote?.codigo,
                fechaAplicacion: datos.fechaAplicacion,
                producto: datos.producto,
                tipo: datos.tipo,
                dosis: datos.dosis,
                viaAplicacion: datos.viaAplicacion,
                diasRetiroCarne: datos.diasRetiroCarne,
                responsable: responsableNombre,
                responsableUsuario: responsable._id,
                motivo: datos.motivo,
                observaciones: datos.observaciones,
                naturaleza: 'Aplicacion unica',
                claveIdempotencia: claveIdempotencia || undefined
            }, req.usuario?.id, { soloActivos: true, session });
            return { aplicacion, alcance };
        });
        const { aplicacion, alcance } = resultado;

        await notificarAccionSegura({
            actor: req.usuario,
            naturaleza: 'Informativa',
            tipo: 'APLICACION_SANITARIA_REGISTRADA',
            titulo: 'Aplicación sanitaria registrada',
            mensaje: `${nombreUsuario(req.usuario)} registró una aplicación única de ${aplicacion.producto} para ${aplicacion.animales.length} animal${aplicacion.animales.length === 1 ? '' : 'es'}.`,
            moduloOrigen: 'Sanidad',
            entidadTipo: 'AplicacionSanitaria',
            entidadId: aplicacion._id,
            url: `/sanidad/aplicaciones/${aplicacion._id}`,
            metadata: { naturaleza: 'Aplicacion unica', loteId: alcance.lote?._id }
        });

        res.status(201).json(await poblarAplicacion(AplicacionSanitaria.findById(aplicacion._id)));
    } catch (error) {
        if (error?.code === 11000 && req.get('Idempotency-Key')) {
            const existente = await AplicacionSanitaria.findOne({
                claveIdempotencia: String(req.get('Idempotency-Key')).trim()
            }).select('_id');
            if (existente) {
                res.set('X-Idempotent-Replay', 'true');
                return res.json(await poblarAplicacion(AplicacionSanitaria.findById(existente._id)));
            }
        }
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al registrar aplicación', error: error.message });
    }
};

module.exports = aplicacionSanitariaCtrl;
