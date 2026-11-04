const mongoose = require('mongoose');
const Colecta = require('../models/ProgramaTransferencia');
const { CampanaTE, LoteEmbrion } = require('../models/ProgramaTE');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const banco = require('../services/bancoEmbriones-service');
const analizar = (c) => {
    if (!c.organizacionId || !c.fincaId) throw Error('Colecta sin organizacion/finca.');
    if (!c.embriones?.length) throw Error('Colecta anterior sin embriones; requiere revision.');
    if (!['CRC', 'USD'].includes(c.moneda)) throw Error('Moneda historica desconocida.');
    if (!['IN_VIVO', 'FIV'].includes(c.origenEmbrion) || !Number.isFinite(c.costoTotal) || c.costoTotal < 0) throw Error('Origen o costo historico no valido.');
    if (!c.donanteId && !c.donanteExternaNombre) throw Error('Sin donante verificable.');
    const grupos = new Map();
    const receptoras = new Set();
    for (const e of c.embriones) {
        if (!['DISPONIBLE', 'RESERVADO', 'TRANSFERIDO'].includes(e.estado) || !['FRESCO', 'CONGELADO', 'VITRIFICADO'].includes(e.estadoEmbrion)) throw Error('Estado de embrion no reconocido.');
        if (e.estado !== 'DISPONIBLE' && !e.receptoraId) throw Error('Embrion reservado/transferido sin receptora.');
        if (e.estado === 'TRANSFERIDO' && !e.registroReproductivoId) throw Error('Transferencia historica sin ciclo; no se inventa uno.');
        if (e.receptoraId) {
            if (receptoras.has(String(e.receptoraId))) throw Error('Varios embriones de la colecta asociados a la misma receptora; revisar manualmente.');
            receptoras.add(String(e.receptoraId));
        }
        if (e.grado && !['1', '2', '3'].includes(e.grado)) throw Error('Grado historico sin equivalencia explicita.');
        if (e.estadio && !['MORULA', 'BLASTOCISTO_TEMPRANO', 'BLASTOCISTO', 'BLASTOCISTO_EXPANDIDO', 'OTRO'].includes(e.estadio)) throw Error('Estadio historico sin equivalencia explicita.');
        const key = `${e.estadoEmbrion}:${e.grado || ''}:${e.estadio || ''}`;
        if (!grupos.has(key)) grupos.set(key, []); grupos.get(key).push(e);
    }
    return [...grupos.values()];
};
const migrarColecta = (raw, grupos) => ejecutarConOrganizacion(raw.organizacionId, () => ejecutarEnTransaccion(async (session) => {
    const c = await Colecta.findById(raw._id).session(session); if (c.migradoBancoEmbriones || c.versionProgramaTE === 2) return 0;
    let campana;
    const vinculados = c.embriones.filter((e) => e.estado !== 'DISPONIBLE');
    if (vinculados.length) {
        const pendiente = vinculados.some((e) => e.estado === 'RESERVADO');
        const programa = require('../services/programaTE-service');
        const protocolo = programa.prepararProtocolo(pendiente ? [{ nombre: 'Revisar sincronizacion historica', tipoAccion: 'CONTROL', offsetHoras: 0 }, { nombre: 'Evaluar cuerpo luteo', tipoAccion: 'EVALUACION_CL', offsetHoras: 0 }, { nombre: 'Transferencia real', tipoAccion: 'TRANSFERENCIA_EMBRIONES', offsetHoras: 0 }] : [], 'Compatibilidad historica');
        const [creada] = await CampanaTE.create([{ nombre: `Historico · ${c.nombre}`, fechaInicio: c.fechaColecta, responsable: vinculados[0].responsable || c.creadoPor,
            estado: pendiente ? 'ACTIVA' : 'CERRADA', protocoloSnapshot: protocolo,
            receptoras: vinculados.map((e) => ({ animal: e.receptoraId, evaluacionCL: 'PENDIENTE', registroId: e.registroReproductivoId })), claveIdempotencia: `migracion:${c._id}`
        }], { session, ordered: true }); campana = creada;
        if (pendiente) {
            await require('../models/Tarea').Tarea.updateMany({ referenciaId: c._id, categoriaAutomatica: 'Transferencia de embriones', estado: { $in: ['Pendiente', 'En proceso'] } }, { $set: { estado: 'Cancelada', observaciones: 'Seguimiento trasladado a campana TETF; historial conservado.' } }, { session });
            campana.pasos = await programa.crearTareas({ referencia: campana, protocolo, inicio: c.fechaColecta, responsable: campana.responsable, categoria: 'TETF', usuarioId: c.creadoPor, session });
        }
    }
    for (const [i, grupo] of grupos.entries()) {
        const ejemplo = grupo[0];
        const lote = await banco.crearLote({ origenLote: 'PRODUCCION_PROPIA', origenEmbrion: c.origenEmbrion, donanteId: c.donanteId?.toString(), donanteExterna: c.donanteId ? undefined : { nombre: c.donanteExternaNombre, raza: c.donanteRaza, registro: c.donanteRegistro },
            padreId: c.padreId?.toString(), padreExterno: c.padreId ? undefined : { nombre: c.padreExternoNombre, diio: c.diioPadre },
            estadoConservacion: ejemplo.estadoEmbrion, calidadGrado: ejemplo.grado ? Number(ejemplo.grado) : undefined, estadio: ejemplo.estadio || undefined,
            codigoLote: `LEGADO-${c._id}-${i}`, moneda: c.moneda, costoUnitario: c.costoTotal / c.embriones.length, cantidad: grupo.length
        }, c.creadoPor, session, { colectaId: c._id, claveEntrada: `migracion:${c._id}:${i}` });
        c.lotesBanco.push(lote._id);
        for (const e of grupo) {
            if (e.estado === 'RESERVADO') {
                await banco.cambiarSaldo(await banco.buscarLote(String(lote._id), session), 'REPRODUCTIVO', 'CAMPANA', 1, session);
                campana.asignaciones.push({ loteId: lote._id, cantidad: 1 });
                await banco.registrarMovimiento({ loteId: lote._id, tipo: 'ASIGNACION_CAMPANA', origen: 'REPRODUCTIVO', destino: 'CAMPANA', cantidad: 1, campanaId: campana._id, motivo: 'Reserva historica conservada; CL pendiente de evaluar.', claveIdempotencia: `migrar:${e._id}:reserva` }, session);
            } else if (e.estado === 'TRANSFERIDO') {
                const registro = await RegistroReproductivo.findOne({ _id: e.registroReproductivoId, animal: e.receptoraId }).session(session);
                if (!registro) throw Error('El ciclo historico no corresponde a receptora/finca.');
                await banco.cambiarSaldo(await banco.buscarLote(String(lote._id), session), 'REPRODUCTIVO', 'TRANSFERIDO', 1, session);
                await banco.registrarMovimiento({ loteId: lote._id, tipo: 'TRANSFERENCIA_RECEPTORA', origen: 'REPRODUCTIVO', destino: 'TRANSFERIDO', cantidad: 1, campanaId: campana._id, registroId: registro._id, motivo: 'Transferencia historica; no modifica fechas ni genealogia.', claveIdempotencia: `migrar:${e._id}:transferencia` }, session);
            }
        }
    }
    if (campana) await campana.save({ session });
    c.versionProgramaTE = 2; c.migradoBancoEmbriones = true; c.estadoProduccion = 'FINALIZADA'; c.tipoProduccion = c.origenEmbrion;
    c.estructurasRecuperadas = c.embriones.length; c.embrionesViables = c.embriones.length; c.embrionesDegenerados = 0;
    c.costos = [{ concepto: 'Costo historico de colecta', monto: c.costoTotal, moneda: c.moneda }];
    if (!c.donanteId) c.donanteExterna = { nombre: c.donanteExternaNombre, raza: c.donanteRaza, registro: c.donanteRegistro };
    if (!c.padreId) c.padreExterno = { nombre: c.padreExternoNombre, diio: c.diioPadre };
    await c.save({ session }); return grupos.length;
}), raw.fincaId);
const ejecutarMigracion = async ({ aplicar = false } = {}) => {
    const reproduccion = await require('./migrar-metodo-reproductivo').ejecutarMigracion({ aplicar });
    const colectas = await Colecta.find({ versionProgramaTE: { $ne: 2 }, migradoBancoEmbriones: { $ne: true } }).setOptions({ omitirAislamientoOrganizacion: true }).lean();
    const informe = { modo: aplicar ? 'aplicar' : 'dry-run', reproduccion, colectasAnalizadas: colectas.length, colectasPendientes: 0, colectasMigradas: 0, lotesPrevistos: 0, lotesCreados: 0, discrepancias: [] };
    for (const c of colectas) {
        try {
            const grupos = analizar(c);
            await ejecutarConOrganizacion(c.organizacionId, async () => {
                await banco.validarGenetica({ donanteId: c.donanteId, donanteExterna: c.donanteId ? undefined : { nombre: c.donanteExternaNombre }, padreId: c.padreId }, null);
                for (const e of c.embriones.filter((e) => e.estado === 'TRANSFERIDO')) if (!await RegistroReproductivo.exists({ _id: e.registroReproductivoId, animal: e.receptoraId })) throw Error('Transferencia historica sin ciclo de la receptora en esta finca.');
            }, c.fincaId);
            informe.colectasPendientes++; informe.lotesPrevistos += grupos.length;
            if (aplicar) { const n = await migrarColecta(c, grupos); if (n) { informe.colectasMigradas++; informe.lotesCreados += n; } }
        } catch (e) { informe.discrepancias.push({ colectaId: String(c._id), mensaje: e.message }); }
    }
    for (const l of await LoteEmbrion.find({}).setOptions({ omitirAislamientoOrganizacion: true }).lean()) try { banco.comprobarInvariante(l); } catch (e) { informe.discrepancias.push({ loteId: String(l._id), mensaje: e.message }); }
    return informe;
};
async function main() {
    const args = process.argv.slice(2);
    if (args.some((a) => !['--dry-run', '--aplicar'].includes(a)) || args.includes('--dry-run') && args.includes('--aplicar')) throw Error('Use --dry-run o --aplicar.');
    require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true }); if (!process.env.MONGODB_URI) throw Error('MONGODB_URI es obligatoria.');
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
    const informe = await ejecutarMigracion({ aplicar: args.includes('--aplicar') }); console.log(JSON.stringify(informe, null, 2));
    if (informe.discrepancias.length || informe.reproduccion.discrepancias.length) process.exitCode = 1;
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { analizar, migrarColecta, ejecutarMigracion };
