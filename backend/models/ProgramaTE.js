const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');
const vinculo = (ref) => ({ type: Schema.Types.ObjectId, ref });
const loteSchema = new Schema({
    origenLote: { type: String, enum: ['PRODUCCION_PROPIA', 'COMPRA'], required: true },
    colectaId: vinculo('ProgramaTransferencia'), origenEmbrion: { type: String, enum: ['IN_VIVO', 'FIV'], required: true },
    donanteId: vinculo('Animal'), donanteExterna: { nombre: String, diio: String, raza: String, registro: String },
    padreId: vinculo('Animal'), padreExterno: { nombre: String, diio: String, raza: String },
    estadoConservacion: { type: String, enum: ['FRESCO', 'CONGELADO', 'VITRIFICADO'], required: true },
    calidadGrado: { type: Number, enum: [1, 2, 3] },
    estadio: { type: String, enum: ['MORULA', 'BLASTOCISTO_TEMPRANO', 'BLASTOCISTO', 'BLASTOCISTO_EXPANDIDO', 'OTRO'] },
    canastillaTermo: String, codigoLote: { type: String, required: true },
    costoUnitario: { type: Number, min: 0, required: true }, moneda: { type: String, enum: ['CRC', 'USD'], required: true },
    costosUnitarios: { CRC: { type: Number, min: 0, default: 0 }, USD: { type: Number, min: 0, default: 0 } },
    claveEntrada: String,
    stockReproductivo: { type: Number, min: 0, default: 0 }, stockComercial: { type: Number, min: 0, default: 0 }, asignadoCampanas: { type: Number, min: 0, default: 0 },
    totalIngresados: { type: Number, min: 0, default: 0 }, totalTransferidos: { type: Number, min: 0, default: 0 }, totalVendidos: { type: Number, min: 0, default: 0 }, totalMermas: { type: Number, min: 0, default: 0 }
}, { timestamps: true });
loteSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
loteSchema.index({ organizacionId: 1, fincaId: 1, codigoLote: 1 }, { unique: true });
loteSchema.index({ organizacionId: 1, fincaId: 1, claveEntrada: 1 }, { unique: true, partialFilterExpression: { claveEntrada: { $type: 'string' } } });
const movimientoSchema = new Schema({
    loteId: { ...vinculo('LoteEmbrion'), required: true }, tipo: { type: String, enum: ['ENTRADA_COLECTA', 'ENTRADA_COMPRA', 'ASIGNACION_CAMPANA', 'TRANSFERENCIA_RECEPTORA', 'DEVOLUCION_CAMPANA', 'TRASLADO_GAVETA', 'VENTA', 'ANULACION_VENTA', 'MERMA'], required: true },
    origen: String, destino: String, cantidad: { type: Number, min: 1, required: true }, motivo: String,
    usuarioId: vinculo('Usuario'), campanaId: vinculo('CampanaTE'), ventaId: vinculo('VentaEmbrion'), registroId: vinculo('RegistroReproductivo'), claveIdempotencia: String
}, { timestamps: true });
movimientoSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
movimientoSchema.index({ organizacionId: 1, fincaId: 1, claveIdempotencia: 1 }, { unique: true, partialFilterExpression: { claveIdempotencia: { $type: 'string' } } });
movimientoSchema.index({ organizacionId: 1, fincaId: 1, loteId: 1, createdAt: -1 });
const inmutable = () => { throw new Error('Los movimientos de embriones son inmutables; registre una operacion inversa.'); };
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'bulkWrite']) movimientoSchema.pre(op, inmutable);
movimientoSchema.pre('save', function () { if (!this.isNew) inmutable(); });
movimientoSchema.pre('deleteOne', { document: true, query: false }, inmutable);
const campanaSchema = new Schema({
    nombre: { type: String, required: true }, fechaInicio: { type: Date, required: true }, responsable: { ...vinculo('Usuario'), required: true },
    estado: { type: String, enum: ['ACTIVA', 'CERRADA', 'CANCELADA'], default: 'ACTIVA' },
    protocoloSnapshot: { type: Schema.Types.Mixed, required: true },
    pasos: [{ pasoId: String, nombre: String, tipoAccion: String, fechaProgramada: Date, fechaReal: Date, tareaId: vinculo('Tarea'), estado: { type: String, enum: ['PENDIENTE', 'REALIZADO'], default: 'PENDIENTE' }, productos: [Schema.Types.Mixed] }],
    receptoras: [{ animal: { ...vinculo('Animal'), required: true }, evaluacionCL: { type: String, enum: ['APTA', 'NO_APTA', 'PENDIENTE'], default: 'PENDIENTE' },
        ladoOvario: { type: String, enum: ['IZQUIERDO', 'DERECHO'] }, calidadCL: String, fechaEvaluacion: Date,
        loteId: vinculo('LoteEmbrion'), registroId: vinculo('RegistroReproductivo'), fechaTransferencia: Date,
        tecnico: String, edadEmbrionDias: { type: Number, min: 0, max: 30, default: 7 } }],
    asignaciones: [{ loteId: vinculo('LoteEmbrion'), cantidad: Number, usadas: { type: Number, default: 0 }, devueltas: { type: Number, default: 0 } }],
    costos: [{ concepto: String, monto: { type: Number, min: 0 }, moneda: { type: String, enum: ['CRC', 'USD'] } }],
    revision: { type: Number, default: 0 }, claveIdempotencia: String, motivoCierre: String, creadoPor: vinculo('Usuario')
}, { timestamps: true, optimisticConcurrency: true });
campanaSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
campanaSchema.index({ organizacionId: 1, fincaId: 1, estado: 1, fechaInicio: -1 });
campanaSchema.index({ organizacionId: 1, fincaId: 1, claveIdempotencia: 1 }, { unique: true, partialFilterExpression: { claveIdempotencia: { $type: 'string' } } });
const ventaSchema = new Schema({
    loteId: { ...vinculo('LoteEmbrion'), required: true }, comprador: { type: String, required: true }, cantidad: { type: Number, min: 1, required: true },
    precioUnitario: { type: Number, min: 0, required: true }, montoTotal: { type: Number, min: 0, required: true }, moneda: { type: String, enum: ['CRC', 'USD'], required: true },
    fecha: { type: Date, required: true }, estado: { type: String, enum: ['Completada', 'Anulada'], default: 'Completada' },
    movimientoFinancieroId: vinculo('MovimientoFinanciero'), movimientoReversionId: vinculo('MovimientoFinanciero'), motivoAnulacion: String, fechaAnulacion: Date, creadoPor: vinculo('Usuario')
}, { timestamps: true });
ventaSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
ventaSchema.index({ organizacionId: 1, fincaId: 1, fecha: -1 });
module.exports = { LoteEmbrion: model('LoteEmbrion', loteSchema), MovimientoEmbrion: model('MovimientoEmbrion', movimientoSchema), CampanaTE: model('CampanaTE', campanaSchema), VentaEmbrion: model('VentaEmbrion', ventaSchema) };
