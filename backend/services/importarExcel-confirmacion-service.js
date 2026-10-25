const mongoose = require('mongoose');
const Animal = require('../models/Animal');
const Potrero = require('../models/Potrero');
const Pesaje = require('../models/Pesaje');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const CatalogoFinanciero = require('../models/CatalogoFinanciero');
const HistorialCoberturaPotrero = require('../models/HistorialCoberturaPotrero');
const RotacionPotrero = require('../models/RotacionPotrero');
const Lote = require('../models/Lote');
const {
    asegurarPuedeCrearAnimal,
    asegurarPlanVigente,
    ejecutarConReservaCuota,
    obtenerPlanActual,
    puedeUsarEspecie
} = require('./plan-service');
const { validarObjetivoProductivoFinca } = require('./finca-service');
const { obtenerFincaActual } = require('../context/organizacion-context');
const { prepararDatosRaciales } = require('./raza-service');
const { guardarCobertura } = require('./potreroCobertura-service');
const { agregarAnimalesAlLote, validarAnimalParaLote } = require('./lote-service');
const { validarRelacionGenealogica } = require('./genealogiaService');
const {
    actualizarPesoActualAnimal,
    registrarEventoPesaje,
    validarDatosPesaje
} = require('./pesaje-integridad-service');
const { upsertEventoAnimal } = require('./eventoAnimal-service');

const crearResumen = () => ({ creados: 0, actualizados: 0, duplicados: 0, omitidos: 0, errores: [] });
const crearResultado = () => ({
    Potrero: crearResumen(), Animal: crearResumen(), MovimientoFinanciero: crearResumen(), Pesaje: crearResumen()
});

const crearErrorFila = (hoja, registro, error) => Object.assign(
    new Error(`${hoja}, fila ${registro.filaOrigen}: ${error.message}`),
    { status: error.status || 422, codigo: error.codigo || error.code || 'IMPORTACION_FALLIDA', hoja, fila: registro.filaOrigen }
);

const excluirControl = (registro) => Object.fromEntries(Object.entries(registro).filter(([clave, valor]) => ![
    'filaOrigen', 'camposProporcionados', 'cambios', 'operacion', 'existenteId', 'posibleDuplicado',
    'omitirPorDuplicado', 'potreroCodigo', 'codigoLote', 'nombreLote', 'propositoLote', 'pastoTexto',
    'loteProposito',
    'pastoPrincipal', 'fechaEstablecimientoPasto', 'diasDescansoObjetivo', 'intervaloCorteObjetivoDias',
    'observacionCobertura', 'descripcionCobertura', 'madreDiio', 'padreDiio', 'pesoActual', 'fechaPesaje',
    'claveImportacion', 'diio', 'identificadorFinca'
].includes(clave) && valor !== undefined && valor !== null && valor !== ''));

const aprobadoDuplicado = (registro, opciones) => (
    !registro.omitirPorDuplicado || new Set(opciones.duplicadosConfirmados || []).has(registro.claveImportacion)
);

const clavePersistida = (registro, opciones) => (registro.omitirPorDuplicado
    ? `${registro.claveImportacion}:${opciones.importacionId}:${registro.filaOrigen}`
    : registro.claveImportacion);

const buscarAnimalUnico = async (clave, session) => {
    const encontrados = await Animal.find({ $or: [{ diio: clave }, { identificadorFinca: clave }] })
        .limit(2)
        .collation({ locale: 'es', strength: 1 })
        .session(session);
    if (encontrados.length > 1) throw new Error(`La referencia ${clave} coincide con más de un animal.`);
    return encontrados[0] || null;
};

const registrarAltaImportada = (animal, registro, opciones, session) => upsertEventoAnimal({
    animal: animal._id,
    tipoEvento: 'Observacion',
    fecha: animal.createdAt || new Date(),
    titulo: 'Alta por importación',
    descripcion: `Animal ${animal.diio || animal.identificadorFinca} incorporado mediante importación estándar.`,
    moduloOrigen: 'Inventario',
    referenciaId: opciones.importacionId,
    creadoPor: opciones.usuarioId,
    claveIdempotencia: `importacion:${opciones.importacionId}:animal:${registro.filaOrigen}`,
    metadata: { origen: 'Importación', importacionId: opciones.importacionId, fila: registro.filaOrigen }
}, { session });

const registrarPesajeImportado = async ({ animal, fecha, peso, etapaProductiva, observaciones, claveImportacion, opciones, session, resultado }) => {
    const validacion = await validarDatosPesaje({ animal: animal._id, fecha, peso }, { session });
    if (etapaProductiva && animal.especie !== 'Porcino') throw new Error('La etapa productiva por fases aplica únicamente a porcinos.');
    const dia = validacion.fecha.toISOString().slice(0, 10);
    const inicio = new Date(`${dia}T00:00:00.000Z`);
    const fin = new Date(inicio); fin.setUTCDate(fin.getUTCDate() + 1);
    let pesaje = await Pesaje.findOne({ animal: animal._id, fecha: { $gte: inicio, $lt: fin } }).session(session);
    if (pesaje) {
        if (opciones.modo === 'solo_crear') {
            resultado.duplicados += 1;
            return pesaje;
        }
        pesaje.peso = validacion.peso;
        if (etapaProductiva) pesaje.etapaProductiva = etapaProductiva;
        if (observaciones) pesaje.observaciones = observaciones;
        pesaje.editadoPor = opciones.usuarioId;
        pesaje.fechaEdicion = new Date();
        pesaje.tipoPesaje = 'Importacion';
        await pesaje.save({ session });
        resultado.actualizados += 1;
    } else {
        [pesaje] = await Pesaje.create([{
            animal: animal._id,
            lote: animal.loteActual || null,
            fecha: validacion.fecha,
            peso: validacion.peso,
            tipoPesaje: 'Importacion',
            etapaProductiva: etapaProductiva || animal.etapaProductiva,
            observaciones,
            registradoPor: opciones.usuarioId,
            claveImportacion,
            importacionOrigen: opciones.importacionId
        }], { session, ordered: true });
        resultado.creados += 1;
    }
    await registrarEventoPesaje(pesaje, opciones.usuarioId, { session, titulo: 'Pesaje importado' });
    await actualizarPesoActualAnimal(animal._id, { session, forzar: true });
    return pesaje;
};

const importarPotreros = async (registros, opciones, resultado, session) => {
    for (const registro of registros) {
        if (!aprobadoDuplicado(registro, opciones)) { resultado.duplicados += 1; continue; }
        try {
            let existente = await Potrero.findOne({ codigo: registro.codigo }).session(session);
            if (existente) {
                if (opciones.modo === 'solo_crear') { resultado.duplicados += 1; continue; }
                const rotacionActiva = await RotacionPotrero.exists({ potrero: existente._id, estado: 'Activa' }).session(session);
                if (rotacionActiva && (
                    (registro.estado && registro.estado !== existente.estado)
                    || (registro.tipoArea && registro.tipoArea !== existente.tipoArea)
                )) throw new Error('No se puede cambiar estado o tipo de un potrero con rotación activa.');
                Object.assign(existente, excluirControl(registro));
                await existente.save({ session });
                resultado.actualizados += 1;
            } else {
                const datos = { ...excluirControl(registro), estado: registro.estado || 'Disponible', tipoArea: registro.tipoArea || 'PASTOREO' };
                [existente] = await Potrero.create([{
                    ...datos,
                    claveImportacion: clavePersistida(registro, opciones),
                    importacionOrigen: opciones.importacionId
                }], { session, ordered: true });
                resultado.creados += 1;
            }
            if (registro.pastoTexto || registro.diasDescansoObjetivo !== undefined || registro.intervaloCorteObjetivoDias !== undefined || registro.observacionCobertura) {
                const vigente = await HistorialCoberturaPotrero.findOne({ potrero: existente._id, fechaFin: null }).session(session);
                await guardarCobertura(existente._id, {
                    pastoPrincipal: registro.pastoPrincipal,
                    descripcionCobertura: registro.descripcionCobertura,
                    fechaEstablecimientoPasto: registro.fechaEstablecimientoPasto,
                    fechaCambio: registro.fechaEstablecimientoPasto || new Date(),
                    diasDescansoObjetivo: registro.diasDescansoObjetivo,
                    intervaloCorteObjetivoDias: registro.intervaloCorteObjetivoDias,
                    observacionCobertura: registro.observacionCobertura
                }, { soloInicial: !vigente, usuarioId: opciones.usuarioId, session });
            }
        } catch (error) { throw crearErrorFila('POTREROS', registro, error); }
    }
};

const importarAnimalesBase = async (registros, opciones, resultado, session) => {
    const aplicadas = new Map();
    for (const registro of registros) {
        if (!aprobadoDuplicado(registro, opciones)) { resultado.duplicados += 1; continue; }
        try {
            let animal = await buscarAnimalUnico(registro.diio, session);
            if (animal) {
                if (opciones.modo === 'solo_crear') { resultado.duplicados += 1; continue; }
                if (['Vendido', 'Muerto'].includes(animal.estado) && registro.estado && registro.estado !== animal.estado) {
                    throw new Error(`El estado ${animal.estado} solo puede cambiar mediante su flujo operativo.`);
                }
                if (registro.especie !== animal.especie || registro.sexo !== animal.sexo) {
                    throw new Error('Especie y sexo no pueden modificarse mediante importación.');
                }
                const datos = prepararDatosRaciales(excluirControl(registro), animal.toObject());
                delete datos.estado;
                Object.assign(animal, datos);
                await animal.save({ session });
                resultado.actualizados += 1;
            } else {
                const datos = prepararDatosRaciales({
                    ...excluirControl(registro),
                    identificadorFinca: registro.diio,
                    diio: registro.diio,
                    estado: 'Activo',
                    estadoSanitario: registro.estadoSanitario || 'Sano',
                    objetivoProductivo: registro.objetivoProductivo || 'SIN_DEFINIR',
                    claveImportacion: clavePersistida(registro, opciones),
                    importacionOrigen: opciones.importacionId
                });
                await validarObjetivoProductivoFinca({
                    fincaId: obtenerFincaActual(), especie: datos.especie, objetivoProductivo: datos.objetivoProductivo
                });
                [animal] = await Animal.create([datos], { session, ordered: true });
                await registrarAltaImportada(animal, registro, opciones, session);
                resultado.creados += 1;
            }
            if (registro.potreroCodigo && !registro.codigoLote) {
                const potrero = await Potrero.findOne({ codigo: registro.potreroCodigo }).session(session);
                if (!potrero || potrero.tipoArea !== 'PASTOREO' || ['Mantenimiento', 'Inactivo'].includes(potrero.estado)) {
                    throw new Error(`El potrero ${registro.potreroCodigo} no es un destino operativo disponible.`);
                }
                if (animal.potreroActual && String(animal.potreroActual) !== String(potrero._id) && registro.operacion === 'actualizar') {
                    throw new Error('Los cambios de potrero de animales existentes deben registrarse desde rotaciones o lotes.');
                }
                animal.potreroActual = potrero._id;
                await animal.save({ session });
            }
            aplicadas.set(registro.filaOrigen, { registro, animal });
        } catch (error) { throw crearErrorFila('INVENTARIO', registro, error); }
    }
    return aplicadas;
};

const completarAnimales = async (aplicadas, opciones, resultadoPesaje, session) => {
    for (const { registro, animal } of aplicadas.values()) {
        try {
            if (registro.codigoLote) {
                const lote = await Lote.findOne({ codigo: registro.codigoLote.toUpperCase() }).session(session);
                if (!lote) throw new Error(`No existe el lote ${registro.codigoLote}.`);
                validarAnimalParaLote(animal, lote);
                if (String(animal.loteActual || '') !== String(lote._id)) {
                    await agregarAnimalesAlLote(lote._id, {
                        animales: [animal._id], permitirMover: true,
                        motivoEntrada: 'Asignación desde importación estándar',
                        motivoSalida: 'Cambio de lote desde importación estándar'
                    }, opciones.usuarioId, { session });
                }
            }
            const madre = registro.madreDiio ? await buscarAnimalUnico(registro.madreDiio, session) : null;
            const padre = registro.padreDiio ? await buscarAnimalUnico(registro.padreDiio, session) : null;
            await validarRelacionGenealogica(animal._id, padre?._id, madre?._id, animal.especie, {
                session, fechaNacimiento: animal.fechaNacimiento
            });
            if (madre || padre) {
                if (madre) animal.madre = madre._id;
                if (padre) animal.padre = padre._id;
                animal.origenGenealogico = 'Interno';
                await animal.save({ session });
            }
            if (registro.pesoActual !== undefined) {
                await registrarPesajeImportado({
                    animal,
                    fecha: registro.fechaPesaje || new Date(),
                    peso: registro.pesoActual,
                    etapaProductiva: registro.etapaProductiva,
                    observaciones: 'Peso inicial registrado desde INVENTARIO.',
                    claveImportacion: `${clavePersistida(registro, opciones)}:peso`,
                    opciones,
                    session,
                    resultado: resultadoPesaje
                });
            }
        } catch (error) { throw crearErrorFila('INVENTARIO', registro, error); }
    }
};

const importarPesajes = async (registros, opciones, resultado, session) => {
    for (const registro of registros) {
        if (!aprobadoDuplicado(registro, opciones)) { resultado.duplicados += 1; continue; }
        try {
            const animal = await buscarAnimalUnico(registro.diio, session);
            if (!animal) throw new Error(`No existe el animal ${registro.diio}.`);
            await registrarPesajeImportado({
                animal, fecha: registro.fecha, peso: registro.peso,
                etapaProductiva: registro.etapaProductiva, observaciones: registro.observaciones,
                claveImportacion: clavePersistida(registro, opciones), opciones, session, resultado
            });
        } catch (error) { throw crearErrorFila('PESAJES', registro, error); }
    }
};

const importarFinanzas = async (registros, opciones, resultado, session) => {
    const catalogos = await CatalogoFinanciero.find({ activo: true }).select('tipo nombre').session(session).lean();
    const categorias = new Set(catalogos.filter((item) => item.tipo === 'categoria').map((item) => item.nombre));
    const destinos = new Set(catalogos.filter((item) => item.tipo === 'destinoUso').map((item) => item.nombre));
    for (const registro of registros) {
        if (!aprobadoDuplicado(registro, opciones)) { resultado.duplicados += 1; continue; }
        try {
            if (!['CRC', 'USD'].includes(registro.moneda)) throw new Error('La moneda debe ser CRC o USD.');
            if (categorias.size && !categorias.has(registro.categoria)) throw new Error(`La categoría ${registro.categoria} ya no está activa.`);
            if (registro.destinoUso && destinos.size && !destinos.has(registro.destinoUso)) throw new Error(`El destino ${registro.destinoUso} ya no está activo.`);
            const categoriaNormalizada = String(registro.categoria || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
            if (['PLANILLA', 'INVERSION', 'INVERSIONES'].includes(categoriaNormalizada) && registro.naturaleza !== 'Egreso') {
                throw new Error(`${registro.categoria} solo puede registrarse como Egreso.`);
            }
            await MovimientoFinanciero.create([{
                ...excluirControl(registro),
                claveImportacion: clavePersistida(registro, opciones),
                importacionOrigen: opciones.importacionId
            }], { session, ordered: true });
            resultado.creados += 1;
        } catch (error) { throw crearErrorFila('FINANZAS', registro, error); }
    }
};

const contarAltasActivas = async (registros) => {
    let cantidad = 0;
    for (const registro of registros) {
        if (registro.omitirPorDuplicado) continue;
        if (!await buscarAnimalUnico(registro.diio, null)) cantidad += 1;
    }
    return cantidad;
};

const confirmarImportacionExcelAtomica = async (payload, opciones = {}) => {
    const registros = payload?.registros || {};
    const configuracion = {
        ...opciones,
        modo: ['crear_actualizar', 'solo_crear'].includes(opciones.modo) ? opciones.modo : 'crear_actualizar'
    };
    asegurarPlanVigente(await obtenerPlanActual(configuracion.organizacionId));
    for (const especie of new Set((registros.Animal || []).map((item) => item.especie))) {
        const permiso = await puedeUsarEspecie(especie, configuracion.organizacionId);
        if (!permiso.permitido) throw Object.assign(new Error(permiso.message), { status: 403, codigo: permiso.code });
    }
    const cantidadNuevos = await contarAltasActivas(registros.Animal || []);
    const permisoCuota = cantidadNuevos
        ? await asegurarPuedeCrearAnimal({
            organizacionId: configuracion.organizacionId,
            especie: registros.Animal[0]?.especie || 'Bovino',
            cantidad: cantidadNuevos
        })
        : null;
    const ejecutar = async () => {
        const session = await mongoose.startSession();
        const resultado = crearResultado();
        try {
            await session.withTransaction(async () => {
                await importarPotreros(registros.Potrero || [], configuracion, resultado.Potrero, session);
                const aplicadas = await importarAnimalesBase(registros.Animal || [], configuracion, resultado.Animal, session);
                await completarAnimales(aplicadas, configuracion, resultado.Pesaje, session);
                await importarPesajes(registros.Pesaje || [], configuracion, resultado.Pesaje, session);
                await importarFinanzas(registros.MovimientoFinanciero || [], configuracion, resultado.MovimientoFinanciero, session);
            });
            return { mensaje: 'Importación estándar aplicada completamente.', modo: configuracion.modo, resultado };
        } finally {
            await session.endSession();
        }
    };
    return permisoCuota
        ? ejecutarConReservaCuota({
            permiso: permisoCuota,
            recurso: 'animales',
            organizacionId: configuracion.organizacionId,
            cantidad: cantidadNuevos,
            operacion: ejecutar
        })
        : ejecutar();
};

module.exports = {
    confirmarImportacionExcelAtomica,
    crearErrorFila,
    excluirControl
};
