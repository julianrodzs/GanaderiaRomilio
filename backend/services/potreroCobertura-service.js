const mongoose = require('mongoose');
const CatalogoPasto = require('../models/CatalogoPasto');
const HistorialCoberturaPotrero = require('../models/HistorialCoberturaPotrero');
const Potrero = require('../models/Potrero');
const { CATALOGO_PASTOS_BASE } = require('../config/catalogoPastos');

const MS_DIA = 24 * 60 * 60 * 1000;

const normalizarTexto = (valor) => String(valor || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const diaUTC = (valor) => {
    if (!valor) return null;
    if (typeof valor === 'string') {
        const partes = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (partes) return new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])));
    }
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return null;
    return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
};

const asegurarCatalogoPastosBase = async () => {
    await CatalogoPasto.bulkWrite(CATALOGO_PASTOS_BASE.map((item) => ({
        updateOne: {
            filter: { clave: item.clave },
            update: {
                $set: {
                    nombre: item.nombre,
                    nombreCientifico: item.nombreCientifico,
                    especieBase: item.especieBase,
                    cultivar: item.cultivar,
                    categoria: item.categoria,
                    aliases: item.aliases || [],
                    usosPermitidos: item.usosPermitidos || []
                },
                $setOnInsert: { clave: item.clave, orden: item.orden, activo: true }
            },
            upsert: true
        }
    })), { ordered: false });
};

const etiquetaCatalogo = (item) => item.cultivar
    ? `${item.nombre} (${item.especieBase || item.nombreCientifico})`
    : item.nombre;

const coincideBusquedaCatalogo = (item, buscar) => {
    const termino = normalizarTexto(buscar);
    if (!termino) return true;
    return normalizarTexto([
        item.nombre,
        item.nombreCientifico,
        item.especieBase,
        item.cultivar,
        ...(item.aliases || [])
    ].join(' ')).includes(termino);
};

const listarCatalogoPastos = async ({ categoria, uso, buscar, incluirInactivos = false } = {}) => {
    await asegurarCatalogoPastosBase();
    const filtro = {};
    if (categoria) filtro.categoria = categoria;
    if (uso) filtro.usosPermitidos = uso;
    if (!incluirInactivos) filtro.activo = true;
    const elementos = await CatalogoPasto.find(filtro).sort({ categoria: 1, orden: 1, nombre: 1 }).lean();
    return elementos
        .filter((item) => coincideBusquedaCatalogo(item, buscar))
        .map((item) => ({ ...item, etiqueta: etiquetaCatalogo(item) }));
};

const resolverPastoPorTexto = async (valor, categoria = 'Pasto', uso) => {
    const buscado = normalizarTexto(valor);
    if (!buscado) return null;
    const elementos = await listarCatalogoPastos({ categoria, uso, incluirInactivos: true });
    const coincidencia = elementos.find((item) => [
        item.nombre,
        item.nombreCientifico,
        item.clave,
        ...(item.aliases || [])
    ].some((texto) => normalizarTexto(texto) === buscado));
    return coincidencia || null;
};

const idsUnicos = (valores = []) => [...new Set(valores.filter(Boolean).map(String))];

const validarReferencias = async (principal, secundarios, leguminosas, tipoArea = 'PASTOREO') => {
    const ids = idsUnicos([principal, ...secundarios, ...leguminosas]);
    if (!ids.length) return;
    if (ids.some((id) => !mongoose.isValidObjectId(id))) throw new Error('La cobertura contiene una referencia inválida.');
    const encontrados = await CatalogoPasto.find({ _id: { $in: ids }, activo: true }).lean();
    if (encontrados.length !== ids.length) throw new Error('Algún pasto o forraje no existe o está inactivo.');
    const porId = new Map(encontrados.map((item) => [String(item._id), item]));
    const usoRequerido = tipoArea === 'BANCO_FORRAJERO' ? 'CORTE' : 'PASTOREO';
    const admiteUso = (item) => item?.usosPermitidos?.includes(usoRequerido);
    if (principal && !admiteUso(porId.get(String(principal)))) throw new Error(`La cobertura principal no admite uso de ${usoRequerido.toLowerCase()}.`);
    if (secundarios.some((id) => !admiteUso(porId.get(String(id))))) throw new Error(`Las coberturas secundarias deben admitir uso de ${usoRequerido.toLowerCase()}.`);
    if (leguminosas.some((id) => porId.get(String(id))?.categoria !== 'Leguminosa/Forraje')) throw new Error('Las asociaciones deben pertenecer al catálogo de leguminosas y forrajes.');
};

const prepararCobertura = async (datos = {}, tipoArea = 'PASTOREO') => {
    const pastoPrincipal = datos.pastoPrincipal || null;
    const pastosSecundarios = idsUnicos(datos.pastosSecundarios);
    const leguminosasAsociadas = idsUnicos(datos.leguminosasAsociadas);
    await validarReferencias(pastoPrincipal, pastosSecundarios, leguminosasAsociadas, tipoArea);
    if (pastoPrincipal && pastosSecundarios.includes(String(pastoPrincipal))) {
        throw new Error('El pasto principal no puede repetirse como secundario.');
    }
    const porcentajesCobertura = (datos.porcentajesCobertura || [])
        .filter((item) => item?.catalogoPasto && item?.porcentajeEstimado !== '' && item?.porcentajeEstimado !== null && item?.porcentajeEstimado !== undefined)
        .map((item) => ({ catalogoPasto: item.catalogoPasto, porcentajeEstimado: Number(item.porcentajeEstimado) }));
    if (porcentajesCobertura.some((item) => !Number.isFinite(item.porcentajeEstimado) || item.porcentajeEstimado < 0 || item.porcentajeEstimado > 100)) {
        throw new Error('Los porcentajes estimados deben estar entre 0 y 100.');
    }
    const diasDescansoObjetivo = datos.diasDescansoObjetivo === '' || datos.diasDescansoObjetivo === null || datos.diasDescansoObjetivo === undefined
        ? null
        : Number(datos.diasDescansoObjetivo);
    if (diasDescansoObjetivo !== null && (!Number.isFinite(diasDescansoObjetivo) || diasDescansoObjetivo < 0)) {
        throw new Error('Los días de descanso objetivo deben ser un número mayor o igual a cero.');
    }
    const intervaloCorteObjetivoDias = datos.intervaloCorteObjetivoDias === '' || datos.intervaloCorteObjetivoDias === null || datos.intervaloCorteObjetivoDias === undefined
        ? null
        : Number(datos.intervaloCorteObjetivoDias);
    if (intervaloCorteObjetivoDias !== null && (!Number.isFinite(intervaloCorteObjetivoDias) || intervaloCorteObjetivoDias < 1)) {
        throw new Error('El intervalo de corte objetivo debe ser al menos de un día.');
    }
    return {
        pastoPrincipal,
        pastosSecundarios,
        leguminosasAsociadas,
        porcentajesCobertura,
        fechaEstablecimientoPasto: datos.fechaEstablecimientoPasto ? diaUTC(datos.fechaEstablecimientoPasto) : null,
        diasDescansoObjetivo,
        intervaloCorteObjetivoDias,
        observacionCobertura: String(datos.observacionCobertura || '').trim() || null,
        descripcionCobertura: String(datos.descripcionCobertura || '').trim() || null
    };
};

const poblarCobertura = (consulta) => consulta
    .populate('pastoPrincipal')
    .populate('pastosSecundarios')
    .populate('leguminosasAsociadas')
    .populate('porcentajesCobertura.catalogoPasto');

const obtenerCoberturaPotrero = async (potreroId) => {
    const potrero = await poblarCobertura(Potrero.findById(potreroId)).lean();
    if (!potrero) return null;
    const historial = await poblarCobertura(HistorialCoberturaPotrero.find({ potrero: potreroId }).sort({ fechaInicio: -1 })).lean();
    return {
        potrero: { _id: potrero._id, codigo: potrero.codigo, nombre: potrero.nombre },
        actual: historial.find((item) => !item.fechaFin) || null,
        historial
    };
};

const guardarCobertura = async (potreroId, datos, opciones = {}) => {
    const fechaCambio = diaUTC(datos.fechaCambio || datos.fechaInicio || new Date());
    if (!fechaCambio) throw new Error('La fecha del cambio de cobertura es inválida.');
    const potrero = await Potrero.findById(potreroId);
    if (!potrero) return null;
    const cobertura = await prepararCobertura(datos, potrero.tipoArea);

    const vigente = await HistorialCoberturaPotrero.findOne({ potrero: potreroId, fechaFin: null }).sort({ fechaInicio: -1 });
    if (opciones.soloInicial && vigente) {
        const error = new Error('El potrero ya tiene una cobertura vigente. Utilice la opción de cambiar cobertura.');
        error.codigo = 'COBERTURA_EXISTENTE';
        throw error;
    }
    if (vigente && fechaCambio < diaUTC(vigente.fechaInicio)) {
        throw new Error('La fecha del cambio debe ser posterior al inicio de la cobertura vigente.');
    }

    const sesion = await mongoose.startSession();
    let nuevoHistorial;
    try {
        await sesion.withTransaction(async () => {
            if (vigente && fechaCambio.getTime() === diaUTC(vigente.fechaInicio).getTime()) {
                Object.assign(vigente, cobertura);
                await vigente.save({ session: sesion });
                nuevoHistorial = vigente;
            } else if (vigente) {
                vigente.fechaFin = new Date(fechaCambio.getTime() - MS_DIA);
                await vigente.save({ session: sesion });
            }
            if (!nuevoHistorial) {
                [nuevoHistorial] = await HistorialCoberturaPotrero.create([{
                    potrero: potreroId,
                    ...cobertura,
                    fechaInicio: fechaCambio,
                    fechaFin: null,
                    registradoPor: opciones.usuarioId || null
                }], { session: sesion });
            }
            Object.assign(potrero, cobertura);
            await potrero.save({ session: sesion });
        });
    } finally {
        await sesion.endSession();
    }
    return poblarCobertura(HistorialCoberturaPotrero.findById(nuevoHistorial._id)).lean();
};

const obtenerCoberturaEnFecha = (historial = [], fecha) => {
    const dia = diaUTC(fecha);
    if (!dia) return null;
    return historial.find((item) => {
        const inicio = diaUTC(item.fechaInicio);
        const fin = item.fechaFin ? diaUTC(item.fechaFin) : null;
        return inicio && inicio <= dia && (!fin || fin >= dia);
    }) || null;
};

module.exports = {
    asegurarCatalogoPastosBase,
    coincideBusquedaCatalogo,
    diaUTC,
    guardarCobertura,
    listarCatalogoPastos,
    normalizarTexto,
    obtenerCoberturaEnFecha,
    obtenerCoberturaPotrero,
    prepararCobertura,
    resolverPastoPorTexto
};
