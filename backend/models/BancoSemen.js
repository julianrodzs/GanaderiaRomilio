const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const entero = (extra = {}) => ({ type: Number, min: 0, default: 0, validate: Number.isSafeInteger, ...extra });
const dinero = () => ({ type: Number, min: 0, default: 0 });
const ref = (nombre, requerido = false) => ({ type: Schema.Types.ObjectId, ref: nombre, required: requerido });
const moneda = { type: String, enum: ['CRC', 'USD'], required: true };
const saldoSchema = new Schema({
    reproductivo: entero(), comercial: entero(), asignado: entero(),
    valorReproductivo: dinero(), valorComercial: dinero(), valorAsignado: dinero()
}, { _id: false });
const bancoSchema = new Schema({
    toroId: ref('Animal'), esExterno: { type: Boolean, required: true },
    nombreSemental: { type: String, required: true, trim: true },
    diio: { type: String, trim: true }, diioNormalizado: { type: String, trim: true },
    raza: String, especie: { type: String, enum: ['Bovino', 'Porcino'], required: true },
    tipoSemen: { type: String, enum: ['CONVENCIONAL', 'SEXADO', 'OTRO'], default: 'CONVENCIONAL' },
    stockReproductivo: entero(), stockComercial: entero(), asignadoCampanas: entero(),
    totalIngresado: entero(), totalUsadasIATF: entero(), totalVendidas: entero(), totalMermas: entero(),
    saldos: { CRC: { type: saldoSchema, default: () => ({}) }, USD: { type: saldoSchema, default: () => ({}) } },
    creadoPor: ref('Usuario')
}, { timestamps: true });
bancoSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
bancoSchema.index({ organizacionId: 1, fincaId: 1, toroId: 1 }, { unique: true, partialFilterExpression: { toroId: { $type: 'objectId' } } });
bancoSchema.index({ organizacionId: 1, fincaId: 1, diioNormalizado: 1 }, {
    unique: true, partialFilterExpression: { esExterno: true, diioNormalizado: { $type: 'string' } }
});

const loteSchema = new Schema({
    fichaSemenId: ref('BancoSemen', true), origen: { type: String, enum: ['COMPRA', 'COLECTA_PROPIA', 'MIGRACION'], required: true },
    fecha: { type: Date, required: true }, loteProveedor: String, canastillaTermo: String,
    cantidad: entero({ required: true }), costoUnitario: dinero(), moneda,
    cantidadReproductiva: entero(), cantidadComercial: entero(),
    insumoLegadoId: ref('InsumoReproductivo'), movimientoFinancieroId: ref('MovimientoFinanciero'),
    creadoPor: ref('Usuario')
}, { timestamps: true });
loteSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
loteSchema.index({ organizacionId: 1, fincaId: 1, insumoLegadoId: 1 }, {
    unique: true, partialFilterExpression: { insumoLegadoId: { $type: 'objectId' } }
});

const asignacionSchema = new Schema({
    campanaId: ref('CampanaIATF', true), fichaSemenId: ref('BancoSemen', true),
    cantidadAsignada: entero(), cantidadUsada: entero(), cantidadDevuelta: entero(),
    costoUnitarioAplicado: dinero(), moneda, creadoPor: ref('Usuario'), legado: { type: Boolean, default: false }
}, { timestamps: true });
asignacionSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
asignacionSchema.index({ organizacionId: 1, fincaId: 1, campanaId: 1, fichaSemenId: 1, moneda: 1 });

const movimientoSchema = new Schema({
    fichaSemenId: ref('BancoSemen', true),
    tipo: { type: String, required: true, enum: ['ENTRADA_LOTE', 'ASIGNACION_CAMPANA', 'CONSUMO_INSEMINACION', 'DEVOLUCION_CAMPANA', 'TRASLADO_INTERNO', 'VENTA', 'ANULACION_VENTA', 'AJUSTE', 'MERMA'] },
    origen: { type: String, enum: ['EXTERNO', 'REPRODUCTIVO', 'COMERCIAL', 'CAMPANA', 'CLIENTE', 'MERMA'], required: true },
    destino: { type: String, enum: ['EXTERNO', 'REPRODUCTIVO', 'COMERCIAL', 'CAMPANA', 'CLIENTE', 'MERMA'], required: true },
    cantidad: entero({ required: true }), moneda, costoUnitario: dinero(),
    motivo: String, usuarioId: ref('Usuario'), campanaId: ref('CampanaIATF'),
    asignacionId: ref('AsignacionSemenCampana'), ventaPajillaId: ref('VentaPajilla'),
    loteSemenId: ref('LoteSemen'), eventoId: Schema.Types.ObjectId,
    reversaDe: ref('MovimientoSemen'), claveIdempotencia: { type: String, trim: true, default: undefined }
}, { timestamps: true });
movimientoSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
movimientoSchema.index({ organizacionId: 1, fincaId: 1, claveIdempotencia: 1 }, {
    unique: true, partialFilterExpression: { claveIdempotencia: { $type: 'string' } }
});
movimientoSchema.index({ organizacionId: 1, fincaId: 1, fichaSemenId: 1, createdAt: -1 });
movimientoSchema.index({ organizacionId: 1, fincaId: 1, reversaDe: 1 }, { unique: true, partialFilterExpression: { reversaDe: { $type: 'objectId' } } });
movimientoSchema.pre('validate', function validarMovimiento(next) {
    if (!this.claveIdempotencia?.trim()) this.claveIdempotencia = undefined;
    if (['AJUSTE', 'MERMA', 'TRASLADO_INTERNO'].includes(this.tipo) && !this.motivo?.trim()) {
        return next(new Error('El motivo es obligatorio.'));
    }
    return next();
});
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'bulkWrite'].forEach((operacion) => {
    movimientoSchema.pre(operacion, function inmutable(next) { next(new Error('Los movimientos de semen son inmutables.')); });
});
movimientoSchema.pre('save', function impedirEdicion(next) { next(this.isNew ? undefined : new Error('Los movimientos de semen son inmutables.')); });
movimientoSchema.pre('deleteOne', { document: true, query: false }, function impedirBorrado(next) { next(new Error('Los movimientos de semen son inmutables.')); });

const ventaSchema = new Schema({
    fichaSemenId: ref('BancoSemen', true), nombreSemental: String, diio: String,
    comprador: { type: String, required: true, trim: true }, cantidad: entero({ required: true }),
    precioUnitario: dinero(), moneda, montoTotal: dinero(), fecha: { type: Date, required: true },
    costoUnitarioAplicado: dinero(), movimientoFinancieroId: ref('MovimientoFinanciero'),
    monedaCosto: { type: String, enum: ['CRC', 'USD'] },
    movimientoReversionId: ref('MovimientoFinanciero'),
    estado: { type: String, enum: ['Completada', 'Anulada'], default: 'Completada' },
    motivoAnulacion: String, fechaAnulacion: Date, creadoPor: ref('Usuario'), anuladoPor: ref('Usuario')
}, { timestamps: true });
ventaSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });

module.exports = {
    BancoSemen: model('BancoSemen', bancoSchema),
    LoteSemen: model('LoteSemen', loteSchema),
    AsignacionSemenCampana: model('AsignacionSemenCampana', asignacionSchema),
    MovimientoSemen: model('MovimientoSemen', movimientoSchema),
    VentaPajilla: model('VentaPajilla', ventaSchema)
};
