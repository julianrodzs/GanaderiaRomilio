const mongoose = require('mongoose');
const Animal = require('../models/Animal');

const CAMPOS_ANIMAL = 'diio identificadorFinca nombre sexo raza padre madre padreExternoNombre madreExternaNombre registroGenealogico observacionesGenealogicas origenGenealogico fechaNacimiento estado';
const MAX_GENERACIONES_VALIDACION = 12;

const normalizarId = (valor) => {
    if (!valor) return null;
    if (typeof valor === 'object' && valor._id) return String(valor._id);
    return String(valor);
};

const esObjectIdValido = (id) => mongoose.Types.ObjectId.isValid(id);

const obtenerAnimalBasico = async (animalId) => {
    if (!esObjectIdValido(animalId)) return null;
    return Animal.findById(animalId).select(CAMPOS_ANIMAL).lean();
};

const crearError = (mensaje, status = 400) => {
    const error = new Error(mensaje);
    error.status = status;
    return error;
};

const obtenerAncestros = async (animalId, generaciones = 3, visitados = new Set(), nivel = 1) => {
    if (!animalId || nivel > generaciones || visitados.has(String(animalId))) return [];
    visitados.add(String(animalId));

    const animal = await obtenerAnimalBasico(animalId);
    if (!animal) return [];

    const padres = [animal.padre, animal.madre].filter(Boolean);
    const ancestros = [];

    for (const padreId of padres) {
        const padre = await obtenerAnimalBasico(padreId);
        if (!padre) continue;
        ancestros.push({ ...padre, nivel });
        const superiores = await obtenerAncestros(padre._id, generaciones, visitados, nivel + 1);
        ancestros.push(...superiores);
    }

    return ancestros;
};

const obtenerIdsAncestros = async (animalId, generaciones = 3) => {
    const ancestros = await obtenerAncestros(animalId, generaciones);
    return new Set(ancestros.map((animal) => String(animal._id)));
};

const esDescendienteDirecto = async (animalId, posibleAncestroId) => {
    const ancestros = await obtenerIdsAncestros(animalId, MAX_GENERACIONES_VALIDACION);
    return ancestros.has(String(posibleAncestroId));
};

const validarRelacionGenealogica = async (animalId, padreId, madreId) => {
    const idAnimal = normalizarId(animalId);
    const idPadre = normalizarId(padreId);
    const idMadre = normalizarId(madreId);

    if (idAnimal && idPadre && idPadre === idAnimal) {
        throw crearError('Un animal no puede ser su propio padre.');
    }

    if (idAnimal && idMadre && idMadre === idAnimal) {
        throw crearError('Un animal no puede ser su propia madre.');
    }

    if (idPadre && idMadre && idPadre === idMadre) {
        throw crearError('Padre y madre no pueden ser el mismo animal.');
    }

    if (idPadre) {
        const padre = await obtenerAnimalBasico(idPadre);
        if (!padre) throw crearError('El padre seleccionado no existe.');
        if (padre.sexo !== 'Macho') throw crearError('El padre registrado debe ser Macho.');
        if (idAnimal && await esDescendienteDirecto(idPadre, idAnimal)) {
            throw crearError('La relación de padre genera un ciclo genealógico.');
        }
    }

    if (idMadre) {
        const madre = await obtenerAnimalBasico(idMadre);
        if (!madre) throw crearError('La madre seleccionada no existe.');
        if (madre.sexo !== 'Hembra') throw crearError('La madre registrada debe ser Hembra.');
        if (idAnimal && await esDescendienteDirecto(idMadre, idAnimal)) {
            throw crearError('La relación de madre genera un ciclo genealógico.');
        }
    }
};

const crearNodoArbol = async (animalId, generaciones, visitados = new Set()) => {
    const animal = await obtenerAnimalBasico(animalId);
    if (!animal) return null;

    const idActual = String(animal._id);
    if (visitados.has(idActual)) {
        return { animal, padre: null, madre: null, cicloDetectado: true };
    }

    const siguientesVisitados = new Set(visitados);
    siguientesVisitados.add(idActual);

    const nodo = {
        animal,
        padre: null,
        madre: null
    };

    if (generaciones <= 0) return nodo;

    if (animal.padre) {
        nodo.padre = await crearNodoArbol(animal.padre, generaciones - 1, siguientesVisitados);
    } else if (animal.padreExternoNombre || animal.padreDiio) {
        nodo.padre = {
            animal: {
                nombre: animal.padreExternoNombre || animal.padreDiio,
                externo: true,
                sexo: 'Macho'
            },
            padre: null,
            madre: null
        };
    }

    if (animal.madre) {
        nodo.madre = await crearNodoArbol(animal.madre, generaciones - 1, siguientesVisitados);
    } else if (animal.madreExternaNombre || animal.madreDiio) {
        nodo.madre = {
            animal: {
                nombre: animal.madreExternaNombre || animal.madreDiio,
                externo: true,
                sexo: 'Hembra'
            },
            padre: null,
            madre: null
        };
    }

    return nodo;
};

const obtenerArbolGenealogico = async (animalId, generaciones = 3) => {
    const totalGeneraciones = Math.max(Number(generaciones) || 3, 0);
    const nodo = await crearNodoArbol(animalId, totalGeneraciones);
    if (!nodo) return null;
    return {
        ...nodo,
        generaciones: totalGeneraciones
    };
};

const obtenerDescendencia = async (animalId) => {
    const hijos = await Animal.find({
        $or: [{ padre: animalId }, { madre: animalId }]
    }).select(CAMPOS_ANIMAL).sort({ fechaNacimiento: -1 }).lean();

    const hijosIds = hijos.map((animal) => animal._id);
    const nietos = hijosIds.length
        ? await Animal.find({
            $or: [{ padre: { $in: hijosIds } }, { madre: { $in: hijosIds } }]
        }).select(CAMPOS_ANIMAL).sort({ fechaNacimiento: -1 }).lean()
        : [];

    return {
        hijos,
        nietos,
        totalDescendientes: hijos.length + nietos.length
    };
};

const intersectarAncestros = async (animalA, animalB, generaciones = 3) => {
    const ancestrosA = await obtenerAncestros(animalA, generaciones);
    const ancestrosB = await obtenerAncestros(animalB, generaciones);
    const mapaA = new Map(ancestrosA.map((animal) => [String(animal._id), animal]));

    return ancestrosB
        .filter((animal) => mapaA.has(String(animal._id)))
        .map((animal) => ({
            ...animal,
            nivelAnimalA: mapaA.get(String(animal._id)).nivel,
            nivelAnimalB: animal.nivel
        }));
};

const detectarParentesco = async (animalA, animalB) => {
    const idA = normalizarId(animalA);
    const idB = normalizarId(animalB);
    if (!idA || !idB) throw crearError('Debes indicar ambos animales.');
    if (idA === idB) {
        return {
            parentesco: 'Mismo animal',
            ancestrosComunes: [],
            descripcion: 'Se seleccionó el mismo animal.'
        };
    }

    const [a, b] = await Promise.all([obtenerAnimalBasico(idA), obtenerAnimalBasico(idB)]);
    if (!a || !b) throw crearError('Uno de los animales no existe.', 404);

    const aEsAncestro = await esDescendienteDirecto(idB, idA);
    const bEsAncestro = await esDescendienteDirecto(idA, idB);
    const ancestrosComunes = await intersectarAncestros(idA, idB, 3);

    let parentesco = 'Sin parentesco conocido';
    if (aEsAncestro || bEsAncestro) parentesco = 'Descendencia directa';
    else if (ancestrosComunes.some((animal) => animal.nivelAnimalA === 1 && animal.nivelAnimalB === 1)) parentesco = 'Medios hermanos o hermanos';
    else if (ancestrosComunes.length > 0) parentesco = 'Ancestros comunes';

    return {
        parentesco,
        ancestrosComunes,
        descripcion: ancestrosComunes.length
            ? `Comparten ${ancestrosComunes.length} ancestro(s) conocido(s).`
            : 'No se encontraron ancestros comunes conocidos en 3 generaciones.'
    };
};

const calcularRiesgoCruce = async (machoId, hembraId) => {
    const [macho, hembra] = await Promise.all([
        obtenerAnimalBasico(machoId),
        obtenerAnimalBasico(hembraId)
    ]);

    if (!macho || !hembra) throw crearError('Macho o hembra no encontrado.', 404);
    if (macho.sexo !== 'Macho') throw crearError('El animal macho seleccionado debe tener sexo Macho.');
    if (hembra.sexo !== 'Hembra') throw crearError('La hembra seleccionada debe tener sexo Hembra.');

    const datosInsuficientes = !macho.padre && !macho.madre && !hembra.padre && !hembra.madre;
    if (datosInsuficientes) {
        return {
            nivel: 'Indeterminado',
            motivo: 'No hay suficientes datos genealógicos registrados para evaluar el cruce.',
            ancestrosComunes: [],
            recomendacion: 'Completar padre y madre conocidos antes de tomar una decisión reproductiva.'
        };
    }

    const machoEsAncestro = await esDescendienteDirecto(hembraId, machoId);
    const hembraEsAncestro = await esDescendienteDirecto(machoId, hembraId);
    const ancestrosComunes = await intersectarAncestros(machoId, hembraId, 3);
    const compartenPadreOMadre = ancestrosComunes.some((animal) => animal.nivelAnimalA === 1 && animal.nivelAnimalB === 1);
    const compartenAbuelo = ancestrosComunes.some((animal) => animal.nivelAnimalA <= 2 && animal.nivelAnimalB <= 2);

    if (machoEsAncestro || hembraEsAncestro) {
        return {
            nivel: 'Alto',
            motivo: 'Uno de los animales aparece como ancestro directo del otro.',
            ancestrosComunes,
            recomendacion: 'Evitar este cruce.'
        };
    }

    if (compartenPadreOMadre) {
        return {
            nivel: 'Alto',
            motivo: 'Comparten padre o madre registrados.',
            ancestrosComunes,
            recomendacion: 'Evitar este cruce por riesgo alto de consanguinidad.'
        };
    }

    if (compartenAbuelo) {
        return {
            nivel: 'Medio',
            motivo: 'Comparten al menos un abuelo o abuela registrado.',
            ancestrosComunes,
            recomendacion: 'Revisar alternativas antes de usar este cruce.'
        };
    }

    if (ancestrosComunes.length > 0) {
        return {
            nivel: 'Medio',
            motivo: 'Tienen ancestros comunes más lejanos dentro de 3 generaciones.',
            ancestrosComunes,
            recomendacion: 'Cruce posible, pero conviene revisar la línea familiar.'
        };
    }

    return {
        nivel: 'Bajo',
        motivo: 'No se encontraron ancestros comunes conocidos en 3 generaciones.',
        ancestrosComunes: [],
        recomendacion: 'Cruce aceptable según la información disponible.'
    };
};

const prepararDatosGenealogia = (datos) => {
    const copia = { ...datos };

    ['padre', 'madre'].forEach((campo) => {
        if (copia[campo] === '') copia[campo] = null;
    });

    if (!copia.padre && !copia.padreExternoNombre && copia.padreDiio) {
        copia.padreExternoNombre = copia.padreDiio;
    }

    if (!copia.madre && !copia.madreExternaNombre && copia.madreDiio) {
        copia.madreExternaNombre = copia.madreDiio;
    }

    if (copia.padre || copia.madre) {
        copia.origenGenealogico = 'Interno';
    } else if (copia.padreExternoNombre || copia.madreExternaNombre) {
        copia.origenGenealogico = 'Externo';
    } else {
        copia.origenGenealogico = copia.origenGenealogico || 'Desconocido';
    }

    return copia;
};

module.exports = {
    obtenerArbolGenealogico,
    obtenerDescendencia,
    validarRelacionGenealogica,
    detectarParentesco,
    calcularRiesgoCruce,
    prepararDatosGenealogia
};
