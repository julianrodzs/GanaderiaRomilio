const mongoose = require('mongoose');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const Animal = require('../models/Animal');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { prepararMetodoCiclo, validarMetodo } = require('../services/metodoReproductivo-service');

const analizarRegistro = (r, otrosRegistros = []) => {
    const senales = [];
    if (r.metodo && r.metodo !== 'DESCONOCIDO') senales.push(r.metodo);
    if (r.campanaIATF || r.campanaId || r.tipoInseminacion === 'IATF') senales.push('IATF');
    if (r.origenGestacion && r.origenGestacion !== 'INDETERMINADO') senales.push(r.origenGestacion);
    if (['Monta', 'Monta natural'].includes(r.tipoRegistro)) senales.push('MONTA_NATURAL');
    if (['Inseminación', 'Inseminación artificial'].includes(r.tipoRegistro) && !senales.includes('IATF')) senales.push('IA_CONVENCIONAL');
    if (r.tipoInseminacion === 'IA_CONVENCIONAL') senales.push('IA_CONVENCIONAL');
    if (new Set(senales).size > 1) throw Error(`Metodos contradictorios: ${[...new Set(senales)].join(', ')}`);
    const inicio = r.fechaInseminacion || r.fechaMonta;
    const duracionHistorica = inicio && r.fechaPartoEstimada ? Math.round((new Date(r.fechaPartoEstimada) - new Date(inicio)) / 86400000) : null;
    const diasReferencia = r.diasGestacionReferencia || (r.especie === 'Porcino'
        ? duracionHistorica >= 100 && duracionHistorica <= 130 ? duracionHistorica : 118
        : duracionHistorica >= 250 && duracionHistorica <= 310 ? duracionHistorica : 283);
    const copia = new RegistroReproductivo({ ...r, diasGestacionReferencia: diasReferencia, metodo: senales[0] || 'DESCONOCIDO' });
    validarMetodo(copia.metodo, copia.especie);
    prepararMetodoCiclo(copia);
    if (!r.servicios?.length && copia.servicios.length) copia.servicios[0]._id = new mongoose.Types.ObjectId(require('crypto').createHash('sha256').update(`servicio:${r._id}`).digest('hex').slice(0, 24));
    if (r.fechaPartoReal || r.fechaPartoEstimada) {
        for (const otro of otrosRegistros) {
            if (String(otro._id) === String(r._id) || String(otro.animal) !== String(r.animal) || String(otro.fincaId) !== String(r.fincaId) || String(otro.organizacionId) !== String(r.organizacionId) || otro.inseminacionAnulada) continue;
            try {
                const origen = analizarRegistro(otro);
                for (const s of origen.servicios || []) if (!s.anulado && !s.cicloOrigenId && (s.fechaServicio || s.fechaServicioDesde) && !copia.servicios.some((actual) => String(actual._id) === String(s._id))) copia.servicios.push({ ...s, cicloOrigenId: otro._id });
            } catch { /* La contradiccion del otro ciclo se informa al procesarlo, sin inventar un servicio. */ }
        }
    }
    prepararMetodoCiclo(copia);
    const candidatos = new Set(copia.serviciosCandidatos.map(String));
    copia.servicios = copia.servicios.filter((s) => !s.cicloOrigenId || candidatos.has(String(s._id)));
    if (['Monta natural', 'Inseminación artificial', 'Sin especificar'].includes(copia.tipoRegistro)) copia.tipoRegistro = copia.tipoRegistro === 'Monta natural' ? 'Monta' : copia.tipoRegistro === 'Inseminación artificial' ? 'Inseminación' : 'Inseminación/Monta';
    const obj = copia.toObject();
    return Object.fromEntries(['metodo', 'tipoRegistro', 'origenGestacion', 'servicios', 'servicioAtribuidoId', 'serviciosCandidatos', 'estadoAtribucion', 'resultado', 'diasGestacionReferencia'].filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
};
const ejecutarMigracion = async ({ aplicar = false } = {}) => {
    const registros = await RegistroReproductivo.find({}).setOptions({ omitirAislamientoOrganizacion: true }).lean();
    const porAnimal = new Map();
    const claveAnimal = (r) => `${r.organizacionId}:${r.fincaId}:${r.animal}`;
    for (const r of registros) { const clave = claveAnimal(r); if (!porAnimal.has(clave)) porAnimal.set(clave, []); porAnimal.get(clave).push(r); }
    const animales = await Animal.find({ madre: { $ne: null } }).setOptions({ omitirAislamientoOrganizacion: true }).lean();
    const informe = { modo: aplicar ? 'aplicar' : 'dry-run', sinEscrituras: !aplicar, ciclos: registros.length, partosAntes: registros.filter((r) => r.fechaPartoReal).length, ciclosPendientes: 0, ciclosMigrados: 0, animalesPendientes: 0, animalesMigrados: 0, discrepancias: [] };
    for (const r of registros) {
        if (r.versionMetodo === 1) continue;
        try {
            if (!r.organizacionId || !r.fincaId) throw Error('Ciclo sin organizacion o finca.');
            const cambios = analizarRegistro(r, porAnimal.get(claveAnimal(r)));
            if (r.semenSnapshot?.toroId && ['INCIERTA', 'SIN_SERVICIO'].includes(cambios.estadoAtribucion)) informe.discrepancias.push({ cicloId: String(r._id), mensaje: 'Paternidad historica no concluyente; no se modifican crias.' });
            informe.ciclosPendientes++;
            if (aplicar) await ejecutarConOrganizacion(r.organizacionId, async () => {
                const resultado = await RegistroReproductivo.updateOne({ _id: r._id, versionMetodo: { $ne: 1 } }, { $set: { ...cambios, versionMetodo: 1 } }, { runValidators: true });
                informe.ciclosMigrados += resultado.modifiedCount;
            }, r.fincaId);
        } catch (e) { informe.discrepancias.push({ cicloId: String(r._id), mensaje: e.message }); }
    }
    for (const a of animales) {
        if (a.madreGeneticaId && a.madreGestanteId) continue;
        if (a.madreGeneticaId || a.madreGestanteId || a.madreGeneticaExterna?.nombre) {
            informe.discrepancias.push({ animalId: String(a._id), mensaje: 'Filiacion dual incompleta: revisar donante y receptora; no se infiere una de la otra.' }); continue;
        }
        if (!a.organizacionId || !a.fincaId) { informe.discrepancias.push({ animalId: String(a._id), mensaje: 'Animal sin tenant.' }); continue; }
        const madre = await Animal.findOne({ _id: a.madre, organizacionId: a.organizacionId, fincaId: a.fincaId }).setOptions({ omitirAislamientoOrganizacion: true }).lean();
        if (!madre || madre.sexo !== 'Hembra' || madre.especie !== a.especie) { informe.discrepancias.push({ animalId: String(a._id), mensaje: 'Madre historica no valida; revisar antes de migrar.' }); continue; }
        informe.animalesPendientes++;
        if (aplicar) await ejecutarConOrganizacion(a.organizacionId, async () => {
            const cambios = {};
            if (!a.madreGeneticaId) cambios.madreGeneticaId = a.madre;
            if (!a.madreGestanteId) cambios.madreGestanteId = a.madre;
            await Animal.updateOne({ _id: a._id }, { $set: cambios }); informe.animalesMigrados++;
        }, a.fincaId);
    }
    informe.partosDespues = await RegistroReproductivo.countDocuments({ fechaPartoReal: { $ne: null } }).setOptions({ omitirAislamientoOrganizacion: true });
    if (informe.partosDespues !== informe.partosAntes) throw Error('Cambio inesperado de totales de partos.');
    return informe;
};
async function main() {
    const args = process.argv.slice(2);
    if (args.some((a) => !['--dry-run', '--aplicar'].includes(a)) || args.includes('--dry-run') && args.includes('--aplicar')) throw Error('Use --dry-run o --aplicar.');
    require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
    if (!process.env.MONGODB_URI) throw Error('MONGODB_URI es obligatoria.');
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
    const informe = await ejecutarMigracion({ aplicar: args.includes('--aplicar') });
    console.log(JSON.stringify(informe, null, 2));
    if (informe.discrepancias.length) process.exitCode = 1;
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { analizarRegistro, ejecutarMigracion };
