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
    if (animal.estado && animal.estado !== 'Activo') return animal.categoria || null;
    if ((animal.especie || 'Bovino') === 'Porcino') return obtenerCategoriaPorcinaPorEdad(animal, fechaReferencia);
    return obtenerCategoriaBovinaPorEdad(animal, fechaReferencia);
};

const validarYPrepararCategoriaAnimal = (datos, animalAnterior = {}, fechaReferencia = new Date()) => {
    const animal = {
        especie: datos.especie ?? animalAnterior.especie ?? 'Bovino',
        sexo: datos.sexo ?? animalAnterior.sexo,
        fechaNacimiento: datos.fechaNacimiento !== undefined ? datos.fechaNacimiento : animalAnterior.fechaNacimiento,
        estado: datos.estado ?? animalAnterior.estado,
        categoria: animalAnterior.categoria || datos.categoria
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

const fechaProximoCambioCategoria = (animal, fechaReferencia = new Date()) => {
    if (animal.estado && animal.estado !== 'Activo') return null;
    if (!animal.fechaNacimiento || !['Hembra', 'Macho'].includes(animal.sexo)) return null;
    const nacimiento = new Date(animal.fechaNacimiento);
    if (Number.isNaN(+nacimiento)) return null;
    const edad = calcularEdadMeses(nacimiento, fechaReferencia);
    if (edad === null) return nacimiento > fechaReferencia ? new Date(Date.UTC(nacimiento.getUTCFullYear(), nacimiento.getUTCMonth(), nacimiento.getUTCDate())) : null;
    const umbral = ((animal.especie || 'Bovino') === 'Porcino' ? [3, 7] : [12, 24]).find((meses) => edad < meses);
    return umbral == null ? null : new Date(Date.UTC(nacimiento.getUTCFullYear(), nacimiento.getUTCMonth() + umbral, nacimiento.getUTCDate()));
};

const filtroCategoriasElegibles = (fechaReferencia) => ({
    estado: 'Activo', fechaNacimiento: { $ne: null },
    $or: [{ fechaProximoCambioCategoria: { $lte: fechaReferencia } }, { fechaProximoCambioCategoria: { $exists: false } }]
});

const sincronizarCategoriasAnimales = async (fechaReferencia = new Date(), { comprobarBloqueo = async () => {}, alProgreso = () => {} } = {}) => {
    const Animal = require('../models/Animal');
    const resumen = { escaneados: 0, revisados: 0, actualizados: 0, sellados: 0, lotes: 0 };
    let buffer = [];
    const guardar = async () => {
        await comprobarBloqueo();
        for (const cambiaCategoria of [true, false]) {
            const operaciones = buffer.filter((item) => item.cambiaCategoria === cambiaCategoria).map((item) => item.operacion);
            if (!operaciones.length) continue;
            await comprobarBloqueo();
            const contar = (resultado) => {
                const modificados = Number(resultado?.modifiedCount || 0);
                resumen.sellados += modificados;
                if (cambiaCategoria) resumen.actualizados += modificados;
            };
            try { contar(await Animal.bulkWrite(operaciones, { ordered: false, agendaCategoriaPreparada: true })); }
            catch (error) { contar(error.result); throw error; }
        }
        resumen.lotes++;
        buffer = [];
        alProgreso();
    };
    await comprobarBloqueo();
    const cursor = Animal.find(filtroCategoriasElegibles(fechaReferencia))
        .select('_id organizacionId fincaId especie sexo categoria fechaNacimiento estado fechaProximoCambioCategoria')
        .lean().cursor({ batchSize: 250 });
    try {
        for await (const animal of cursor) {
            await comprobarBloqueo();
            resumen.escaneados++; resumen.revisados++;
            const categoria = obtenerCategoriaAnimal(animal, fechaReferencia);
            const proxima = fechaProximoCambioCategoria(animal, fechaReferencia);
            const cambios = {};
            const cambiaCategoria = Boolean(categoria && categoria !== animal.categoria);
            if (cambiaCategoria) cambios.categoria = categoria;
            if (!Object.hasOwn(animal, 'fechaProximoCambioCategoria') || Number(animal.fechaProximoCambioCategoria) !== Number(proxima)) cambios.fechaProximoCambioCategoria = proxima;
            if (Object.keys(cambios).length) buffer.push({ cambiaCategoria, operacion: { updateOne: {
                // Comparacion optimista: no pisar una venta o una correccion mientras se recorre el cursor.
                filter: { _id: animal._id, fincaId: animal.fincaId, estado: 'Activo', fechaNacimiento: animal.fechaNacimiento,
                    sexo: animal.sexo, especie: Object.hasOwn(animal, 'especie') ? animal.especie : { $exists: false },
                    categoria: Object.hasOwn(animal, 'categoria') ? animal.categoria : { $exists: false },
                    fechaProximoCambioCategoria: Object.hasOwn(animal, 'fechaProximoCambioCategoria') ? animal.fechaProximoCambioCategoria : { $exists: false } },
                update: { $set: cambios }
            } } });
            if (buffer.length >= 250) await guardar();
        }
        if (buffer.length) await guardar();
        return resumen;
    } catch (error) {
        error.resultadoCategorias = { ...resumen };
        throw error;
    } finally {
        await cursor.close();
    }
};

module.exports = {
    calcularEdadMeses,
    obtenerCategoriaBovinaPorEdad,
    obtenerCategoriaPorcinaPorEdad,
    obtenerCategoriaAnimal,
    validarYPrepararCategoriaAnimal,
    sincronizarCategoriasAnimales,
    fechaProximoCambioCategoria,
    filtroCategoriasElegibles,
    CATEGORIAS_POR_ESPECIE
};
