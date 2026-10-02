const { AplicacionSanitaria, NATURALEZAS_APLICACION } = require('../models/AplicacionSanitaria');
const { crearAplicacionSanitaria, resolverAlcanceSanitario } = require('../services/aplicacionSanitaria-service');
const { nombreUsuario, notificarAccionSegura } = require('../services/notificacion-service');
const { validarUsuarioAsignable } = require('../services/usuarioAsignable-service');

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
        const responsable = await validarUsuarioAsignable(req.body.responsableUsuario, 'Sanidad');
        const responsableNombre = [responsable.nombre, responsable.apellido].filter(Boolean).join(' ') || responsable.correo;
        const alcance = await resolverAlcanceSanitario({
            animales: req.body.animales,
            lote: req.body.lote,
            especie: req.body.especie
        }, { soloActivos: true });
        const aplicacion = await crearAplicacionSanitaria({
            animales: alcance.ids,
            especie: alcance.especie,
            lote: alcance.lote?._id || null,
            loteCodigo: alcance.lote?.codigo,
            fechaAplicacion: req.body.fechaAplicacion,
            producto: req.body.producto,
            tipo: req.body.tipo,
            dosis: req.body.dosis,
            viaAplicacion: req.body.viaAplicacion,
            responsable: responsableNombre,
            responsableUsuario: responsable._id,
            motivo: req.body.motivo,
            observaciones: req.body.observaciones,
            naturaleza: 'Aplicacion unica'
        }, req.usuario?.id, { soloActivos: true });

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
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al registrar aplicación', error: error.message });
    }
};

module.exports = aplicacionSanitariaCtrl;
