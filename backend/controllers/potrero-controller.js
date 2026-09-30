const potreroCtrl = {};

const Potrero = require('../models/Potrero');
const CorteForraje = require('../models/CorteForraje');
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
        if (req.body.tipoArea === 'BANCO_FORRAJERO') await validarUsuarioAsignable(req.body.responsableCorte, 'Tareas');
        const nuevoPotrero = new Potrero(sinCamposCobertura(req.body));
        const potreroGuardado = await nuevoPotrero.save();
        await programarPrimerCorte(potreroGuardado, req.body, req.usuario?.id);
        res.status(201).json(potreroGuardado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear potrero', error: error.message });
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
        if (req.body.tipoArea === 'BANCO_FORRAJERO' && req.body.responsableCorte) await validarUsuarioAsignable(req.body.responsableCorte, 'Tareas');
        const potrero = await Potrero.findByIdAndUpdate(req.params.id, sinCamposCobertura(req.body), {
            new: true,
            runValidators: true
        });

        if (!potrero) {
            return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        }

        await programarPrimerCorte(potrero, req.body, req.usuario?.id);

        res.json(potrero);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar potrero', error: error.message });
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
        res.status(error.status || 400).json({ mensaje: 'No se pudo registrar el corte', error: error.message });
    }
};

potreroCtrl.deletePotrero = async (req, res) => {
    try {
        const cortesRegistrados = await CorteForraje.countDocuments({ potrero: req.params.id });
        if (cortesRegistrados > 0) {
            return res.status(409).json({
                mensaje: 'El banco tiene cortes históricos y no puede eliminarse. Cámbielo a Mantenimiento para conservar la trazabilidad.',
                codigo: 'BANCO_CON_HISTORIAL'
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
