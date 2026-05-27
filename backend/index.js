require('dotenv').config();

const app = require('./app');
const conectarDB = require('./database');

// Inicializar el servidor
async function main() {
    try {
        await conectarDB();
        app.listen(app.get('port'), () => {
            console.log('Servidor se esta ejecutando en el puerto:', app.get('port'));
        });
    } catch (error) {
        process.exit(1);
    }
}

main();
