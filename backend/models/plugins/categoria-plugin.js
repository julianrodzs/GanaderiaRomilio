const { fechaProximoCambioCategoria, obtenerCategoriaAnimal } = require('../../services/categoriaAnimal-service');
const relevantes = ['fechaNacimiento', 'sexo', 'especie', 'estado', 'categoria'];
const marcador = 'fechaProximoCambioCategoria';
const tocaCategoria = (datos = {}) => relevantes.some((campo) => Object.hasOwn(datos, campo));
const prepararAgenda = (doc) => {
    if (!doc.estado || doc.estado === 'Activo') doc.categoria = obtenerCategoriaAnimal(doc) || doc.categoria;
    doc[marcador] = fechaProximoCambioCategoria(doc);
};

const invalidarAgenda = (update) => {
    if (!update || Array.isArray(update)) return;
    if (tocaCategoria(update.$set || update) || tocaCategoria(update.$unset)) {
        if (update.$set) delete update.$set[marcador];
        update.$unset = { ...update.$unset, [marcador]: 1 };
    }
};

module.exports = function agendaCategoria(schema) {
    schema.pre('validate', function () {
        if (this.isNew || relevantes.some((campo) => this.isModified(campo))) {
            prepararAgenda(this);
        }
    });
    schema.pre('insertMany', function (next, documentos) {
        documentos.forEach(prepararAgenda);
        next();
    });
    for (const metodo of ['findOneAndUpdate', 'updateOne']) schema.pre(metodo, async function () {
        const update = this.getUpdate();
        if (!update || Array.isArray(update) || (!tocaCategoria(update.$set || update) && !tocaCategoria(update.$unset))) return;
        const opciones = this.getOptions();
        const anterior = await this.model.findOne(this.getFilter()).select('fechaNacimiento sexo especie estado categoria')
            .setOptions({ session: opciones.session, omitirAislamientoOrganizacion: opciones.omitirAislamientoOrganizacion,
                omitirAislamientoFinca: opciones.omitirAislamientoFinca }).lean();
        if (!anterior && !opciones.upsert) return;
        const siguiente = { ...anterior, ...update.$setOnInsert, ...(update.$set || update) };
        Object.keys(update.$unset || {}).forEach((campo) => { delete siguiente[campo]; });
        update.$set = { ...(update.$set || {}), [marcador]: fechaProximoCambioCategoria(siguiente) };
        if (!siguiente.estado || siguiente.estado === 'Activo') {
            const categoria = obtenerCategoriaAnimal(siguiente);
            if (categoria) update.$set.categoria = categoria;
        } else if (anterior?.estado === 'Activo') {
            const fechaBaja = siguiente.estado === 'Vendido' ? siguiente.fechaVenta : siguiente.fechaMuerte;
            update.$set.categoria = obtenerCategoriaAnimal({ ...siguiente, estado: 'Activo' }, fechaBaja || new Date()) || anterior.categoria;
        } else if (anterior?.categoria) update.$set.categoria = anterior.categoria;
        if (update.$unset) delete update.$unset[marcador];
        if (update.$unset && Object.hasOwn(update.$set, 'categoria')) delete update.$unset.categoria;
        this.setUpdate(update);
    });
    schema.pre('updateMany', function () { invalidarAgenda(this.getUpdate()); });
    schema.pre('bulkWrite', function (next, operaciones, opciones = {}) {
        if (!opciones.agendaCategoriaPreparada) for (const op of operaciones) {
            if (op.insertOne?.document) prepararAgenda(op.insertOne.document);
            if (op.replaceOne?.replacement) prepararAgenda(op.replaceOne.replacement);
            for (const tipo of ['updateOne', 'updateMany']) if (op[tipo]) invalidarAgenda(op[tipo].update);
        }
        next();
    });
    for (const metodo of ['replaceOne', 'findOneAndReplace']) schema.pre(metodo, function () {
        const update = this.getUpdate();
        if (update) prepararAgenda(update);
    });
};
