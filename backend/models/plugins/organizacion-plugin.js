const { Schema, Types } = require('mongoose');
const { obtenerFincaActual, obtenerOrganizacionActual } = require('../../context/organizacion-context');

const ORGANIZACION_SIN_CONTEXTO = '000000000000000000000000';

const OPERACIONES_CON_FILTRO = [
    'countDocuments',
    'deleteMany',
    'deleteOne',
    'distinct',
    'find',
    'findOne',
    'findOneAndDelete',
    'findOneAndReplace',
    'findOneAndUpdate',
    'replaceOne',
    'updateMany',
    'updateOne'
];

const agregarContextoAActualizacion = (actualizacion, organizacionId, fincaId = null) => {
    if (!actualizacion || Array.isArray(actualizacion)) return;

    const usaOperadores = Object.keys(actualizacion).some((clave) => clave.startsWith('$'));
    if (usaOperadores) {
        actualizacion.$setOnInsert = {
            ...(actualizacion.$setOnInsert || {}),
            organizacionId,
            ...(fincaId ? { fincaId } : {})
        };
        return;
    }

    actualizacion.organizacionId = organizacionId;
    if (fincaId) actualizacion.fincaId = fincaId;
};

const aplicarAislamientoOrganizacion = (schema, opciones = {}) => {
    schema.add({
        organizacionId: {
            type: Schema.Types.ObjectId,
            ref: 'Organizacion',
            required: opciones.required !== false,
            index: true
        }
    });

    if (opciones.finca) {
        schema.add({
            fincaId: {
                type: Schema.Types.ObjectId,
                ref: 'Finca',
                required: opciones.fincaRequired !== false,
                index: true
            }
        });
    }

    OPERACIONES_CON_FILTRO.forEach((operacion) => {
        schema.pre(operacion, function aplicarOrganizacion(next) {
            if (this.getOptions()?.omitirAislamientoOrganizacion) return next();

            const organizacionId = obtenerOrganizacionActual();
            if (!organizacionId && opciones.required === false) return next();
            const organizacionConsulta = organizacionId || ORGANIZACION_SIN_CONTEXTO;

            this.setQuery({
                ...this.getFilter(),
                organizacionId: organizacionConsulta,
                ...(opciones.finca && obtenerFincaActual() && !this.getOptions()?.omitirAislamientoFinca
                    ? { fincaId: obtenerFincaActual() }
                    : {})
            });

            if (this.getOptions()?.upsert) {
                const actualizacion = this.getUpdate();
                agregarContextoAActualizacion(
                    actualizacion,
                    organizacionConsulta,
                    opciones.finca ? obtenerFincaActual() : null
                );
                this.setUpdate(actualizacion);
            }

            next();
        });
    });

    schema.pre('aggregate', function aplicarOrganizacionAggregate(next) {
        if (this.options?.omitirAislamientoOrganizacion) return next();

        const organizacionId = obtenerOrganizacionActual();
        if (!organizacionId && opciones.required === false) return next();
        const organizacionConsulta = organizacionId || ORGANIZACION_SIN_CONTEXTO;

        const match = { $match: { organizacionId: new Types.ObjectId(organizacionConsulta) } };
        if (opciones.finca && obtenerFincaActual() && !this.options?.omitirAislamientoFinca) {
            match.$match.fincaId = new Types.ObjectId(obtenerFincaActual());
        }
        const pipeline = this.pipeline();
        const posicion = pipeline[0]?.$geoNear ? 1 : 0;
        pipeline.splice(posicion, 0, match);
        next();
    });

    schema.pre('validate', function asignarOrganizacion(next) {
        if (!this.organizacionId) {
            this.organizacionId = obtenerOrganizacionActual();
        }
        if (opciones.finca && !this.fincaId) {
            this.fincaId = obtenerFincaActual();
        }
        next();
    });

    schema.pre('insertMany', function asignarOrganizacionInsertMany(next, documentos) {
        const organizacionId = obtenerOrganizacionActual();
        const fincaId = obtenerFincaActual();
        if (organizacionId) {
            documentos.forEach((documento) => {
                documento.organizacionId = organizacionId;
                if (opciones.finca && fincaId && !documento.fincaId) documento.fincaId = fincaId;
            });
        }
        next();
    });

    schema.index({ organizacionId: 1, createdAt: -1 });
    if (opciones.finca) schema.index({ organizacionId: 1, fincaId: 1, createdAt: -1 });
};

module.exports = {
    aplicarAislamientoOrganizacion
};
