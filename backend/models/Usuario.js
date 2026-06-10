const { Schema, model } = require('mongoose');

const usuarioSchema = new Schema(
    {
        nombre: { type: String, required: true, trim: true },
        apellido: { type: String, trim: true },
        correo: { type: String, required: true, unique: true, lowercase: true, trim: true },
        contrasena: { type: String, required: true },
        telefono: { type: String, trim: true },
        rol: {
            type: String,
            enum: ['Administrador', 'Encargado', 'Consulta'],
            default: 'Encargado'
        },
        estado: {
            type: String,
            enum: ['Activo', 'Inactivo'],
            default: 'Activo'
        },
        ultimoAcceso: { type: Date },
        resetPasswordToken: { type: String },
        resetPasswordExpires: { type: Date },
        resetPasswordRequestedAt: { type: Date },
        resetPasswordRequestIp: { type: String }
    },
    {
        timestamps: true
    }
);

usuarioSchema.index({ rol: 1 });
usuarioSchema.index({ estado: 1 });

module.exports = model('Usuario', usuarioSchema);
