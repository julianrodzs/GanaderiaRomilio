const potreroCtrl = {};

const Potrero = require('../models/Potrero');
const CorteForraje = require('../models/CorteForraje');
const RotacionPotrero = require('../models/RotacionPotrero');
const HistorialCoberturaPotrero = require('../models/HistorialCoberturaPotrero');
const Animal = require('../models/Animal');
const Lote = require('../models/Lote');
const { Tarea } = require('../models/Tarea');
const {
    calcularComparativoPotreros,
    calcularRendimientoPorPasto,
    obtenerRendimientoPotrero
} = require('../services/potreroRendimiento-service');
const {
    guardarCobertura,
    obtenerCoberturaPotrero
} = require('../services/potreroCobertura-service');
const { enriquecerBancosForrajeros, listarCortes, programarPrimerCorte, registrarCorte } = require('../services/forraje-service');
const { validarUsuarioAsignable } = require('../services/usuarioAsignable-service');
const { crearErrorIntegridad, sanitizarPotrero } = require('../services/potrero-integridad-service');

const CAMPOS_COBERTURA = [
    'pastoPrincipal', 'pastosSecundarios', 'leguminosasAsociadas', 'porcentajesCobertura',
    'fechaEstablecimientoPasto', 'diasDescansoObjetivo', 'observacionCobertura', 'descripcionCobertura'
    , 'intervaloCorteObjetivoDias'
];

const sinCamposCobertura = (datos = {}) => Object.fromEntries(
    Object.entries(datos).filter(([clave]) => !CAMPOS_COBERTURA.includes(clave))
);

potreroCtrl.getPotreros = async (req, res) => {
    try {
        const filtro = req.query.tipoArea ? { tipoArea: req.query.tipoArea } : {};
        const potreros = await Potrero.find(filtro)
            .populate('pastoPrincipal')
            .populate('pastosSecundarios')
            .populate('leguminosasAsociadas')
            .populate('responsableCorte', 'nombre apellido correo rol estado')
            .sort({ createdAt: -1 });
        res.json(await enriquecerBancosForrajeros(potreros));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener potreros', error: error.message });
    }
};

potreroCtrl.createPotrero = async (req, res) => {
    try {
        const { datos, programacion } = sanitizarPotrero(req.body);
        if (datos.tipoArea === 'BANCO_FORRAJERO') await validarUsuarioAsignable(datos.responsableCorte, 'Tareas');
        const nuevoPotrero = new Potrero(sinCamposCobertura(datos));
        const potreroGuardado = await nuevoPotrero.save();
        await programarPrimerCorte(potreroGuardado, {
            ...programacion,
            responsableCorte: datos.responsableCorte
        }, req.usuario?.id);
        res.status(201).json(potreroGuardado);
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message, codigo: error.codigo });
    }
};

potreroCtrl.getPotrero = async (req, res) => {
    try {
        const potrero = await Potrero.findById(req.params.id)
            .populate('pastoPrincipal')
            .populate('pastosSecundarios')
            .populate('leguminosasAsociadas');

        if (!potrero) {
            return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        }
        await potrero.populate('responsableCorte', 'nombre apellido correo rol estado');

        res.json(potrero);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener potrero', error: error.message });
    }
};

potreroCtrl.getRendimientoPotreros = async (req, res) => {
    try {
        res.json(await calcularComparativoPotreros(req.query));
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al calcular el rendimiento de los potreros', error: error.message });
    }
};

potreroCtrl.getRendimientoPotrero = async (req, res) => {
    try {
        const rendimiento = await obtenerRendimientoPotrero(req.params.id, req.query);
        if (!rendimiento) return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        res.json(rendimiento);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al calcular el rendimiento del potrero', error: error.message });
    }
};

potreroCtrl.getRendimientoPorPasto = async (req, res) => {
    try {
        res.json(await calcularRendimientoPorPasto(req.query));
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al calcular el rendimiento por tipo de pasto', error: error.message });
    }
};

potreroCtrl.getCoberturaPotrero = async (req, res) => {
    try {
        const resultado = await obtenerCoberturaPotrero(req.params.id);
        if (!resultado) return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener la cobertura del potrero', error: error.message });
    }
};

potreroCtrl.createCoberturaPotrero = async (req, res) => {
    try {
        const cobertura = await guardarCobertura(req.params.id, req.body, { soloInicial: true, usuarioId: req.usuario?.id });
        if (!cobertura) return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        res.status(201).json(cobertura);
    } catch (error) {
        res.status(error.codigo === 'COBERTURA_EXISTENTE' ? 409 : 400).json({ mensaje: 'No se pudo registrar la cobertura', error: error.message, codigo: error.codigo });
    }
};

potreroCtrl.updateCoberturaPotrero = async (req, res) => {
    try {
        const cobertura = await guardarCobertura(req.params.id, req.body, { usuarioId: req.usuario?.id });
        if (!cobertura) return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        res.json(cobertura);
    } catch (error) {
        res.status(400).json({ mensaje: 'No se pudo cambiar la cobertura', error: error.message });
    }
};

potreroCtrl.updatePotrero = async (req, res) => {
    try {
        const actual = await Potrero.findById(req.params.id);
        if (!actual) return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        const { datos, programacion } = sanitizarPotrero(req.body);
        if (['Mantenimiento', 'Inactivo'].includes(datos.estado) && datos.estado !== actual.estado) {
            const [rotacionActiva, animalesAsignados, lotesActivos] = await Promise.all([
                RotacionPotrero.exists({ potrero: actual._id, estado: 'Activa' }),
                Animal.exists({ potreroActual: actual._id, estado: 'Activo' }),
                Lote.exists({ ubicacionActual: actual._id, estado: 'ACTIVO' })
            ]);
            if (rotacionActiva || animalesAsignados || lotesActivos) {
                throw crearErrorIntegridad(
                    'Mueva primero los lotes y animales antes de retirar el potrero de operacion.',
                    409,
                    'POTRERO_OCUPADO'
                );
            }
        }
        if (datos.tipoArea && datos.tipoArea !== actual.tipoArea) {
            const [rotacion, cobertura, corte] = await Promise.all([
                RotacionPotrero.exists({ potrero: actual._id }),
                HistorialCoberturaPotrero.exists({ potrero: actual._id }),
                CorteForraje.exists({ potrero: actual._id })
            ]);
            if (rotacion || cobertura || corte) {
                throw crearErrorIntegridad(
                    'El uso del area no puede cambiar porque ya tiene historial operativo.',
                    409,
                    'TIPO_AREA_CON_HISTORIAL'
                );
            }
        }
        const tipoFinal = datos.tipoArea || actual.tipoArea;
        const responsableFinal = datos.responsableCorte === undefined ? actual.responsableCorte : datos.responsableCorte;
        if (tipoFinal === 'BANCO_FORRAJERO' && responsableFinal) await validarUsuarioAsignable(responsableFinal, 'Tareas');
        const potrero = await Potrero.findByIdAndUpdate(req.params.id, sinCamposCobertura(datos), {
            new: true,
            runValidators: true
        });

        if (!potrero) {
            return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        }

        await programarPrimerCorte(potrero, {
            ...programacion,
            responsableCorte: responsableFinal
        }, req.usuario?.id);

        res.json(potrero);
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message, codigo: error.codigo });
    }
};

potreroCtrl.getCortesForraje = async (req, res) => {
    try {
        res.json(await listarCortes(req.params.id, req.query));
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al obtener los cortes de forraje', error: error.message });
    }
};

potreroCtrl.createCorteForraje = async (req, res) => {
    try {
        const corte = await registrarCorte(req.params.id, req.body, req.usuario?.id);
        if (!corte) return res.status(404).json({ mensaje: 'Banco forrajero no encontrado' });
        res.status(201).json(corte);
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message });
    }
};

potreroCtrl.deletePotrero = async (req, res) => {
    try {
        const potreroExistente = await Potrero.findById(req.params.id).select('_id nombre codigo');
        if (!potreroExistente) return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        const [rotaciones, rotacionesActivas, animales, lotes, coberturas, cortes, tareas] = await Promise.all([
            RotacionPotrero.countDocuments({ potrero: req.params.id }),
            RotacionPotrero.countDocuments({ potrero: req.params.id, estado: 'Activa' }),
            Animal.countDocuments({ potreroActual: req.params.id }),
            Lote.countDocuments({ ubicacionActual: req.params.id, estado: 'ACTIVO' }),
            HistorialCoberturaPotrero.countDocuments({ potrero: req.params.id }),
            CorteForraje.countDocuments({ potrero: req.params.id }),
            Tarea.countDocuments({ potrero: req.params.id })
        ]);
        const dependencias = { rotaciones, rotacionesActivas, animales, lotes, coberturas, cortes, tareas };
        const puedeInactivar = rotacionesActivas === 0 && animales === 0 && lotes === 0;
        if (Object.values(dependencias).some((cantidad) => cantidad > 0)) {
            return res.status(409).json({
                mensaje: 'El area tiene historial o asignaciones y no puede eliminarse. Cambie su estado a Mantenimiento o Inactivo para conservar la trazabilidad.',
                codigo: 'POTRERO_CON_DEPENDENCIAS',
                dependencias,
                estadosAlternativos: puedeInactivar ? ['Mantenimiento', 'Inactivo'] : [],
                puedeInactivar
            });
        }
        const potrero = await Potrero.findByIdAndDelete(req.params.id);

        if (!potrero) {
            return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        }

        res.json({ mensaje: 'Potrero eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar potrero', error: error.message });
    }
};

module.exports = potreroCtrl;
