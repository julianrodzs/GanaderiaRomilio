const { Schema, model } = require('mongoose');
const { despuesDeDias, DIAS_PURGA_INVITACION, ESTADOS_INVITACION_TEMPORAL } = require('../services/retencionDatos-service');

const invitacionSchema = new Schema({
    organizacionId: { type: Schema.Types.ObjectId, ref: 'Organizacion', required: true, index: true },
    correo: { type: String, required: true, lowercase: true, trim: true },
    usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    nombre: { type: String, trim: true },
    apellido: { type: String, trim: true },
    telefono: { type: String, trim: true },
    rol: { type: String, required: true },
    estadoMembresia: { type: String, enum: ['Activo', 'Inactivo'], default: 'Activo' },
    accesoTodasFincas: { type: Boolean, default: true },
    fincas: [{ type: Schema.Types.ObjectId, ref: 'Finca' }],
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiraEn: { type: Date, required: true, index: true },
    purgarEn: { type: Date, select: false },
    estado: { type: String, enum: ['Pendiente', 'Aceptada', 'Revocada', 'Expirada'], default: 'Pendiente', index: true },
    requiereContrasena: { type: Boolean, default: false },
    esActivacionOrganizacion: { type: Boolean, default: false, immutable: true },
    aceptadaEn: { type: Date },
    invitadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true }
}, { timestamps: true });

invitacionSchema.pre('validate', function () {
    if (this.expiraEn && ESTADOS_INVITACION_TEMPORAL.includes(this.estado)) {
        this.purgarEn = despuesDeDias(this.expiraEn, DIAS_PURGA_INVITACION);
    }
});
invitacionSchema.index({ purgarEn: 1 }, {
    expireAfterSeconds: 0, partialFilterExpression: { estado: { $in: ESTADOS_INVITACION_TEMPORAL } }
});

invitacionSchema.index(
    { organizacionId: 1, correo: 1, estado: 1 },
    { unique: true, partialFilterExpression: { estado: 'Pendiente' } }
);

module.exports = model('Invitacion', invitacionSchema);
