const calcularEdadMeses = (fechaNacimiento, fechaReferencia = new Date()) => {
    if (!fechaNacimiento) return null;
    const nacimiento = new Date(fechaNacimiento);
    const referencia = new Date(fechaReferencia);
    if (Number.isNaN(nacimiento.getTime()) || Number.isNaN(referencia.getTime()) || nacimiento > referencia) return null;

    let meses = (referencia.getUTCFullYear() - nacimiento.getUTCFullYear()) * 12;
    meses += referencia.getUTCMonth() - nacimiento.getUTCMonth();
    if (referencia.getUTCDate() < nacimiento.getUTCDate()) meses -= 1;
    return Math.max(meses, 0);
};

const obtenerCategoriaBovinaPorEdad = ({ sexo, fechaNacimiento }, fechaReferencia = new Date()) => {
    const edadMeses = calcularEdadMeses(fechaNacimiento, fechaReferencia);
    if (edadMeses === null || !['Hembra', 'Macho'].includes(sexo)) return null;
    if (edadMeses < 12) return sexo === 'Hembra' ? 'Ternera' : 'Ternero';
    if (sexo === 'Hembra') return edadMeses >= 24 ? 'Vaca' : 'Novilla';
    return edadMeses >= 24 ? 'Toro' : 'Novillo';
};

const obtenerCategoriaPorcinaPorEdad = ({ sexo, fechaNacimiento }, fechaReferencia = new Date()) => {
    const edadMeses = calcularEdadMeses(fechaNacimiento, fechaReferencia);
    if (edadMeses === null || !['Hembra', 'Macho'].includes(sexo)) return null;
    if (edadMeses < 3) return sexo === 'Hembra' ? 'Lechona' : 'Lechón';
    if (edadMeses < 7) return sexo === 'Hembra' ? 'Cerda joven' : 'Cerdo joven';
    return sexo === 'Hembra' ? 'Chancha' : 'Cerdo adulto';
};

const CATEGORIAS_POR_ESPECIE = {
    Bovino: ['Ternero', 'Ternera', 'Novillo', 'Novilla', 'Toro', 'Vaca', 'Otro'],
    Porcino: ['Lechón', 'Lechona', 'Cerdo joven', 'Cerda joven', 'Cerdo adulto', 'Chancha', 'Otro']
};

const obtenerCategoriaAnimal = (animal, fechaReferencia = new Date()) => {
    if ((animal.especie || 'Bovino') === 'Porcino') return obtenerCategoriaPorcinaPorEdad(animal, fechaReferencia);
    return obtenerCategoriaBovinaPorEdad(animal, fechaReferencia);
};

const validarYPrepararCategoriaAnimal = (datos, animalAnterior = {}, fechaReferencia = new Date()) => {
    const animal = {
        especie: datos.especie ?? animalAnterior.especie ?? 'Bovino',
        sexo: datos.sexo ?? animalAnterior.sexo,
        fechaNacimiento: datos.fechaNacimiento !== undefined ? datos.fechaNacimiento : animalAnterior.fechaNacimiento
    };
    const calculada = obtenerCategoriaAnimal(animal, fechaReferencia);
    const recibida = datos.categoria;

    if (calculada && recibida && recibida !== calculada) {
        const error = new Error(`La categoría correcta para un ${animal.especie.toLowerCase()} ${animal.sexo.toLowerCase()} de esa edad es ${calculada}.`);
        error.status = 400;
        error.codigo = 'CATEGORIA_EDAD_SEXO_INCOMPATIBLE';
        throw error;
    }
    if (calculada) return { ...datos, categoria: calculada };
    if (recibida && !CATEGORIAS_POR_ESPECIE[animal.especie]?.includes(recibida)) {
        const error = new Error(`La categoría ${recibida} no corresponde a la especie ${animal.especie}.`);
        error.status = 400;
        throw error;
    }
    return datos;
};

const sincronizarCategoriasAnimales = async (fechaReferencia = new Date()) => {
    const Animal = require('../models/Animal');
    const animales = await Animal.find({ fechaNacimiento: { $ne: null } })
        .select('_id especie sexo fechaNacimiento categoria')
        .lean();
    const operaciones = animales.reduce((acumuladas, animal) => {
        const categoria = obtenerCategoriaAnimal(animal, fechaReferencia);
        if (categoria && categoria !== animal.categoria) {
            acumuladas.push({
                updateOne: {
                    filter: { _id: animal._id },
                    update: { $set: { categoria } }
                }
            });
        }
        return acumuladas;
    }, []);

    if (operaciones.length) await Animal.bulkWrite(operaciones);
    return { revisados: animales.length, actualizados: operaciones.length };
};

module.exports = {
    calcularEdadMeses,
    obtenerCategoriaBovinaPorEdad,
    obtenerCategoriaPorcinaPorEdad,
    obtenerCategoriaAnimal,
    validarYPrepararCategoriaAnimal,
    sincronizarCategoriasAnimales,
    CATEGORIAS_POR_ESPECIE
};
