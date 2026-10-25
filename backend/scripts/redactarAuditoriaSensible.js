require('dotenv').config();
const mongoose = require('mongoose');
const Auditoria = require('../models/Auditoria');
const { sanitizar } = require('../middleware/auditoria');

const aplicar = process.argv.includes('--apply');

const main = async () => {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI no configurado');
    await mongoose.connect(process.env.MONGODB_URI);
    const cursor = Auditoria.find({}).setOptions({ omitirAislamientoOrganizacion: true }).cursor();
    let revisados = 0;
    let modificados = 0;
    for await (const registro of cursor) {
        revisados += 1;
        const datos = sanitizar(registro.datos);
        if (JSON.stringify(datos) === JSON.stringify(registro.datos)) continue;
        modificados += 1;
        if (aplicar) {
            await Auditoria.updateOne(
                { _id: registro._id },
                { $set: { datos } },
                { omitirAislamientoOrganizacion: true, permitirRedaccionAuditoria: true }
            );
        }
    }
    if (aplicar) {
        await Auditoria.create({
            accion: 'REDACTAR', modulo: 'Administracion SaaS', metodo: 'SCRIPT',
            ruta: 'scripts/redactarAuditoriaSensible.js',
            descripcion: 'Redacción de datos sensibles',
            datos: { registrosRevisados: revisados, registrosRedactados: modificados },
            estado: 'Exitoso', codigoRespuesta: 200
        });
    }
    console.log(JSON.stringify({ modo: aplicar ? 'APLICADO' : 'SOLO_LECTURA', revisados, modificados }, null, 2));
};

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(() => mongoose.disconnect());
