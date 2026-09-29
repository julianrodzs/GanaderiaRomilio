const { AsyncLocalStorage } = require('async_hooks');

const almacenamiento = new AsyncLocalStorage();

const ejecutarConOrganizacion = (organizacionId, callback, fincaId = null) => almacenamiento.run(
    {
        organizacionId: organizacionId?.toString() || null,
        fincaId: fincaId?.toString() || null
    },
    async () => callback()
);

const obtenerOrganizacionActual = () => almacenamiento.getStore()?.organizacionId || null;
const obtenerFincaActual = () => almacenamiento.getStore()?.fincaId || null;

module.exports = {
    ejecutarConOrganizacion,
    obtenerFincaActual,
    obtenerOrganizacionActual
};
