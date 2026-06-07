const { Schema, model } = require('mongoose');

const TIPOS_TAREA = [
    'Chapia',
    'Herbicida',
    'Fertilización',
    'Sanidad',
    'Pesaje',
    'Revisión de potrero',
    'Revisión de cerca',
    'Conteo de ganado',
    'Limpieza',
    'Otro'
];

const ESTADOS_TAREA = ['Pendiente', 'En proceso', 'Completada', 'Cancelada'];
const PRIORIDADES_TAREA = ['Baja', 'Media', 'Alta', 'Urgente'];

const tareaSchema = new Schema(
    {
        titulo: { type: String, required: true, trim: true },
        descripcion: { type: String, trim: true },
        tipo: { type: String, enum: TIPOS_TAREA, required: true },
        estado: { type: String, enum: ESTADOS_TAREA, default: 'Pendiente' },
        prioridad: { type: String, enum: PRIORIDADES_TAREA, default: 'Media' },
        fechaProgramada: { type: Date, required: true },
        fechaLimite: { type: Date },
        fechaCompletada: { type: Date },
        asignadoA: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
        creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
        potrero: { type: Schema.Types.ObjectId, ref: 'Potrero' },
        animal: { type: Schema.Types.ObjectId, ref: 'Animal' },
        evidenciaUrl: { type: String, trim: true },
        observaciones: { type: String, trim: true },
        comentarios: [
            {
                usuario: { type: Schema.Types.ObjectId, ref: 'Usuario' },
                texto: { type: String, trim: true },
                fecha: { type: Date, default: Date.now }
            }
        ]
    },
    {
        timestamps: true
    }
);

module.exports = {
    Tarea: model('Tarea', tareaSchema),
    TIPOS_TAREA,
    ESTADOS_TAREA,
    PRIORIDADES_TAREA
};
