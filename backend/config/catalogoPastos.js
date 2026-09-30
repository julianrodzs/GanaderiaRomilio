const PASTOS_BASE = [
    { clave: 'brizantha', nombre: 'Brizantha', nombreCientifico: 'Urochloa brizantha', especieBase: 'Urochloa brizantha', aliases: ['Brachiaria brizantha'] },
    { clave: 'brizantha-toledo', nombre: 'Toledo', nombreCientifico: 'Urochloa brizantha', especieBase: 'Urochloa brizantha', cultivar: 'Toledo', aliases: ['Brizantha Toledo', 'Brachiaria brizantha Toledo'] },
    { clave: 'brizantha-marandu', nombre: 'Marandú', nombreCientifico: 'Urochloa brizantha', especieBase: 'Urochloa brizantha', cultivar: 'Marandú', aliases: ['Brizantha Marandu', 'Brizantha Marandú'] },
    { clave: 'brizantha-piata', nombre: 'Piatá', nombreCientifico: 'Urochloa brizantha', especieBase: 'Urochloa brizantha', cultivar: 'Piatá', aliases: ['Brizantha Piata', 'Brizantha Piatá'] },
    { clave: 'brizantha-xaraes', nombre: 'Xaraés', nombreCientifico: 'Urochloa brizantha', especieBase: 'Urochloa brizantha', cultivar: 'Xaraés', aliases: ['Brizantha Xaraes', 'Brizantha Xaraés'] },
    { clave: 'brizantha-diamantes-1', nombre: 'Diamantes 1', nombreCientifico: 'Urochloa brizantha', especieBase: 'Urochloa brizantha', cultivar: 'Diamantes 1', aliases: ['Brizantha Diamantes 1'] },
    { clave: 'brizantha-mg5-victoria', nombre: 'MG-5 Victoria', nombreCientifico: 'Urochloa brizantha', especieBase: 'Urochloa brizantha', cultivar: 'MG-5 Victoria', aliases: ['Brizantha MG5', 'Brizantha Victoria'] },
    { clave: 'mombaza', nombre: 'Mombaza', nombreCientifico: 'Megathyrsus maximus', especieBase: 'Megathyrsus maximus', cultivar: 'Mombaza', aliases: ['Panicum maximum Mombaza'] },
    { clave: 'tanzania', nombre: 'Tanzania', nombreCientifico: 'Megathyrsus maximus', especieBase: 'Megathyrsus maximus', cultivar: 'Tanzania', aliases: ['Panicum maximum Tanzania'] },
    { clave: 'massai', nombre: 'Massai', nombreCientifico: 'Megathyrsus maximus', especieBase: 'Megathyrsus maximus', cultivar: 'Massai', aliases: ['Panicum maximum Massai'] },
    { clave: 'guinea', nombre: 'Guinea', nombreCientifico: 'Megathyrsus maximus', especieBase: 'Megathyrsus maximus', aliases: ['Panicum maximum', 'Pasto Guinea'] },
    { clave: 'estrella-africana', nombre: 'Estrella Africana', nombreCientifico: 'Cynodon nlemfuensis', especieBase: 'Cynodon nlemfuensis' },
    { clave: 'ratana', nombre: 'Ratana', nombreCientifico: 'Ischaemum indicum', especieBase: 'Ischaemum indicum' },
    { clave: 'decumbens', nombre: 'Brachiaria Decumbens', nombreCientifico: 'Urochloa decumbens', especieBase: 'Urochloa decumbens', aliases: ['Decumbens'] },
    { clave: 'humidicola', nombre: 'Brachiaria Humidícola', nombreCientifico: 'Urochloa humidicola', especieBase: 'Urochloa humidicola', aliases: ['Humidicola', 'Humidícola'] },
    { clave: 'mulato', nombre: 'Mulato', nombreCientifico: 'Urochloa híbrida', especieBase: 'Urochloa híbrida', cultivar: 'Mulato' },
    { clave: 'mulato-ii', nombre: 'Mulato II', nombreCientifico: 'Urochloa híbrida', especieBase: 'Urochloa híbrida', cultivar: 'Mulato II', aliases: ['Mulato 2'] },
    { clave: 'tanner', nombre: 'Tanner', nombreCientifico: 'Urochloa arrecta', especieBase: 'Urochloa arrecta' },
    { clave: 'brachipara', nombre: 'Brachipará', nombreCientifico: 'Urochloa arrecta', especieBase: 'Urochloa arrecta', aliases: ['Braquipara', 'Brachipara'] },
    { clave: 'gamalote', nombre: 'Gamalote', nombreCientifico: 'Axonopus scoparius', especieBase: 'Axonopus scoparius' },
    { clave: 'jaragua', nombre: 'Jaragua', nombreCientifico: 'Hyparrhenia rufa', especieBase: 'Hyparrhenia rufa' },
    { clave: 'kikuyo', nombre: 'Kikuyo', nombreCientifico: 'Cenchrus clandestinus', especieBase: 'Cenchrus clandestinus' },
    { clave: 'pasto-para', nombre: 'Pasto Pará', nombreCientifico: 'Urochloa mutica', especieBase: 'Urochloa mutica', aliases: ['Pará', 'Pasto Para'] },
    { clave: 'aleman', nombre: 'Alemán', nombreCientifico: 'Echinochloa polystachya', especieBase: 'Echinochloa polystachya', aliases: ['Pasto Aleman'] },
    { clave: 'limpograss', nombre: 'LimpoGrass', nombreCientifico: 'Hemarthria altissima', especieBase: 'Hemarthria altissima', aliases: ['Limpograss'] },
    { clave: 'suazi', nombre: 'Suazi', nombreCientifico: 'Digitaria swazilandensis', especieBase: 'Digitaria swazilandensis' },
    { clave: 'transvala', nombre: 'Transvala', nombreCientifico: 'Digitaria eriantha', especieBase: 'Digitaria eriantha' },
    { clave: 'bermuda-alicia', nombre: 'Bermuda / Alicia', nombreCientifico: 'Cynodon dactylon', especieBase: 'Cynodon dactylon', aliases: ['Bermuda', 'Alicia'] },
    { clave: 'ryegrass', nombre: 'Ryegrass', nombreCientifico: 'Lolium spp.', especieBase: 'Lolium spp.' },
    { clave: 'pantanero', nombre: 'Pantanero', nombreCientifico: 'Urochloa dictyoneura', especieBase: 'Urochloa dictyoneura' },
    { clave: 'natural', nombre: 'Natural / Naturalizado', especieBase: 'Natural / Naturalizado', aliases: ['Natural', 'Naturalizado'] },
    { clave: 'mezcla-no-identificada', nombre: 'Mezcla no identificada', especieBase: 'Mezcla no identificada', aliases: ['Mezcla'] },
    { clave: 'otro-pasto', nombre: 'Otro', especieBase: 'Otro' },
    { clave: 'desconocido', nombre: 'Desconocido', especieBase: 'Desconocido' }
].map((item, indice) => ({ ...item, categoria: 'Pasto', usosPermitidos: ['PASTOREO'], orden: indice + 1, activo: true }));

const FORRAJES_CORTE_BASE = [
    { clave: 'capiazu', nombre: 'Capiazú', especieBase: 'Cenchrus purpureus', aliases: ['Capiazu'] },
    { clave: 'cuba-om-22', nombre: 'Cuba OM-22', especieBase: 'Cenchrus purpureus', cultivar: 'OM-22', aliases: ['Cuba 22', 'Cuba OM22'] },
    { clave: 'cuba-ct-115', nombre: 'Cuba CT-115', especieBase: 'Cenchrus purpureus', cultivar: 'CT-115', aliases: ['Cuba CT115'] },
    { clave: 'king-grass', nombre: 'King Grass', especieBase: 'Cenchrus purpureus' },
    { clave: 'taiwan', nombre: 'Taiwán', especieBase: 'Cenchrus purpureus', aliases: ['Taiwan'] },
    { clave: 'taiwan-rojo', nombre: 'Taiwán rojo', especieBase: 'Cenchrus purpureus', aliases: ['Taiwan rojo'] },
    { clave: 'camerun', nombre: 'Camerún', especieBase: 'Cenchrus purpureus', aliases: ['Camerun'] },
    { clave: 'maralfalfa', nombre: 'Maralfalfa', especieBase: 'Cenchrus purpureus' },
    { clave: 'elefante', nombre: 'Elefante', especieBase: 'Cenchrus purpureus', aliases: ['Pasto elefante'] },
    { clave: 'gigante', nombre: 'Gigante', especieBase: 'Cenchrus purpureus' },
    { clave: 'cana-azucar', nombre: 'Caña de azúcar', nombreCientifico: 'Saccharum officinarum', especieBase: 'Saccharum officinarum', aliases: ['Cana de azucar'] },
    { clave: 'imperial', nombre: 'Imperial', especieBase: 'Axonopus scoparius' },
    { clave: 'maiz-forrajero', nombre: 'Maíz forrajero', nombreCientifico: 'Zea mays', especieBase: 'Zea mays', aliases: ['Maiz forrajero'], usosPermitidos: ['CORTE', 'ENSILAJE'] },
    { clave: 'sorgo-forrajero', nombre: 'Sorgo forrajero', nombreCientifico: 'Sorghum bicolor', especieBase: 'Sorghum bicolor', usosPermitidos: ['CORTE', 'ENSILAJE'] },
    { clave: 'prodigioso', nombre: 'Prodigioso', especieBase: 'Forraje no especificado' },
    { clave: 'otro-forraje-corte', nombre: 'Otro', especieBase: 'Otro' }
].map((item, indice) => ({
    ...item,
    categoria: 'Pasto de corte',
    usosPermitidos: item.usosPermitidos || ['CORTE'],
    orden: indice + 1,
    activo: true
}));

const LEGUMINOSAS_BASE = [
    { clave: 'mani-forrajero', nombre: 'Maní forrajero', nombreCientifico: 'Arachis pintoi', especieBase: 'Arachis pintoi', aliases: ['Mani forrajero'] },
    { clave: 'kudzu', nombre: 'Kudzú', nombreCientifico: 'Pueraria phaseoloides', especieBase: 'Pueraria phaseoloides', aliases: ['Kudzu'] },
    { clave: 'cratylia', nombre: 'Cratylia', nombreCientifico: 'Cratylia argentea', especieBase: 'Cratylia argentea' },
    { clave: 'stylosanthes', nombre: 'Stylosanthes', nombreCientifico: 'Stylosanthes spp.', especieBase: 'Stylosanthes spp.' },
    { clave: 'otra-leguminosa', nombre: 'Otra', especieBase: 'Otra' },
    { clave: 'ninguna-leguminosa', nombre: 'Ninguna', especieBase: 'Ninguna' }
].map((item, indice) => ({ ...item, categoria: 'Leguminosa/Forraje', usosPermitidos: ['PASTOREO', 'CORTE'], orden: indice + 1, activo: true }));

module.exports = {
    CATALOGO_PASTOS_BASE: [...PASTOS_BASE, ...FORRAJES_CORTE_BASE, ...LEGUMINOSAS_BASE]
};
