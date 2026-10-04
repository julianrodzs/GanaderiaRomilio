const crypto = require('crypto');
const mongoose = require('mongoose');
const Animal = require('../models/Animal');
const CierreConsolidado = require('../models/CierreConsolidado');
const EventoAnimal = require('../models/EventoAnimal');
const HistorialFincaAnimal = require('../models/HistorialFincaAnimal');
const MetaConsolidacion = require('../models/MetaConsolidacion');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const PertenenciaLote = require('../models/PertenenciaLote');
const TrasladoFinca = require('../models/TrasladoFinca');
const { validarObjetivoProductivoFinca } = require('./finca-service');

const errorOperacion = (mensaje, status = 400, code = 'MULTI_FARM_INVALID_OPERATION') => {
    const error = new Error(mensaje);
    error.status = status;
    error.code = code;
    return error;
};

const fechaValida = (valor, nombre) => {
    const fecha = valor ? new Date(valor) : new Date();
    if (Number.isNaN(fecha.getTime())) throw errorOperacion(`${nombre} no es una fecha válida.`);
    return fecha;
};

const redondearMoneda = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

const calcularDistribucionGasto = ({ montoTotal, distribucion, modo = 'IGUAL' }) => {
    const total = Number(montoTotal);
    if (!Number.isFinite(total) || total <= 0) throw errorOperacion('El monto total debe ser mayor que cero.');
    if (!Array.isArray(distribucion) || !distribucion.length) throw errorOperacion('Selecciona al menos una finca para distribuir el gasto.');

    const fincas = [...new Set(distribucion.map((item) => String(item.fincaId || '')).filter(Boolean))];
    if (fincas.length !== distribucion.length) throw errorOperacion('La distribución contiene fincas vacías o repetidas.');

    let calculada;
    if (modo === 'MONTO') {
        calculada = distribucion.map((item) => ({ fincaId: String(item.fincaId), monto: redondearMoneda(item.monto) }));
        const suma = redondearMoneda(calculada.reduce((totalMonto, item) => totalMonto + item.monto, 0));
        if (calculada.some((item) => item.monto <= 0) || Math.abs(suma - total) > 0.01) {
            throw errorOperacion('Los montos por finca deben ser positivos y sumar exactamente el monto total.');
        }
    } else {
        const porcentajes = modo === 'PORCENTAJE'
            ? distribucion.map((item) => Number(item.porcentaje))
            : distribucion.map(() => 100 / distribucion.length);
        const suma = porcentajes.reduce((acumulado, porcentaje) => acumulado + porcentaje, 0);
        if (porcentajes.some((porcentaje) => !Number.isFinite(porcentaje) || porcentaje <= 0) || Math.abs(suma - 100) > 0.001) {
            throw errorOperacion('Los porcentajes deben ser positivos y sumar 100%.');
        }
        let asignado = 0;
        calculada = distribucion.map((item, indice) => {
            const monto = indice === distribucion.length - 1
                ? redondearMoneda(total - asignado)
                : redondearMoneda(total * porcentajes[indice] / 100);
            asignado = redondearMoneda(asignado + monto);
            return { fincaId: String(item.fincaId), porcentaje: porcentajes[indice], monto };
        });
    }

    return calculada;
};

const trasladarAnimalesEntreFincas = async ({
    fincaOrigenId,
    fincaDestino,
    animales: animalIds,
    fecha,
    motivo,
    observaciones,
    usuarioId
}) => {
    if (String(fincaOrigenId) === String(fincaDestino?._id)) throw errorOperacion('La finca de destino debe ser diferente a la finca activa.');
    if (!String(motivo || '').trim()) throw errorOperacion('El motivo del traslado es requerido.');
    const ids = [...new Set((animalIds || []).map(String).filter(mongoose.Types.ObjectId.isValid))];
    if (!ids.length) throw errorOperacion('Selecciona al menos un animal activo.');

    const animales = await Animal.find({ _id: { $in: ids }, fincaId: fincaOrigenId, estado: 'Activo' }).lean();
    if (animales.length !== ids.length) throw errorOperacion('Uno o más animales no existen, no están activos o no pertenecen a la finca de origen.', 409);
    const identificadores = animales.map((animal) => animal.identificadorFinca).filter(Boolean);
    const conflicto = identificadores.length
        ? await Animal.findOne({ fincaId: fincaDestino._id, identificadorFinca: { $in: identificadores } })
            .setOptions({ omitirAislamientoFinca: true })
            .select('identificadorFinca')
            .lean()
        : null;
    if (conflicto) throw errorOperacion(`El identificador ${conflicto.identificadorFinca} ya existe en la finca de destino.`, 409, 'FARM_IDENTIFIER_CONFLICT');
    for (const animal of animales) {
        await validarObjetivoProductivoFinca({
            fincaId: fincaDestino._id,
            especie: animal.especie,
            objetivoProductivo: animal.objetivoProductivo
        });
    }

    const fechaTraslado = fechaValida(fecha, 'La fecha del traslado');
    const sesion = await mongoose.startSession();
    let trasladoCreado;
    try {
        await sesion.withTransaction(async () => {
            [trasladoCreado] = await TrasladoFinca.create([{
                fincaOrigen: fincaOrigenId,
                fincaDestino: fincaDestino._id,
                fecha: fechaTraslado,
                animales: animales.map((animal) => ({
                    animal: animal._id,
                    identificador: animal.diio || animal.identificadorFinca,
                    especie: animal.especie,
                    pesoTraslado: animal.pesoActual
                })),
                motivo: String(motivo).trim(),
                observaciones,
                registradoPor: usuarioId
            }], { session: sesion });

            for (const animal of animales) {
                const tieneHistoria = await HistorialFincaAnimal.exists({ animal: animal._id }).session(sesion);
                if (!tieneHistoria) {
                    await HistorialFincaAnimal.create([{
                        animal: animal._id,
                        tipo: 'Ingreso inicial',
                        fincaDestino: fincaOrigenId,
                        fecha: animal.createdAt || fechaTraslado,
                        motivo: 'Pertenencia anterior al primer traslado registrado',
                        registradoPor: usuarioId
                    }], { session: sesion });
                }

                await PertenenciaLote.updateMany(
                    { animal: animal._id, activo: true },
                    { $set: { activo: false, fechaSalida: fechaTraslado, motivoSalida: 'Traslado a otra finca' } },
                    { session: sesion }
                );
                const resultadoTraslado = await Animal.updateOne(
                    { _id: animal._id, fincaId: fincaOrigenId },
                    { $set: { fincaId: fincaDestino._id, loteActual: null, potreroActual: null } },
                    { session: sesion }
                );
                if (resultadoTraslado.modifiedCount !== 1) {
                    throw errorOperacion(
                        `El animal ${animal.diio || animal.identificadorFinca || animal._id} cambió de finca durante el proceso. Intenta nuevamente.`,
                        409,
                        'ANIMAL_FARM_CONFLICT'
                    );
                }
                await HistorialFincaAnimal.create([{
                    animal: animal._id,
                    tipo: 'Traslado',
                    fincaOrigen: fincaOrigenId,
                    fincaDestino: fincaDestino._id,
                    fecha: fechaTraslado,
                    pesoTraslado: animal.pesoActual,
                    motivo: String(motivo).trim(),
                    traslado: trasladoCreado._id,
                    registradoPor: usuarioId
                }], { session: sesion });

                const descripcion = `Traslado de finca por ${String(motivo).trim()}.`;
                await EventoAnimal.create([{
                    animal: animal._id,
                    tipoEvento: 'Traslado de finca',
                    fecha: fechaTraslado,
                    titulo: 'Salida hacia otra finca',
                    descripcion,
                    moduloOrigen: 'Fincas',
                    referenciaId: trasladoCreado._id,
                    creadoPor: usuarioId,
                    fincaId: fincaOrigenId,
                    metadata: { fincaOrigenId, fincaDestinoId: fincaDestino._id, pesoTraslado: animal.pesoActual }
                }, {
                    animal: animal._id,
                    tipoEvento: 'Traslado de finca',
                    fecha: fechaTraslado,
                    titulo: 'Ingreso desde otra finca',
                    descripcion,
                    moduloOrigen: 'Fincas',
                    referenciaId: trasladoCreado._id,
                    creadoPor: usuarioId,
                    fincaId: fincaDestino._id,
                    metadata: { fincaOrigenId, fincaDestinoId: fincaDestino._id, pesoTraslado: animal.pesoActual }
                }], { session: sesion });
            }
        });
    } finally {
        await sesion.endSession();
    }
    return trasladoCreado;
};

const crearTransferenciaFinancieraInterna = async ({ fincaOrigenId, fincaDestino, datos, usuarioId }) => {
    if (String(fincaOrigenId) === String(fincaDestino?._id)) throw errorOperacion('La finca de destino debe ser diferente a la finca activa.');
    const monto = Number(datos.monto);
    if (!Number.isFinite(monto) || monto <= 0) throw errorOperacion('El monto debe ser mayor que cero.');
    const grupo = new mongoose.Types.ObjectId();
    const fecha = fechaValida(datos.fecha, 'La fecha');
    const descripcion = String(datos.descripcion || 'Transferencia entre fincas').trim();
    const base = {
        fecha,
        tipoMovimiento: 'Transferencia interna',
        categoria: 'Transferencias internas',
        categoriaNormalizada: 'Transferencias internas',
        descripcion,
        monto,
        moneda: datos.moneda || 'CRC',
        metodoPago: datos.metodoPago,
        observaciones: datos.observaciones,
        alcanceFinanciero: 'TRANSFERENCIA_INTERNA',
        grupoConsolidacion: grupo,
        excluirConsolidacion: true,
        referenciaModelo: 'TransferenciaInterna',
        referenciaId: grupo
    };
    const sesion = await mongoose.startSession();
    let movimientos;
    try {
        await sesion.withTransaction(async () => {
            movimientos = await MovimientoFinanciero.create([{
                ...base,
                fincaId: fincaOrigenId,
                fincaContraparte: fincaDestino._id,
                naturaleza: 'Egreso'
            }, {
                ...base,
                fincaId: fincaDestino._id,
                fincaContraparte: fincaOrigenId,
                naturaleza: 'Ingreso'
            }], { session: sesion });
        });
    } finally {
        await sesion.endSession();
    }
    return { grupoConsolidacion: grupo, movimientos, registradoPor: usuarioId };
};

const crearGastoCompartido = async ({ datos, fincasAutorizadas, usuarioId }) => {
    const distribucion = calcularDistribucionGasto(datos);
    const permitidas = new Set(fincasAutorizadas.map((finca) => String(finca._id)));
    if (distribucion.some((item) => !permitidas.has(item.fincaId))) throw errorOperacion('Una finca de la distribución no está autorizada.', 403);
    const fecha = fechaValida(datos.fecha, 'La fecha');
    const grupo = new mongoose.Types.ObjectId();
    const sesion = await mongoose.startSession();
    let movimientos;
    try {
        await sesion.withTransaction(async () => {
            movimientos = await MovimientoFinanciero.create(distribucion.map((item) => ({
                fecha,
                fincaId: item.fincaId,
                tipoMovimiento: datos.tipoMovimiento || 'Compra',
                naturaleza: 'Egreso',
                categoria: datos.categoria,
                descripcion: datos.descripcion,
                producto: datos.producto,
                monto: item.monto,
                moneda: datos.moneda || 'CRC',
                proveedor: datos.proveedor,
                destinoUso: datos.destinoUso,
                metodoPago: datos.metodoPago,
                observaciones: datos.observaciones,
                alcanceFinanciero: 'GASTO_COMPARTIDO',
                grupoConsolidacion: grupo,
                excluirConsolidacion: false,
                porcentajeDistribucion: item.porcentaje,
                referenciaModelo: 'GastoCompartido',
                referenciaId: grupo
            })), { session: sesion });
        });
    } finally {
        await sesion.endSession();
    }
    return { grupoConsolidacion: grupo, montoTotal: Number(datos.montoTotal), distribucion, movimientos, registradoPor: usuarioId };
};

const validarRango = (fechaInicio, fechaFin) => {
    const inicio = fechaValida(fechaInicio, 'La fecha inicial');
    const fin = fechaValida(fechaFin, 'La fecha final');
    if (inicio > fin) throw errorOperacion('La fecha inicial no puede ser posterior a la final.');
    return { inicio, fin };
};

const guardarMetaConsolidacion = async ({ datos, fincasAutorizadas, usuarioId }) => {
    const { inicio, fin } = validarRango(datos.fechaInicio, datos.fechaFin);
    const alcance = datos.alcance === 'FINCA' ? 'FINCA' : 'ORGANIZACION';
    let finca = null;
    if (alcance === 'FINCA') {
        finca = fincasAutorizadas.find((item) => String(item._id) === String(datos.finca));
        if (!finca) throw errorOperacion('La finca de la meta no está autorizada.', 403);
    }
    const campos = ['animalesActivos', 'pesoPromedioKg', 'ingresos', 'egresosMaximos', 'balance', 'partos', 'destetes', 'aplicacionesSanitarias'];
    const metas = Object.fromEntries(campos
        .filter((campo) => datos.metas?.[campo] !== '' && datos.metas?.[campo] != null)
        .map((campo) => [campo, Number(datos.metas[campo])]));
    if (!Object.keys(metas).length || Object.values(metas).some((valor) => !Number.isFinite(valor))) {
        throw errorOperacion('Registra al menos una meta numérica válida.');
    }
    return MetaConsolidacion.findOneAndUpdate(
        { alcance, finca: finca?._id || null, fechaInicio: inicio, fechaFin: fin },
        { $set: { nombre: String(datos.nombre || 'Meta del período').trim(), metas, actualizadoPor: usuarioId } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
};

const claveCierre = ({ fechaInicio, fechaFin, especie, fincaIds }) => crypto.createHash('sha256')
    .update(JSON.stringify({ fechaInicio, fechaFin, especie, fincaIds: [...fincaIds].map(String).sort() }))
    .digest('hex');

const crearCierreConsolidado = async ({ nombre, reporte, fincas, usuarioId }) => {
    const fincaIds = fincas.map((finca) => finca._id);
    const clave = claveCierre({
        fechaInicio: reporte.filtros.fechaInicio,
        fechaFin: reporte.filtros.fechaFin,
        especie: reporte.filtros.especie,
        fincaIds
    });
    const existente = await CierreConsolidado.findOne({ clave });
    if (existente) throw errorOperacion('Ya existe un cierre para las mismas fincas, período y especie.', 409, 'CONSOLIDATED_CLOSE_EXISTS');
    return CierreConsolidado.create({
        clave,
        nombre: String(nombre || 'Cierre consolidado').trim(),
        fechaInicio: reporte.filtros.fechaInicio,
        fechaFin: reporte.filtros.fechaFin,
        especie: reporte.filtros.especie,
        fincas: fincaIds,
        datos: reporte,
        cerradoPor: usuarioId
    });
};

module.exports = {
    calcularDistribucionGasto,
    claveCierre,
    crearCierreConsolidado,
    crearGastoCompartido,
    crearTransferenciaFinancieraInterna,
    errorOperacion,
    guardarMetaConsolidacion,
    trasladarAnimalesEntreFincas,
    validarRango
};
