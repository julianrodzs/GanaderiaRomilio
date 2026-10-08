const { eliminarFotoAnimal, subirFotoAnimal } = require('../services/fotoAnimal-service');

const responder = (res, error) => res.status(error.status || 500).json({
    mensaje: error.message || 'No se pudo actualizar la fotografía del animal.',
    code: error.code
});

const subir = async (req, res) => {
    try {
        const animal = await subirFotoAnimal({
            animalId: req.params.id,
            archivo: req.file,
            organizacionId: req.organizacionId,
            fincaId: req.fincaId,
            usuarioId: req.usuario.id
        });
        res.status(201).json({ mensaje: 'Fotografía actualizada.', animal });
    } catch (error) { responder(res, error); }
};

const eliminar = async (req, res) => {
    try {
        const animal = await eliminarFotoAnimal({
            animalId: req.params.id,
            organizacionId: req.organizacionId,
            fincaId: req.fincaId
        });
        res.json({ mensaje: 'Fotografía eliminada.', animal });
    } catch (error) { responder(res, error); }
};

module.exports = { eliminar, subir };
