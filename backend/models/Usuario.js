const {Schema, model} = require('mongoose');

const usuarioSchema = new Schema ({
    nombre: {type: String, required: true},
    apellido: {type: String, required: true},
    correo: {type: String, required: true},
    contrasena: {type: String, required: true},
    telefono: {type: Number, required: true},
    rol: {
        type: String,
        enum: ['Administrador', 'Encargado', 'Consulta'],
        default: 'Administrador'
    },
    recuperacionContrasenaToken: {type: String},
    recuperacionContrasenaExpira: {type: Date},
},
{
    timestamps: true
})

module.exports = model('Usuario', usuarioSchema);
