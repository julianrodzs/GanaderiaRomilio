const { Schema, model } = require('mongoose');

const normalizarTexto = (valor = '') => String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const catalogoFinancieroSchema = new Schema(
    {
        tipo: {
            type: String,
            enum: ['categoria', 'destinoUso'],
            required: true,
            trim: true
        },
        nombre: {
            type: String,
            required: true,
            trim: true
        },
        nombreNormalizado: {
            type: String,
            required: true,
            trim: true
        },
        activo: {
            type: Boolean,
            default: true
        },
        protegido: {
            type: Boolean,
            default: false
        },
        descripcion: {
            type: String,
            trim: true
        }
    },
    {
        timestamps: true
    }
);

catalogoFinancieroSchema.pre('validate', function normalizarCatalogo(next) {
    this.nombreNormalizado = normalizarTexto(this.nombre);
    next();
});

catalogoFinancieroSchema.index({ tipo: 1, nombreNormalizado: 1 }, { unique: true });
catalogoFinancieroSchema.index({ tipo: 1, activo: 1, nombre: 1 });

module.exports = model('CatalogoFinanciero', catalogoFinancieroSchema);
