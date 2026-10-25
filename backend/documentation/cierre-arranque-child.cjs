// Preload del ensayo: evita dotenv y detecta cualquier intento real de escuchar.
// Solo se utiliza desde cierre-standalone.cjs con variables sinteticas.
const dotenv = require('dotenv');
dotenv.config = () => ({});
const app = require('../app');
const listen = app.listen.bind(app);
app.listen = (...args) => {
    console.log('HTTP_LISTEN_ATTEMPT');
    return listen(...args);
};
