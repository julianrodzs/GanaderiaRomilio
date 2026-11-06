const Organizacion = require('../models/Organizacion');
const PagoSuscripcion = require('../models/PagoSuscripcion');

const prepararIndices = async () => {
    // Aditivo: no syncIndexes, eliminacion de indices ni cambios a cuentas existentes.
    await Organizacion.createIndexes();
    await PagoSuscripcion.createIndexes();
    return { modelos: ['Organizacion', 'PagoSuscripcion'], datosModificados: 0 };
};
const main = async () => {
    require('dotenv').config();
    process.env.MONGODB_AUTO_INDEX = 'false';
    await require('../database')();
    const resultado = await prepararIndices();
    const pendientes = await Organizacion.find({ modoFacturacion: { $ne: 'STRIPE' }, 'plan.proveedorPago': { $ne: 'Stripe' }, fechaProximoVencimiento: null })
        .select('_id nombre slug plan.codigo').lean();
    console.log(JSON.stringify({ ...resultado, cuentasConVigenciaPorConfigurar: pendientes }, null, 2));
};
if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => require('mongoose').disconnect());
module.exports = { prepararIndices };
