require('dotenv').config();

const mongoose = require('mongoose');

const URI = process.env.MONGODB_URI || 'mongodb://localhost/dataganado';
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';
const aplicar = process.argv.includes('--apply');

const texto = (valor) => String(valor || '').trim();
const claveBase = (animal) => [
    texto(animal.organizacionId),
    texto(animal.fincaId),
    animal.especie || 'Bovino'
].join('|');
const claveIdentificador = (animal, identificador) => `${claveBase(animal)}|${texto(identificador).toUpperCase()}`;

const agregarCandidata = (mapa, animal, identificador) => {
    if (!texto(identificador)) return;
    const clave = claveIdentificador(animal, identificador);
    const ids = mapa.get(clave) || new Set();
    ids.add(String(animal._id));
    mapa.set(clave, ids);
};

const ejecutar = async () => {
    await mongoose.connect(URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 10_000 });
    const animales = mongoose.connection.collection('animals');
    const [pendientes, vinculadosConOrigenIncorrecto, hembras] = await Promise.all([
        animales.find({
            $and: [
                { madreDiio: { $type: 'string', $ne: '' } },
                { $or: [{ madre: { $exists: false } }, { madre: null }] }
            ]
        }).toArray(),
        animales.find({
            madre: { $type: 'objectId' },
            origenGenealogico: { $ne: 'Interno' }
        }).toArray(),
        animales.find({ sexo: 'Hembra' }, {
            projection: { organizacionId: 1, fincaId: 1, especie: 1, diio: 1, identificadorFinca: 1, nombre: 1 }
        }).toArray()
    ]);

    const candidatasPorIdentificador = new Map();
    const hembrasPorId = new Map();
    hembras.forEach((hembra) => {
        hembrasPorId.set(String(hembra._id), hembra);
        agregarCandidata(candidatasPorIdentificador, hembra, hembra.diio);
        agregarCandidata(candidatasPorIdentificador, hembra, hembra.identificadorFinca);
    });

    const cambios = [];
    const ambiguos = [];
    const sinCoincidencia = [];

    pendientes.forEach((cria) => {
        const ids = [...(candidatasPorIdentificador.get(claveIdentificador(cria, cria.madreDiio)) || [])]
            .filter((id) => id !== String(cria._id));
        if (ids.length === 0) {
            sinCoincidencia.push({ id: cria._id, diio: cria.diio || cria.identificadorFinca, madreDiio: cria.madreDiio });
            return;
        }
        if (ids.length > 1) {
            ambiguos.push({ id: cria._id, diio: cria.diio || cria.identificadorFinca, madreDiio: cria.madreDiio, coincidencias: ids.length });
            return;
        }
        const madre = hembrasPorId.get(ids[0]);
        cambios.push({
            cria,
            madre,
            updateOne: {
                filter: { _id: cria._id, $or: [{ madre: { $exists: false } }, { madre: null }] },
                update: {
                    $set: { madre: madre._id, origenGenealogico: 'Interno', updatedAt: new Date() },
                    ...([cria.madreDiio, madre.diio, madre.identificadorFinca].some((valor) => texto(valor) === texto(cria.madreExternaNombre))
                        ? { $unset: { madreExternaNombre: '' } }
                        : {})
                }
            }
        });
    });

    const correccionesOrigen = vinculadosConOrigenIncorrecto.map((cria) => ({
        updateOne: {
            filter: { _id: cria._id, madre: cria.madre },
            update: {
                $set: { origenGenealogico: 'Interno', updatedAt: new Date() },
                ...(texto(cria.madreExternaNombre) && texto(cria.madreExternaNombre) === texto(cria.madreDiio)
                    ? { $unset: { madreExternaNombre: '' } }
                    : {})
            }
        }
    }));

    if (aplicar && (cambios.length || correccionesOrigen.length)) {
        await animales.bulkWrite([
            ...cambios.map((cambio) => ({ updateOne: cambio.updateOne })),
            ...correccionesOrigen
        ], { ordered: false });
    }

    console.log(JSON.stringify({
        modo: aplicar ? 'APLICADO' : 'DRY_RUN',
        registrosRevisados: pendientes.length,
        madresInternasEncontradas: cambios.length,
        origenInternoPorCorregir: correccionesOrigen.length,
        valoresAmbiguos: ambiguos.length,
        sinCoincidencia: sinCoincidencia.length,
        cambios: cambios.map(({ cria, madre }) => ({
            animalId: cria._id,
            animal: cria.diio || cria.identificadorFinca || null,
            madreId: madre._id,
            madre: madre.diio || madre.identificadorFinca || null
        })),
        ambiguos
    }, null, 2));
};

if (require.main === module) {
    ejecutar()
        .catch((error) => {
            console.error('Falló la revisión de madres internas:', error);
            process.exitCode = 1;
        })
        .finally(() => mongoose.disconnect());
}

module.exports = { agregarCandidata, claveIdentificador };
