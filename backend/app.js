const express = require('express');
const cors = require('cors');
const path = require('path');
const { auth } = require('./middleware/auth');
const app = express();

// configuracion
app.set('port', process.env.PORT || 4000);

// middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// rutas
app.get('/', (req, res)=>{
    res.send('Bienvenido a la API de GanaderiaRomilio');
});

// rutas principales
app.use('/api/usuarios', require('./routes/usuario'));
app.use('/api/animales', auth, require('./routes/animal'));
app.use('/api/potreros', auth, require('./routes/potrero'));
app.use('/api/pesajes', auth, require('./routes/pesaje'));
app.use('/api/sanidad', auth, require('./routes/sanidad'));
app.use('/api/plan-sanitario', auth, require('./routes/planSanitario'));
app.use('/api/costos', auth, require('./routes/costo'));
app.use('/api/finanzas', auth, require('./routes/finanza'));
app.use('/api/rotaciones', auth, require('./routes/rotacion'));
app.use('/api/reportes', auth, require('./routes/reporte'));
app.use('/api/importar', auth, require('./routes/importar'));
app.use('/api/conteo-drone', auth, require('./routes/conteoDroneRoutes'));

module.exports = app;
