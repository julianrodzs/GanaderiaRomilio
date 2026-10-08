const Animal = require('../models/Animal');
const BandaReproductivaPorcina = require('../models/BandaReproductivaPorcina');
const Camada = require('../models/Camada');
const { PlantillaProtocoloReproductivoPorcino, ACCIONES_PROTOCOLO_PORCINO } = require('../models/PlantillaProtocoloReproductivoPorcino');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const { Tarea } = require('../models/Tarea');
const { upsertEventoAnimal } = require('./eventoAnimal-service');
const { crearAplicacionSanitaria } = require('./aplicacionSanitaria-service');
const { calcularFechasCamada, generarCodigoCamada, registrarEventoCamada } = require('./camada-service');
const { upsertEventoCamada } = require('./eventoCamada-service');
const { tieneFeature } = require('./plan-service');
const { validarUsuarioAsignable } = require('./usuarioAsignable-service');
const { calcularCronograma, calcularCumplimiento, idTexto, normalizarPasos, validarPasos } = require('./protocoloScheduler-service');
const { obtenerFincaActual } = require('../context/organizacion-context');

const errorProtocolo = (mensaje, status = 400, code = 'PROTOCOLO_PORCINO') => Object.assign(new Error(mensaje), { status, code });
const seleccionar = (datos, campos) => Object.fromEntries(campos.filter((campo) => Object.hasOwn(datos || {}, campo)).map((campo) => [campo, datos[campo]]));
const limpiarPlantilla = (datos = {}) => seleccionar(datos, ['nombre', 'descripcion', 'alcance', 'activo', 'pasos']);

const prepararPasos = (pasos = []) => {
    const normalizados = normalizarPasos(pasos);
    validarPasos(normalizados, ACCIONES_PROTOCOLO_PORCINO);
    normalizados.forEach((paso) => {
        if (paso.referenciaTemporal === 'DESDE_EVENTO_REAL' && !paso.eventoReferencia) throw errorProtocolo(`El paso ${paso.nombre} requiere un evento real de referencia.`);
    });
    return normalizados;
};

const validarAlcance = async (alcance, organizacionId) => {
    if (alcance === 'ORGANIZACION' && !await tieneFeature('reportesMultiFinca', organizacionId)) throw errorProtocolo('Las plantillas compartidas entre fincas requieren Premium.', 403, 'PLAN_FEATURE_REQUIRED');
};

const normalizarResultadoDiagnostico = (resultado) => resultado === 'PRENADA' ? 'PREÑADA' : resultado;
const rolPuedeEjecutarPaso = ({ rolUsuario, tipoAccion, asignada }) => {
    if (tipoAccion === 'DIAGNOSTICO_GESTACION') return ['Administrador', 'Veterinario'].includes(rolUsuario);
    if (['Administrador', 'Encargado', 'Veterinario'].includes(rolUsuario)) return true;
    return Boolean(asignada);
};

const listarPlantillas = (incluirInactivas = false) => PlantillaProtocoloReproductivoPorcino.find({
    ...(incluirInactivas ? {} : { activo: true }),
    $or: [{ fincaId: obtenerFincaActual() }, { alcance: 'ORGANIZACION' }]
}).sort({ nombre: 1, version: -1 }).lean();

const crearPlantilla = async ({ datos, usuarioId, organizacionId }) => {
    const limpio = limpiarPlantilla(datos);
    if (!String(limpio.nombre || '').trim()) throw errorProtocolo('El nombre es requerido.');
    await validarAlcance(limpio.alcance, organizacionId);
    limpio.pasos = prepararPasos(limpio.pasos);
    return PlantillaProtocoloReproductivoPorcino.create({ ...limpio, alcance: limpio.alcance || 'FINCA', fincaId: limpio.alcance === 'ORGANIZACION' ? null : obtenerFincaActual(), creadoPor: usuarioId });
};

const versionarPlantilla = async ({ id, datos, usuarioId, organizacionId }) => {
    const anterior = await PlantillaProtocoloReproductivoPorcino.findById(id);
    if (!anterior) throw errorProtocolo('Protocolo no encontrado.', 404);
    const combinado = { ...anterior.toObject(), ...limpiarPlantilla(datos), activo: datos.activo ?? true, version: anterior.version + 1 };
    await validarAlcance(combinado.alcance, organizacionId); combinado.pasos = prepararPasos(combinado.pasos);
    delete combinado._id; delete combinado.createdAt; delete combinado.updatedAt; delete combinado.__v;
    const nueva = await PlantillaProtocoloReproductivoPorcino.create({ ...combinado, creadoPor: usuarioId });
    anterior.activo = false; await anterior.save();
    return nueva;
};

const obtenerRegistroActivo = (animal) => RegistroReproductivo.findOne({ animal, especie: 'Porcino', estadoCiclo: 'Activo' }).sort({ createdAt: -1 });

const crearTareas = async (banda) => {
    for (const ejecucion of banda.ejecuciones) {
        const paso = banda.protocoloSnapshot.pasos.find((item) => idTexto(item._id) === idTexto(ejecucion.pasoId));
        if (!paso?.generaTarea || !ejecucion.fechaProgramada) continue;
        const tarea = await Tarea.findOneAndUpdate(
            { claveAutomatica: `BANDA_PORCINA:${banda._id}:${paso._id}` },
            { $set: { fechaProgramada: ejecucion.fechaProgramada, fechaLimite: ejecucion.ventanaFin }, $setOnInsert: {
                titulo: `${paso.nombre} · ${banda.nombre}`,
                descripcion: `${paso.instrucciones || 'Actividad reproductiva porcina.'} Participantes: ${banda.participantes.length}.`,
                tipo: ['TRATAMIENTO_REPRODUCTIVO'].includes(paso.tipoAccion) ? 'Sanidad' : 'Reproducción',
                asignadoA: banda.responsable, creadoPor: banda.creadoPor,
                moduloOrigen: 'BandaReproductivaPorcina', referenciaId: banda._id,
                creadoAutomaticamente: true, especie: 'Porcino', categoriaAutomatica: 'BANDA_PORCINA',
                claveAutomatica: `BANDA_PORCINA:${banda._id}:${paso._id}`
            } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        ejecucion.tarea = tarea._id;
    }
    await banda.save();
};

const crearBanda = async ({ datos, usuarioId }) => {
    const protocolo = await PlantillaProtocoloReproductivoPorcino.findById(datos.protocolo);
    if (!protocolo?.activo) throw errorProtocolo('Selecciona un protocolo activo.', 409);
    const ids = [...new Set((datos.animales || []).map(String))];
    if (!ids.length) throw errorProtocolo('Selecciona al menos una cerda.');
    const animales = await Animal.find({ _id: { $in: ids }, especie: 'Porcino', sexo: 'Hembra', estado: 'Activo' });
    if (animales.length !== ids.length) throw errorProtocolo('Todas las participantes deben ser hembras porcinas activas.', 409);
    const ocupadas = await BandaReproductivaPorcina.find({ estado: { $in: ['PROGRAMADA', 'ACTIVA'] }, 'participantes.animal': { $in: ids } }).select('participantes.animal').lean();
    const ocupados = new Set(ocupadas.flatMap((item) => item.participantes.map((p) => idTexto(p.animal))));
    if (ocupados.size) throw errorProtocolo('Una o más cerdas ya participan en otra banda activa.', 409);
    const responsable = await validarUsuarioAsignable(datos.responsable, 'BandasPorcinas');
    if (datos.veterinario) await validarUsuarioAsignable(datos.veterinario, 'BandasPorcinas');
    const fechaInicio = new Date(datos.fechaInicio || Date.now());
    const registros = await Promise.all(animales.map((animal) => obtenerRegistroActivo(animal._id)));
    const snapshot = protocolo.toObject();
    const cronograma = calcularCronograma({ pasos: snapshot.pasos, fechaInicio });
    const banda = await BandaReproductivaPorcina.create({
        nombre: datos.nombre, protocolo: protocolo._id, protocoloVersion: protocolo.version, protocoloSnapshot: snapshot,
        fechaInicio, estado: 'ACTIVA', responsable: responsable._id, veterinario: datos.veterinario || null, creadoPor: usuarioId,
        participantes: animales.map((animal, indice) => ({
            animal: animal._id, diio: animal.diio || animal.identificadorFinca, nombre: animal.nombre,
            numeroPartos: animal.numeroPartos, condicionCorporal: animal.condicionCorporal, loteOrigen: animal.loteActual,
            registroReproductivo: registros[indice]?._id, fechaUltimoParto: registros[indice]?.fechaPartoReal, fechaUltimoDestete: registros[indice]?.fechaDestete
        })),
        ejecuciones: cronograma.map((item) => ({ ...item, obligatorio: snapshot.pasos.find((paso) => idTexto(paso._id) === idTexto(item.pasoId))?.obligatorio !== false }))
    });
    await crearTareas(banda);
    await Promise.all(animales.map((animal) => upsertEventoAnimal({ animal: animal._id, tipoEvento: 'Observacion', fecha: fechaInicio, titulo: 'Ingreso a banda reproductiva', descripcion: `${banda.nombre} · ${protocolo.nombre}`, moduloOrigen: 'Reproduccion', referenciaId: banda._id, creadoPor: usuarioId, metadata: { bandaId: banda._id, protocoloId: protocolo._id } })));
    return obtenerBanda(banda._id);
};

const listarBandas = (filtros = {}) => BandaReproductivaPorcina.find({ ...(filtros.estado ? { estado: filtros.estado } : {}) }).populate('responsable', 'nombre apellido rol').populate('veterinario', 'nombre apellido rol').sort({ createdAt: -1 }).lean();

const obtenerActividadPorTarea = async ({ tareaId, usuarioId, rolUsuario }) => {
    const tarea = await Tarea.findOne({ _id: tareaId, categoriaAutomatica: 'BANDA_PORCINA' }).lean();
    if (!tarea) throw errorProtocolo('Actividad de banda no encontrada.', 404);
    if (!['Administrador', 'Encargado'].includes(rolUsuario) && idTexto(tarea.asignadoA) !== idTexto(usuarioId)) throw errorProtocolo('Esta actividad está asignada a otro usuario.', 403);
    const banda = await obtenerBanda(tarea.referenciaId);
    const ejecucion = banda.ejecuciones.find((item) => idTexto(item.tarea) === idTexto(tareaId));
    if (!ejecucion) throw errorProtocolo('La tarea no está vinculada a una ejecución vigente.', 409);
    return { tarea, banda, ejecucion };
};

const calcularMetricas = async (banda) => {
    const activos = banda.participantes.filter((item) => item.estadoParticipacion !== 'RETIRADA');
    const servidas = activos.filter((item) => ['SERVIDA', 'PRENADA', 'PARIDA', 'DESTETADA'].includes(item.estadoParticipacion));
    const prenadas = activos.filter((item) => item.resultadoActual === 'PRENADA');
    const idsRegistro = activos.map((item) => item.registroReproductivo).filter(Boolean);
    const camadas = idsRegistro.length ? await Camada.find({ registroReproductivo: { $in: idsRegistro } }).lean() : [];
    const porcentaje = (numerador, denominador) => denominador ? Number(((numerador / denominador) * 100).toFixed(1)) : null;
    return {
        participantes: activos.length,
        servidas: servidas.length,
        prenadas: prenadas.length,
        tasaPrenez: { valor: porcentaje(prenadas.length, servidas.length), numerador: prenadas.length, denominador: servidas.length },
        camadas: camadas.length,
        nacidosVivos: camadas.reduce((total, item) => total + Number(item.nacidosVivos || 0), 0),
        destetados: camadas.reduce((total, item) => total + Number(item.destetados || 0), 0),
        cumplimiento: calcularCumplimiento(banda.ejecuciones)
    };
};

const obtenerBanda = async (id) => {
    const banda = await BandaReproductivaPorcina.findById(id).populate('participantes.animal', 'diio identificadorFinca nombre categoria estado estadoSanitario').populate('responsable', 'nombre apellido rol').populate('veterinario', 'nombre apellido rol').lean();
    if (!banda) throw errorProtocolo('Banda no encontrada.', 404);
    return { ...banda, metricas: await calcularMetricas(banda) };
};

const registrarAccionParticipante = async ({ banda, participante, paso, datos, usuarioId }) => {
    const fecha = new Date(datos.fechaReal || Date.now());
    let registro = participante.registroReproductivo ? await RegistroReproductivo.findById(participante.registroReproductivo) : await obtenerRegistroActivo(participante.animal);
    if (['SERVICIO', 'INSEMINACION'].includes(paso.tipoAccion)) {
        if (!registro) registro = new RegistroReproductivo({ animal: participante.animal, especie: 'Porcino', asignadoA: banda.responsable, bandaReproductivaPorcina: banda._id });
        registro.tipoRegistro = paso.tipoAccion === 'SERVICIO' ? 'Monta' : 'Inseminación'; registro.tipoInseminacion = paso.tipoAccion === 'INSEMINACION' ? 'IA_CONVENCIONAL' : undefined;
        registro.origenGestacion = paso.tipoAccion === 'SERVICIO' ? 'MONTA_NATURAL' : 'IA_CONVENCIONAL';
        if (paso.tipoAccion === 'SERVICIO') { registro.fechaMonta = fecha; registro.fechaInseminacion = undefined; }
        else { registro.fechaInseminacion = fecha; registro.fechaMonta = undefined; }
        registro.observaciones = datos.observaciones;
        await registro.save(); participante.registroReproductivo = registro._id; participante.estadoParticipacion = 'SERVIDA'; participante.fechasReales.set ? participante.fechasReales.set(paso.tipoAccion === 'SERVICIO' ? 'SERVICIO' : 'IA', fecha) : (participante.fechasReales[paso.tipoAccion === 'SERVICIO' ? 'SERVICIO' : 'IA'] = fecha);
    }
    if (paso.tipoAccion === 'DESTETE') {
        if (registro) { registro.fechaDestete = fecha; await registro.save(); }
        participante.fechaUltimoDestete = fecha; participante.estadoParticipacion = 'DESTETADA'; participante.fechasReales.set ? participante.fechasReales.set('DESTETE', fecha) : (participante.fechasReales.DESTETE = fecha);
    }
    if (paso.tipoAccion === 'DIAGNOSTICO_GESTACION') {
        if (!registro) throw errorProtocolo(`La cerda ${participante.diio || participante.nombre} no tiene ciclo reproductivo activo.`, 409);
        const resultado = normalizarResultadoDiagnostico(datos.resultado || 'DUDOSA'); registro.resultadoDiagnosticoGestacion = resultado; registro.fechaUltimoDiagnosticoGestacion = fecha; registro.gestacionConfirmada = resultado === 'PREÑADA';
        registro.historialDiagnosticos.push({ fecha, resultado, observaciones: datos.observaciones, registradoPor: usuarioId }); await registro.save();
        participante.resultadoActual = resultado === 'PREÑADA' ? 'PRENADA' : resultado;
        participante.estadoParticipacion = resultado === 'PREÑADA' ? 'PRENADA' : 'SERVIDA';
    }
    if (paso.tipoAccion === 'CONTROL_REPETICION') {
        participante.fechasReales.set ? participante.fechasReales.set('CONTROL_REPETICION', fecha) : (participante.fechasReales.CONTROL_REPETICION = fecha);
        if (datos.retornoCelo === true) participante.observaciones = [participante.observaciones, 'Retorno a celo observado.'].filter(Boolean).join(' ');
    }
    if (paso.tipoAccion === 'PARTO') {
        if (!registro) throw errorProtocolo('Se requiere un ciclo reproductivo antes de registrar el parto.', 409);
        if (!datos.camada) throw errorProtocolo('Registra los resultados reales de la camada.', 400);
        registro.fechaPartoReal = fecha; await registro.save(); participante.estadoParticipacion = 'PARIDA'; participante.fechasReales.set ? participante.fechasReales.set('PARTO_REAL', fecha) : (participante.fechasReales.PARTO_REAL = fecha);
        let camada = await Camada.findOne({ registroReproductivo: registro._id });
        if (camada) throw errorProtocolo('Esta cerda ya tiene una camada para el ciclo reproductivo actual.', 409);
        const datosCamada = seleccionar(datos.camada, ['nacidosTotales', 'nacidosVivos', 'nacidosMuertos', 'momias', 'destino', 'pesoPromedioNacimiento', 'observaciones']);
        const suma = Number(datosCamada.nacidosVivos || 0) + Number(datosCamada.nacidosMuertos || 0) + Number(datosCamada.momias || 0);
        if (datosCamada.nacidosTotales != null && Number(datosCamada.nacidosTotales) !== suma) throw errorProtocolo('Nacidos totales debe coincidir con vivos, muertos y momias.');
        const fechas = calcularFechasCamada({ fechaNacimiento: fecha, destino: datosCamada.destino });
        camada = await Camada.create({ ...datosCamada, nacidosTotales: suma, madre: participante.animal, registroReproductivo: registro._id, asignadoA: banda.responsable, codigoCamada: datos.camada.codigoCamada || await generarCodigoCamada(fecha), fechaNacimiento: fecha, fechaDesteteEstimada: fechas.fechaDesteteEstimada });
        await registrarEventoCamada({ camada, madre: participante.animal, usuarioId, titulo: 'Parto registrado desde banda reproductiva' });
    }
    if (paso.tipoAccion === 'DESTETE_CAMADA') {
        if (!registro) throw errorProtocolo('No existe ciclo reproductivo para localizar la camada.', 409);
        const camada = await Camada.findOne({ registroReproductivo: registro._id });
        if (!camada) throw errorProtocolo('No existe una camada asociada a esta cerda.', 409);
        camada.fechaDesteteReal = fecha; camada.destetados = Number(datos.destetados ?? camada.destetados); camada.pesoPromedioDestete = datos.pesoPromedioDestete ?? camada.pesoPromedioDestete; camada.estado = 'Destetada'; await camada.save();
        await upsertEventoCamada({ camada: camada._id, tipoEvento: 'Destete', fecha, titulo: 'Destete registrado desde banda reproductiva', descripcion: `${camada.destetados || 0} cría(s) destetadas.`, moduloOrigen: 'Reproduccion', referenciaId: banda._id, creadoPor: usuarioId, metadata: { bandaId: banda._id, destetados: camada.destetados, pesoPromedioDestete: camada.pesoPromedioDestete } });
        registro.fechaDestete = fecha; await registro.save(); participante.estadoParticipacion = 'DESTETADA'; participante.fechasReales.set ? participante.fechasReales.set('DESTETE_REAL', fecha) : (participante.fechasReales.DESTETE_REAL = fecha);
    }
    if (['DESTETE', 'SERVICIO', 'INSEMINACION', 'DIAGNOSTICO_GESTACION', 'PARTO', 'DESTETE_CAMADA'].includes(paso.tipoAccion)) {
        const tipoEvento = paso.tipoAccion === 'PARTO' ? 'Parto'
            : ['DESTETE', 'DESTETE_CAMADA'].includes(paso.tipoAccion) ? 'Destete'
                : paso.tipoAccion === 'DIAGNOSTICO_GESTACION' ? 'Diagnostico de gestacion' : 'Monta';
        await upsertEventoAnimal({ animal: participante.animal, tipoEvento, fecha, titulo: paso.nombre, descripcion: datos.observaciones || `Actividad de la banda ${banda.nombre}.`, moduloOrigen: 'Reproduccion', referenciaId: banda._id, creadoPor: usuarioId, metadata: { bandaId: banda._id, pasoId: paso._id, tipoAccion: paso.tipoAccion, resultado: datos.resultado } });
    }
};

const ejecutarPaso = async ({ bandaId, pasoId, datos = {}, usuarioId, rolUsuario }) => {
    const banda = await BandaReproductivaPorcina.findById(bandaId);
    if (!banda || banda.estado !== 'ACTIVA') throw errorProtocolo('La banda no está activa.', 409);
    const ejecucion = banda.ejecuciones.id(pasoId) || banda.ejecuciones.find((item) => idTexto(item.pasoId) === idTexto(pasoId));
    if (!ejecucion) throw errorProtocolo('Paso no encontrado.', 404);
    if (ejecucion.estado === 'REALIZADO') throw errorProtocolo('Esta actividad ya fue registrada.', 409, 'PASO_YA_REALIZADO');
    const paso = banda.protocoloSnapshot.pasos.find((item) => idTexto(item._id) === idTexto(ejecucion.pasoId));
    const asignada = ejecucion.tarea && await Tarea.exists({ _id: ejecucion.tarea, asignadoA: usuarioId });
    if (!rolPuedeEjecutarPaso({ rolUsuario, tipoAccion: paso.tipoAccion, asignada })) {
        throw errorProtocolo(paso.tipoAccion === 'DIAGNOSTICO_GESTACION'
            ? 'El diagnóstico debe registrarlo un administrador o veterinario.'
            : 'Solo puedes ejecutar actividades asignadas a tu usuario.', 403, 'ACTIVIDAD_NO_AUTORIZADA');
    }
    const seleccionados = datos.participantes?.length ? new Set(datos.participantes.map(String)) : null;
    const yaProcesados = new Set((ejecucion.participantes || []).map(idTexto));
    const participantes = banda.participantes.filter((item) => item.estadoParticipacion !== 'RETIRADA' && !yaProcesados.has(idTexto(item._id)) && (!seleccionados || seleccionados.has(idTexto(item._id)) || seleccionados.has(idTexto(item.animal))));
    if (!participantes.length) throw errorProtocolo('Selecciona al menos una participante activa.');
    if (['PARTO', 'DESTETE_CAMADA'].includes(paso.tipoAccion) && participantes.length !== 1) throw errorProtocolo('El parto y el destete de camada se registran una cerda a la vez para conservar resultados individuales.', 409);
    if (paso.tipoAccion === 'TRATAMIENTO_REPRODUCTIVO') {
        if (!datos.aplicacion?.producto) throw errorProtocolo('Indica el producto realmente aplicado.');
        await crearAplicacionSanitaria({ ...datos.aplicacion, animales: participantes.map((item) => item.animal), fechaAplicacion: datos.fechaReal || new Date(), especie: 'Porcino', naturaleza: 'Aplicacion unica', responsableUsuario: usuarioId, motivo: datos.aplicacion.motivo || datos.observaciones }, usuarioId, { soloActivos: true });
    }
    for (const participante of participantes) await registrarAccionParticipante({ banda, participante, paso, datos, usuarioId });
    ejecucion.fechaReal = datos.fechaReal || new Date(); ejecucion.participantes = [...(ejecucion.participantes || []), ...participantes.map((item) => item._id)]; ejecucion.estado = ejecucion.participantes.length < banda.participantes.filter((item) => item.estadoParticipacion !== 'RETIRADA').length ? 'PARCIAL' : 'REALIZADO'; ejecucion.resultado = seleccionar(datos, ['resultado', 'retornoCelo', 'observaciones']); ejecucion.realizadoPor = usuarioId;
    if (ejecucion.tarea && ejecucion.estado === 'REALIZADO') await Tarea.updateOne({ _id: ejecucion.tarea }, { $set: { estado: 'Completada', fechaCompletada: ejecucion.fechaReal, observaciones: datos.observaciones } });
    const eventoPorAccion = { DESTETE: 'DESTETE', SERVICIO: 'SERVICIO', INSEMINACION: 'IA', PARTO: 'PARTO_REAL', DESTETE_CAMADA: 'DESTETE_REAL' };
    const eventos = {};
    banda.ejecuciones.filter((item) => item.fechaReal).forEach((item) => {
        const clave = eventoPorAccion[item.tipoAccion];
        if (clave) eventos[clave] = item.fechaReal;
    });
    const cronograma = calcularCronograma({ pasos: banda.protocoloSnapshot.pasos, fechaInicio: banda.fechaInicio, ejecuciones: banda.ejecuciones, eventos });
    cronograma.forEach((programado) => {
        const pendiente = banda.ejecuciones.find((item) => idTexto(item.pasoId) === idTexto(programado.pasoId));
        if (pendiente?.estado === 'PENDIENTE') { pendiente.fechaProgramada = programado.fechaProgramada; pendiente.ventanaInicio = programado.ventanaInicio; pendiente.ventanaFin = programado.ventanaFin; }
    });
    await banda.save();
    await crearTareas(banda);
    return obtenerBanda(banda._id);
};

const reprogramar = async ({ bandaId, eventos = {}, usuarioId }) => {
    const banda = await BandaReproductivaPorcina.findById(bandaId);
    if (!banda || banda.estado !== 'ACTIVA') throw errorProtocolo('La banda no está activa.', 409);
    const cronograma = calcularCronograma({ pasos: banda.protocoloSnapshot.pasos, fechaInicio: banda.fechaInicio, ejecuciones: banda.ejecuciones, eventos });
    cronograma.forEach((programado) => {
        const ejecucion = banda.ejecuciones.find((item) => idTexto(item.pasoId) === idTexto(programado.pasoId));
        if (ejecucion && ejecucion.estado === 'PENDIENTE') { ejecucion.fechaProgramada = programado.fechaProgramada; ejecucion.ventanaInicio = programado.ventanaInicio; ejecucion.ventanaFin = programado.ventanaFin; }
    });
    await banda.save();
    await crearTareas(banda);
    return obtenerBanda(banda._id);
};

const retirarParticipante = async ({ bandaId, participanteId, motivo, usuarioId }) => {
    const banda = await BandaReproductivaPorcina.findById(bandaId); if (!banda) throw errorProtocolo('Banda no encontrada.', 404);
    const participante = banda.participantes.id(participanteId); if (!participante) throw errorProtocolo('Participante no encontrada.', 404);
    participante.estadoParticipacion = 'RETIRADA'; participante.observaciones = [participante.observaciones, motivo].filter(Boolean).join(' · '); await banda.save();
    await upsertEventoAnimal({ animal: participante.animal, tipoEvento: 'Observacion', fecha: new Date(), titulo: 'Retiro de banda reproductiva', descripcion: motivo || banda.nombre, moduloOrigen: 'Reproduccion', referenciaId: banda._id, creadoPor: usuarioId, metadata: { bandaId: banda._id } });
    return obtenerBanda(banda._id);
};

const cerrarBanda = async ({ bandaId, estado, motivo, usuarioId }) => {
    const banda = await BandaReproductivaPorcina.findById(bandaId); if (!banda) throw errorProtocolo('Banda no encontrada.', 404);
    if (!['FINALIZADA', 'CANCELADA'].includes(estado)) throw errorProtocolo('Estado final inválido.');
    if (['FINALIZADA', 'CANCELADA'].includes(banda.estado)) return obtenerBanda(banda._id);
    banda.estado = estado; banda.fechaFin = new Date(); banda.motivoCierre = motivo; banda.ejecuciones.filter((item) => item.estado === 'PENDIENTE').forEach((item) => { item.estado = 'CANCELADO'; }); await banda.save();
    await Tarea.updateMany({ moduloOrigen: 'BandaReproductivaPorcina', referenciaId: banda._id, estado: { $in: ['Pendiente', 'En proceso'] } }, { $set: { estado: 'Cancelada', observaciones: motivo } });
    await Promise.all(banda.participantes.filter((item) => item.estadoParticipacion !== 'RETIRADA').map((item) => upsertEventoAnimal({ animal: item.animal, tipoEvento: 'Observacion', fecha: banda.fechaFin, titulo: estado === 'FINALIZADA' ? 'Banda reproductiva finalizada' : 'Banda reproductiva cancelada', descripcion: motivo || banda.nombre, moduloOrigen: 'Reproduccion', referenciaId: banda._id, creadoPor: usuarioId, metadata: { bandaId: banda._id, estado } })));
    return obtenerBanda(banda._id);
};

const consolidar = async ({ fincasAutorizadas = [] }) => {
    const bandas = await BandaReproductivaPorcina.find(fincasAutorizadas.length ? { fincaId: { $in: fincasAutorizadas } } : {}).setOptions({ omitirAislamientoFinca: true }).lean();
    const porFinca = new Map();
    for (const banda of bandas) {
        const activos = banda.participantes.filter((p) => p.estadoParticipacion !== 'RETIRADA');
        const registrosIds = activos.map((item) => item.registroReproductivo).filter(Boolean);
        const [registros, camadas] = await Promise.all([
            registrosIds.length ? RegistroReproductivo.find({ _id: { $in: registrosIds } }).setOptions({ omitirAislamientoFinca: true }).lean() : [],
            registrosIds.length ? Camada.find({ registroReproductivo: { $in: registrosIds } }).setOptions({ omitirAislamientoFinca: true }).lean() : []
        ]);
        const clave = idTexto(banda.fincaId); const item = porFinca.get(clave) || { fincaId: banda.fincaId, bandas: 0, servidas: 0, prenadas: 0, partos: 0, nacidosVivos: 0, destetados: 0, sumaIntervaloDesteteServicio: 0, intervalos: 0, pasos: [] };
        item.bandas += 1; item.servidas += activos.filter((p) => ['SERVIDA', 'PRENADA', 'PARIDA', 'DESTETADA'].includes(p.estadoParticipacion)).length; item.prenadas += activos.filter((p) => p.resultadoActual === 'PRENADA').length;
        item.partos += camadas.length; item.nacidosVivos += camadas.reduce((total, camada) => total + Number(camada.nacidosVivos || 0), 0); item.destetados += camadas.reduce((total, camada) => total + Number(camada.destetados || 0), 0);
        activos.forEach((participante) => {
            const registro = registros.find((actual) => idTexto(actual._id) === idTexto(participante.registroReproductivo));
            if (participante.fechaUltimoDestete && (registro?.fechaInseminacion || registro?.fechaMonta)) {
                const dias = (new Date(registro.fechaInseminacion || registro.fechaMonta) - new Date(participante.fechaUltimoDestete)) / 86400000;
                if (dias >= 0) { item.sumaIntervaloDesteteServicio += dias; item.intervalos += 1; }
            }
        });
        item.pasos.push(...banda.ejecuciones); porFinca.set(clave, item);
    }
    return [...porFinca.values()].map((item) => ({ fincaId: item.fincaId, bandas: item.bandas, servidas: item.servidas, prenadas: item.prenadas, tasaPrenez: item.servidas ? Number(((item.prenadas / item.servidas) * 100).toFixed(1)) : null, partos: item.partos, nacidosVivos: item.nacidosVivos, destetados: item.destetados, intervaloDesteteServicioDias: item.intervalos ? Number((item.sumaIntervaloDesteteServicio / item.intervalos).toFixed(1)) : null, coberturaIntervalo: { conDato: item.intervalos, total: item.servidas }, cumplimiento: calcularCumplimiento(item.pasos) }));
};

module.exports = { cerrarBanda, consolidar, crearBanda, crearPlantilla, ejecutarPaso, listarBandas, listarPlantillas, normalizarResultadoDiagnostico, obtenerActividadPorTarea, obtenerBanda, prepararPasos, reprogramar, retirarParticipante, rolPuedeEjecutarPaso, versionarPlantilla };
