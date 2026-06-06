require('dotenv').config();

const app = require('./app');
const conectarDB = require('./database');
const { iniciarProgramadorAlertasCorreo } = require('./services/alertasCorreo-service');

// Inicializar el servidor
async function main() {
    try {
        await conectarDB();
        app.listen(app.get('port'), () => {
            console.log('Servidor se esta ejecutando en el puerto:', app.get('port'));
            iniciarProgramadorAlertasCorreo();
        });
    } catch (error) {
        process.exit(1);
    }
}

main();
