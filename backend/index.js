require('dotenv').config();

const app = require('./app');
const conectarDB = require('./database');
const { validarConfiguracionArranque } = require('./config/env');
const { iniciarProgramadorAlertas } = require('./services/trabajoProgramado-service');

// Inicializar el servidor
async function main() {
    try {
        validarConfiguracionArranque();
        await conectarDB();
        app.listen(app.get('port'), () => {
            console.log('Servidor se esta ejecutando en el puerto:', app.get('port'));
            iniciarProgramadorAlertas();
        });
    } catch (error) {
        console.error('No se pudo iniciar el servidor:', error.message);
        process.exit(1);
    }
}

main();
