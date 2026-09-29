require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { OBJETIVOS_PRODUCTIVOS } = require('../config/lineasProductivas');
const AlertaCorreo = require('../models/AlertaCorreo');
const Animal = require('../models/Animal');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const Auditoria = require('../models/Auditoria');
const Camada = require('../models/Camada');
const CatalogoFinanciero = require('../models/CatalogoFinanciero');
const CompraAnimal = require('../models/CompraAnimal');
const ConfiguracionProductiva = require('../models/ConfiguracionProductiva');
const ConteoDrone = require('../models/ConteoDrone');
const Costo = require('../models/Costo');
const EventoAnimal = require('../models/EventoAnimal');
const EventoCamada = require('../models/EventoCamada');
const Finca = require('../models/Finca');
const ImportacionExcel = require('../models/ImportacionExcel');
const { Membresia } = require('../models/Membresia');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const Notificacion = require('../models/Notificacion');
const Organizacion = require('../models/Organizacion');
const Pesaje = require('../models/Pesaje');
const { PlanSanitario } = require('../models/PlanSanitario');
const Potrero = require('../models/Potrero');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const RegistroSanitario = require('../models/RegistroSanitario');
const RotacionPotrero = require('../models/RotacionPotrero');
const { Tarea } = require('../models/Tarea');
const { TratamientoSanitario } = require('../models/TratamientoSanitario');
const Usuario = require('../models/Usuario');
const VentaAnimal = require('../models/VentaAnimal');

const aplicar = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI || 'mongodb://localhost/dataganado';
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';
const NOMBRE_ORGANIZACION = process.env.ORGANIZACION_INICIAL_NOMBRE || 'Ganadería Romilio';
const SLUG_ORGANIZACION = process.env.ORGANIZACION_INICIAL_SLUG || 'ganaderia-romilio';

const MODELOS_TENANT = [
    AlertaCorreo,
    Animal,
    AplicacionSanitaria,
    Auditoria,
    Camada,
    CatalogoFinanciero,
    CompraAnimal,
    ConfiguracionProductiva,
    ConteoDrone,
    Costo,
    EventoAnimal,
    EventoCamada,
    Finca,
    ImportacionExcel,
    MovimientoFinanciero,
    Notificacion,
    Pesaje,
    PlanSanitario,
    Potrero,
    RegistroReproductivo,
    RegistroSanitario,
    RotacionPotrero,
    Tarea,
    TratamientoSanitario,
    VentaAnimal
];

const MODELOS_FINCA = [
    Animal,
    AplicacionSanitaria,
    Camada,
    CompraAnimal,
    ConteoDrone,
    Costo,
    EventoAnimal,
    EventoCamada,
    ImportacionExcel,
    MovimientoFinanciero,
    Pesaje,
    PlanSanitario,
    Potrero,
    RegistroReproductivo,
    RegistroSanitario,
    RotacionPotrero,
    Tarea,
    TratamientoSanitario,
    VentaAnimal
];

const MIGRACIONES_ARCHIVOS = [
    { categoria: 'compras', modelo: CompraAnimal, campo: 'comprobanteUrl' },
    { categoria: 'ventas', modelo: VentaAnimal, campo: 'comprobanteUrl' },
    { categoria: 'tareas', modelo: Tarea, campo: 'evidenciaUrl' },
    { categoria: 'conteo-drone', modelo: ConteoDrone, campo: 'imagenOriginalUrl' },
    { categoria: 'conteo-drone', modelo: ConteoDrone, campo: 'imagenProcesadaUrl' }
];

const asegurarOrganizacion = async () => {
    let organizacion = await Organizacion.findOne({ slug: SLUG_ORGANIZACION });
    if (!organizacion && aplicar) {
        organizacion = await Organizacion.create({
            nombre: NOMBRE_ORGANIZACION,
            slug: SLUG_ORGANIZACION,
            pais: 'Costa Rica',
            zonaHoraria: 'America/Costa_Rica'
        });
    }
    return organizacion;
};

const migrarMembresias = async (organizacionId) => {
    const usuarios = await Usuario.find({}).lean();
    let pendientes = 0;
    for (const usuario of usuarios) {
        const existe = await Membresia.exists({ organizacionId, usuario: usuario._id });
        if (existe) continue;
        pendientes += 1;
        if (aplicar) {
            await Membresia.create({
                organizacionId,
                usuario: usuario._id,
                rol: usuario.rol || 'Encargado',
                estado: usuario.estado || 'Activo',
                esPrincipal: true,
                accesoTodasFincas: true
            });
        }
    }
    return { usuarios: usuarios.length, pendientes };
};

const migrarColecciones = async (organizacionId) => {
    const resumen = [];
    for (const Modelo of MODELOS_TENANT) {
        const filtro = { $or: [{ organizacionId: { $exists: false } }, { organizacionId: null }] };
        const pendientes = await Modelo.collection.countDocuments(filtro);
        if (aplicar && pendientes) {
            await Modelo.collection.updateMany(filtro, { $set: { organizacionId } });
        }
        resumen.push({ coleccion: Modelo.collection.collectionName, pendientes });
    }
    return resumen;
};

const asegurarFincaPrincipal = async (organizacion) => {
    let finca = await Finca.collection.findOne({
        organizacionId: organizacion._id,
        codigo: 'PRINCIPAL'
    });

    const especiesRegistradas = await Animal.collection.distinct('especie', {
        organizacionId: organizacion._id
    });
    const especies = new Set(especiesRegistradas.filter((especie) => ['Bovino', 'Porcino'].includes(especie)));
    const bovinosSinEspecie = await Animal.collection.countDocuments({
        organizacionId: organizacion._id,
        $or: [{ especie: { $exists: false } }, { especie: null }]
    });
    if (bovinosSinEspecie > 0) especies.add('Bovino');
    if (especies.size === 0 && organizacion.plan?.especiePlan) especies.add(organizacion.plan.especiePlan);
    if (especies.size === 0) {
        especies.add('Bovino');
        especies.add('Porcino');
    }
    const lineasProductivas = [...especies].sort().map((especie) => ({
        especie,
        objetivos: [...OBJETIVOS_PRODUCTIVOS],
        activa: true
    }));

    if (!finca && aplicar) {
        const resultado = await Finca.collection.insertOne({
            organizacionId: organizacion._id,
            nombre: 'Finca principal',
            codigo: 'PRINCIPAL',
            estado: 'Activa',
            lineasProductivas,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        finca = await Finca.collection.findOne({ _id: resultado.insertedId });
    }

    if (aplicar && finca && (!Array.isArray(finca.lineasProductivas) || finca.lineasProductivas.length === 0)) {
        await Finca.collection.updateOne(
            { _id: finca._id },
            { $set: { lineasProductivas, updatedAt: new Date() } }
        );
        finca = await Finca.collection.findOne({ _id: finca._id });
    }

    if (aplicar && finca && String(organizacion.fincaPrincipal || '') !== String(finca._id)) {
        organizacion.fincaPrincipal = finca._id;
        await organizacion.save();
    }
    return finca;
};

const migrarDocumentosAFincaPrincipal = async (organizacionId, fincaId) => {
    const resumen = [];
    if (!fincaId) return resumen;
    for (const Modelo of MODELOS_FINCA) {
        const filtro = {
            organizacionId,
            $or: [{ fincaId: { $exists: false } }, { fincaId: null }]
        };
        const pendientes = await Modelo.collection.countDocuments(filtro);
        if (aplicar && pendientes) {
            await Modelo.collection.updateMany(filtro, { $set: { fincaId } });
        }
        resumen.push({ coleccion: Modelo.collection.collectionName, pendientes });
    }
    return resumen;
};

const moverArchivos = (organizacionId) => {
    const raiz = path.join(__dirname, '..', 'uploads');
    const movimientos = [];

    for (const categoria of new Set(MIGRACIONES_ARCHIVOS.map((item) => item.categoria))) {
        const origen = path.join(raiz, categoria);
        const destino = path.join(raiz, String(organizacionId), categoria);
        const archivos = fs.existsSync(origen)
            ? fs.readdirSync(origen, { withFileTypes: true }).filter((item) => item.isFile())
            : [];

        movimientos.push({ categoria, archivos: archivos.length });
        if (!aplicar || !archivos.length) continue;

        fs.mkdirSync(destino, { recursive: true });
        archivos.forEach((archivo) => {
            const rutaOrigen = path.join(origen, archivo.name);
            const rutaDestino = path.join(destino, archivo.name);
            if (!fs.existsSync(rutaDestino)) fs.renameSync(rutaOrigen, rutaDestino);
        });
    }
    return movimientos;
};

const actualizarUrlsArchivos = async (organizacionId) => {
    const resumen = [];
    const raiz = path.join(__dirname, '..', 'uploads');
    for (const { categoria, modelo, campo } of MIGRACIONES_ARCHIVOS) {
        const prefijoAnterior = `/uploads/${categoria}/`;
        const documentos = await modelo.collection.find({
            [campo]: { $regex: `^${prefijoAnterior.replace(/\//g, '\\/')}` }
        }).project({ [campo]: 1 }).toArray();

        const disponibles = documentos.filter((documento) => {
            const nombre = path.basename(documento[campo]);
            return fs.existsSync(path.join(raiz, String(organizacionId), categoria, nombre))
                || fs.existsSync(path.join(raiz, categoria, nombre));
        });

        resumen.push({
            coleccion: modelo.collection.collectionName,
            campo,
            pendientes: documentos.length,
            convertibles: disponibles.length
        });
        if (!aplicar) continue;

        for (const documento of disponibles) {
            const nombre = path.basename(documento[campo]);
            await modelo.collection.updateOne(
                { _id: documento._id },
                { $set: { [campo]: `/api/archivos/${categoria}/${nombre}` } }
            );
        }
    }
    return resumen;
};

const sincronizarIndices = async () => {
    if (!aplicar) return;
    const modelos = [
        AlertaCorreo,
        Animal,
        AplicacionSanitaria,
        Camada,
        CatalogoFinanciero,
        Notificacion,
        Potrero,
        Finca
    ];
    for (const Modelo of modelos) await Modelo.syncIndexes();
};

const main = async () => {
    await mongoose.connect(URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 5000, autoIndex: false });
    try {
        let organizacion = await asegurarOrganizacion();
        if (!organizacion && !aplicar) {
            organizacion = { _id: new mongoose.Types.ObjectId(), nombre: NOMBRE_ORGANIZACION };
        }

        const colecciones = await migrarColecciones(organizacion._id);
        const finca = await asegurarFincaPrincipal(organizacion);
        const documentosFinca = await migrarDocumentosAFincaPrincipal(organizacion._id, finca?._id);
        const membresias = await migrarMembresias(organizacion._id);
        const archivos = moverArchivos(organizacion._id);
        const urls = await actualizarUrlsArchivos(organizacion._id);
        await sincronizarIndices();

        console.log(JSON.stringify({
            modo: aplicar ? 'APLICADO' : 'REVISION',
            organizacion: { id: organizacion._id, nombre: organizacion.nombre },
            fincaPrincipal: finca?._id || null,
            documentosFinca,
            membresias,
            colecciones,
            archivos,
            urls
        }, null, 2));
    } finally {
        await mongoose.disconnect();
    }
};

main().catch((error) => {
    console.error('Error migrando SaaS por organización:', error);
    process.exitCode = 1;
});
