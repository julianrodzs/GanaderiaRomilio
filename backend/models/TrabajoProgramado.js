const { Schema, model } = require('mongoose');

const trabajoProgramadoSchema = new Schema(
    {
        clave: { type: String, required: true, unique: true, trim: true },
        estado: {
            type: String,
            enum: ['Disponible', 'Ejecutando', 'Completado', 'Error'],
            default: 'Disponible'
        },
        tokenBloqueo: { type: String, default: null },
        bloqueadoHasta: { type: Date, default: null },
        ultimaEjecucionInicio: { type: Date, default: null },
        ultimaEjecucionFin: { type: Date, default: null },
        ultimoOrigen: { type: String, trim: true },
        ultimoResultado: { type: Schema.Types.Mixed, default: null },
        ultimoError: { type: String, default: '' }
    },
    { timestamps: true }
);

module.exports = model('TrabajoProgramado', trabajoProgramadoSchema);
