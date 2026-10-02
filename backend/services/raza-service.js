const {
    COMPOSICIONES_RACIALES,
    FRACCIONES_RACIALES,
    GRADOS_RACIALES,
    GRUPOS_RACIALES_BOVINOS,
    GRUPOS_RACIALES_PORCINOS,
    RAZAS_BOVINAS,
    RAZAS_PORCINAS,
    RAZAS_POR_TIPO,
    VARIEDADES_POR_RAZA
} = require('../config/catalogoRacial');

const CAMPOS_RACIALES = [
    'raza', 'razaPrincipal', 'razaSecundaria', 'grupoRacial', 'gradoRacial',
    'variedadRacial', 'descripcionRacial', 'composicionRacial',
    'fraccionRazaPrincipal', 'fraccionRazaSecundaria'
];

const normalizarTexto = (valor) => String(valor || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const resolverEspecie = (especie) => especie === 'Porcino' ? 'Porcino' : 'Bovino';
const razasPorEspecie = (especie) => resolverEspecie(especie) === 'Porcino' ? RAZAS_PORCINAS : RAZAS_BOVINAS;

const crearAliases = (razas, adicionales = []) => {
    const aliases = new Map();
    razas.forEach((raza) => aliases.set(normalizarTexto(raza), raza));
    adicionales.forEach(([alias, raza]) => aliases.set(normalizarTexto(alias), raza));
    return aliases;
};

const ALIASES_BOVINOS = crearAliases(RAZAS_BOVINAS, [
    ['brahaman', 'Brahman'],
    ['brahman gris', 'Brahman'],
    ['brahman rojo', 'Brahman'],
    ['pardo suizo', 'Braunvieh / Pardo Suizo'],
    ['braunvieh', 'Braunvieh / Pardo Suizo'],
    ['mestizo', 'Mestizo / Cruce no definido'],
    ['cruce no definido', 'Mestizo / Cruce no definido'],
    ['desconocido', 'Desconocida']
]);

const ALIASES_PORCINOS = crearAliases(RAZAS_PORCINAS, [
    ['large white', 'Large White (Yorkshire)'],
    ['yorkshire', 'Large White (Yorkshire)'],
    ['largewhite', 'Large White (Yorkshire)'],
    ['landra', 'Landrace'],
    ['durock', 'Duroc'],
    ['pietran', 'Pietrain'],
    ['spot', 'Spotted'],
    ['criolla', 'Criollo'],
    ['mestizo', 'Mestizo / Cruce no definido'],
    ['cruce no definido', 'Mestizo / Cruce no definido'],
    ['linea comercial', 'Línea comercial / Híbrido'],
    ['hibrido', 'Línea comercial / Híbrido'],
    ['hibrida', 'Línea comercial / Híbrido'],
    ['desconocido', 'Desconocida']
]);

const obtenerRazaCanonica = (valor, especie = 'Bovino') => {
    const aliases = resolverEspecie(especie) === 'Porcino' ? ALIASES_PORCINOS : ALIASES_BOVINOS;
    return aliases.get(normalizarTexto(valor)) || null;
};

const tipoRazaBovina = (raza) => Object.entries(RAZAS_POR_TIPO)
    .find(([, razas]) => razas.includes(raza))?.[0] || null;

const determinarGrupoRacial = ({ razaPrincipal, razaSecundaria, gradoRacial, especie = 'Bovino' }) => {
    const especieCanonica = resolverEspecie(especie);
    const principal = obtenerRazaCanonica(razaPrincipal, especieCanonica) || razaPrincipal;
    const secundaria = obtenerRazaCanonica(razaSecundaria, especieCanonica) || razaSecundaria;

    if (especieCanonica === 'Porcino') {
        if (principal === 'Criollo' || principal === 'Mestizo / Cruce no definido') return 'Criollo / Mestizo';
        if (principal === 'Línea comercial / Híbrido') return 'Línea comercial / Híbrido';
        if (principal === 'Otra') return 'Otro';
        if (!principal || principal === 'Desconocida') return 'Desconocido';
        if (RAZAS_PORCINAS.includes(principal)) return 'Comercial internacional';
        return gradoRacial === 'Cruce no definido' ? 'Criollo / Mestizo' : 'Otro';
    }

    const tipoPrincipal = tipoRazaBovina(principal);
    const tipoSecundaria = tipoRazaBovina(secundaria);
    if (RAZAS_POR_TIPO.sintetico.includes(principal)) return 'Sintético';
    if (principal === 'Mestizo / Cruce no definido' || principal === 'Criollo') return 'Criollo / Mestizo';
    if (principal === 'Otra') return 'Otro';
    if (!principal || principal === 'Desconocida') return 'Desconocido';
    if (!secundaria || secundaria === 'Desconocida') {
        if (gradoRacial === 'Cruce no definido' && tipoPrincipal === 'cebuino') return 'Cruce cebú no definido';
        if (gradoRacial === 'Cruce no definido') return principal === 'Mestizo / Cruce no definido' ? 'Criollo / Mestizo' : 'Otro';
        if (tipoPrincipal === 'cebuino') return 'Cebuino';
        if (tipoPrincipal === 'europeo') return 'Europeo de carne';
        if (tipoPrincipal === 'tropical') return 'Tropical adaptado';
        return 'Desconocido';
    }
    const tipos = new Set([tipoPrincipal, tipoSecundaria]);
    if (tipos.size === 1 && tipoPrincipal === 'cebuino') return 'Cebuino';
    if (tipos.has('cebuino') && tipos.has('europeo')) return 'Cebú × Europeo';
    if (tipos.has('cebuino') && tipos.has('tropical')) return 'Cebú × Tropical adaptado';
    if (tipos.size === 1 && tipoPrincipal === 'europeo') return 'Europeo de carne';
    if (tipos.size === 1 && tipoPrincipal === 'tropical') return 'Tropical adaptado';
    return 'Otro';
};

const detectarVariedad = (texto, raza) => {
    const normalizado = normalizarTexto(texto);
    return (VARIEDADES_POR_RAZA[raza] || []).find((variedad) => normalizado.includes(normalizarTexto(variedad))) || null;
};

const analizarDescripcionRacial = (descripcion, especie = 'Bovino') => {
    const especieCanonica = resolverEspecie(especie);
    const razas = razasPorEspecie(especieCanonica);
    const original = String(descripcion || '').trim();
    const normalizada = normalizarTexto(original);
    if (!normalizada) {
        return {
            razaPrincipal: 'Desconocida', razaSecundaria: null, gradoRacial: 'Desconocido',
            grupoRacial: 'Desconocido', descripcionRacial: original || null
        };
    }

    const encontradas = razas
        .filter((raza) => !['Otra', 'Desconocida', 'Mestizo / Cruce no definido'].includes(raza))
        .map((raza) => ({ raza, posicion: normalizada.indexOf(normalizarTexto(raza)) }))
        .filter((item) => item.posicion >= 0)
        .sort((a, b) => a.posicion - b.posicion);

    if (especieCanonica === 'Bovino') {
        if (normalizada.includes('brahaman') && !encontradas.some((item) => item.raza === 'Brahman')) {
            encontradas.unshift({ raza: 'Brahman', posicion: normalizada.indexOf('brahaman') });
        }
        if (/\bnelor\b/.test(normalizada) && !encontradas.some((item) => item.raza === 'Nelore')) {
            encontradas.unshift({ raza: 'Nelore', posicion: normalizada.indexOf('nelor') });
        }
    } else {
        [
            ['yorkshire', 'Large White (Yorkshire)'],
            ['large white', 'Large White (Yorkshire)'],
            ['landra', 'Landrace'],
            ['durock', 'Duroc'],
            ['pietran', 'Pietrain'],
            ['spot', 'Spotted']
        ]
            .forEach(([alias, raza]) => {
                const posicion = normalizada.indexOf(alias);
                if (posicion >= 0 && !encontradas.some((item) => item.raza === raza)) encontradas.push({ raza, posicion });
            });
        encontradas.sort((a, b) => a.posicion - b.posicion);
    }

    const unicas = [...new Set(encontradas.map((item) => item.raza))];
    const indicaCruce = /\b(cruza|cruzado|cruzamiento|cruce|mestizo|media sangre|x|con)\b/.test(normalizada);
    const indicaRegistro = /\b(puro|pura|registro|registrado|registrada)\b/.test(normalizada);
    let razaPrincipal = unicas[0] || obtenerRazaCanonica(original, especieCanonica);
    const razaSecundaria = unicas.find((raza) => raza !== razaPrincipal) || null;
    if (!razaPrincipal && normalizada.includes('mestiz')) razaPrincipal = 'Mestizo / Cruce no definido';
    if (!razaPrincipal && especieCanonica === 'Porcino' && indicaCruce) razaPrincipal = 'Mestizo / Cruce no definido';
    if (!razaPrincipal) razaPrincipal = 'Otra';
    const gradoRacial = razaSecundaria
        ? 'Cruce conocido'
        : indicaCruce || razaPrincipal === 'Mestizo / Cruce no definido'
            ? 'Cruce no definido'
            : razaPrincipal === 'Otra' ? 'Desconocido' : indicaRegistro ? 'Puro / Registrado' : 'Predominante';
    const variedadRacial = detectarVariedad(original, razaPrincipal);
    return {
        razaPrincipal,
        razaSecundaria,
        grupoRacial: determinarGrupoRacial({ razaPrincipal, razaSecundaria, gradoRacial, especie: especieCanonica }),
        gradoRacial,
        variedadRacial,
        descripcionRacial: original
    };
};

const construirDescripcionRacial = ({ razaPrincipal, razaSecundaria, gradoRacial, variedadRacial }) => {
    if (!razaPrincipal || razaPrincipal === 'Desconocida' || razaPrincipal === 'Otra') return '';
    let descripcion = razaPrincipal;
    if (variedadRacial) descripcion += ` ${variedadRacial}`;
    if (razaSecundaria && razaSecundaria !== 'Desconocida') descripcion += ` × ${razaSecundaria}`;
    else if (gradoRacial === 'Cruce no definido') descripcion += ' cruzado';
    return descripcion;
};

const maximoComunDivisor = (a, b) => (b ? maximoComunDivisor(b, a % b) : a);
const normalizarFraccionRacial = (valor) => {
    if (valor === undefined || valor === null || String(valor).trim() === '') return null;
    const coincidencia = String(valor).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!coincidencia) throw new Error('La fracción racial debe usar el formato 3/8.');
    const numerador = Number(coincidencia[1]);
    const denominador = Number(coincidencia[2]);
    if (!denominador || numerador <= 0 || numerador > denominador) {
        throw new Error('La fracción racial debe ser mayor que cero y no puede superar la unidad.');
    }
    const divisor = maximoComunDivisor(numerador, denominador);
    return `${numerador / divisor}/${denominador / divisor}`;
};

const construirComposicionFraccionada = ({ razaPrincipal, razaSecundaria, fraccionRazaPrincipal, fraccionRazaSecundaria }) => {
    const partes = [];
    if (fraccionRazaPrincipal && razaPrincipal) partes.push(`${fraccionRazaPrincipal} ${razaPrincipal}`);
    if (fraccionRazaSecundaria && razaSecundaria) partes.push(`${fraccionRazaSecundaria} ${razaSecundaria}`);
    return partes.join(' + ') || null;
};

const prepararDatosRaciales = (datos, animalAnterior = null) => {
    const copia = { ...datos };
    const especie = resolverEspecie(copia.especie || animalAnterior?.especie || 'Bovino');
    const modificaRaza = CAMPOS_RACIALES.some((campo) => Object.prototype.hasOwnProperty.call(copia, campo));
    if (!modificaRaza) return copia;

    const entradaPrincipal = copia.razaPrincipal || animalAnterior?.razaPrincipal;
    const entradaSecundaria = copia.razaSecundaria === null || copia.razaSecundaria === ''
        ? null
        : copia.razaSecundaria || animalAnterior?.razaSecundaria;
    const descripcionEntrada = copia.descripcionRacial || copia.raza || entradaPrincipal || animalAnterior?.descripcionRacial || animalAnterior?.raza || '';
    const analisis = analizarDescripcionRacial(descripcionEntrada, especie);
    const razaPrincipal = obtenerRazaCanonica(entradaPrincipal, especie)
        || (entradaPrincipal ? analizarDescripcionRacial(entradaPrincipal, especie).razaPrincipal : analisis.razaPrincipal);
    const razaSecundaria = obtenerRazaCanonica(entradaSecundaria, especie)
        || (entradaSecundaria ? analizarDescripcionRacial(entradaSecundaria, especie).razaPrincipal : null);
    const gradoRacial = copia.gradoRacial || (razaSecundaria ? 'Cruce conocido' : analisis.gradoRacial) || 'Desconocido';
    const variedadRacial = copia.variedadRacial || analizarDescripcionRacial(descripcionEntrada, especie).variedadRacial || null;
    const descripcionRacial = String(copia.descripcionRacial || copia.raza || construirDescripcionRacial({
        razaPrincipal, razaSecundaria, gradoRacial, variedadRacial
    }) || descripcionEntrada).trim();
    const fraccionRazaPrincipal = normalizarFraccionRacial(
        Object.prototype.hasOwnProperty.call(copia, 'fraccionRazaPrincipal')
            ? copia.fraccionRazaPrincipal : animalAnterior?.fraccionRazaPrincipal
    );
    const fraccionRazaSecundaria = razaSecundaria ? normalizarFraccionRacial(
        Object.prototype.hasOwnProperty.call(copia, 'fraccionRazaSecundaria')
            ? copia.fraccionRazaSecundaria : animalAnterior?.fraccionRazaSecundaria
    ) : null;

    copia.razaPrincipal = razaPrincipal || 'Desconocida';
    copia.razaSecundaria = razaSecundaria || null;
    copia.gradoRacial = GRADOS_RACIALES.includes(gradoRacial) ? gradoRacial : 'Desconocido';
    copia.variedadRacial = variedadRacial || null;
    copia.descripcionRacial = descripcionRacial || null;
    copia.fraccionRazaPrincipal = fraccionRazaPrincipal;
    copia.fraccionRazaSecundaria = fraccionRazaSecundaria;
    copia.composicionRacial = construirComposicionFraccionada(copia) || copia.composicionRacial || null;
    copia.grupoRacial = determinarGrupoRacial({ ...copia, especie });
    copia.raza = copia.raza || descripcionRacial || animalAnterior?.raza;
    return copia;
};

const obtenerCatalogoRacial = (especie = 'Bovino') => {
    const especieCanonica = resolverEspecie(especie);
    return {
        especie: especieCanonica,
        razas: razasPorEspecie(especieCanonica),
        gruposRaciales: especieCanonica === 'Porcino' ? GRUPOS_RACIALES_PORCINOS : GRUPOS_RACIALES_BOVINOS,
        gradosRaciales: GRADOS_RACIALES,
        variedadesPorRaza: especieCanonica === 'Bovino' ? VARIEDADES_POR_RAZA : {},
        composicionesRaciales: COMPOSICIONES_RACIALES,
        fraccionesRaciales: FRACCIONES_RACIALES
    };
};

module.exports = {
    analizarDescripcionRacial,
    construirDescripcionRacial,
    determinarGrupoRacial,
    normalizarFraccionRacial,
    obtenerCatalogoRacial,
    obtenerRazaCanonica,
    prepararDatosRaciales
};
