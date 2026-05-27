const express = require('express');
const cors = require('cors');
const app = express();

// configuracion
app.set('port', process.env.PORT || 4000);

// middlewares
app.use(cors());
app.use(express.json());

// rutas
app.get('/', (req, res)=>{
    res.send('Bienvenido a la API de GanaderiaRomilio');
});

// rutas principales
app.use('/api/usuarios', require('./routes/usuario'));
app.use('/api/animales', require('./routes/animal'));
app.use('/api/potreros', require('./routes/potrero'));
app.use('/api/pesajes', require('./routes/pesaje'));
app.use('/api/sanidad', require('./routes/sanidad'));
app.use('/api/costos', require('./routes/costo'));
app.use('/api/rotaciones', require('./routes/rotacion'));
app.use('/api/conteo-drone', require('./routes/conteoDrone'));

module.exports = app;
