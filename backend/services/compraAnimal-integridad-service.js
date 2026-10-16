const normalizarId = (valor) => String(valor?._id || valor || '');
const normalizarTexto = (valor) => String(valor || '').trim();

const errorIntegridad = (mensaje) => Object.assign(new Error(mensaje), {
    status: 409,
    code: 'PURCHASE_ANIMAL_IDENTITY_IMMUTABLE'
});

const preservarIdentidadAnimalesCompra = (animalesRecibidos = [], animalesActuales = []) => {
    if (!Array.isArray(animalesRecibidos) || animalesRecibidos.length !== animalesActuales.length) {
        throw errorIntegridad('Una compra confirmada no permite agregar ni quitar animales. Gestione el inventario desde el módulo correspondiente.');
    }

    const porId = new Map(animalesActuales.map((item) => [normalizarId(item.animal), item]));
    const porCodigo = new Map();
    animalesActuales.forEach((item) => {
        [item.diio, item.identificadorFinca].filter(Boolean).forEach((codigo) => porCodigo.set(normalizarTexto(codigo), item));
    });

    const usados = new Set();
    const resultado = animalesRecibidos.map((recibido) => {
        const idRecibido = normalizarId(recibido.animal);
        const actual = (idRecibido && porId.get(idRecibido))
            || porCodigo.get(normalizarTexto(recibido.diio || recibido.identificadorFinca));
        const idActual = normalizarId(actual?.animal);
        if (!actual || !idActual || usados.has(idActual)) {
            throw errorIntegridad('No se puede sustituir un animal de una compra confirmada. El registro debe conservar su identidad e historial.');
        }
        usados.add(idActual);
        return {
            animal: actual.animal,
            identificadorFinca: actual.identificadorFinca,
            diio: actual.diio,
            nombre: actual.nombre,
            sexo: actual.sexo,
            objetivoProductivo: actual.objetivoProductivo,
            raza: actual.raza,
            fechaNacimiento: actual.fechaNacimiento,
            pesoCompraKg: recibido.pesoCompraKg,
            precioKg: recibido.precioKg,
            observaciones: recibido.observaciones
        };
    });

    if (usados.size !== animalesActuales.length) {
        throw errorIntegridad('La edición debe conservar todos los animales originales de la compra.');
    }
    return resultado;
};

module.exports = { preservarIdentidadAnimalesCompra };
