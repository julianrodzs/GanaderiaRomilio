const mongoose = require('mongoose');
const Colecta = require('../models/ProgramaTransferencia');
const { CampanaTE: Campana, LoteEmbrion: Lote } = require('../models/ProgramaTE');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const Animal = require('../models/Animal');
const { Tarea } = require('../models/Tarea');
const banco = require('./bancoEmbriones-service');
const { seleccionar, validarServicio, registrarEventosMetodo } = require('./servicioReproductivo-service');
const { validarUsuarioAsignable } = require('./usuarioAsignable-service');
const { ejecutarEnTransaccion: tx } = require('./mongo-transaccion-service');
const { calcularCronograma, validarPlantilla, consumirInsumos } = require('./iatf-service');
const { cantidad, fechaValida, monedaValida } = require('./bancoSemen-service');
const { obtenerFincaActual } = require('../context/organizacion-context');
const { error, id, dinero, motivo } = banco;
const textoId = (v) => String(v?._id || v);
const sumar = (costos = []) => costos.reduce((r, c) => { r[monedaValida(c.moneda)] += dinero(c.monto); return r; }, { CRC: 0, USD: 0 });
const costosValidos = (costos = []) => {
    if (!Array.isArray(costos) || costos.length > 100) throw error('Costos invalidos.');
    return costos.map((c) => { seleccionar(c, ['concepto', 'monto', 'moneda']); return { concepto: motivo(c.concepto), monto: dinero(c.monto), moneda: monedaValida(c.moneda) }; });
};
const prepararProtocolo = (pasos = [], nombre = 'Protocolo TE') => {
    if (!Array.isArray(pasos) || pasos.length > 60) throw error('Protocolo invalido.');
    const acciones = ['INSERTAR_DISPOSITIVO', 'RETIRAR_DISPOSITIVO', 'APLICAR_PRODUCTO', 'OBSERVAR_CELO', 'CONTROL', 'OTRA', 'EVALUACION_CL', 'TRANSFERENCIA_EMBRIONES'];
    const protocolo = { nombre, version: 1, pasos: pasos.map((p) => {
        seleccionar(p, ['nombre', 'tipoAccion', 'offsetHoras', 'productos', 'rolResponsable', 'obligatorio', 'instrucciones']);
        if (!acciones.includes(p.tipoAccion)) throw error('Accion de protocolo TE no valida.');
        for (const uso of p.productos || []) seleccionar(uso, ['producto', 'cantidadPorAnimal', 'dosis', 'unidad']);
        return { ...p, _id: new mongoose.Types.ObjectId(), referenciaTemporal: 'DESDE_INICIO', generaTarea: true, rolResponsable: p.rolResponsable || 'Veterinario', obligatorio: p.obligatorio !== false };
    }) };
    if (pasos.length) validarPlantilla(protocolo);
    return protocolo;
};
const crearTareas = async ({ referencia, protocolo, inicio, responsable, animales = [], categoria, usuarioId, session }) => {
    const pasos = [];
    for (const cron of calcularCronograma(protocolo.pasos, inicio)) {
        const [tarea] = await Tarea.create([{ titulo: `${cron.paso.nombre} · ${referencia.nombre}`, tipo: 'Reproducción', estado: 'Pendiente', asignadoA: responsable,
            fechaProgramada: cron.fechaHoraProgramada, fechaLimite: cron.fechaHoraProgramada, creadoPor: usuarioId, animal: animales.length === 1 ? animales[0] : undefined,
            especie: 'Bovino', moduloOrigen: 'Reproduccion', referenciaId: referencia._id, creadoAutomaticamente: true, categoriaAutomatica: categoria, claveAutomatica: `${categoria}:${referencia._id}:${cron.pasoId}`
        }], { session, ordered: true });
        pasos.push({ pasoId: cron.pasoId, nombre: cron.paso.nombre, tipoAccion: cron.paso.tipoAccion, fechaProgramada: cron.fechaHoraProgramada, tareaId: tarea._id, estado: 'PENDIENTE' });
    }
    return pasos;
};
const validarProductosEjecutados = (productos = [], paso) => {
    if (!Array.isArray(productos) || productos.length > 100) throw error('Productos invalidos.');
    for (const p of productos) {
        seleccionar(p, ['producto', 'cantidad', 'unidad', 'dosis', 'lote']); id(p.producto);
        if (!Number.isFinite(Number(p.cantidad)) || Number(p.cantidad) <= 0) throw error('La cantidad aplicada debe ser positiva y finita.');
    }
    if ((paso.productos || []).some((p) => !productos.some((u) => String(u.producto) === String(p.producto)))) throw error('Registre los insumos previstos antes de completar el paso.');
    return productos;
};
const finalizarColectaEnSesion = async (c, datos, usuarioId, session) => {
    if (c.estadoProduccion === 'FINALIZADA') return c;
    const total = Number(datos.estructurasRecuperadas), viables = Number(datos.embrionesViables), degenerados = Number(datos.embrionesDegenerados || 0);
    if (![total, viables, degenerados].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1000000) || viables + degenerados > total) throw error('Las estructuras, viables y degenerados no concilian.');
    const protocolo = c.protocoloDonante;
    if (protocolo?.pasos?.some((p) => p.obligatorio && !c.ejecucionesDonante.some((e) => e.pasoId === String(p._id)))) throw error('Complete los pasos obligatorios del protocolo de donante antes de finalizar.', 409);
    if (!Array.isArray(datos.lotes) || datos.lotes.reduce((n, l) => n + Number(l.cantidad), 0) !== viables) throw error('Los lotes deben sumar los embriones viables.');
    if (c.fichaSemenId && !c.semenConsumido) {
        const uso = await require('./semen-reproductivo-service').consumirSemen({ semenId: c.fichaSemenId, cantidad: c.semenPlanificado.cantidad, moneda: c.semenPlanificado.moneda, especie: 'Bovino', fechaInseminacion: c.fechaColecta, usuarioId, eventoId: c._id, session });
        c.costos.push({ concepto: 'Semen de produccion', monto: uso.snapshot.costoUnitario * uso.cantidad, moneda: uso.snapshot.moneda });
        c.padreId = uso.snapshot.toroId;
        c.padreExterno = uso.snapshot.esExterno ? { nombre: uso.snapshot.toro, diio: uso.snapshot.codigoToro, raza: uso.snapshot.raza } : undefined;
        c.semenConsumido = true;
    }
    const costos = sumar(c.costos);
    c.costoTotal = costos[c.moneda];
    for (const [i, l] of datos.lotes.entries()) {
        seleccionar(l, ['codigoLote', 'cantidad', 'cantidadReproductiva', 'cantidadComercial', 'estadoConservacion', 'calidadGrado', 'estadio', 'canastillaTermo', 'moneda']);
        const moneda = monedaValida(l.moneda || c.moneda);
        const lote = await banco.crearLote({ ...l, moneda, costoUnitario: costos[moneda] / viables, origenLote: 'PRODUCCION_PROPIA', origenEmbrion: c.tipoProduccion,
            donanteId: c.donanteId?.toString(), donanteExterna: c.donanteId ? undefined : c.donanteExterna?.toObject(), padreId: c.padreId?.toString(), padreExterno: c.padreId ? undefined : c.padreExterno?.toObject()
        }, usuarioId, session, { colectaId: c._id, costosUnitarios: { CRC: costos.CRC / viables, USD: costos.USD / viables }, claveEntrada: `colecta:${c._id}:${i}` });
        c.lotesBanco.push(lote._id);
    }
    c.estructurasRecuperadas = total; c.embrionesViables = viables; c.embrionesDegenerados = degenerados; c.estadoProduccion = 'FINALIZADA';
    await c.save({ session }); return c;
};
const crearColecta = async (d, usuarioId) => {
    seleccionar(d, ['nombre', 'tipoProduccion', 'donanteId', 'donanteExterna', 'padreId', 'padreExterno', 'fichaSemenId', 'cantidadPajuelas', 'monedaSemen', 'fechaColecta', 'tecnico', 'laboratorio', 'costos', 'protocolo', 'responsable', 'estructurasRecuperadas', 'embrionesViables', 'embrionesDegenerados', 'lotes', 'claveIdempotencia']);
    const key = banco.clave(d, 'colecta');
    return tx(async (session) => {
        const anterior = await Colecta.findOne({ claveIdempotencia: key }).session(session); if (anterior) return anterior;
        await banco.validarGenetica(d, session);
        if (!['IN_VIVO', 'FIV'].includes(d.tipoProduccion)) throw error('Tipo de produccion invalido.');
        const fecha = fechaValida(d.fechaColecta), costos = costosValidos(d.costos), protocolo = prepararProtocolo(d.protocolo || [], `Donante · ${d.nombre}`);
        let padreId = d.padreId, padreExterno = d.padreExterno;
        if (d.fichaSemenId) {
            const ficha = await require('../models/BancoSemen').BancoSemen.findOne({ _id: id(d.fichaSemenId), especie: 'Bovino' }).session(session);
            if (!ficha) throw error('Seleccione semen bovino del banco de esta finca.');
            cantidad(d.cantidadPajuelas ?? 1); if (d.monedaSemen) monedaValida(d.monedaSemen);
            padreId = ficha.toroId; padreExterno = ficha.esExterno ? { nombre: ficha.nombreSemental, diio: ficha.diio, raza: ficha.raza } : undefined;
        }
        if (protocolo.pasos.length && !d.donanteId) throw error('El protocolo de superovulacion requiere una donante registrada.');
        if (protocolo.pasos.length) await validarUsuarioAsignable(d.responsable, 'Reproduccion', { session });
        const totales = sumar(costos), moneda = costos[0]?.moneda || 'CRC';
        const [c] = await Colecta.create([{ nombre: motivo(d.nombre), versionProgramaTE: 2, tipoProduccion: d.tipoProduccion, origenEmbrion: d.tipoProduccion,
            donanteId: d.donanteId, donanteExterna: d.donanteExterna, padreId, padreExterno, fichaSemenId: d.fichaSemenId, fechaColecta: fecha, tecnico: d.tecnico, laboratorio: d.laboratorio,
            semenPlanificado: d.fichaSemenId ? { cantidad: Number(d.cantidadPajuelas ?? 1), moneda: d.monedaSemen } : undefined,
            costos, costoTotal: totales[moneda], moneda, estadoProduccion: 'PLANIFICADA', protocoloDonante: protocolo, claveIdempotencia: key, creadoPor: usuarioId
        }], { session, ordered: true });
        if (protocolo.pasos.length) {
            const tareas = await crearTareas({ referencia: c, protocolo, inicio: fecha, responsable: d.responsable, animales: [d.donanteId], categoria: 'TE_DONANTE', usuarioId, session });
            c.tareasDonante = tareas.map((p) => p.tareaId); await c.save({ session });
        }
        if (d.embrionesViables !== undefined) await finalizarColectaEnSesion(c, d, usuarioId, session);
        return c;
    });
};
const finalizarColecta = (colectaId, d, usuarioId) => {
    seleccionar(d, ['estructurasRecuperadas', 'embrionesViables', 'embrionesDegenerados', 'lotes']);
    return tx(async (session) => { const c = await Colecta.findOne({ _id: id(colectaId), versionProgramaTE: 2 }).session(session); if (!c) throw error('Colecta no encontrada.', 404); return finalizarColectaEnSesion(c, d, usuarioId, session); });
};
const ejecutarDonante = (colectaId, pasoId, d, usuarioId) => {
    seleccionar(d, ['fecha', 'productos']);
    return tx(async (session) => {
        const c = await Colecta.findOne({ _id: id(colectaId), versionProgramaTE: 2 }).session(session);
        if (!c || c.estadoProduccion !== 'PLANIFICADA') throw error('La colecta no admite ejecuciones.', 409);
        if (c.ejecucionesDonante.some((e) => e.pasoId === pasoId)) return c;
        const paso = c.protocoloDonante?.pasos.find((p) => String(p._id) === pasoId); if (!paso) throw error('Paso no encontrado.', 404);
        const productos = await consumirInsumos({ productos: validarProductosEjecutados(d.productos, paso), tipoAccion: paso.tipoAccion, session });
        c.ejecucionesDonante.push({ pasoId, fecha: fechaValida(d.fecha), productos, usuarioId });
        for (const p of productos) c.costos.push({ concepto: p.nombre, monto: p.costoTotalSnapshot, moneda: p.moneda });
        await Tarea.updateMany({ referenciaId: c._id, claveAutomatica: `TE_DONANTE:${c._id}:${pasoId}` }, { $set: { estado: 'Completada', fechaCompletada: fechaValida(d.fecha) } }, { session });
        await require('./eventoAnimal-service').upsertEventoAnimal({ animal: c.donanteId, tipoEvento: 'Observacion', fecha: fechaValida(d.fecha), titulo: paso.nombre, descripcion: 'Ejecucion de protocolo de donante TE; no representa un parto.', moduloOrigen: 'Reproduccion', referenciaId: c._id, claveIdempotencia: `TE:donante:${c._id}:${pasoId}`, creadoPor: usuarioId, metadata: { colectaId: c._id, productos } }, { session });
        await c.save({ session }); return c;
    });
};
const crearCampana = (d, usuarioId) => {
    seleccionar(d, ['nombre', 'fechaInicio', 'responsable', 'animales', 'protocolo', 'costos', 'claveIdempotencia']);
    const key = banco.clave(d, 'campana');
    return tx(async (session) => {
        const anterior = await Campana.findOne({ claveIdempotencia: key }).session(session); if (anterior) return anterior;
        await validarUsuarioAsignable(d.responsable, 'Reproduccion', { session });
        if (!Array.isArray(d.animales) || !d.animales.length || d.animales.length > 500 || new Set(d.animales).size !== d.animales.length) throw error('Seleccione receptoras sin duplicados.');
        const animales = await Animal.find({ _id: { $in: d.animales.map(id) }, sexo: 'Hembra', especie: 'Bovino', estado: 'Activo' }).session(session);
        if (animales.length !== d.animales.length) throw error('Las receptoras deben ser bovinas activas de esta finca.');
        const protocolo = prepararProtocolo(d.protocolo || [], d.nombre); if (!protocolo.pasos.length) throw error('La campana requiere un protocolo.');
        const [c] = await Campana.create([{ nombre: motivo(d.nombre), fechaInicio: fechaValida(d.fechaInicio), responsable: d.responsable, protocoloSnapshot: protocolo, receptoras: animales.map((a) => ({ animal: a._id })), costos: costosValidos(d.costos), claveIdempotencia: key, creadoPor: usuarioId }], { session, ordered: true });
        c.pasos = await crearTareas({ referencia: c, protocolo, inicio: c.fechaInicio, responsable: c.responsable, animales: d.animales, categoria: 'TETF', usuarioId, session });
        await c.save({ session }); return c;
    });
};
const campanaActiva = async (campanaId, session) => {
    const c = await Campana.findOneAndUpdate({ _id: id(campanaId), estado: 'ACTIVA' }, { $inc: { revision: 1 } }, { new: true, session });
    if (!c) throw error('Campana no encontrada o cerrada.', 409); return c;
};
const ejecutarPaso = (campanaId, pasoId, d, usuarioId) => {
    seleccionar(d, ['fecha', 'productos']);
    return tx(async (session) => {
        const c = await campanaActiva(campanaId, session), paso = c.pasos.find((p) => p.pasoId === pasoId);
        if (!paso) throw error('Paso no encontrado.', 404);
        if (paso.estado === 'REALIZADO') return c;
        if (['EVALUACION_CL', 'TRANSFERENCIA_EMBRIONES'].includes(paso.tipoAccion)) throw error('Use la evaluacion o transferencia individual de receptoras.');
        const configurado = c.protocoloSnapshot.pasos.find((p) => String(p._id) === pasoId);
        const productos = await consumirInsumos({ productos: validarProductosEjecutados(d.productos, configurado || paso), tipoAccion: paso.tipoAccion, session });
        paso.estado = 'REALIZADO'; paso.fechaReal = fechaValida(d.fecha); paso.productos = productos;
        for (const p of productos) c.costos.push({ concepto: p.nombre, monto: p.costoTotalSnapshot, moneda: p.moneda });
        await Tarea.updateOne({ _id: paso.tareaId }, { $set: { estado: 'Completada', fechaCompletada: paso.fechaReal } }, { session });
        for (const receptora of c.receptoras) await require('./eventoAnimal-service').upsertEventoAnimal({ animal: receptora.animal, tipoEvento: 'Observacion', fecha: paso.fechaReal, titulo: paso.nombre, descripcion: `Sincronizacion de receptora · ${c.nombre}`, moduloOrigen: 'Reproduccion', referenciaId: c._id, claveIdempotencia: `TETF:${c._id}:${pasoId}:${receptora.animal}`, creadoPor: usuarioId, metadata: { campanaTE: c._id, productos } }, { session });
        await c.save({ session }); return c;
    });
};
const evaluarCL = (campanaId, animalId, d, usuarioId) => {
    seleccionar(d, ['evaluacionCL', 'ladoOvario', 'calidadCL', 'fecha']);
    return tx(async (session) => {
        const c = await campanaActiva(campanaId, session), r = c.receptoras.find((a) => String(a.animal) === animalId);
        if (!r) throw error('Receptora no encontrada.', 404); if (r.registroId) throw error('La transferencia ya fue realizada.', 409);
        if (!['APTA', 'NO_APTA', 'PENDIENTE'].includes(d.evaluacionCL)) throw error('Evaluacion CL invalida.');
        if (d.evaluacionCL === 'APTA' && !['IZQUIERDO', 'DERECHO'].includes(d.ladoOvario)) throw error('Indique el lado del ovario con cuerpo luteo.');
        Object.assign(r, { evaluacionCL: d.evaluacionCL, ladoOvario: d.ladoOvario, calidadCL: d.calidadCL, fechaEvaluacion: fechaValida(d.fecha) });
        if (c.receptoras.every((a) => a.evaluacionCL !== 'PENDIENTE')) for (const p of c.pasos.filter((p) => p.tipoAccion === 'EVALUACION_CL')) { p.estado = 'REALIZADO'; p.fechaReal = r.fechaEvaluacion; await Tarea.updateOne({ _id: p.tareaId }, { $set: { estado: 'Completada', fechaCompletada: p.fechaReal } }, { session }); }
        await c.save({ session }); return c;
    });
};
const asignar = (campanaId, d, usuarioId) => {
    seleccionar(d, ['asignaciones', 'claveIdempotencia']); const key = banco.clave(d, 'asignacion');
    if (!Array.isArray(d.asignaciones) || !d.asignaciones.length) throw error('Seleccione lotes y cantidades.');
    return banco.unaVez(key, async (session) => {
        const c = await campanaActiva(campanaId, session);
        for (const [i, a] of d.asignaciones.entries()) {
            seleccionar(a, ['loteId', 'cantidad']); const n = cantidad(a.cantidad), lote = await banco.buscarLote(a.loteId, session);
            await banco.cambiarSaldo(lote, 'REPRODUCTIVO', 'CAMPANA', n, session); c.asignaciones.push({ loteId: lote._id, cantidad: n });
            await banco.registrarMovimiento({ loteId: lote._id, tipo: 'ASIGNACION_CAMPANA', origen: 'REPRODUCTIVO', destino: 'CAMPANA', cantidad: n, usuarioId, campanaId: c._id, claveIdempotencia: i ? `${key}:${i}` : key }, session);
        }
        await c.save({ session }); return { campana: c };
    });
};
const datosServicioLote = (l, receptoraId, fecha, tecnico, edadDias = 7) => ({ metodo: 'TRANSFERENCIA_EMBRIONES', fechaServicio: fecha, toroId: l.padreId?.toString(), sementalExternoNombre: l.padreExterno?.nombre, diioSemental: l.padreExterno?.diio,
    embrion: { donanteId: l.donanteId?.toString(), donanteExternaNombre: l.donanteExterna?.nombre, donanteDiio: l.donanteExterna?.diio, donanteRegistro: l.donanteExterna?.registro, donanteRaza: l.donanteExterna?.raza,
        origenEmbrion: l.origenEmbrion, estadoEmbrion: l.estadoConservacion, codigoEmbrion: l.codigoLote, grado: l.calidadGrado?.toString(), estadio: l.estadio, costo: l.costoUnitario, moneda: l.moneda, edadDias }
});
const transferir = async (campanaId, animalId, d, usuarioId) => {
    seleccionar(d, ['loteId', 'fecha', 'tecnico', 'edadEmbrionDias']);
    const salida = await tx(async (session) => {
        const c = await campanaActiva(campanaId, session), r = c.receptoras.find((a) => String(a.animal) === animalId);
        if (!r) throw error('Receptora no encontrada.', 404); if (r.registroId) return { campana: c, repetida: true };
        if (r.evaluacionCL !== 'APTA') throw error('Solo se transfiere a receptoras evaluadas APTAS.', 409);
        if (c.pasos.some((p) => p.estado !== 'REALIZADO' && !['EVALUACION_CL', 'TRANSFERENCIA_EMBRIONES'].includes(p.tipoAccion))) throw error('Complete la sincronizacion antes de transferir.', 409);
        const lote = await banco.buscarLote(d.loteId, session);
        const a = c.asignaciones.find((a) => String(a.loteId) === d.loteId && a.cantidad > a.usadas + a.devueltas);
        await banco.cambiarSaldo(lote, a ? 'CAMPANA' : 'REPRODUCTIVO', 'TRANSFERIDO', 1, session);
        if (a) a.usadas++;
        const animal = await Animal.findOne({ _id: r.animal, sexo: 'Hembra', especie: 'Bovino', estado: 'Activo' }).session(session); if (!animal) throw error('Receptora no disponible.');
        const dias = await require('./duracionGestacion-service').obtenerDuracionGestacionBovina({ fincaId: obtenerFincaActual(), session });
        const registro = new RegistroReproductivo({ animal: animal._id, especie: 'Bovino', asignadoA: c.responsable, metodo: 'TRANSFERENCIA_EMBRIONES', diasGestacionReferencia: dias });
        const servicio = await validarServicio(datosServicioLote(lote, animal._id, fechaValida(d.fecha), d.tecnico, d.edadEmbrionDias ?? 7), registro, usuarioId, session);
        servicio.embrion.loteEmbrionId = lote._id; servicio.embrion.campanaTE = c._id; servicio.embrion.costosUnitarios = lote.costosUnitarios.toObject();
        registro.servicios.push(servicio); registro.fechaPartoEstimada = require('./metodoReproductivo-service').sumarDias(d.fecha || new Date(), dias - (d.edadEmbrionDias ?? 7));
        const creado = await require('./reproduccion-service').crearNuevoCicloReproductivo({ data: registro.toObject(), animal, usuarioId, session });
        await registrarEventosMetodo(creado, usuarioId, session);
        r.loteId = lote._id; r.registroId = creado._id; r.fechaTransferencia = fechaValida(d.fecha); r.tecnico = d.tecnico || String(usuarioId); r.edadEmbrionDias = d.edadEmbrionDias ?? 7;
        await banco.registrarMovimiento({ loteId: lote._id, tipo: 'TRANSFERENCIA_RECEPTORA', origen: a ? 'CAMPANA' : 'REPRODUCTIVO', destino: 'TRANSFERIDO', cantidad: 1, usuarioId, campanaId: c._id, registroId: creado._id, claveIdempotencia: `transferir:${c._id}:${animal._id}` }, session);
        if (c.receptoras.every((a) => a.evaluacionCL === 'NO_APTA' || a.registroId)) for (const p of c.pasos.filter((p) => p.tipoAccion === 'TRANSFERENCIA_EMBRIONES')) { p.estado = 'REALIZADO'; p.fechaReal = r.fechaTransferencia; await Tarea.updateOne({ _id: p.tareaId }, { $set: { estado: 'Completada', fechaCompletada: p.fechaReal } }, { session }); }
        await c.save({ session }); return { campana: c, registro: creado };
    });
    if (salida.registro) await require('./reproduccionBovina-service').sincronizarTareasBovinas({ registro: salida.registro, animal: await Animal.findById(salida.registro.animal), usuarioId });
    return salida;
};
const cerrar = (campanaId, d, usuarioId) => {
    seleccionar(d, ['motivo', 'cancelar']); const razon = motivo(d.motivo);
    return tx(async (session) => {
        const c = await Campana.findById(id(campanaId)).session(session); if (!c) throw error('Campana no encontrada.', 404); if (c.estado !== 'ACTIVA') return c;
        c.estado = d.cancelar === true ? 'CANCELADA' : 'CERRADA'; c.motivoCierre = razon;
        for (const a of c.asignaciones) {
            const restante = a.cantidad - a.usadas - a.devueltas; if (!restante) continue;
            await banco.cambiarSaldo(await banco.buscarLote(String(a.loteId), session), 'CAMPANA', 'REPRODUCTIVO', restante, session);
            a.devueltas += restante;
            await banco.registrarMovimiento({ loteId: a.loteId, tipo: 'DEVOLUCION_CAMPANA', origen: 'CAMPANA', destino: 'REPRODUCTIVO', cantidad: restante, motivo: razon, usuarioId, campanaId: c._id, claveIdempotencia: `cerrar:${c._id}:${a._id}` }, session);
        }
        await Tarea.updateMany({ referenciaId: c._id, categoriaAutomatica: 'TETF', estado: { $in: ['Pendiente', 'En proceso'] } }, { $set: { estado: 'Cancelada', observaciones: razon } }, { session });
        await c.save({ session }); return c;
    });
};
module.exports = { sumar, costosValidos, prepararProtocolo, crearTareas, crearColecta, finalizarColecta, ejecutarDonante, crearCampana, campanaActiva, ejecutarPaso, evaluarCL, asignar, transferir, cerrar, datosServicioLote };
