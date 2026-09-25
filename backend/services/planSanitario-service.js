const Animal = require('../models/Animal');

const crearFiltroEspecie = (especie) => {
    if (especie === 'Bovino') return { $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] };
    if (especie === 'Porcino') return { especie };
    return {};
};

const obtenerAnimalesParaPlan = async (plan) => {
    if (plan.animales?.length) {
        return Animal.find({
            _id: { $in: plan.animales.map((animal) => animal?._id || animal) },
            ...crearFiltroEspecie(plan.especie),
            estado: { $nin: ['Muerto', 'Vendido'] }
        });
    }

    if (plan.animalDiio) {
        const filtros = [
            crearFiltroEspecie(plan.especie),
            { $or: [{ diio: plan.animalDiio }, { identificadorFinca: plan.animalDiio }] }
        ].filter((filtro) => Object.keys(filtro).length);
        const animal = await Animal.findOne({
            $and: [...filtros, { estado: { $nin: ['Muerto', 'Vendido'] } }]
        });
        return animal ? [animal] : [];
    }

    if (plan.grupoGanado === 'Todo el ganado') {
        return Animal.find({
            ...crearFiltroEspecie(plan.especie),
            estado: { $nin: ['Muerto', 'Vendido'] }
        });
    }

    return [];
};

module.exports = {
    crearFiltroEspecie,
    obtenerAnimalesParaPlan
};
