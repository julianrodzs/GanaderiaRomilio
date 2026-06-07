const { RegistroReproductivo, completarFechasYEstado } = require('../models/RegistroReproductivo');
const Animal = require('../models/Animal');

const reproduccionCtrl = {};

const poblarAnimal = (query) => query.populate('animal');

const fechaKey = (fecha) => {
    if (!fecha) return '';
    return new Date(fecha).toISOString().slice(0, 10);
};

const refrescarRegistro = async (registro) => {
    const original = {
        estado: registro.estado,
        fechaPartoEstimada: fechaKey(registro.fechaPartoEstimada),
        fechaListaMonta: fechaKey(registro.fechaListaMonta),
        fechaDestete: fechaKey(registro.fechaDestete)
    };

    completarFechasYEstado(registro);

    const actualizado = {
        estado: registro.estado,
        fechaPartoEstimada: fechaKey(registro.fechaPartoEstimada),
        fechaListaMonta: fechaKey(registro.fechaListaMonta),
        fechaDestete: fechaKey(registro.fechaDestete)
    };

    if (JSON.stringify(original) !== JSON.stringify(actualizado)) {
        await registro.save();
    }

    return registro;
};

const validarHembra = async (animalId) => {
    const animal = await Animal.findById(animalId);

    if (!animal) {
        return { valido: false, status: 404, mensaje: 'Animal no encontrado' };
    }

    if (animal.sexo !== 'Hembra') {
        return { valido: false, status: 400, mensaje: 'Solo se pueden registrar ciclos reproductivos para hembras' };
    }

    return { valido: true, animal };
};

reproduccionCtrl.getRegistros = async (req, res) => {
    try {
        const registrosSinPoblar = await RegistroReproductivo.find().sort({ fechaPartoEstimada: 1, createdAt: -1 });
        await Promise.all(registrosSinPoblar.map(refrescarRegistro));
        const registros = await poblarAnimal(
            RegistroReproductivo.find().sort({ fechaPartoEstimada: 1, createdAt: -1 })
        );

        res.json(registros);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener registros reproductivos', error: error.message });
    }
};

reproduccionCtrl.createRegistro = async (req, res) => {
    try {
        const validacion = await validarHembra(req.body.animal);

        if (!validacion.valido) {
            return res.status(validacion.status).json({ mensaje: validacion.mensaje });
        }

        const nuevoRegistro = new RegistroReproductivo(req.body);
        const registroGuardado = await nuevoRegistro.save();
        const registro = await poblarAnimal(RegistroReproductivo.findById(registroGuardado._id));

        res.status(201).json(registro);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear registro reproductivo', error: error.message });
    }
};

reproduccionCtrl.getRegistro = async (req, res) => {
    try {
        const registroSinPoblar = await RegistroReproductivo.findById(req.params.id);

        if (!registroSinPoblar) {
            return res.status(404).json({ mensaje: 'Registro reproductivo no encontrado' });
        }

        await refrescarRegistro(registroSinPoblar);
        const registro = await poblarAnimal(RegistroReproductivo.findById(req.params.id));

        res.json(registro);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener registro reproductivo', error: error.message });
    }
};

reproduccionCtrl.getRegistrosPorAnimal = async (req, res) => {
    try {
        const registrosSinPoblar = await RegistroReproductivo.find({ animal: req.params.animalId }).sort({ fechaMonta: -1, createdAt: -1 });
        await Promise.all(registrosSinPoblar.map(refrescarRegistro));
        const registros = await poblarAnimal(
            RegistroReproductivo.find({ animal: req.params.animalId }).sort({ fechaMonta: -1, createdAt: -1 })
        );

        res.json(registros);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener registros reproductivos del animal', error: error.message });
    }
};

reproduccionCtrl.updateRegistro = async (req, res) => {
    try {
        if (req.body.animal) {
            const validacion = await validarHembra(req.body.animal);

            if (!validacion.valido) {
                return res.status(validacion.status).json({ mensaje: validacion.mensaje });
            }
        }

        const registroActualizado = await RegistroReproductivo.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!registroActualizado) {
            return res.status(404).json({ mensaje: 'Registro reproductivo no encontrado' });
        }

        const registro = await poblarAnimal(RegistroReproductivo.findById(registroActualizado._id));

        res.json(registro);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar registro reproductivo', error: error.message });
    }
};

reproduccionCtrl.deleteRegistro = async (req, res) => {
    try {
        const registro = await RegistroReproductivo.findByIdAndDelete(req.params.id);

        if (!registro) {
            return res.status(404).json({ mensaje: 'Registro reproductivo no encontrado' });
        }

        res.json({ mensaje: 'Registro reproductivo eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar registro reproductivo', error: error.message });
    }
};

module.exports = reproduccionCtrl;
