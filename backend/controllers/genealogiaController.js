const Animal = require('../models/Animal');
const {
    obtenerArbolGenealogico,
    obtenerDescendencia,
    validarRelacionGenealogica,
    detectarParentesco,
    calcularRiesgoCruce,
    prepararDatosGenealogia
} = require('../services/genealogiaService');

const responderError = (res, error, mensaje) => {
    res.status(error.status || 400).json({
        mensaje: error.message || mensaje,
        error: error.message
    });
};

const getArbolGenealogico = async (req, res) => {
    try {
        const generaciones = Number(req.query.generaciones || 3);
        const arbol = await obtenerArbolGenealogico(req.params.animalId, generaciones);

        if (!arbol?.animal) {
            return res.status(404).json({ mensaje: 'Animal no encontrado' });
        }

        res.json(arbol);
    } catch (error) {
        responderError(res, error, 'Error al obtener árbol genealógico');
    }
};

const getDescendencia = async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.animalId).select('_id');
        if (!animal) return res.status(404).json({ mensaje: 'Animal no encontrado' });

        const descendencia = await obtenerDescendencia(req.params.animalId);
        res.json(descendencia);
    } catch (error) {
        responderError(res, error, 'Error al obtener descendencia');
    }
};

const getParentesco = async (req, res) => {
    try {
        const { animalA, animalB } = req.query;
        const parentesco = await detectarParentesco(animalA, animalB);
        res.json(parentesco);
    } catch (error) {
        responderError(res, error, 'Error al detectar parentesco');
    }
};

const getRiesgoCruce = async (req, res) => {
    try {
        const { macho, hembra } = req.query;
        const riesgo = await calcularRiesgoCruce(macho, hembra);
        res.json(riesgo);
    } catch (error) {
        responderError(res, error, 'Error al calcular riesgo de cruce');
    }
};

const updateGenealogiaAnimal = async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ mensaje: 'Animal no encontrado' });

        const datos = prepararDatosGenealogia(req.body);
        await validarRelacionGenealogica(req.params.id, datos.padre, datos.madre);

        const camposPermitidos = [
            'padre',
            'madre',
            'origenGenealogico',
            'padreExternoNombre',
            'madreExternaNombre',
            'registroGenealogico',
            'observacionesGenealogicas',
            'padreDiio',
            'madreDiio'
        ];

        camposPermitidos.forEach((campo) => {
            if (Object.prototype.hasOwnProperty.call(datos, campo)) {
                animal[campo] = datos[campo] || undefined;
            }
        });

        const actualizado = await animal.save();
        await actualizado.populate(['padre', 'madre', 'potreroActual']);
        res.json(actualizado);
    } catch (error) {
        responderError(res, error, 'Error al actualizar genealogía');
    }
};

module.exports = {
    getArbolGenealogico,
    getDescendencia,
    getParentesco,
    getRiesgoCruce,
    updateGenealogiaAnimal
};
