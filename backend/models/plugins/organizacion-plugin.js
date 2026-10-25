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

const eliminarCampo = (objeto, campo) => {
    if (objeto && Object.prototype.hasOwnProperty.call(objeto, campo)) delete objeto[campo];
};

const protegerTenantActualizacion = (actualizacion, organizacionId, fincaId = null, opciones = {}) => {
    if (!actualizacion || Array.isArray(actualizacion)) return;

    const permitirOrganizacion = opciones.permitirOrganizacionExplicita === true;
    const permitirFinca = opciones.permitirFincaExplicita === true;
    ['$set', '$setOnInsert', '$unset'].forEach((operador) => {
        if (!permitirOrganizacion) eliminarCampo(actualizacion[operador], 'organizacionId');
        if (!permitirFinca) eliminarCampo(actualizacion[operador], 'fincaId');
    });
    if (!permitirOrganizacion) eliminarCampo(actualizacion, 'organizacionId');
    if (!permitirFinca) eliminarCampo(actualizacion, 'fincaId');

    const usaOperadores = Object.keys(actualizacion).some((clave) => clave.startsWith('$'));
    if (usaOperadores) {
        actualizacion.$setOnInsert = {
            ...(actualizacion.$setOnInsert || {}),
            ...(!permitirOrganizacion ? { organizacionId } : {}),
            ...(fincaId && !permitirFinca ? { fincaId } : {})
        };
        return;
    }

    if (!permitirOrganizacion) actualizacion.organizacionId = organizacionId;
    if (fincaId && !permitirFinca) actualizacion.fincaId = fincaId;
};

const filtroContexto = ({ organizacionId, fincaId, conFinca, omitirFinca }) => ({
    organizacionId,
    ...(conFinca && fincaId && !omitirFinca ? { fincaId } : {})
});

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

            if (['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'].includes(operacion)) {
                const actualizacion = this.getUpdate();
                protegerTenantActualizacion(
                    actualizacion,
                    organizacionConsulta,
                    opciones.finca ? obtenerFincaActual() : null,
                    this.getOptions()
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
        const organizacionId = obtenerOrganizacionActual();
        const fincaId = obtenerFincaActual();
        const opcionesGuardado = this.$__?.saveOptions || {};
        if (organizacionId && this.$locals?.permitirOrganizacionExplicita !== true && opcionesGuardado.permitirOrganizacionExplicita !== true) {
            this.organizacionId = organizacionId;
        }
        if (opciones.finca && fincaId && this.$locals?.permitirFincaExplicita !== true && opcionesGuardado.permitirFincaExplicita !== true) {
            this.fincaId = fincaId;
        }
        next();
    });

    schema.pre('insertMany', function asignarOrganizacionInsertMany(next, documentos, opcionesInsert = {}) {
        const organizacionId = obtenerOrganizacionActual();
        const fincaId = obtenerFincaActual();
        if (organizacionId) {
            documentos.forEach((documento) => {
                if (opcionesInsert.permitirOrganizacionExplicita !== true) documento.organizacionId = organizacionId;
                if (opciones.finca && fincaId && opcionesInsert.permitirFincaExplicita !== true) documento.fincaId = fincaId;
            });
        }
        next();
    });

    schema.pre('bulkWrite', function aislarBulkWrite(next, operaciones = [], opcionesBulk = {}) {
        if (opcionesBulk.omitirAislamientoOrganizacion) return next();
        const organizacionId = obtenerOrganizacionActual() || ORGANIZACION_SIN_CONTEXTO;
        const fincaId = obtenerFincaActual();
        const contexto = filtroContexto({
            organizacionId,
            fincaId,
            conFinca: opciones.finca,
            omitirFinca: opcionesBulk.omitirAislamientoFinca
        });

        operaciones.forEach((operacion) => {
            if (operacion.insertOne?.document) {
                const documento = operacion.insertOne.document;
                if (opcionesBulk.permitirOrganizacionExplicita !== true) documento.organizacionId = organizacionId;
                if (opciones.finca && fincaId && opcionesBulk.permitirFincaExplicita !== true) documento.fincaId = fincaId;
                return;
            }
            ['updateOne', 'updateMany'].forEach((tipo) => {
                if (!operacion[tipo]) return;
                operacion[tipo].filter = { ...(operacion[tipo].filter || {}), ...contexto };
                protegerTenantActualizacion(operacion[tipo].update, organizacionId, fincaId, opcionesBulk);
            });
            if (operacion.replaceOne) {
                operacion.replaceOne.filter = { ...(operacion.replaceOne.filter || {}), ...contexto };
                const reemplazo = operacion.replaceOne.replacement || {};
                if (opcionesBulk.permitirOrganizacionExplicita !== true) reemplazo.organizacionId = organizacionId;
                if (opciones.finca && fincaId && opcionesBulk.permitirFincaExplicita !== true) reemplazo.fincaId = fincaId;
            }
            ['deleteOne', 'deleteMany'].forEach((tipo) => {
                if (operacion[tipo]) operacion[tipo].filter = { ...(operacion[tipo].filter || {}), ...contexto };
            });
        });
        next();
    });

    schema.index({ organizacionId: 1, createdAt: -1 });
    if (opciones.finca) schema.index({ organizacionId: 1, fincaId: 1, createdAt: -1 });
};

module.exports = {
    aplicarAislamientoOrganizacion
};
