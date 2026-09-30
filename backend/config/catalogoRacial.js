const GRUPOS_RACIALES = [
    'Cebuino',
    'Europeo de carne',
    'Tropical adaptado',
    'Sintético',
    'Cebú × Europeo',
    'Cebú × Tropical adaptado',
    'Cruce cebú no definido',
    'Criollo / Mestizo',
    'Otro',
    'Desconocido'
];

const GRADOS_RACIALES = [
    'Puro / Registrado',
    'Predominante',
    'Cruce conocido',
    'Cruce no definido',
    'Desconocido'
];

const RAZAS = [
    'Brahman',
    'Nelore',
    'Angus',
    'Simmental',
    'Fleckvieh',
    'Senepol',
    'Braunvieh / Pardo Suizo',
    'Charolais',
    'Limousin',
    'Hereford',
    'Romosinuano',
    'Brangus',
    'Simbrah',
    'Beefmaster',
    'Charbray',
    'Santa Gertrudis',
    'Gyr',
    'Guzerat',
    'Indubrasil',
    'Sardo Negro',
    'Sindi',
    "Blonde d'Aquitaine",
    'Chianina',
    'Gelbvieh',
    'Piemontese',
    'Belgian Blue',
    'Maine-Anjou',
    'Murray Grey',
    'Pinzgauer',
    'Normando',
    'Criollo',
    'Mestizo / Cruce no definido',
    'Otra',
    'Desconocida'
];

const VARIEDADES_POR_RAZA = {
    Brahman: ['Gris', 'Rojo'],
    Angus: ['Negro', 'Rojo'],
    Brangus: ['Negro', 'Rojo']
};

const COMPOSICIONES_RACIALES = ['50/50', '3/4 - 1/4', '5/8 - 3/8', '7/8 - 1/8', 'Otra'];

const RAZAS_POR_TIPO = {
    cebuino: ['Brahman', 'Nelore', 'Gyr', 'Guzerat', 'Indubrasil', 'Sardo Negro', 'Sindi'],
    europeo: [
        'Angus', 'Simmental', 'Fleckvieh', 'Braunvieh / Pardo Suizo', 'Charolais',
        'Limousin', 'Hereford', "Blonde d'Aquitaine", 'Chianina', 'Gelbvieh',
        'Piemontese', 'Belgian Blue', 'Maine-Anjou', 'Murray Grey', 'Pinzgauer', 'Normando'
    ],
    tropical: ['Senepol', 'Romosinuano', 'Criollo'],
    sintetico: ['Brangus', 'Simbrah', 'Beefmaster', 'Charbray', 'Santa Gertrudis']
};

module.exports = {
    COMPOSICIONES_RACIALES,
    GRADOS_RACIALES,
    GRUPOS_RACIALES,
    RAZAS,
    RAZAS_POR_TIPO,
    VARIEDADES_POR_RAZA
};
