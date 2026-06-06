const express = require('express');
const cors = require('cors');
const path = require('path');
const { auth, autorizarRoles } = require('./middleware/auth');
const app = express();
const soloAdministrador = [auth, autorizarRoles('Administrador')];

// configuracion
app.set('port', process.env.PORT || 4000);

// middlewares
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// rutas
app.get('/', (req, res)=>{
    res.send('Bienvenido a la API de GanaderiaRomilio');
});

// rutas principales
app.use('/api/usuarios', require('./routes/usuario'));
app.use('/api/animales', soloAdministrador, require('./routes/animal'));
app.use('/api/potreros', soloAdministrador, require('./routes/potrero'));
app.use('/api/pesajes', soloAdministrador, require('./routes/pesaje'));
app.use('/api/sanidad', soloAdministrador, require('./routes/sanidad'));
app.use('/api/plan-sanitario', soloAdministrador, require('./routes/planSanitario'));
app.use('/api/reproduccion', soloAdministrador, require('./routes/reproduccionRoutes'));
app.use('/api/costos', soloAdministrador, require('./routes/costo'));
app.use('/api/finanzas', soloAdministrador, require('./routes/finanza'));
app.use('/api/rotaciones', soloAdministrador, require('./routes/rotacion'));
app.use('/api/reportes', soloAdministrador, require('./routes/reporte'));
app.use('/api/importar', soloAdministrador, require('./routes/importar'));
app.use('/api/conteo-drone', soloAdministrador, require('./routes/conteoDroneRoutes'));

module.exports = app;
