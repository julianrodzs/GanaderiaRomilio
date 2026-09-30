require('dotenv').config();

const mongoose = require('mongoose');
const conectarDB = require('../database');
const { ejecutarAlertasProgramadas } = require('../services/trabajoProgramado-service');

const main = async () => {
    try {
        await conectarDB();
        const resultado = await ejecutarAlertasProgramadas({ origen: 'cron-cli' });
        console.log(JSON.stringify(resultado, null, 2));
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Fallo el trabajo programado de alertas:', error.message);
        await mongoose.disconnect().catch(() => {});
        process.exit(1);
    }
};

main();
