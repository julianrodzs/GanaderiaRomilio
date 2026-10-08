const Animal = require('../models/Animal');
const BandaReproductivaPorcina = require('../models/BandaReproductivaPorcina');
const Camada = require('../models/Camada');
const CampanaIATF = require('../models/CampanaIATF');
const CicloEngorde = require('../models/CicloEngorde');
const Lote = require('../models/Lote');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');

const escaparExpresionRegular = (valor = '') => String(valor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizarBusqueda = (valor = '') => String(valor).trim().slice(0, 80);

const ids = (documentos = []) => documentos.map((documento) => documento._id);

const construirFiltroBusquedaTareas = async (valor) => {
    const busqueda = normalizarBusqueda(valor);
    if (!busqueda) return {};

    const expresion = new RegExp(escaparExpresionRegular(busqueda), 'i');
    const [animales, lotes] = await Promise.all([
        Animal.find({ $or: [{ diio: expresion }, { identificadorFinca: expresion }, { nombre: expresion }] }).select('_id').lean(),
        Lote.find({ $or: [{ codigo: expresion }, { nombre: expresion }] }).select('_id').lean()
    ]);
    const animalesIds = ids(animales);
    const lotesIds = ids(lotes);

    const [camadas, registros, ciclosEngorde, bandasPorcinas, campanasIatf] = await Promise.all([
        Camada.find({ $or: [{ codigoCamada: expresion }, ...(animalesIds.length ? [{ madre: { $in: animalesIds } }] : [])] }).select('_id').lean(),
        animalesIds.length ? RegistroReproductivo.find({ animal: { $in: animalesIds } }).select('_id').lean() : [],
        CicloEngorde.find({
            $or: [
                { 'protocoloSnapshot.nombre': expresion },
                { 'participantesSnapshot.diio': expresion },
                { 'participantesSnapshot.nombre': expresion },
                ...(animalesIds.length ? [{ 'participantesSnapshot.animal': { $in: animalesIds } }] : []),
                ...(lotesIds.length ? [{ lote: { $in: lotesIds } }] : [])
            ]
        }).select('_id').lean(),
        BandaReproductivaPorcina.find({
            $or: [
                { nombre: expresion },
                { 'protocoloSnapshot.nombre': expresion },
                { 'participantes.diio': expresion },
                { 'participantes.nombre': expresion },
                ...(animalesIds.length ? [{ 'participantes.animal': { $in: animalesIds } }] : [])
            ]
        }).select('_id').lean(),
        CampanaIATF.find({
            $or: [
                { nombre: expresion },
                { 'protocoloSnapshot.nombre': expresion },
                ...(animalesIds.length ? [{ 'participantes.animal': { $in: animalesIds } }] : [])
            ]
        }).select('_id').lean()
    ]);

    const referenciasIds = [
        ...ids(camadas),
        ...ids(registros),
        ...ids(ciclosEngorde),
        ...ids(bandasPorcinas),
        ...ids(campanasIatf)
    ];
    const condiciones = [
        { titulo: expresion },
        { descripcion: expresion },
        { observaciones: expresion }
    ];
    if (animalesIds.length) condiciones.push({ animal: { $in: animalesIds } });
    if (lotesIds.length) condiciones.push({ lote: { $in: lotesIds } });
    if (referenciasIds.length) condiciones.push({ referenciaId: { $in: referenciasIds } });

    return { $or: condiciones };
};

module.exports = {
    construirFiltroBusquedaTareas,
    escaparExpresionRegular,
    normalizarBusqueda
};
