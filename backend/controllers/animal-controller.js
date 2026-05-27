const animalCtrl = {};

const Animal = require('../models/Animal');

animalCtrl.getAnimales = async (req, res) => {
    try {
        const animales = await Animal.find().populate('potreroActual').sort({ createdAt: -1 });
        res.json(animales);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener animales', error: error.message });
    }
};

animalCtrl.createAnimal = async (req, res) => {
    try {
        const nuevoAnimal = new Animal(req.body);
        const animalGuardado = await nuevoAnimal.save();
        res.status(201).json(animalGuardado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear animal', error: error.message });
    }
};

animalCtrl.getAnimal = async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id).populate('potreroActual');

        if (!animal) {
            return res.status(404).json({ mensaje: 'Animal no encontrado' });
        }

        res.json(animal);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener animal', error: error.message });
    }
};

animalCtrl.updateAnimal = async (req, res) => {
    try {
        const animal = await Animal.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!animal) {
            return res.status(404).json({ mensaje: 'Animal no encontrado' });
        }

        res.json(animal);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar animal', error: error.message });
    }
};

animalCtrl.deleteAnimal = async (req, res) => {
    try {
        const animal = await Animal.findByIdAndDelete(req.params.id);

        if (!animal) {
            return res.status(404).json({ mensaje: 'Animal no encontrado' });
        }

        res.json({ mensaje: 'Animal eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar animal', error: error.message });
    }
};

module.exports = animalCtrl;
