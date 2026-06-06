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
        recuperacionContrasenaToken: { type: String },
        recuperacionContrasenaExpira: { type: Date }
    },
    {
        timestamps: true
    }
);

module.exports = model('Usuario', usuarioSchema);
