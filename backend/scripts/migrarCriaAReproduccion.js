require('dotenv').config();

const mongoose = require('mongoose');
const Animal = require('../models/Animal');
const Finca = require('../models/Finca');
const Lote = require('../models/Lote');
const PlanAlimentacion = require('../models/PlanAlimentacion');
const Racion = require('../models/Racion');
const { normalizarObjetivoProductivo } = require('../config/objetivosProductivos');
const { normalizarPropositoLote } = require('../config/lotes');

const URI = process.env.MONGODB_URI || 'mongodb://localhost/dataganado';
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';
const dryRun = process.argv.includes('--dry-run');

const claveAnterior = (valor) => {
    const clave = String(valor ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_').toUpperCase();
    return clave || 'SIN_DEFINIR';
};

const contar = (documentos, campo, normalizador) => documentos.reduce((resumen, documento) => {
    const valor = documento[campo];
    const clave = normalizador(valor) || `VALOR_NO_RECONOCIDO:${String(valor).trim()}`;
    resumen[clave] = (resumen[clave] || 0) + 1;
    return resumen;
}, {});

const prepararOperaciones = ({ documentos, campo, normalizador, entidad, incluirSinDefinir = false }) => {
    const operaciones = [];
    const ambiguos = [];
    const cambios = [];
    documentos.forEach((documento) => {
        const anterior = documento[campo];
        if ((anterior === undefined || anterior === null || String(anterior).trim() === '') && !incluirSinDefinir) return;
        const nuevo = normalizador(anterior);
        if (!nuevo) {
            ambiguos.push({ entidad, id: documento._id, campo, valor: anterior });
            return;
        }
        if (anterior === nuevo) return;
        operaciones.push({ updateOne: { filter: { _id: documento._id }, update: { $set: { [campo]: nuevo, updatedAt: new Date() } } } });
        cambios.push({
            entidad,
            id: documento._id,
            identificador: documento.diio || documento.identificadorFinca || documento.codigo || documento.nombre,
            especie: documento.especie,
            valorAnterior: anterior ?? null,
            valorNuevo: nuevo
        });
    });
    return { operaciones, ambiguos, cambios };
};

const prepararFincas = (fincas) => {
    const operaciones = [];
    const ambiguos = [];
    const cambios = [];
    fincas.forEach((finca) => {
        let cambio = false;
        const lineasProductivas = (finca.lineasProductivas || []).map((linea) => {
            const objetivos = [];
            (linea.objetivos || []).forEach((anterior) => {
                const nuevo = normalizarObjetivoProductivo(anterior);
                if (!nuevo) {
                    ambiguos.push({ entidad: 'Finca', id: finca._id, campo: 'lineasProductivas.objetivos', valor: anterior });
                    objetivos.push(anterior);
                    return;
                }
                if (nuevo !== anterior) {
                    cambio = true;
                    cambios.push({ entidad: 'Finca', id: finca._id, identificador: finca.codigo || finca.nombre, especie: linea.especie, valorAnterior: anterior, valorNuevo: nuevo });
                }
                if (!objetivos.includes(nuevo)) objetivos.push(nuevo);
                else cambio = true;
            });
            return { ...linea, objetivos };
        });
        if (cambio) operaciones.push({ updateOne: { filter: { _id: finca._id }, update: { $set: { lineasProductivas, updatedAt: new Date() } } } });
    });
    return { operaciones, ambiguos, cambios };
};

const ejecutar = async () => {
    await mongoose.connect(URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 10_000 });
    const [animales, fincas, lotes, planes, raciones] = await Promise.all([
        Animal.collection.find({}).toArray(),
        Finca.collection.find({}).toArray(),
        Lote.collection.find({}).toArray(),
        PlanAlimentacion.collection.find({}).toArray(),
        Racion.collection.find({}).toArray()
    ]);
    const totalPorEspecie = contar(animales, 'especie', (valor) => valor || 'SIN_ESPECIE');
    const antes = contar(animales, 'objetivoProductivo', claveAnterior);
    const grupos = [
        { collection: Animal.collection, ...prepararOperaciones({ documentos: animales, campo: 'objetivoProductivo', normalizador: normalizarObjetivoProductivo, entidad: 'Animal' }) },
        { collection: Lote.collection, ...prepararOperaciones({ documentos: lotes, campo: 'proposito', normalizador: normalizarPropositoLote, entidad: 'Lote' }) },
        { collection: PlanAlimentacion.collection, ...prepararOperaciones({ documentos: planes, campo: 'proposito', normalizador: normalizarPropositoLote, entidad: 'PlanAlimentacion' }) },
        { collection: Racion.collection, ...prepararOperaciones({ documentos: raciones, campo: 'proposito', normalizador: normalizarPropositoLote, entidad: 'Racion' }) },
        { collection: Finca.collection, ...prepararFincas(fincas) }
    ];
    if (!dryRun) {
        for (const grupo of grupos) {
            if (grupo.operaciones.length) await grupo.collection.bulkWrite(grupo.operaciones, { ordered: false });
        }
    }
    const cambios = grupos.flatMap((grupo) => grupo.cambios);
    const ambiguos = grupos.flatMap((grupo) => grupo.ambiguos);
    const despuesProyectado = dryRun
        ? animales.map((animal) => ({ ...animal, objetivoProductivo: normalizarObjetivoProductivo(animal.objetivoProductivo) || animal.objetivoProductivo }))
        : await Animal.collection.find({}).toArray();
    const despues = contar(despuesProyectado, 'objetivoProductivo', claveAnterior);
    const totalPorEspecieDespues = contar(despuesProyectado, 'especie', (valor) => valor || 'SIN_ESPECIE');
    const resumen = {
        modo: dryRun ? 'DRY_RUN' : 'APLICADO',
        animalesRevisados: animales.length,
        animalesMigrados: grupos[0].cambios.length,
        animalesPorEspecie: grupos[0].cambios.reduce((r, item) => {
            const especie = item.especie || 'SIN_ESPECIE';
            return { ...r, [especie]: (r[especie] || 0) + 1 };
        }, {}),
        lotesMigrados: grupos[1].cambios.length,
        planesMigrados: grupos[2].cambios.length,
        racionesMigradas: grupos[3].cambios.length,
        objetivosFincaMigrados: grupos[4].cambios.length,
        valoresNoReconocidos: ambiguos.length,
        totalAntes: animales.length,
        totalDespues: despuesProyectado.length,
        totalPorEspecie,
        totalPorEspecieDespues,
        distribucionAntes: antes,
        distribucionDespues: despues
    };
    if (resumen.totalAntes !== resumen.totalDespues) throw new Error('La validación de totales de animales falló.');
    if (JSON.stringify(totalPorEspecie) !== JSON.stringify(totalPorEspecieDespues)) throw new Error('La validación de totales por especie falló.');
    console.log(JSON.stringify({ resumen, cambios, valoresNoReconocidos: ambiguos }, null, 2));
};

if (require.main === module) {
    ejecutar()
        .catch((error) => { console.error('Falló la migración:', error); process.exitCode = 1; })
        .finally(() => mongoose.disconnect());
}

module.exports = { prepararFincas, prepararOperaciones };
