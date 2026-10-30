const mongoose = require('mongoose');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const { InsumoReproductivo } = require('../models/InsumoReproductivo');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const CampanaIATF = require('../models/CampanaIATF');
const Animal = require('../models/Animal');
const Finca = require('../models/Finca');
const { BancoSemen, LoteSemen, AsignacionSemenCampana } = require('../models/BancoSemen');
const { comprobarInvariante, guardarFicha, cambiarSaldo, registrarMovimiento } = require('../services/bancoSemen-service');

const texto = (v) => String(v || '').trim();
const analizarLegado = ({ insumo, campanas, registros, especieFinca }) => {
    const incidencias = [];
    if (!insumo.organizacionId || !insumo.fincaId) incidencias.push('Sin organizacion o finca.');
    if (!Number.isSafeInteger(insumo.cantidadDisponible) || insumo.cantidadDisponible < 0) incidencias.push('Saldo no entero o negativo.');
    if (Number(insumo.cantidadEnUso || 0)) incidencias.push('cantidadEnUso no es cero; no puede inferirse su destino.');
    if (!['CRC', 'USD'].includes(insumo.moneda || 'CRC')) incidencias.push('Moneda de entrada desconocida.');
    if (!Number.isFinite(Number(insumo.costoUnitario || 0)) || Number(insumo.costoUnitario || 0) < 0) incidencias.push('Costo de entrada invalido.');
    const usos = [];
    const ciclosCampana = new Set();
    for (const c of campanas) {
        for (const p of c.participantes || []) {
            if (String(p.semenUtilizado || '') !== String(insumo._id) || !p.fechaInseminacion) continue;
            if (p.registroReproductivo) ciclosCampana.add(String(p.registroReproductivo));
            usos.push({ campana: c._id, participante: p._id, snapshot: p.semenSnapshot || {}, cantidad: Number(p.semenSnapshot?.cantidad ?? 1) });
        }
    }
    for (const r of registros) {
        if (ciclosCampana.has(String(r._id))) continue;
        if (r.campanaIATF) {
            // Una referencia de campana sin participante verificable no se reconstruye por suposicion.
            incidencias.push('Ciclo de campana sin participante verificable.');
            continue;
        }
        usos.push({ registro: r._id, snapshot: r.semenSnapshot || {}, cantidad: Number(r.cantidadPajuelas ?? r.semenSnapshot?.cantidad ?? 1) });
    }
    for (const u of usos) {
        if (!Number.isSafeInteger(u.cantidad) || u.cantidad <= 0) incidencias.push('Consumo historico no entero.');
        if (!['CRC', 'USD'].includes(u.snapshot.moneda || insumo.moneda)) incidencias.push('Moneda historica desconocida.');
        if (!Number.isFinite(Number(u.snapshot.costoUnitario ?? insumo.costoUnitario)) || Number(u.snapshot.costoUnitario ?? insumo.costoUnitario) < 0) incidencias.push('Costo historico invalido.');
    }
    const especies = [...new Set([...registros.map((r) => r.especie || 'Bovino'), ...(usos.some((u) => u.campana) ? ['Bovino'] : []), ...(['Bovino', 'Porcino'].includes(insumo.especie) ? [insumo.especie] : [])])];
    if (especies.length > 1) incidencias.push('Una existencia de semen se utilizo en dos especies.');
    const especie = especies[0] || especieFinca;
    if (!['Bovino', 'Porcino'].includes(especie)) incidencias.push('Especie no verificable; requiere revision antes de migrar.');
    return { incidencias: [...new Set(incidencias)], usos, especie, usadas: usos.reduce((s, u) => s + u.cantidad, 0), disponible: insumo.cantidadDisponible };
};

const migrarInsumo = async (insumo, analisis) => ejecutarConOrganizacion(insumo.organizacionId, () => ejecutarEnTransaccion(async (session) => {
    if (await LoteSemen.exists({ insumoLegadoId: insumo._id }).session(session)) return { omitido: true };
    const actual = await InsumoReproductivo.findById(insumo._id).session(session);
    if (!actual || actual.bancoSemenId) return { omitido: true };
    if (actual.cantidadDisponible !== insumo.cantidadDisponible) throw new Error('El saldo cambio durante la revision; repita en ventana de mantenimiento.');
    const diio = texto(insumo.codigoToro), nombre = texto(insumo.toro || insumo.nombre);
    const toro = diio ? await Animal.findOne({ sexo: 'Macho', especie: analisis.especie, diio }).session(session) : null;
    const filtro = toro ? { toroId: toro._id } : diio ? { esExterno: true, diioNormalizado: diio.normalize('NFKC').toUpperCase() } : { esExterno: true, nombreSemental: nombre, especie: analisis.especie };
    let ficha = await BancoSemen.findOne(filtro).session(session);
    if (ficha && (ficha.especie !== analisis.especie || ficha.tipoSemen !== (insumo.tipoSemen || 'CONVENCIONAL'))) throw new Error('Ficha incompatible; revisar especie/tipo antes de agrupar.');
    if (!ficha) [ficha] = await BancoSemen.create([{
        ...filtro, esExterno: !toro, nombreSemental: toro?.nombre || nombre,
        diio: toro?.diio || diio || undefined, raza: toro?.raza || insumo.razaToro,
        especie: analisis.especie, tipoSemen: insumo.tipoSemen || 'CONVENCIONAL', creadoPor: insumo.creadoPor
    }], { session, ordered: true });
    const [lote] = await LoteSemen.create([{
        fichaSemenId: ficha._id, origen: 'MIGRACION', fecha: insumo.createdAt || new Date(),
        loteProveedor: insumo.lote, cantidad: analisis.disponible + analisis.usadas,
        cantidadReproductiva: analisis.disponible + analisis.usadas, cantidadComercial: 0,
        costoUnitario: insumo.costoUnitario || 0, moneda: insumo.moneda || 'CRC', insumoLegadoId: insumo._id, creadoPor: insumo.creadoPor
    }], { session, ordered: true });
    if (analisis.disponible) {
        ficha = await cambiarSaldo({ ficha, gaveta: 'REPRODUCTIVO', n: analisis.disponible, moneda: insumo.moneda || 'CRC', costoUnitario: insumo.costoUnitario || 0, incremento: true, session, acumulado: 'totalIngresado' });
        await registrarMovimiento({ fichaSemenId: ficha._id, tipo: 'ENTRADA_LOTE', origen: 'EXTERNO', destino: 'REPRODUCTIVO', cantidad: analisis.disponible, moneda: insumo.moneda || 'CRC', costoUnitario: insumo.costoUnitario || 0, motivo: 'Existencia libre legada por finca, no atribuible a una campana.', loteSemenId: lote._id, claveIdempotencia: `migrar:${insumo._id}:saldo` }, session);
    }
    for (const [i, u] of analisis.usos.entries()) {
        const costo = Number(u.snapshot.costoUnitario ?? insumo.costoUnitario ?? 0), moneda = u.snapshot.moneda || insumo.moneda || 'CRC';
        ficha.totalIngresado += u.cantidad; ficha.totalUsadasIATF += u.cantidad;
        let asignacion;
        if (u.campana) {
            [asignacion] = await AsignacionSemenCampana.create([{ campanaId: u.campana, fichaSemenId: ficha._id, cantidadAsignada: u.cantidad, cantidadUsada: u.cantidad, costoUnitarioAplicado: costo, moneda, legado: true }], { session, ordered: true });
            await CampanaIATF.updateOne({ _id: u.campana, 'participantes._id': u.participante }, { $set: { 'participantes.$.bancoSemenId': ficha._id } }, { session });
        }
        if (u.registro) await RegistroReproductivo.updateOne({ _id: u.registro }, { $set: { bancoSemenId: ficha._id } }, { session });
        await registrarMovimiento({ fichaSemenId: ficha._id, tipo: 'ENTRADA_LOTE', origen: 'EXTERNO', destino: 'REPRODUCTIVO', cantidad: u.cantidad, moneda, costoUnitario: costo, loteSemenId: lote._id, claveIdempotencia: `migrar:${insumo._id}:entrada:${i}` }, session);
        if (asignacion) await registrarMovimiento({ fichaSemenId: ficha._id, tipo: 'ASIGNACION_CAMPANA', origen: 'REPRODUCTIVO', destino: 'CAMPANA', cantidad: u.cantidad, moneda, costoUnitario: costo, campanaId: u.campana, asignacionId: asignacion._id, claveIdempotencia: `migrar:${insumo._id}:asignar:${i}` }, session);
        await registrarMovimiento({ fichaSemenId: ficha._id, tipo: 'CONSUMO_INSEMINACION', origen: u.campana ? 'CAMPANA' : 'REPRODUCTIVO', destino: 'EXTERNO', cantidad: u.cantidad, moneda, costoUnitario: costo, campanaId: u.campana, asignacionId: asignacion?._id, motivo: 'Reconstruccion historica; conserva snapshot y costo anteriores.', claveIdempotencia: `migrar:${insumo._id}:usar:${i}` }, session);
    }
    await guardarFicha(ficha, session);
    actual.bancoSemenId = ficha._id; actual.activo = false; await actual.save({ session });
    return { migrado: true, fichaSemenId: String(ficha._id) };
}), insumo.fincaId);

const ejecutarMigracion = async ({ aplicar = false } = {}) => {
    const insumos = await InsumoReproductivo.find({ categoria: 'SEMEN' }).setOptions({ omitirAislamientoOrganizacion: true }).lean();
    const informe = { modo: aplicar ? 'aplicar' : 'dry-run', sinEscrituras: !aplicar, existencias: insumos.length, pendientes: 0, migradas: 0, yaMigradas: 0, unidadesDisponibles: 0, usadasVerificadas: 0, discrepancias: [] };
    for (const insumo of insumos) {
        if (insumo.bancoSemenId) { informe.yaMigradas++; continue; }
        if (!insumo.organizacionId || !insumo.fincaId) { informe.discrepancias.push({ insumoId: String(insumo._id), motivos: ['Sin tenant.'] }); continue; }
        await ejecutarConOrganizacion(insumo.organizacionId, async () => {
            const campanas = await CampanaIATF.find({ 'participantes.semenUtilizado': insumo._id }).lean();
            const registros = await RegistroReproductivo.find({ semenUtilizado: insumo._id }).lean();
            const finca = await Finca.findById(insumo.fincaId).lean();
            const especies = [...new Set((finca?.lineasProductivas || []).filter((l) => l.activa !== false).map((l) => l.especie))];
            const analisis = analizarLegado({ insumo, campanas, registros, especieFinca: especies.length === 1 ? especies[0] : undefined });
            informe.unidadesDisponibles += analisis.disponible || 0; informe.usadasVerificadas += analisis.usadas || 0;
            if (analisis.incidencias.length) { informe.discrepancias.push({ insumoId: String(insumo._id), motivos: analisis.incidencias }); return; }
            informe.pendientes++;
            if (aplicar) {
                try { const resultado = await migrarInsumo(insumo, analisis); if (resultado.migrado) informe.migradas++; }
                catch (error) { informe.discrepancias.push({ insumoId: String(insumo._id), motivos: [error.message] }); }
            }
        }, insumo.fincaId);
    }
    for (const ficha of await BancoSemen.find({}).setOptions({ omitirAislamientoOrganizacion: true }).lean()) {
        try { comprobarInvariante(ficha); } catch (error) { informe.discrepancias.push({ fichaId: String(ficha._id), motivos: [error.message] }); }
    }
    return informe;
};
const main = async () => {
    const args = process.argv.slice(2);
    if (args.some((a) => !['--dry-run', '--aplicar'].includes(a)) || args.includes('--dry-run') && args.includes('--aplicar')) throw new Error('Use --dry-run o --aplicar.');
    require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI es obligatoria; no hay fallback.');
    // Incluso en desarrollo, el diagnostico no crea colecciones ni indices.
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
    const resultado = await ejecutarMigracion({ aplicar: args.includes('--aplicar') });
    console.log(JSON.stringify(resultado, null, 2));
    if (resultado.discrepancias.length) process.exitCode = 1;
};
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { analizarLegado, ejecutarMigracion, migrarInsumo };
