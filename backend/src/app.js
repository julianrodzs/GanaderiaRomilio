const express = require('express');
const cors = require('cors');
const app = express();

//configuracion
app.set('port', process.env.PORT || 4000);

//middlewares
app.use(cors());
app.use(express.json());

//rutas
app.get('/', (req, res)=>{
    res.send('Bienvenido a mi api rest full');
});

//rutas usuarios
app.use('/api/usuarios', require('./routes/usuario'));

module.exports = app;