const { Schema, model } = require('mongoose');

const organizacionSchema = new Schema(
    {
        nombre: { type: String, required: true, trim: true },
        razonSocial: { type: String, trim: true },
        slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
        pais: { type: String, default: 'Costa Rica', trim: true },
        zonaHoraria: { type: String, default: 'America/Costa_Rica', trim: true },
        estado: {
            type: String,
            enum: ['Activa', 'Suspendida', 'Inactiva'],
            default: 'Activa',
            index: true
        },
        fincaPrincipal: { type: Schema.Types.ObjectId, ref: 'Finca', default: null },
        plan: {
            codigo: {
                type: String,
                enum: ['ESENCIAL', 'GESTION', 'PRO', 'PREMIUM'],
                default: 'ESENCIAL'
            },
            especiePlan: {
                type: String,
                enum: ['Bovino', 'Porcino', null],
                default: null
            },
            estado: {
                type: String,
                enum: ['Activo', 'Prueba', 'Suspendido', 'Cancelado'],
                default: 'Activo'
            },
            fechaAsignacion: { type: Date, default: Date.now },
            referenciaExterna: { type: String, trim: true },
            proveedorPago: { type: String, enum: ['Stripe', null], default: null },
            clientePagoId: { type: String, trim: true },
            suscripcionPagoId: { type: String, trim: true },
            fechaRenovacion: { type: Date, default: null },
            fechaExpiracion: { type: Date, default: null },
            ultimoPagoFallido: { type: Date, default: null }
        },
        configuracion: { type: Schema.Types.Mixed, default: {} }
    },
    { timestamps: true }
);

module.exports = model('Organizacion', organizacionSchema);
