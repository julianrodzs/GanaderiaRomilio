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
        branding: {
            logo: { type: Schema.Types.ObjectId, ref: 'ArchivoMultimedia', default: null }
        },
        fincaPrincipal: { type: Schema.Types.ObjectId, ref: 'Finca', default: null },
        modoFacturacion: { type: String, enum: ['MANUAL', 'STRIPE'], default: 'MANUAL' },
        estadoSuscripcion: { type: String, enum: ['PRUEBA', 'ACTIVA', 'POR_VENCER', 'EN_GRACIA', 'VENCIDA', 'SUSPENDIDA', 'CANCELADA'] },
        fechaInicioPeriodoActual: Date,
        fechaFinPeriodoActual: Date,
        fechaProximoVencimiento: Date,
        diasGracia: { type: Number, min: 0, max: 60, default: 5 },
        notasFacturacion: { type: String, trim: true, maxlength: 2000 },
        revisionSuscripcion: { type: Number, default: 0 },
        ultimoPagoSuscripcion: { type: Schema.Types.ObjectId, ref: 'PagoSuscripcion', default: null },
        avisoVencimientoCiclo: { type: String, default: '' },
        avisoCarteraCiclo: { type: String, default: '' },
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
            ultimoPagoFallido: { type: Date, default: null },
            fincasOperativas: [{ type: Schema.Types.ObjectId, ref: 'Finca' }]
        },
        configuracion: { type: Schema.Types.Mixed, default: {} }
    },
    { timestamps: true }
);

organizacionSchema.pre('validate', function prepararVigenciaNueva(next) {
    const { modoFacturacion, establecerPeriodo, sumarMeses, DIA } = require('../services/suscripcion-estado-service');
    if (this.isNew && modoFacturacion(this) === 'MANUAL' && !this.fechaProximoVencimiento) {
        const estadoAnterior = this.plan.estado;
        const inicio = this.fechaInicioPeriodoActual || new Date();
        const fin = this.fechaFinPeriodoActual || (this.plan.estado === 'Prueba' ? new Date(+inicio + 15 * DIA) : sumarMeses(inicio, 1, this.zonaHoraria));
        establecerPeriodo(this, inicio, fin, this.plan.estado === 'Prueba' ? 'Prueba' : 'Activo');
        if (['Suspendido', 'Cancelado'].includes(estadoAnterior)) {
            this.plan.estado = estadoAnterior;
            this.estadoSuscripcion = estadoAnterior === 'Suspendido' ? 'SUSPENDIDA' : 'CANCELADA';
        }
    }
    if (this.fechaProximoVencimiento && this.fechaInicioPeriodoActual && this.fechaProximoVencimiento <= this.fechaInicioPeriodoActual) {
        this.invalidate('fechaProximoVencimiento', 'El vencimiento debe ser posterior al inicio del período.');
    }
    if (this.isModified('fechaProximoVencimiento')) this.fechaFinPeriodoActual = this.fechaProximoVencimiento;
    next();
});
organizacionSchema.index({ modoFacturacion: 1, fechaProximoVencimiento: 1 });

module.exports = model('Organizacion', organizacionSchema);
