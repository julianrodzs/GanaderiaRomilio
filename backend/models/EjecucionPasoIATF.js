const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const ejecucionPasoIATFSchema = new Schema({
    campana: { type: Schema.Types.ObjectId, ref: 'CampanaIATF', required: true },
    pasoPlantilla: { type: Schema.Types.ObjectId, required: true },
    pasoSnapshot: { type: Schema.Types.Mixed, required: true },
    fechaHoraProgramada: { type: Date, required: true },
    ventanaInicio: { type: Date },
    ventanaFin: { type: Date },
    fechaHoraReal: { type: Date },
    responsable: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    animalesAplicados: [{ type: Schema.Types.ObjectId, ref: 'Animal' }],
    productosRealmenteUtilizados: [{
        producto: { type: Schema.Types.ObjectId, ref: 'InsumoReproductivo', required: true },
        nombre: { type: String, required: true },
        cantidad: { type: Number, min: 0, required: true },
        unidad: { type: String, trim: true },
        dosis: { type: String, trim: true },
        lote: { type: String, trim: true },
        vencimiento: { type: Date },
        costoUnitarioSnapshot: { type: Number, min: 0, default: 0 },
        costoTotalSnapshot: { type: Number, min: 0, default: 0 },
        moneda: { type: String, enum: ['CRC', 'USD'], default: 'CRC' }
    }],
    observaciones: { type: String, trim: true },
    estado: { type: String, enum: ['PENDIENTE', 'REALIZADO', 'PARCIAL', 'OMITIDO', 'CANCELADO'], default: 'PENDIENTE' },
    tarea: { type: Schema.Types.ObjectId, ref: 'Tarea' },
    ejecutadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

ejecucionPasoIATFSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
ejecucionPasoIATFSchema.index({ organizacionId: 1, fincaId: 1, campana: 1, fechaHoraProgramada: 1 });
ejecucionPasoIATFSchema.index({ campana: 1, pasoPlantilla: 1 }, { unique: true });

module.exports = model('EjecucionPasoIATF', ejecucionPasoIATFSchema);
