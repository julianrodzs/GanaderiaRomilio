const Animal = require('../models/Animal');
const ArchivoMultimedia = require('../models/ArchivoMultimedia');
const { eliminarImagenR2, subirImagenR2 } = require('./almacenamientoR2-service');

const buscarAnimalConFoto = ({ animalId, organizacionId, fincaId }) => Animal.findOne({
    _id: animalId,
    organizacionId,
    fincaId
}).populate('fotoPrincipal');

const desactivarArchivo = async (archivo) => {
    if (!archivo?._id) return;
    try {
        await eliminarImagenR2(archivo.clave);
    } catch (error) {
        // La referencia se desactiva aunque R2 esté temporalmente indisponible; una limpieza posterior puede retirar el objeto.
    }
    await ArchivoMultimedia.findByIdAndUpdate(archivo._id, { $set: { activo: false } });
};

const subirFotoAnimal = async ({ animalId, archivo, organizacionId, fincaId, usuarioId }) => {
    const animal = await buscarAnimalConFoto({ animalId, organizacionId, fincaId });
    if (!animal) {
        const error = new Error('Animal no encontrado.'); error.status = 404; throw error;
    }
    const fotoAnterior = animal.fotoPrincipal;
    const almacenamiento = await subirImagenR2({
        archivo,
        organizacionId,
        fincaId,
        uso: 'FOTO_ANIMAL'
    });

    let nuevaFoto;
    try {
        nuevaFoto = await ArchivoMultimedia.create({
            fincaId,
            animalId: animal._id,
            uso: 'FOTO_ANIMAL',
            ...almacenamiento,
            nombreOriginal: archivo.originalname,
            mimeType: archivo.mimetype,
            tamanoBytes: archivo.size,
            creadoPor: usuarioId
        });
        animal.fotoPrincipal = nuevaFoto._id;
        await animal.save();
    } catch (error) {
        await eliminarImagenR2(almacenamiento.clave).catch(() => {});
        throw error;
    }

    if (fotoAnterior?._id) await desactivarArchivo(fotoAnterior);
    return buscarAnimalConFoto({ animalId: animal._id, organizacionId, fincaId });
};

const eliminarFotoAnimal = async ({ animalId, organizacionId, fincaId }) => {
    const animal = await buscarAnimalConFoto({ animalId, organizacionId, fincaId });
    if (!animal) {
        const error = new Error('Animal no encontrado.'); error.status = 404; throw error;
    }
    const foto = animal.fotoPrincipal;
    animal.fotoPrincipal = null;
    await animal.save();
    if (foto?._id) await desactivarArchivo(foto);
    return animal;
};

const limpiarFotoAnimalEliminado = async (fotoId) => {
    if (!fotoId) return;
    const archivo = await ArchivoMultimedia.findById(fotoId);
    if (archivo) await desactivarArchivo(archivo);
};

module.exports = {
    eliminarFotoAnimal,
    limpiarFotoAnimalEliminado,
    subirFotoAnimal
};
