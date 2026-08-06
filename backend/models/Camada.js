const { Schema, model } = require('mongoose');

const ESTADOS_CAMADA = ['Activa', 'Destetada', 'Vendida', 'Cerrada', 'Cancelada'];
const DESTINOS_CAMADA = ['Se quedan', 'Se venden', 'Engorde', 'Mixto', 'No definido'];

const camadaSchema = new Schema(
    {
        madre: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
        registroReproductivo: { type: Schema.Types.ObjectId, ref: 'RegistroReproductivo' },
        codigoCamada: { type: String, required: true, unique: true, trim: true },
        fechaNacimiento: { type: Date, required: true },
        fechaDesteteEstimada: { type: Date },
        fechaDesteteReal: { type: Date },
        nacidosTotales: { type: Number, min: 0, default: 0 },
        nacidosVivos: { type: Number, min: 0, default: 0 },
        nacidosMuertos: { type: Number, min: 0, default: 0 },
        momias: { type: Number, min: 0, default: 0 },
        destetados: { type: Number, min: 0, default: 0 },
        muertosPreDestete: { type: Number, min: 0, default: 0 },
        destino: { type: String, enum: DESTINOS_CAMADA, default: 'No definido' },
        estado: { type: String, enum: ESTADOS_CAMADA, default: 'Activa' },
        pesoPromedioNacimiento: { type: Number, min: 0 },
        pesoPromedioDestete: { type: Number, min: 0 },
        pesoTotalDestete: { type: Number, min: 0 },
        tareasGeneradas: [
            {
                tarea: { type: Schema.Types.ObjectId, ref: 'Tarea' },
                tipoTarea: { type: String, trim: true }
            }
        ],
        observaciones: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

camadaSchema.index({ madre: 1, fechaNacimiento: -1 });
camadaSchema.index({ registroReproductivo: 1 });
camadaSchema.index({ estado: 1, destino: 1 });

module.exports = model('Camada', camadaSchema);
