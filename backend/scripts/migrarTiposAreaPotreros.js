require('dotenv').config();
const mongoose = require('mongoose');
const Potrero = require('../models/Potrero');

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI || process.env.DB_URI);
    const aplicar = process.argv.includes('--apply');
    const filtro = { tipoArea: { $exists: false } };
    const pendientes = await Potrero.countDocuments(filtro, {
        omitirAislamientoOrganizacion: true,
        omitirAislamientoFinca: true
    });
    console.log(`Potreros sin tipo de área: ${pendientes}`);
    if (!aplicar) {
        console.log('Vista previa. Use --apply para asignar PASTOREO.');
        await mongoose.disconnect();
        return;
    }
    const resultado = await Potrero.updateMany(
        filtro,
        { $set: { tipoArea: 'PASTOREO' } },
        { omitirAislamientoOrganizacion: true, omitirAislamientoFinca: true }
    );
    console.log(`Potreros migrados a PASTOREO: ${resultado.modifiedCount}`);
    await mongoose.disconnect();
};

ejecutar().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exitCode = 1;
});
