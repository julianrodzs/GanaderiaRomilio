const express = require('express');
const cors = require('cors');
const path = require('path');
const { auth } = require('./middleware/auth');
const { auditoriaPeticiones } = require('./middleware/auditoria');
const app = express();

// configuracion
app.set('port', process.env.PORT || 4000);

// middlewares
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use(auditoriaPeticiones);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// rutas
app.get('/', (req, res)=>{
    res.send('Bienvenido a la API de GanaderiaRomilio');
});

// rutas principales
app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', require('./routes/usuario'));
app.use('/api/auditoria', auth, require('./routes/auditoriaRoutes'));
app.use('/api/notificaciones', auth, require('./routes/notificacionRoutes'));
app.use('/api/tareas', require('./routes/tareaRoutes'));
app.use('/api/animales', auth, require('./routes/animal'));
app.use('/api/camadas', auth, require('./routes/camadaRoutes'));
app.use('/api/genealogia', auth, require('./routes/genealogiaRoutes'));
app.use('/api/eventos-animal', auth, require('./routes/eventoAnimalRoutes'));
app.use('/api/eventos-camada', auth, require('./routes/eventoCamadaRoutes'));
app.use('/api/potreros', auth, require('./routes/potrero'));
app.use('/api/pesajes', auth, require('./routes/pesaje'));
app.use('/api/sanidad', auth, require('./routes/sanidad'));
app.use('/api/plan-sanitario', auth, require('./routes/planSanitario'));
app.use('/api/tratamientos-sanitarios', auth, require('./routes/tratamientoSanitarioRoutes'));
app.use('/api/aplicaciones-sanitarias', auth, require('./routes/aplicacionSanitariaRoutes'));
app.use('/api/reproduccion', auth, require('./routes/reproduccionRoutes'));
app.use('/api/costos', auth, require('./routes/costo'));
app.use('/api/finanzas', auth, require('./routes/finanza'));
app.use('/api/ventas', auth, require('./routes/ventaAnimalRoutes'));
app.use('/api/compras', auth, require('./routes/compraAnimalRoutes'));
app.use('/api/rotaciones', auth, require('./routes/rotacion'));
app.use('/api/reportes', auth, require('./routes/reporte'));
app.use('/api/importar', auth, require('./routes/importar'));
app.use('/api/conteo-drone', auth, require('./routes/conteoDroneRoutes'));

module.exports = app;
