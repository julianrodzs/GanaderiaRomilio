require('dotenv').config()

const app = require('./app')
require('./database')

// Inicializar el servidor
async function main() {
    await app.listen(app.get('port'));
    console.log('Servidor se esta ejecutando en el puerto:', app.get('port'));
}

main();