const { Types } = require('mongoose');

const normalizarId = (valor) => {
    if (valor == null || valor === '') return null;
    // ObjectId.id es un Buffer; resolver ObjectId antes que los objetos de usuario.
    const candidato = valor instanceof Types.ObjectId ? valor.toHexString()
        : typeof valor === 'object' ? valor._id || valor.id : valor;
    const texto = candidato instanceof Types.ObjectId ? candidato.toHexString() : candidato;
    if (typeof texto !== 'string' || !/^[a-f\d]{24}$/i.test(texto)) {
        throw Object.assign(new Error('Identificador inválido.'), { status: 400 });
    }
    return texto.toLowerCase();
};

module.exports = { normalizarId };
