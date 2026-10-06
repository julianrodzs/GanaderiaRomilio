const mongoose = require('mongoose');
const Animal = require('../models/Animal');
const CampanaIATF = require('../models/CampanaIATF');
const DiagnosticoGestacionIATF = require('../models/DiagnosticoGestacionIATF');
const EjecucionPasoIATF = require('../models/EjecucionPasoIATF');
const EventoCampanaIATF = require('../models/EventoCampanaIATF');
const Finca = require('../models/Finca');
const { InsumoReproductivo } = require('../models/InsumoReproductivo');
const Lote = require('../models/Lote');
const PertenenciaLote = require('../models/PertenenciaLote');
const { PlantillaProtocoloIATF } = require('../models/PlantillaProtocoloIATF');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const { Tarea } = require('../models/Tarea');
const { Membresia } = require('../models/Membresia');
const { calcularFechaProbablePartoBovino, obtenerDuracionGestacionBovina } = require('./duracionGestacion-service');
const { upsertEventoAnimal } = require('./eventoAnimal-service');
const { validarUsuarioAsignable } = require('./usuarioAsignable-service');
const { obtenerFincaActual } = require('../context/organizacion-context');

const ESTADOS_PARTICIPACION_ACTIVOS = ['INSCRITA', 'EN_PROTOCOLO', 'PROTOCOLO_COMPLETADO', 'INSEMINADA'];
const ACCIONES_BITACORA = new Set(['IATF', 'DIAGNOSTICO_GESTACION']);

const errorIatf = (mensaje, status = 400, code = 'IATF_VALIDATION') => {
    const error = new Error(mensaje);
    error.status = status;
    error.code = code;
    return error;
};

const idTexto = (valor) => String(valor?._id || valor || '');
const sumarHoras = (fecha, horas) => new Date(new Date(fecha).getTime() + Number(horas || 0) * 60 * 60 * 1000);
const evaluarEstadoPasoIatf = ({ participantes = [], animalesAplicados = [] }) => {
    const aplicados = new Set(animalesAplicados.map(idTexto));
    const activos = participantes.filter((participante) => !['RETIRADA', 'CANCELADA'].includes(participante.estadoParticipacion));
    const faltanAplicar = activos.some((participante) => !aplicados.has(idTexto(participante.animal)));
    const faltanInseminar = activos.some((participante) => (
        aplicados.has(idTexto(participante.animal)) && !participante.fechaInseminacion
    ));
    return faltanAplicar || faltanInseminar ? 'PARCIAL' : 'REALIZADO';
};
const seleccionarCampos = (datos, campos) => Object.fromEntries(
    campos.filter((campo) => Object.prototype.hasOwnProperty.call(datos || {}, campo)).map((campo) => [campo, datos[campo]])
);
const limpiarDatosPlantilla = (datos = {}) => seleccionarCampos(datos, [
    'nombre', 'descripcion', 'alcance', 'activo', 'diasPostpartoMinimosRecomendados',
    'escalaCondicionCorporal', 'condicionCorporalMinima', 'pasos'
]);
const limpiarDatosInsumo = (datos = {}) => seleccionarCampos(datos, [
    'nombre', 'categoria', 'unidad', 'cantidadDisponible', 'cantidadEnUso', 'costoUnitario',
    'moneda', 'lote', 'fechaVencimiento', 'tipoDispositivo', 'tipoSemen', 'toro',
    'codigoToro', 'razaToro', 'activo'
]);

const normalizarIdsPasos = (pasos = []) => {
    const mapa = new Map();
    const normalizados = pasos.map((paso, indice) => {
        const clave = idTexto(paso._id || paso.claveTemporal || `paso-${indice}`);
        const _id = mongoose.isValidObjectId(paso._id) ? paso._id : new mongoose.Types.ObjectId();
        mapa.set(clave, _id);
        return { ...paso, _id };
    });
    return normalizados.map((paso) => {
        if (paso.referenciaTemporal !== 'DESDE_PASO') return { ...paso, pasoReferenciaId: undefined };
        const referencia = mapa.get(idTexto(paso.pasoReferenciaId || paso.pasoReferenciaClave));
        return { ...paso, pasoReferenciaId: referencia || paso.pasoReferenciaId };
    });
};

const validarReferenciasProductos = async (pasos = []) => {
    const ids = [...new Set(pasos.flatMap((paso) => (paso.productos || []).map((item) => idTexto(item.producto))).filter(Boolean))];
    if (!ids.length) return;
    const cantidad = await InsumoReproductivo.countDocuments({ _id: { $in: ids }, activo: true });
    if (cantidad !== ids.length) throw errorIatf('El protocolo contiene insumos que no pertenecen a la finca activa.');
};

const validarPlantilla = (datos) => {
    const pasos = datos?.pasos || [];
    if (!String(datos?.nombre || '').trim()) throw errorIatf('El nombre del protocolo es requerido.');
    if (!pasos.length) throw errorIatf('El protocolo requiere al menos un paso.');
    const ids = new Set(pasos.map((paso) => idTexto(paso._id || paso.id)).filter(Boolean));
    pasos.forEach((paso, indice) => {
        if (!paso.nombre || !paso.tipoAccion) throw errorIatf(`El paso ${indice + 1} requiere nombre y tipo de acción.`);
        if (!Number.isFinite(Number(paso.offsetHoras))) throw errorIatf(`El paso ${paso.nombre} requiere un desplazamiento horario válido.`);
        if (paso.referenciaTemporal === 'DESDE_PASO' && !ids.has(idTexto(paso.pasoReferenciaId))) {
            throw errorIatf(`El paso ${paso.nombre} referencia un paso inexistente.`);
        }
        if (paso.ventanaInicioHoras != null && paso.ventanaFinHoras != null
            && Number(paso.ventanaInicioHoras) > Number(paso.ventanaFinHoras)) {
            throw errorIatf(`La ventana del paso ${paso.nombre} no es válida.`);
        }
        if (paso.tipoAccion === 'DIAGNOSTICO_GESTACION' && !['Administrador', 'Veterinario'].includes(paso.rolResponsable)) {
            throw errorIatf('Los diagnósticos de gestación deben asignarse a Administrador o Veterinario.');
        }
    });
    return true;
};

const calcularCronograma = (pasos, fechaHoraInicio, fechasReales = new Map()) => {
    const inicio = new Date(fechaHoraInicio);
    if (Number.isNaN(inicio.getTime())) throw errorIatf('La fecha de inicio no es válida.');
    const pendientes = [...pasos];
    const calculados = new Map();
    const resultado = [];

    while (pendientes.length) {
        const cantidadAnterior = pendientes.length;
        for (let indice = pendientes.length - 1; indice >= 0; indice -= 1) {
            const paso = pendientes[indice];
            const pasoId = idTexto(paso._id || paso.id);
            const referenciaId = idTexto(paso.pasoReferenciaId);
            const base = paso.referenciaTemporal === 'DESDE_PASO' ? calculados.get(referenciaId) : inicio;
            if (!base) continue;
            const fechaHoraProgramada = sumarHoras(base, paso.offsetHoras);
            const ventanaInicio = paso.ventanaInicioHoras == null ? null : sumarHoras(fechaHoraProgramada, paso.ventanaInicioHoras);
            const ventanaFin = paso.ventanaFinHoras == null ? null : sumarHoras(fechaHoraProgramada, paso.ventanaFinHoras);
            const calculado = { paso, pasoId, fechaHoraProgramada, ventanaInicio, ventanaFin };
            calculados.set(pasoId, fechasReales.get(pasoId) || fechaHoraProgramada);
            resultado.push(calculado);
            pendientes.splice(indice, 1);
        }
        if (pendientes.length === cantidadAnterior) throw errorIatf('El protocolo contiene dependencias circulares o referencias inválidas.');
    }
    return resultado.sort((a, b) => a.fechaHoraProgramada - b.fechaHoraProgramada);
};

const calcularDiasPostparto = (fechaParto, fechaReferencia) => {
    if (!fechaParto) return null;
    return Math.max(0, Math.floor((new Date(fechaReferencia) - new Date(fechaParto)) / 86400000));
};

const obtenerUltimosEstadosReproductivos = async (animales, session) => {
    const registros = await RegistroReproductivo.find({ animal: { $in: animales } })
        .sort({ createdAt: -1 })
        .session(session || null)
        .lean();
    const mapa = new Map();
    registros.forEach((registro) => {
        const id = idTexto(registro.animal);
        if (!mapa.has(id)) mapa.set(id, registro);
    });
    return mapa;
};

const advertenciasParticipante = ({ animal, registro, condicionCorporal, plantilla, fechaInicio }) => {
    const advertencias = [];
    const diasPostparto = calcularDiasPostparto(registro?.fechaPartoReal, fechaInicio);
    if (plantilla.diasPostpartoMinimosRecomendados != null && diasPostparto != null
        && diasPostparto < plantilla.diasPostpartoMinimosRecomendados) {
        advertencias.push(`No cumple los ${plantilla.diasPostpartoMinimosRecomendados} días posparto configurados.`);
    }
    if (plantilla.condicionCorporalMinima != null && condicionCorporal?.valor != null
        && Number(condicionCorporal.valor) < Number(plantilla.condicionCorporalMinima)) {
        advertencias.push(`Condición corporal inferior a ${plantilla.condicionCorporalMinima} en escala ${plantilla.escalaCondicionCorporal}.`);
    }
    if (animal.estado !== 'Activo') advertencias.push('El animal no está activo en inventario.');
    return { advertencias, diasPostparto };
};

const resolverAnimalesCampana = async ({ loteId, animalesIds = [], session }) => {
    const ids = new Set(animalesIds.map(idTexto).filter(Boolean));
    if (loteId) {
        const lote = await Lote.findById(loteId).session(session || null);
        if (!lote || lote.estado !== 'ACTIVO' || lote.especie !== 'Bovino' || lote.proposito !== 'REPRODUCCION') {
            throw errorIatf('El lote debe ser bovino, reproductivo y estar activo.');
        }
        const membresias = await PertenenciaLote.find({ lote: loteId, activo: true }).select('animal').session(session || null);
        membresias.forEach((item) => ids.add(idTexto(item.animal)));
    }
    if (!ids.size) throw errorIatf('Selecciona al menos una hembra o un lote reproductivo.');
    const animales = await Animal.find({ _id: { $in: [...ids] } }).session(session || null);
    if (animales.length !== ids.size) throw errorIatf('Uno o más animales no pertenecen a la finca activa.');
    animales.forEach((animal) => {
        if (animal.especie !== 'Bovino' || animal.sexo !== 'Hembra' || animal.objetivoProductivo !== 'REPRODUCCION' || animal.estado !== 'Activo') {
            throw errorIatf(`El animal ${animal.diio || animal.identificadorFinca} no es una hembra bovina reproductiva activa.`);
        }
    });
    return animales;
};

const crearPlantilla = async ({ datos, usuarioId }) => {
    const limpios = limpiarDatosPlantilla(datos);
    const normalizados = { ...limpios, pasos: normalizarIdsPasos(limpios.pasos) };
    if (normalizados.alcance === 'SISTEMA') throw errorIatf('Las plantillas de sistema solo pueden aprovisionarse desde la plataforma.', 403);
    validarPlantilla(normalizados);
    await validarReferenciasProductos(normalizados.pasos);
    return PlantillaProtocoloIATF.create({
        ...normalizados,
        fincaId: normalizados.alcance === 'FINCA' ? obtenerFincaActual() : undefined,
        especie: 'BOVINO',
        version: 1,
        creadoPor: usuarioId
    });
};

const versionarPlantilla = async ({ plantillaId, datos, usuarioId }) => {
    const actual = await PlantillaProtocoloIATF.findById(plantillaId);
    if (!actual) throw errorIatf('Protocolo no encontrado.', 404);
    if (actual.alcance === 'SISTEMA') throw errorIatf('Las plantillas del sistema deben duplicarse antes de personalizarlas.', 403);
    const limpios = limpiarDatosPlantilla(datos);
    const normalizados = { ...limpios, pasos: limpios.pasos ? normalizarIdsPasos(limpios.pasos) : actual.pasos };
    if (normalizados.alcance === 'SISTEMA' && actual.alcance !== 'SISTEMA') throw errorIatf('No puedes convertir una plantilla en plantilla de sistema.', 403);
    validarPlantilla({ ...actual.toObject(), ...normalizados });
    await validarReferenciasProductos(normalizados.pasos);
    Object.assign(actual, normalizados, {
        fincaId: (normalizados.alcance || actual.alcance) === 'FINCA' ? obtenerFincaActual() : undefined,
        version: actual.version + 1,
        creadoPor: usuarioId
    });
    return actual.save();
};

const generarTareasCampana = async ({ campana, cronograma, session, usuarioId }) => {
    const tareas = [];
    for (const item of cronograma.filter(({ paso }) => paso.generaTarea)) {
        const asignadoPaso = campana.responsablesPorRol?.[item.paso.rolResponsable] || campana.responsable;
        const tarea = new Tarea({
            titulo: `${item.paso.nombre} - ${campana.nombre}`,
            descripcion: `${campana.participantes.length} animales. ${item.paso.instrucciones || ''}`.trim(),
            tipo: 'Reproducción',
            estado: 'Pendiente',
            prioridad: item.paso.obligatorio ? 'Alta' : 'Media',
            fechaProgramada: item.fechaHoraProgramada,
            fechaLimite: item.ventanaFin || item.fechaHoraProgramada,
            asignadoA: asignadoPaso,
            creadoPor: usuarioId,
            lote: campana.loteOrigen,
            moduloOrigen: 'Reproduccion',
            referenciaId: campana._id,
            creadoAutomaticamente: true,
            especie: 'Bovino',
            categoriaAutomatica: 'IATF',
            claveAutomatica: `IATF_${item.pasoId}`,
            generaBitacora: false
        });
        await tarea.save({ session });
        tareas.push({ pasoId: item.pasoId, tarea });
    }
    return tareas;
};

const crearCampana = async ({ datos, usuarioId }) => {
    await validarUsuarioAsignable(datos.responsable, 'Reproduccion');
    if (datos.veterinario) {
        const veterinario = await validarUsuarioAsignable(datos.veterinario, 'IATF');
        if (!['Veterinario', 'Administrador'].includes(veterinario.rol)) throw errorIatf('El veterinario debe tener rol Veterinario o Administrador.');
    }
    const responsablesPorRol = datos.responsablesPorRol || {};
    for (const [rol, responsableId] of Object.entries(responsablesPorRol)) {
        if (!responsableId) continue;
        const responsable = await validarUsuarioAsignable(responsableId, 'IATF');
        if (responsable.rol !== rol && responsable.rol !== 'Administrador') {
            throw errorIatf(`El responsable seleccionado para ${rol} no tiene ese rol.`);
        }
    }
    const session = await mongoose.startSession();
    let creada;
    try {
        await session.withTransaction(async () => {
            const plantilla = await PlantillaProtocoloIATF.findById(datos.protocolo).session(session);
            if (!plantilla || !plantilla.activo) throw errorIatf('El protocolo no existe o está inactivo.', 404);
            validarPlantilla(plantilla.toObject());
            const animales = await resolverAnimalesCampana({ loteId: datos.loteOrigen, animalesIds: datos.animales, session });
            const registros = await obtenerUltimosEstadosReproductivos(animales.map((animal) => animal._id), session);
            const condiciones = new Map((datos.condicionesCorporales || []).map((item) => [idTexto(item.animal), item]));
            const participantes = animales.map((animal) => {
                const registro = registros.get(idTexto(animal._id));
                const cc = condiciones.get(idTexto(animal._id));
                if (cc?.valor != null) {
                    const escala = cc.escala || plantilla.escalaCondicionCorporal;
                    const maximo = escala === '1-9' ? 9 : 5;
                    if (Number(cc.valor) < 1 || Number(cc.valor) > maximo) throw errorIatf(`La condición corporal de ${animal.diio || animal.identificadorFinca} debe estar entre 1 y ${maximo}.`);
                }
                const evaluacion = advertenciasParticipante({ animal, registro, condicionCorporal: cc, plantilla, fechaInicio: datos.fechaHoraInicio });
                return {
                    animal: animal._id,
                    loteOrigen: animal.loteActual || datos.loteOrigen,
                    diasPostparto: evaluacion.diasPostparto,
                    condicionCorporal: cc?.valor == null ? undefined : { valor: cc.valor, escala: cc.escala || plantilla.escalaCondicionCorporal },
                    estadoReproductivo: registro?.estado || 'Vacía',
                    categoria: animal.categoria,
                    advertencias: evaluacion.advertencias
                };
            });
            const snapshots = plantilla.toObject();
            const [campana] = await CampanaIATF.create([{
                nombre: datos.nombre,
                protocolo: plantilla._id,
                protocoloVersion: plantilla.version,
                protocoloSnapshot: snapshots,
                fechaHoraInicio: datos.fechaHoraInicio,
                responsable: datos.responsable,
                responsablesPorRol,
                veterinario: datos.veterinario,
                loteOrigen: datos.loteOrigen,
                participantes,
                estado: 'PROGRAMADA',
                campanaAnterior: datos.campanaAnterior,
                costosAdicionales: datos.costosAdicionales,
                observaciones: datos.observaciones,
                creadoPor: usuarioId
            }], { session });
            const cronograma = calcularCronograma(snapshots.pasos, campana.fechaHoraInicio);
            const tareas = await generarTareasCampana({ campana, cronograma, session, usuarioId });
            for (const item of cronograma) {
                const tarea = tareas.find((asignada) => asignada.pasoId === item.pasoId)?.tarea;
                await EjecucionPasoIATF.create([{
                    campana: campana._id,
                    pasoPlantilla: item.pasoId,
                    pasoSnapshot: item.paso,
                    fechaHoraProgramada: item.fechaHoraProgramada,
                    ventanaInicio: item.ventanaInicio,
                    ventanaFin: item.ventanaFin,
                    responsable: campana.responsablesPorRol?.[item.paso.rolResponsable] || campana.responsable,
                    tarea: tarea?._id
                }], { session });
            }
            await EventoCampanaIATF.create([{ campana: campana._id, tipo: 'CREADA', descripcion: 'Campaña IATF creada.', usuario: usuarioId }], { session });
            creada = campana;
        });
    } finally {
        await session.endSession();
    }
    return obtenerCampana(creada._id);
};

const obtenerCampana = async (id) => {
    const campana = await CampanaIATF.findById(id)
        .populate('protocolo', 'nombre version')
        .populate('responsable veterinario', 'nombre apellido correo')
        .populate('loteOrigen', 'codigo nombre')
        .populate('participantes.animal', 'diio identificadorFinca nombre categoria raza')
        .populate('participantes.tecnicoInseminador', 'nombre apellido');
    if (!campana) throw errorIatf('Campaña IATF no encontrada.', 404);
    const [pasos, diagnosticos, eventos] = await Promise.all([
        EjecucionPasoIATF.find({ campana: id }).sort({ fechaHoraProgramada: 1 }).populate('responsable', 'nombre apellido'),
        DiagnosticoGestacionIATF.find({ campanaIATF: id }).sort({ fecha: -1 }).populate('responsable', 'nombre apellido'),
        EventoCampanaIATF.find({ campana: id }).sort({ fecha: -1 }).limit(100)
    ]);
    return { ...campana.toObject(), pasos, diagnosticos, eventos, metricas: calcularMetricasCampana(campana, diagnosticos, pasos) };
};

const obtenerActividadPorTarea = async ({ tareaId, usuarioId, rolUsuario }) => {
    const tarea = await Tarea.findOne({ _id: tareaId, categoriaAutomatica: 'IATF', moduloOrigen: 'Reproduccion' });
    if (!tarea) throw errorIatf('Actividad IATF no encontrada.', 404);
    if (rolUsuario === 'Trabajador' && idTexto(tarea.asignadoA) !== idTexto(usuarioId)) {
        throw errorIatf('Solo puedes consultar actividades IATF asignadas a ti.', 403, 'IATF_TAREA_NO_ASIGNADA');
    }
    const ejecucion = await EjecucionPasoIATF.findOne({ tarea: tarea._id });
    if (!ejecucion) throw errorIatf('La tarea no tiene una ejecución IATF asociada.', 404);
    const campana = await CampanaIATF.findById(ejecucion.campana)
        .populate('participantes.animal', 'diio identificadorFinca nombre categoria');
    if (!campana) throw errorIatf('Campaña IATF no encontrada.', 404);
    const idsPlanificados = (ejecucion.pasoSnapshot.productos || []).map((item) => item.producto).filter(Boolean);
    const filtroInsumos = ejecucion.pasoSnapshot.tipoAccion === 'IATF'
        ? { $or: [{ _id: { $in: idsPlanificados } }, { categoria: 'SEMEN' }], activo: true }
        : { _id: { $in: idsPlanificados }, activo: true };
    const insumos = await InsumoReproductivo.find(filtroInsumos).sort({ categoria: 1, nombre: 1 });
    return { tarea, ejecucion, campana, insumos };
};

const consumirInsumos = async ({ productos = [], tipoAccion, session }) => {
    const snapshots = [];
    for (const uso of productos) {
        const cantidad = Number(uso.cantidad);
        if (!(cantidad > 0)) throw errorIatf('La cantidad utilizada debe ser mayor que cero.');
        const actual = await InsumoReproductivo.findById(uso.producto).session(session);
        if (!actual || !actual.activo) throw errorIatf('Inventario insuficiente o insumo no disponible.', 422, 'IATF_STOCK_INSUFICIENTE');
        const esReutilizable = actual.categoria === 'DISPOSITIVO_REPRODUCTIVO' && actual.tipoDispositivo === 'REUTILIZABLE_CONTROLADO';
        const esRetiro = tipoAccion === 'RETIRAR_DISPOSITIVO';
        let filtro = { _id: uso.producto, activo: true };
        let cambio = {};
        if (esRetiro && esReutilizable) {
            filtro.cantidadEnUso = { $gte: cantidad };
            cambio = { $inc: { cantidadEnUso: -cantidad, cantidadDisponible: cantidad } };
        } else if (esRetiro) {
            cambio = { $set: { updatedAt: new Date() } };
        } else if (esReutilizable && tipoAccion === 'INSERTAR_DISPOSITIVO') {
            filtro.cantidadDisponible = { $gte: cantidad };
            cambio = { $inc: { cantidadDisponible: -cantidad, cantidadEnUso: cantidad } };
        } else {
            filtro.cantidadDisponible = { $gte: cantidad };
            cambio = { $inc: { cantidadDisponible: -cantidad } };
        }
        const insumo = await InsumoReproductivo.findOneAndUpdate(filtro, cambio, { new: true, session });
        if (!insumo) throw errorIatf('Inventario insuficiente o insumo no disponible.', 422, 'IATF_STOCK_INSUFICIENTE');
        snapshots.push({
            producto: insumo._id,
            nombre: insumo.nombre,
            cantidad,
            unidad: uso.unidad || insumo.unidad,
            dosis: uso.dosis,
            lote: uso.lote || insumo.lote,
            vencimiento: insumo.fechaVencimiento,
            costoUnitarioSnapshot: insumo.costoUnitario,
            costoTotalSnapshot: esRetiro ? 0 : cantidad * insumo.costoUnitario,
            moneda: insumo.moneda
        });
    }
    return snapshots;
};

const ejecutarPaso = async ({ campanaId, pasoId, datos, usuarioId, rolUsuario }) => {
    const session = await mongoose.startSession();
    try {
        let resultado;
        await session.withTransaction(async () => {
            const campana = await CampanaIATF.findById(campanaId).session(session);
            if (!campana || ['FINALIZADA', 'CANCELADA'].includes(campana.estado)) throw errorIatf('La campaña no admite nuevas ejecuciones.', 409);
            const ejecucion = await EjecucionPasoIATF.findOne({ campana: campanaId, pasoPlantilla: pasoId }).session(session);
            if (!ejecucion || !['PENDIENTE', 'PARCIAL'].includes(ejecucion.estado)) throw errorIatf('El paso no admite más ejecuciones.', 409);
            if (rolUsuario === 'Trabajador') {
                const tareaAsignada = ejecucion.tarea && await Tarea.exists({ _id: ejecucion.tarea, asignadoA: usuarioId, estado: { $in: ['Pendiente', 'En proceso'] } }).session(session);
                if (!tareaAsignada) throw errorIatf('Solo puedes ejecutar actividades IATF asignadas a ti.', 403, 'IATF_TAREA_NO_ASIGNADA');
                const productosPermitidos = new Set((ejecucion.pasoSnapshot.productos || []).map((item) => idTexto(item.producto)));
                if ((datos.productos || []).some((item) => !productosPermitidos.has(idTexto(item.producto)))) {
                    throw errorIatf('Un trabajador no puede agregar productos distintos a los configurados en el protocolo.', 403);
                }
                datos.productos = (datos.productos || []).map((item) => {
                    const previsto = (ejecucion.pasoSnapshot.productos || []).find((p) => idTexto(p.producto) === idTexto(item.producto));
                    return { ...item, dosis: previsto?.dosis, unidad: previsto?.unidad };
                });
            }
            const idsParticipantes = new Set(campana.participantes.map((item) => idTexto(item.animal)));
            const animalesAplicados = (datos.animales || []).map(idTexto);
            if (!animalesAplicados.length || animalesAplicados.some((id) => !idsParticipantes.has(id))) throw errorIatf('Selecciona participantes válidos para ejecutar el paso.');
            const aplicadosAnteriores = new Set((ejecucion.animalesAplicados || []).map(idTexto));
            if (animalesAplicados.some((id) => aplicadosAnteriores.has(id))) throw errorIatf('La selección contiene animales ya registrados en este paso.', 409);
            const productos = await consumirInsumos({ productos: datos.productos, tipoAccion: ejecucion.pasoSnapshot.tipoAccion, session });
            ejecucion.fechaHoraReal = datos.fechaHoraReal || new Date();
            ejecucion.responsable = datos.responsable || usuarioId;
            ejecucion.animalesAplicados = [...aplicadosAnteriores, ...animalesAplicados];
            ejecucion.productosRealmenteUtilizados = [...(ejecucion.productosRealmenteUtilizados || []), ...productos];
            ejecucion.observaciones = datos.observaciones;
            const participantesAplicables = campana.participantes.filter((item) => !['RETIRADA', 'CANCELADA'].includes(item.estadoParticipacion)).length;
            ejecucion.estado = datos.estado || (ejecucion.animalesAplicados.length >= participantesAplicables ? 'REALIZADO' : 'PARCIAL');
            if (ejecucion.pasoSnapshot.tipoAccion === 'IATF') ejecucion.estado = 'PARCIAL';
            ejecucion.ejecutadoPor = usuarioId;
            await ejecucion.save({ session });
            if (campana.estado === 'PROGRAMADA') campana.estado = 'EN_CURSO';
            const iniciados = [];
            campana.participantes.forEach((participante) => {
                if (!animalesAplicados.includes(idTexto(participante.animal))) return;
                if (ejecucion.pasoSnapshot.tipoAccion === 'IATF') participante.estadoParticipacion = 'PROTOCOLO_COMPLETADO';
                else if (participante.estadoParticipacion === 'INSCRITA') {
                    participante.estadoParticipacion = 'EN_PROTOCOLO';
                    iniciados.push(participante.animal);
                }
                if (ejecucion.pasoSnapshot.tipoAccion === 'OBSERVAR_CELO'
                    && (datos.retornoCeloAnimales || []).map(idTexto).includes(idTexto(participante.animal))) {
                    participante.retornoCeloObservado = true;
                }
            });
            await campana.save({ session });
            if (ejecucion.tarea) await Tarea.updateOne(
                { _id: ejecucion.tarea },
                { $set: ejecucion.estado === 'REALIZADO' ? { estado: 'Completada', fechaCompletada: ejecucion.fechaHoraReal } : { estado: 'En proceso' } },
                { session }
            );
            await EventoCampanaIATF.create([{ campana: campana._id, tipo: 'PASO_EJECUTADO', descripcion: ejecucion.pasoSnapshot.nombre, datos: { ejecucion: ejecucion._id, estado: ejecucion.estado }, usuario: usuarioId }], { session });
            for (const animal of iniciados) {
                await upsertEventoAnimal({
                    animal, tipoEvento: 'Observacion', fecha: ejecucion.fechaHoraReal,
                    titulo: 'Inicio de protocolo IATF', descripcion: `Inicio real de la campaña ${campana.nombre}.`,
                    moduloOrigen: 'Reproduccion', referenciaId: ejecucion._id, creadoPor: usuarioId,
                    metadata: { naturaleza: 'IATF', campanaIATF: campana._id, protocoloVersion: campana.protocoloVersion }
                }, { session });
            }
            resultado = ejecucion;
        });
        return resultado;
    } finally {
        await session.endSession();
    }
};

const reprogramarDependientes = async ({ campanaId, pasoId, recalcular, usuarioId }) => {
    const campana = await CampanaIATF.findById(campanaId);
    if (!campana) throw errorIatf('Campaña no encontrada.', 404);
    const pasos = await EjecucionPasoIATF.find({ campana: campanaId }).sort({ fechaHoraProgramada: 1 });
    const ejecutado = pasos.find((paso) => idTexto(paso.pasoPlantilla) === idTexto(pasoId));
    if (!ejecutado?.fechaHoraReal) throw errorIatf('Primero registra la ejecución real del paso de referencia.');
    if (!recalcular) return { actualizados: 0, pasos };
    const fechasReales = new Map(pasos.filter((paso) => paso.fechaHoraReal).map((paso) => [idTexto(paso.pasoPlantilla), paso.fechaHoraReal]));
    const cronograma = calcularCronograma(campana.protocoloSnapshot.pasos, campana.fechaHoraInicio, fechasReales);
    let actualizados = 0;
    for (const item of cronograma) {
        const paso = pasos.find((actual) => idTexto(actual.pasoPlantilla) === item.pasoId);
        if (!paso || paso.estado !== 'PENDIENTE' || paso.fechaHoraProgramada.getTime() === item.fechaHoraProgramada.getTime()) continue;
        paso.fechaHoraProgramada = item.fechaHoraProgramada;
        paso.ventanaInicio = item.ventanaInicio;
        paso.ventanaFin = item.ventanaFin;
        await paso.save();
        if (paso.tarea) await Tarea.updateOne({ _id: paso.tarea, estado: 'Pendiente' }, { $set: { fechaProgramada: item.fechaHoraProgramada, fechaLimite: item.ventanaFin || item.fechaHoraProgramada } });
        actualizados += 1;
    }
    await EventoCampanaIATF.create({ campana: campana._id, tipo: 'REPROGRAMADA', descripcion: `${actualizados} actividades dependientes recalculadas.`, datos: { pasoReferencia: pasoId }, usuario: usuarioId });
    return { actualizados, pasos: await EjecucionPasoIATF.find({ campana: campanaId }).sort({ fechaHoraProgramada: 1 }) };
};

const registrarIATF = async ({ campanaId, datos, usuarioId, rolUsuario }) => {
    const session = await mongoose.startSession();
    try {
        let salida;
        await session.withTransaction(async () => {
            const campana = await CampanaIATF.findById(campanaId).session(session);
            if (!campana || ['FINALIZADA', 'CANCELADA'].includes(campana.estado)) throw errorIatf('Campaña no disponible.', 409);
            const pasoIatf = await EjecucionPasoIATF.findOne({ campana: campanaId, 'pasoSnapshot.tipoAccion': 'IATF' }).session(session);
            if (!pasoIatf) throw errorIatf('La campaña no tiene un paso IATF configurado.', 409);
            if (rolUsuario === 'Trabajador') {
                const tareas = [pasoIatf.tarea].filter(Boolean);
                if (!await Tarea.exists({ _id: { $in: tareas }, asignadoA: usuarioId, estado: { $in: ['Pendiente', 'En proceso'] } }).session(session)) {
                    throw errorIatf('Solo puedes registrar la IATF de una tarea asignada a ti.', 403, 'IATF_TAREA_NO_ASIGNADA');
                }
            }
            const registros = datos.inseminaciones || [];
            if (!registros.length) throw errorIatf('No hay inseminaciones para registrar.');
            const animalesConPasoEjecutado = new Set((pasoIatf.animalesAplicados || []).map(idTexto));
            for (const item of registros) {
                const participante = campana.participantes.id(item.participanteId)
                    || campana.participantes.find((p) => idTexto(p.animal) === idTexto(item.animal));
                if (!participante || !['EN_PROTOCOLO', 'PROTOCOLO_COMPLETADO'].includes(participante.estadoParticipacion)) throw errorIatf('Participante no disponible para inseminar.', 409);
                if (!animalesConPasoEjecutado.has(idTexto(participante.animal))) {
                    throw errorIatf('Primero registra la ejecución del paso IATF para los animales seleccionados.', 409, 'IATF_PASO_NO_EJECUTADO');
                }
                const semen = await InsumoReproductivo.findOneAndUpdate(
                    { _id: item.semen, categoria: 'SEMEN', activo: true, cantidadDisponible: { $gte: 1 } },
                    { $inc: { cantidadDisponible: -1 } },
                    { new: true, session }
                );
                if (!semen) throw errorIatf('No hay pajuelas disponibles para una de las inseminaciones.', 422, 'IATF_SEMEN_INSUFICIENTE');
                const fecha = new Date(item.fechaHoraReal || datos.fechaHoraReal || new Date());
                const diasGestacion = await obtenerDuracionGestacionBovina({ fincaId: campana.fincaId, session });
                let ciclo = await RegistroReproductivo.findOne({ animal: participante.animal, estadoCiclo: 'Activo', activoParaAlertas: true }).session(session);
                if (ciclo && idTexto(ciclo.campanaIATF) !== idTexto(campana._id)) throw errorIatf('El animal ya tiene un ciclo reproductivo activo. Ciérralo antes de registrar la IATF.', 409);
                if (!ciclo) ciclo = new RegistroReproductivo({ animal: participante.animal, especie: 'Bovino' });
                Object.assign(ciclo, {
                    asignadoA: campana.responsable,
                    tipoRegistro: 'Inseminación',
                    tipoInseminacion: 'IATF',
                    campanaIATF: campana._id,
                    origenGestacion: 'IATF',
                    fechaInseminacion: fecha,
                    fechaMonta: fecha,
                    fechaPartoEstimada: undefined,
                    gestacionConfirmada: false,
                    resultadoDiagnosticoGestacion: undefined,
                    estadoCiclo: 'Activo',
                    activoParaAlertas: true,
                    observaciones: item.observaciones
                });
                await ciclo.save({ session });
                participante.estadoParticipacion = 'INSEMINADA';
                participante.fechaInseminacion = fecha;
                participante.semenUtilizado = semen._id;
                participante.semenSnapshot = {
                    nombre: semen.nombre, toro: item.toro || semen.toro, codigoToro: item.codigoToro || semen.codigoToro,
                    raza: item.raza || semen.razaToro, lote: item.loteSemen || semen.lote, tipoSemen: item.tipoSemen || semen.tipoSemen,
                    costoUnitario: semen.costoUnitario, moneda: semen.moneda, diasGestacionConfigurados: diasGestacion
                };
                participante.tecnicoInseminador = item.tecnico || datos.tecnico || usuarioId;
                participante.registroReproductivo = ciclo._id;
                await upsertEventoAnimal({
                    animal: participante.animal, tipoEvento: 'Monta', fecha, titulo: 'Inseminación IATF',
                    descripcion: `Inseminación realizada en la campaña ${campana.nombre}.`, moduloOrigen: 'Reproduccion',
                    referenciaId: ciclo._id, creadoPor: usuarioId,
                    metadata: { campanaIATF: campana._id, tipoInseminacion: 'IATF', semen: participante.semenSnapshot }
                }, { session });
            }
            pasoIatf.estado = evaluarEstadoPasoIatf({
                participantes: campana.participantes,
                animalesAplicados: pasoIatf.animalesAplicados
            });
            campana.estado = pasoIatf.estado === 'REALIZADO' ? 'DIAGNOSTICO' : 'EN_CURSO';
            await Promise.all([campana.save({ session }), pasoIatf.save({ session })]);
            if (pasoIatf.tarea) {
                await Tarea.updateOne(
                    { _id: pasoIatf.tarea },
                    { $set: pasoIatf.estado === 'REALIZADO' ? { estado: 'Completada', fechaCompletada: new Date() } : { estado: 'En proceso' } },
                    { session }
                );
            }
            await EventoCampanaIATF.create([{ campana: campana._id, tipo: 'INSEMINACION', descripcion: `${registros.length} inseminaciones registradas.`, usuario: usuarioId }], { session });
            salida = campana;
        });
        return obtenerCampana(salida._id);
    } finally {
        await session.endSession();
    }
};

const registrarDiagnosticos = async ({ campanaId, datos, usuarioId }) => {
    const session = await mongoose.startSession();
    try {
        let salida;
        await session.withTransaction(async () => {
            const campana = await CampanaIATF.findById(campanaId).session(session);
            if (!campana || campana.estado === 'CANCELADA') throw errorIatf('Campaña no disponible.', 409);
            const items = datos.diagnosticos || [];
            if (!items.length) throw errorIatf('No hay diagnósticos para registrar.');
            for (const item of items) {
                const participante = campana.participantes.id(item.participanteId)
                    || campana.participantes.find((p) => idTexto(p.animal) === idTexto(item.animal));
                if (!participante || participante.estadoParticipacion !== 'INSEMINADA') throw errorIatf('Solo se diagnostican animales inseminados en esta campaña.');
                const [diagnostico] = await DiagnosticoGestacionIATF.create([{
                    animal: participante.animal, campanaIATF: campana._id, fecha: item.fecha || datos.fecha,
                    metodo: item.metodo || datos.metodo, resultado: item.resultado,
                    responsable: item.responsable || datos.responsable || usuarioId,
                    observaciones: item.observaciones, registradoPor: usuarioId
                }], { session });
                participante.resultadoActual = item.resultado;
                if (participante.registroReproductivo) {
                    const ciclo = await RegistroReproductivo.findById(participante.registroReproductivo).session(session);
                    if (ciclo) {
                        ciclo.resultadoDiagnosticoGestacion = item.resultado;
                        ciclo.fechaUltimoDiagnosticoGestacion = diagnostico.fecha;
                        if (item.resultado === 'PREÑADA') {
                            const parto = await calcularFechaProbablePartoBovino({
                                fechaServicio: participante.fechaInseminacion,
                                fincaId: campana.fincaId,
                                session
                            });
                            ciclo.gestacionConfirmada = true;
                            ciclo.fechaPartoEstimada = parto.fechaProbableParto;
                            ciclo.origenGestacion = 'IATF';
                        } else if (item.resultado === 'VACIA') {
                            ciclo.gestacionConfirmada = false;
                            ciclo.fechaPartoEstimada = undefined;
                        }
                        await ciclo.save({ session });
                    }
                }
                await upsertEventoAnimal({
                    animal: participante.animal, tipoEvento: 'Diagnostico de gestacion', fecha: diagnostico.fecha,
                    titulo: item.resultado === 'PREÑADA' ? 'Preñez confirmada' : 'Diagnóstico de gestación',
                    descripcion: `${item.resultado} por ${diagnostico.metodo}.`, moduloOrigen: 'Reproduccion',
                    referenciaId: diagnostico._id, creadoPor: usuarioId,
                    metadata: { campanaIATF: campana._id, resultado: item.resultado, metodo: diagnostico.metodo }
                }, { session });
            }
            campana.estado = 'DIAGNOSTICO';
            await campana.save({ session });
            await EventoCampanaIATF.create([{ campana: campana._id, tipo: 'DIAGNOSTICO', descripcion: `${items.length} diagnósticos registrados.`, usuario: usuarioId }], { session });
            salida = campana;
        });
        return obtenerCampana(salida._id);
    } finally {
        await session.endSession();
    }
};

const calcularMetricasCampana = (campana, diagnosticos = [], pasos = []) => {
    const participantes = campana.participantes || [];
    const inseminadas = participantes.filter((p) => Boolean(p.fechaInseminacion)).length;
    const completaron = participantes.filter((p) => ['PROTOCOLO_COMPLETADO', 'INSEMINADA'].includes(p.estadoParticipacion)).length;
    const prenadas = participantes.filter((p) => p.resultadoActual === 'PREÑADA').length;
    const vacias = participantes.filter((p) => p.resultadoActual === 'VACIA').length;
    const dudosas = participantes.filter((p) => ['DUDOSA', 'REQUIERE_RECONFIRMACION'].includes(p.resultadoActual)).length;
    const costosPorMoneda = {};
    const agregarCosto = (moneda, monto) => {
        const clave = moneda || 'CRC';
        costosPorMoneda[clave] = Number(costosPorMoneda[clave] || 0) + Number(monto || 0);
    };
    const costoProductos = pasos.reduce((total, paso) => total + (paso.productosRealmenteUtilizados || []).reduce((suma, p) => {
        agregarCosto(p.moneda, p.costoTotalSnapshot);
        return suma + Number(p.costoTotalSnapshot || 0);
    }, 0), 0);
    const costoSemen = participantes.reduce((total, p) => {
        agregarCosto(p.semenSnapshot?.moneda, p.semenSnapshot?.costoUnitario);
        return total + Number(p.semenSnapshot?.costoUnitario || 0);
    }, 0);
    const adicionales = campana.costosAdicionales || {};
    agregarCosto(
        adicionales.moneda || 'CRC',
        Number(adicionales.veterinario || 0) + Number(adicionales.tecnico || 0) + Number(adicionales.otros || 0)
    );
    const monedasCosto = Object.keys(costosPorMoneda).filter((moneda) => costosPorMoneda[moneda] !== 0);
    const monedaCosto = monedasCosto.length <= 1 ? (monedasCosto[0] || adicionales.moneda || 'CRC') : null;
    const costoTotal = monedaCosto ? Number(costosPorMoneda[monedaCosto] || 0) : null;
    const porFecha = {};
    diagnosticos.forEach((item) => {
        const clave = new Date(item.fecha).toISOString().slice(0, 10);
        porFecha[clave] ||= { fecha: clave, diagnosticadas: 0, prenadas: 0 };
        porFecha[clave].diagnosticadas += 1;
        if (item.resultado === 'PREÑADA') porFecha[clave].prenadas += 1;
    });
    Object.values(porFecha).forEach((grupo) => {
        grupo.pAI = inseminadas ? Number(((grupo.prenadas / inseminadas) * 100).toFixed(2)) : 0;
    });
    const resultadosPorToro = {};
    participantes.filter((p) => p.fechaInseminacion).forEach((p) => {
        const clave = p.semenSnapshot?.codigoToro || p.semenSnapshot?.toro || p.semenSnapshot?.nombre || 'Sin referencia';
        resultadosPorToro[clave] ||= { toro: clave, inseminadas: 0, prenadas: 0 };
        resultadosPorToro[clave].inseminadas += 1;
        if (p.resultadoActual === 'PREÑADA') resultadosPorToro[clave].prenadas += 1;
    });
    Object.values(resultadosPorToro).forEach((grupo) => {
        grupo.pAIObservado = grupo.inseminadas ? Number(((grupo.prenadas / grupo.inseminadas) * 100).toFixed(2)) : 0;
    });
    return {
        inscritas: participantes.length,
        completaron,
        inseminadas,
        prenadas,
        vacias,
        dudosas,
        pAI: inseminadas ? Number(((prenadas / inseminadas) * 100).toFixed(2)) : 0,
        costoProductos,
        costoSemen,
        costoTotal,
        monedaCosto,
        costosPorMoneda,
        costoPorPrenez: prenadas && costoTotal != null ? Number((costoTotal / prenadas).toFixed(2)) : null,
        diagnosticosPorFecha: Object.values(porFecha),
        resultadosObservadosPorToro: Object.values(resultadosPorToro)
    };
};

const cambiarEstadoCampana = async ({ campanaId, estado, motivo, usuarioId }) => {
    const campana = await CampanaIATF.findById(campanaId);
    if (!campana) throw errorIatf('Campaña no encontrada.', 404);
    if (campana.estado === 'CANCELADA') throw errorIatf('La campaña ya está cancelada.', 409);
    if (estado === 'CANCELADA') {
        const afectados = campana.participantes.filter((p) => ESTADOS_PARTICIPACION_ACTIVOS.includes(p.estadoParticipacion)).map((p) => p.animal);
        campana.estado = estado;
        campana.fechaCancelacion = new Date();
        campana.motivoCancelacion = motivo;
        campana.participantes.forEach((p) => { if (ESTADOS_PARTICIPACION_ACTIVOS.includes(p.estadoParticipacion)) p.estadoParticipacion = 'CANCELADA'; });
        await Promise.all([
            Tarea.updateMany({ referenciaId: campana._id, moduloOrigen: 'Reproduccion', estado: { $in: ['Pendiente', 'En proceso'] } }, { $set: { estado: 'Cancelada', observaciones: motivo || 'Campaña IATF cancelada' } }),
            EjecucionPasoIATF.updateMany(
                { campana: campana._id, estado: { $in: ['PENDIENTE', 'PARCIAL'] } },
                { $set: { estado: 'CANCELADO' } }
            )
        ]);
        await Promise.all(afectados.map((animal) => upsertEventoAnimal({
            animal, tipoEvento: 'Observacion', fecha: campana.fechaCancelacion,
            titulo: 'Campaña IATF cancelada', descripcion: motivo || 'La campaña fue cancelada.',
            moduloOrigen: 'Reproduccion', referenciaId: campana._id, creadoPor: usuarioId,
            metadata: { campanaIATF: campana._id, estado: 'CANCELADA' }
        })));
    } else {
        campana.estado = 'FINALIZADA';
        campana.fechaFinalizacion = new Date();
    }
    await campana.save();
    await EventoCampanaIATF.create({ campana: campana._id, tipo: estado === 'CANCELADA' ? 'CANCELADA' : 'FINALIZADA', descripcion: motivo, usuario: usuarioId });
    return obtenerCampana(campana._id);
};

const retirarParticipante = async ({ campanaId, participanteId, motivo, usuarioId }) => {
    const campana = await CampanaIATF.findById(campanaId);
    if (!campana) throw errorIatf('Campaña no encontrada.', 404);
    const participante = campana.participantes.id(participanteId);
    if (!participante) throw errorIatf('Participante no encontrado.', 404);
    participante.estadoParticipacion = 'RETIRADA';
    participante.observaciones = motivo;
    await campana.save();
    await Promise.all([
        EventoCampanaIATF.create({ campana: campana._id, tipo: 'ANIMAL_RETIRADO', descripcion: motivo, datos: { animal: participante.animal }, usuario: usuarioId }),
        upsertEventoAnimal({ animal: participante.animal, tipoEvento: 'Observacion', fecha: new Date(), titulo: 'Salida de campaña IATF', descripcion: motivo, moduloOrigen: 'Reproduccion', referenciaId: campana._id, creadoPor: usuarioId, metadata: { campanaIATF: campana._id } })
    ]);
    return obtenerCampana(campana._id);
};

const resincronizar = async ({ campanaId, datos, usuarioId }) => {
    const anterior = await CampanaIATF.findById(campanaId);
    if (!anterior) throw errorIatf('Campaña anterior no encontrada.', 404);
    const elegibles = anterior.participantes.filter((participante) => (
        participante.resultadoActual === 'VACIA'
        && participante.estadoParticipacion === 'INSEMINADA'
    ));
    const seleccion = new Set((datos.animales || elegibles.map((item) => item.animal)).map(idTexto));
    const animales = elegibles.filter((item) => seleccion.has(idTexto(item.animal))).map((item) => item.animal);
    if (!animales.length) throw errorIatf('No hay hembras vacías elegibles para la resincronización.');
    return crearCampana({
        datos: {
            ...datos,
            nombre: datos.nombre || `${anterior.nombre} - Resincronización`,
            protocolo: datos.protocolo || anterior.protocolo,
            animales,
            campanaAnterior: anterior._id,
            responsable: datos.responsable || anterior.responsable,
            veterinario: datos.veterinario || anterior.veterinario,
            responsablesPorRol: datos.responsablesPorRol || anterior.responsablesPorRol,
            costosAdicionales: datos.costosAdicionales || undefined
        },
        usuarioId
    });
};

const listarCampanas = (filtros = {}) => CampanaIATF.find({
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.fechaInicio || filtros.fechaFin ? { fechaHoraInicio: { ...(filtros.fechaInicio ? { $gte: new Date(filtros.fechaInicio) } : {}), ...(filtros.fechaFin ? { $lte: new Date(filtros.fechaFin) } : {}) } } : {})
}).sort({ fechaHoraInicio: -1 }).populate('protocolo', 'nombre version').populate('responsable', 'nombre apellido');

const listarProtocolos = (incluirInactivos = false) => PlantillaProtocoloIATF.find({
    ...(incluirInactivos ? {} : { activo: true }),
    $or: [
        { alcance: { $in: ['SISTEMA', 'ORGANIZACION'] } },
        { alcance: 'FINCA', fincaId: obtenerFincaActual() }
    ]
}).sort({ nombre: 1 });
const listarInsumos = (incluirInactivos = false) => InsumoReproductivo.find(incluirInactivos ? {} : { activo: true }).sort({ categoria: 1, nombre: 1 });
const guardarInsumo = async ({ id, datos, usuarioId }) => id
    ? InsumoReproductivo.findByIdAndUpdate(id, limpiarDatosInsumo(datos), { new: true, runValidators: true })
    : InsumoReproductivo.create({ ...limpiarDatosInsumo(datos), creadoPor: usuarioId });

const consolidarMetricas = async ({ fincasAutorizadas = [] }) => {
    const filtro = fincasAutorizadas.length ? { fincaId: { $in: fincasAutorizadas } } : {};
    const campanas = await CampanaIATF.find(filtro).setOptions({ omitirAislamientoFinca: true }).lean();
    const ejecuciones = await EjecucionPasoIATF.find({ campana: { $in: campanas.map((item) => item._id) } })
        .setOptions({ omitirAislamientoFinca: true }).lean();
    const ejecucionesPorCampana = new Map();
    ejecuciones.forEach((paso) => {
        const clave = idTexto(paso.campana);
        ejecucionesPorCampana.set(clave, [...(ejecucionesPorCampana.get(clave) || []), paso]);
    });
    const porFinca = new Map();
    campanas.forEach((campana) => {
        const metrica = calcularMetricasCampana(campana, [], ejecucionesPorCampana.get(idTexto(campana._id)) || []);
        const clave = idTexto(campana.fincaId);
        const actual = porFinca.get(clave) || { fincaId: clave, campanas: 0, inscritas: 0, inseminadas: 0, prenadas: 0, costosPorMoneda: {} };
        actual.campanas += 1;
        actual.inscritas += metrica.inscritas;
        actual.inseminadas += metrica.inseminadas;
        actual.prenadas += metrica.prenadas;
        Object.entries(metrica.costosPorMoneda || {}).forEach(([moneda, monto]) => {
            actual.costosPorMoneda[moneda] = Number(actual.costosPorMoneda[moneda] || 0) + Number(monto || 0);
        });
        porFinca.set(clave, actual);
    });
    const filas = [...porFinca.values()].map((fila) => {
        const monedas = Object.keys(fila.costosPorMoneda).filter((moneda) => fila.costosPorMoneda[moneda] !== 0);
        const monedaCosto = monedas.length === 1 ? monedas[0] : null;
        const costoTotal = monedaCosto ? fila.costosPorMoneda[monedaCosto] : null;
        return {
            ...fila,
            monedaCosto,
            costoTotal,
            pAI: fila.inseminadas ? Number(((fila.prenadas / fila.inseminadas) * 100).toFixed(2)) : 0,
            costoPorPrenez: fila.prenadas && costoTotal != null ? Number((costoTotal / fila.prenadas).toFixed(2)) : null
        };
    });
    const fincas = await Finca.find({ _id: { $in: filas.map((fila) => fila.fincaId) } }).select('nombre codigo').lean();
    const fincasPorId = new Map(fincas.map((finca) => [idTexto(finca._id), finca]));
    filas.forEach((fila) => { fila.finca = fincasPorId.get(fila.fincaId) || null; });
    const totales = filas.reduce((acc, fila) => {
        acc.inscritas += fila.inscritas;
        acc.inseminadas += fila.inseminadas;
        acc.prenadas += fila.prenadas;
        Object.entries(fila.costosPorMoneda || {}).forEach(([moneda, monto]) => {
            acc.costosPorMoneda[moneda] = Number(acc.costosPorMoneda[moneda] || 0) + Number(monto || 0);
        });
        return acc;
    }, { inscritas: 0, inseminadas: 0, prenadas: 0, costosPorMoneda: {} });
    return {
        porFinca: filas,
        ...totales,
        pAI: totales.inseminadas ? Number(((totales.prenadas / totales.inseminadas) * 100).toFixed(2)) : 0
    };
};

module.exports = {
    ACCIONES_BITACORA,
    advertenciasParticipante,
    calcularCronograma,
    calcularMetricasCampana,
    cambiarEstadoCampana,
    consolidarMetricas,
    crearCampana,
    crearPlantilla,
    ejecutarPaso,
    evaluarEstadoPasoIatf,
    errorIatf,
    guardarInsumo,
    listarCampanas,
    listarInsumos,
    listarProtocolos,
    limpiarDatosInsumo,
    limpiarDatosPlantilla,
    obtenerCampana,
    obtenerActividadPorTarea,
    registrarDiagnosticos,
    registrarIATF,
    reprogramarDependientes,
    resincronizar,
    retirarParticipante,
    validarPlantilla,
    versionarPlantilla
};
