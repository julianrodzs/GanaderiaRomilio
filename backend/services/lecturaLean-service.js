const mongoose = require('mongoose');

const minimizarObjetos = (valor) => {
    if (!valor || typeof valor !== 'object' || valor._bsontype || valor instanceof Date || Buffer.isBuffer(valor)) return;
    if (Array.isArray(valor)) { valor.forEach(minimizarObjetos); return; }
    for (const [clave, hijo] of Object.entries(valor)) {
        minimizarObjetos(hijo);
        if (hijo && Object.getPrototypeOf(hijo) === Object.prototype && Object.keys(hijo).length === 0) delete valor[clave];
    }
};

// Conserva los defaults y la seleccion publica sin hidratar documentos Mongoose.
const prepararLecturaLean = (Modelo, datos, { seleccion, populate = [] } = {}) => {
    if (!datos || datos._bsontype) return datos;
    const originales = new Set(Object.keys(datos));
    Modelo.applyDefaults(datos);
    const permitidos = seleccion ? new Set(['_id', ...seleccion.split(/\s+/)]) : null;
    for (const [campo, schemaType] of Object.entries(Modelo.schema.paths)) {
        if (schemaType.options.select === false) delete datos[campo];
    }
    if (permitidos) for (const campo of Object.keys(datos)) {
        if (!originales.has(campo) && !permitidos.has(campo)) delete datos[campo];
    }
    for (const referencia of populate) {
        const schemaType = Modelo.schema.path(referencia.path);
        const Ref = mongoose.models[schemaType?.options?.ref];
        if (!Ref) continue;
        const visitar = (objeto, partes) => {
            if (Array.isArray(objeto)) return objeto.forEach((item) => visitar(item, partes));
            if (!objeto || !partes.length) return;
            const [campo, ...resto] = partes;
            if (resto.length) visitar(objeto[campo], resto);
            else if (objeto[campo] && !objeto[campo]._bsontype && objeto[campo]._id) {
                prepararLecturaLean(Ref, objeto[campo], { seleccion: referencia.select, populate: referencia.populate ? [referencia.populate] : [] });
            }
        };
        visitar(datos, referencia.path.split('.'));
    }
    minimizarObjetos(datos);
    return datos;
};

module.exports = { prepararLecturaLean };
