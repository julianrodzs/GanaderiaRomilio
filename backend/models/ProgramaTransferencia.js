const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');
const schema = new Schema({
    nombre: { type: String, required: true, trim: true },
    versionProgramaTE: Number,
    estadoProduccion: { type: String, enum: ['PLANIFICADA', 'FINALIZADA'] },
    tareasDonante: [{ type: Schema.Types.ObjectId, ref: 'Tarea' }],
    tipoProduccion: { type: String, enum: ['IN_VIVO', 'FIV'] },
    donanteExterna: { nombre: String, diio: String, raza: String, registro: String },
    padreExterno: { nombre: String, diio: String, raza: String },
    fichaSemenId: { type: Schema.Types.ObjectId, ref: 'BancoSemen' },
    semenPlanificado: { cantidad: Number, moneda: { type: String, enum: ['CRC', 'USD'] } },
    semenConsumido: { type: Boolean, default: false },
    tecnico: String, laboratorio: String,
    estructurasRecuperadas: { type: Number, min: 0 },
    embrionesViables: { type: Number, min: 0 },
    embrionesDegenerados: { type: Number, min: 0 },
    costos: [{ concepto: String, monto: { type: Number, min: 0 }, moneda: { type: String, enum: ['CRC', 'USD'] } }],
    protocoloDonante: { type: Schema.Types.Mixed },
    ejecucionesDonante: [{ pasoId: String, fecha: Date, productos: [Schema.Types.Mixed], usuarioId: Schema.Types.ObjectId }],
    lotesBanco: [{ type: Schema.Types.ObjectId, ref: 'LoteEmbrion' }],
    migradoBancoEmbriones: { type: Boolean, default: false },
    fechaColecta: { type: Date, required: true },
    donanteId: { type: Schema.Types.ObjectId, ref: 'Animal' },
    donanteExternaNombre: String, donanteRegistro: String, donanteRaza: String,
    padreId: { type: Schema.Types.ObjectId, ref: 'Animal' }, padreExternoNombre: String, diioPadre: String,
    origenEmbrion: { type: String, enum: ['IN_VIVO', 'FIV'], required: true },
    costoTotal: { type: Number, min: 0, required: true }, moneda: { type: String, enum: ['CRC', 'USD'], required: true },
    embriones: [{ codigo: { type: String, required: true }, estadoEmbrion: { type: String, enum: ['FRESCO', 'CONGELADO', 'VITRIFICADO'], required: true }, grado: String, estadio: String,
        estado: { type: String, enum: ['DISPONIBLE', 'RESERVADO', 'TRANSFERIDO'], default: 'DISPONIBLE' },
        receptoraId: { type: Schema.Types.ObjectId, ref: 'Animal' }, fechaProgramada: Date,
        responsable: { type: Schema.Types.ObjectId, ref: 'Usuario' }, tareaId: { type: Schema.Types.ObjectId, ref: 'Tarea' },
        sincronizacion: [{ actividad: String, fecha: Date, tareaId: { type: Schema.Types.ObjectId, ref: 'Tarea' } }],
        registroReproductivoId: { type: Schema.Types.ObjectId, ref: 'RegistroReproductivo' }
    }], creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }, claveIdempotencia: String
}, { timestamps: true, optimisticConcurrency: true });
schema.plugin(aplicarAislamientoOrganizacion, { finca: true });
schema.index({ organizacionId: 1, fincaId: 1, fechaColecta: -1 });
schema.index({ organizacionId: 1, fincaId: 1, claveIdempotencia: 1 }, { unique: true, partialFilterExpression: { claveIdempotencia: { $type: 'string' } } });
module.exports = model('ProgramaTransferencia', schema);
