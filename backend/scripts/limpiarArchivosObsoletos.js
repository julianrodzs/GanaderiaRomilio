require('dotenv').config();

const mongoose = require('mongoose');
const Animal = require('../models/Animal');
const CompraAnimal = require('../models/CompraAnimal');
const Costo = require('../models/Costo');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const { Tarea } = require('../models/Tarea');
const VentaAnimal = require('../models/VentaAnimal');

const aplicar = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI || 'mongodb://localhost/dataganado';
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';

const camposObsoletos = [
    { nombre: 'Animales', modelo: Animal, campo: 'fotoUrl' },
    { nombre: 'Compras', modelo: CompraAnimal, campo: 'comprobanteUrl' },
    { nombre: 'Ventas', modelo: VentaAnimal, campo: 'comprobanteUrl' },
    { nombre: 'Movimientos financieros', modelo: MovimientoFinanciero, campo: 'comprobante' },
    { nombre: 'Costos legados', modelo: Costo, campo: 'comprobante' },
    { nombre: 'Tareas', modelo: Tarea, campo: 'evidenciaUrl' }
];

const ejecutar = async () => {
    await mongoose.connect(URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 10_000, autoIndex: false });
    const resultados = [];

    for (const item of camposObsoletos) {
        const filtro = { [item.campo]: { $exists: true } };
        const encontrados = await item.modelo.collection.countDocuments(filtro);
        let modificados = 0;

        if (aplicar && encontrados > 0) {
            const resultado = await item.modelo.collection.updateMany(filtro, { $unset: { [item.campo]: '' } });
            modificados = resultado.modifiedCount;
        }

        resultados.push({
            coleccion: item.nombre,
            campo: item.campo,
            encontrados,
            modificados
        });
    }

    console.log(JSON.stringify({
        modo: aplicar ? 'APLICADO' : 'REVISION',
        nota: 'No elimina documentos ni archivos fisicos. Las imagenes del conteo por dron no se modifican.',
        totalEncontrados: resultados.reduce((total, item) => total + item.encontrados, 0),
        totalModificados: resultados.reduce((total, item) => total + item.modificados, 0),
        resultados
    }, null, 2));
};

ejecutar()
    .catch((error) => {
        console.error('No se pudo limpiar los campos de archivos obsoletos:', error);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
