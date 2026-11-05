require('dotenv').config();
const mongoose = require('mongoose');
const conectarDB = require('../database');
const { ejecutarResumenesEmailProgramados } = require('../services/trabajoProgramado-service');

const main = async () => {
    await conectarDB();
    const resultado = await ejecutarResumenesEmailProgramados({ origen: 'cron-cli' });
    console.log(JSON.stringify(resultado, null, 2));
};

main().then(async () => {
    await mongoose.disconnect();
    process.exit(0);
}).catch(async (error) => {
    console.error('Fallo el trabajo programado de resumenes:', error.message);
    if (error.resultado) console.error(JSON.stringify(error.resultado, null, 2));
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
