require('dotenv').config();
const conectarDB = require('../database');
const { ejecutarResumenesEmailProgramados } = require('../services/trabajoProgramado-service');

const main = async () => {
    await conectarDB();
    const resultado = await ejecutarResumenesEmailProgramados({ origen: 'cron-cli' });
    console.log(JSON.stringify(resultado, null, 2));
};

main().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
});
