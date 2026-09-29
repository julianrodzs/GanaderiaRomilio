const { Schema, model } = require('mongoose');

const ROLES = ['Administrador', 'Encargado', 'Trabajador', 'Veterinario', 'Contador', 'Consulta'];

const membresiaSchema = new Schema(
    {
        organizacionId: { type: Schema.Types.ObjectId, ref: 'Organizacion', required: true, index: true },
        usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
        rol: { type: String, enum: ROLES, default: 'Encargado' },
        estado: { type: String, enum: ['Activo', 'Inactivo'], default: 'Activo' },
        esPrincipal: { type: Boolean, default: false },
        accesoTodasFincas: { type: Boolean, default: true },
        fincas: [{ type: Schema.Types.ObjectId, ref: 'Finca' }]
    },
    { timestamps: true }
);

membresiaSchema.index({ organizacionId: 1, usuario: 1 }, { unique: true });
membresiaSchema.index({ organizacionId: 1, rol: 1, estado: 1 });
membresiaSchema.index({ usuario: 1, estado: 1, esPrincipal: -1 });

module.exports = {
    Membresia: model('Membresia', membresiaSchema),
    ROLES_MEMBRESIA: ROLES
};
