const {
    COMPOSICIONES_RACIALES,
    GRADOS_RACIALES,
    GRUPOS_RACIALES,
    RAZAS,
    RAZAS_POR_TIPO,
    VARIEDADES_POR_RAZA
} = require('../config/catalogoRacial');

const CAMPOS_RACIALES = [
    'raza',
    'razaPrincipal',
    'razaSecundaria',
    'gradoRacial',
    'variedadRacial',
    'descripcionRacial',
    'composicionRacial'
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

const ALIASES = new Map();
RAZAS.forEach((raza) => ALIASES.set(normalizarTexto(raza), raza));
[
    ['brahaman', 'Brahman'],
    ['brahman gris', 'Brahman'],
    ['brahman rojo', 'Brahman'],
    ['pardo suizo', 'Braunvieh / Pardo Suizo'],
    ['braunvieh', 'Braunvieh / Pardo Suizo'],
    ['mestizo', 'Mestizo / Cruce no definido'],
    ['cruce no definido', 'Mestizo / Cruce no definido'],
    ['desconocido', 'Desconocida']
].forEach(([alias, raza]) => ALIASES.set(normalizarTexto(alias), raza));

const obtenerRazaCanonica = (valor) => ALIASES.get(normalizarTexto(valor)) || null;

const tipoRaza = (raza) => Object.entries(RAZAS_POR_TIPO)
    .find(([, razas]) => razas.includes(raza))?.[0] || null;

const determinarGrupoRacial = ({ razaPrincipal, razaSecundaria, gradoRacial }) => {
    const principal = obtenerRazaCanonica(razaPrincipal) || razaPrincipal;
    const secundaria = obtenerRazaCanonica(razaSecundaria) || razaSecundaria;
    const tipoPrincipal = tipoRaza(principal);
    const tipoSecundaria = tipoRaza(secundaria);

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

const analizarDescripcionRacial = (descripcion) => {
    const original = String(descripcion || '').trim();
    const normalizada = normalizarTexto(original);
    if (!normalizada) {
        return {
            razaPrincipal: 'Desconocida',
            razaSecundaria: null,
            gradoRacial: 'Desconocido',
            grupoRacial: 'Desconocido',
            descripcionRacial: original || null
        };
    }

    const encontradas = RAZAS
        .filter((raza) => !['Otra', 'Desconocida', 'Mestizo / Cruce no definido'].includes(raza))
        .map((raza) => ({ raza, posicion: normalizada.indexOf(normalizarTexto(raza)) }))
        .filter((item) => item.posicion >= 0)
        .sort((a, b) => a.posicion - b.posicion);

    if (normalizada.includes('brahaman') && !encontradas.some((item) => item.raza === 'Brahman')) {
        encontradas.unshift({ raza: 'Brahman', posicion: normalizada.indexOf('brahaman') });
    }
    if (/\bnelor\b/.test(normalizada) && !encontradas.some((item) => item.raza === 'Nelore')) {
        encontradas.unshift({ raza: 'Nelore', posicion: normalizada.indexOf('nelor') });
    }

    const unicas = [...new Set(encontradas.map((item) => item.raza))];
    const indicaCruce = /\b(cruza|cruzado|cruzamiento|cruce|mestizo|media sangre|x|con)\b/.test(normalizada);
    const indicaRegistro = /\b(puro|pura|registro|registrado|registrada)\b/.test(normalizada);
    let razaPrincipal = unicas[0] || obtenerRazaCanonica(original);
    let razaSecundaria = unicas.find((raza) => raza !== razaPrincipal) || null;

    if (!razaPrincipal && normalizada.includes('mestiz')) razaPrincipal = 'Mestizo / Cruce no definido';
    if (!razaPrincipal) razaPrincipal = 'Otra';

    const gradoRacial = razaSecundaria
        ? 'Cruce conocido'
        : indicaCruce || razaPrincipal === 'Mestizo / Cruce no definido'
            ? 'Cruce no definido'
            : razaPrincipal === 'Otra'
                ? 'Desconocido'
                : indicaRegistro ? 'Puro / Registrado' : 'Predominante';
    const variedadRacial = detectarVariedad(original, razaPrincipal);

    return {
        razaPrincipal,
        razaSecundaria,
        grupoRacial: determinarGrupoRacial({ razaPrincipal, razaSecundaria, gradoRacial }),
        gradoRacial,
        variedadRacial,
        descripcionRacial: original
    };
};

const construirDescripcionRacial = ({ razaPrincipal, razaSecundaria, gradoRacial, variedadRacial }) => {
    if (!razaPrincipal || razaPrincipal === 'Desconocida') return '';
    if (razaPrincipal === 'Otra') return '';
    let descripcion = razaPrincipal;
    if (variedadRacial) descripcion += ` ${variedadRacial}`;
    if (razaSecundaria && razaSecundaria !== 'Desconocida') descripcion += ` × ${razaSecundaria}`;
    else if (gradoRacial === 'Cruce no definido') descripcion += ' cruzado';
    return descripcion;
};

const prepararDatosRaciales = (datos, animalAnterior = null) => {
    const copia = { ...datos };
    const especie = copia.especie || animalAnterior?.especie || 'Bovino';
    const modificaRaza = CAMPOS_RACIALES.some((campo) => Object.prototype.hasOwnProperty.call(copia, campo));
    if (especie !== 'Bovino' || !modificaRaza) return copia;

    const entradaPrincipal = copia.razaPrincipal || animalAnterior?.razaPrincipal;
    const entradaSecundaria = copia.razaSecundaria === null || copia.razaSecundaria === ''
        ? null
        : copia.razaSecundaria || animalAnterior?.razaSecundaria;
    const descripcionEntrada = copia.descripcionRacial || copia.raza || entradaPrincipal || animalAnterior?.descripcionRacial || animalAnterior?.raza || '';
    const analisis = analizarDescripcionRacial(descripcionEntrada);
    const razaPrincipal = obtenerRazaCanonica(entradaPrincipal)
        || (entradaPrincipal ? analizarDescripcionRacial(entradaPrincipal).razaPrincipal : analisis.razaPrincipal);
    const razaSecundaria = obtenerRazaCanonica(entradaSecundaria)
        || (entradaSecundaria ? analizarDescripcionRacial(entradaSecundaria).razaPrincipal : null);
    const gradoRacial = copia.gradoRacial
        || (razaSecundaria ? 'Cruce conocido' : analisis.gradoRacial)
        || 'Desconocido';
    const variedadRacial = copia.variedadRacial || analizarDescripcionRacial(descripcionEntrada).variedadRacial || null;
    const descripcionRacial = String(copia.descripcionRacial || copia.raza || construirDescripcionRacial({
        razaPrincipal,
        razaSecundaria,
        gradoRacial,
        variedadRacial
    }) || descripcionEntrada).trim();

    copia.razaPrincipal = razaPrincipal || 'Desconocida';
    copia.razaSecundaria = razaSecundaria || null;
    copia.gradoRacial = GRADOS_RACIALES.includes(gradoRacial) ? gradoRacial : 'Desconocido';
    copia.variedadRacial = variedadRacial || null;
    copia.descripcionRacial = descripcionRacial || null;
    copia.composicionRacial = copia.composicionRacial || null;
    copia.grupoRacial = determinarGrupoRacial(copia);
    copia.raza = copia.raza || descripcionRacial || animalAnterior?.raza;
    return copia;
};

const obtenerCatalogoRacial = () => ({
    razas: RAZAS,
    gruposRaciales: GRUPOS_RACIALES,
    gradosRaciales: GRADOS_RACIALES,
    variedadesPorRaza: VARIEDADES_POR_RAZA,
    composicionesRaciales: COMPOSICIONES_RACIALES
});

module.exports = {
    analizarDescripcionRacial,
    construirDescripcionRacial,
    determinarGrupoRacial,
    obtenerCatalogoRacial,
    obtenerRazaCanonica,
    prepararDatosRaciales
};
