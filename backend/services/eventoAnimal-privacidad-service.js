const { rolTienePermiso } = require('../config/permisosRoles');

const CLAVES_COMERCIALES = [
    /^monto/i,
    /^precio/i,
    /^subtotal$/i,
    /^moneda$/i,
    /^comprador/i,
    /^proveedor/i,
    /^identificacionComprador$/i,
    /^telefonoComprador$/i
];

const puedeVerDatosComerciales = (rol) => (
    rolTienePermiso(rol, 'finanzas.ver')
    || rolTienePermiso(rol, 'compras.ver')
    || rolTienePermiso(rol, 'ventas.ver')
);

const esClaveComercial = (clave) => CLAVES_COMERCIALES.some((patron) => patron.test(String(clave || '')));

const filtrarDatosComerciales = (valor) => {
    if (Array.isArray(valor)) return valor.map(filtrarDatosComerciales);
    if (!valor || typeof valor !== 'object' || valor instanceof Date) return valor;

    return Object.entries(valor).reduce((resultado, [clave, contenido]) => {
        if (!esClaveComercial(clave)) resultado[clave] = filtrarDatosComerciales(contenido);
        return resultado;
    }, {});
};

const esEventoComercial = (evento = {}) => (
    ['Compra', 'Venta'].includes(evento.tipoEvento)
    || ['Compras', 'Ventas', 'Finanzas'].includes(evento.moduloOrigen)
);

const serializarEventoParaRol = (evento, rol) => {
    const datos = typeof evento?.toObject === 'function' ? evento.toObject() : { ...evento };
    if (!esEventoComercial(datos) || puedeVerDatosComerciales(rol)) return datos;

    const esVenta = datos.tipoEvento === 'Venta' || datos.moduloOrigen === 'Ventas';
    return {
        ...datos,
        titulo: esVenta ? 'Animal vendido' : 'Animal comprado',
        descripcion: esVenta ? 'Salida de inventario registrada.' : 'Ingreso de inventario registrado.',
        metadata: {
            ...filtrarDatosComerciales(datos.metadata || {}),
            datosComercialesOcultos: true
        }
    };
};

module.exports = {
    filtrarDatosComerciales,
    puedeVerDatosComerciales,
    serializarEventoParaRol
};
