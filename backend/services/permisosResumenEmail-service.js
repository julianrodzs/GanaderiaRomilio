const { rolTienePermiso } = require('../config/permisosRoles');

const normalizarModulosResumen = (modulos = {}, rol) => ({
    resumenGanadero: modulos.resumenGanadero === true,
    finanzas: modulos.finanzas === true && rolTienePermiso(rol, 'finanzas.ver'),
    tareasPendientes: modulos.tareasPendientes === true,
    radarOperativo: modulos.radarOperativo !== false && (rolTienePermiso(rol, 'reproduccion.ver') || rolTienePermiso(rol, 'sanidad.ver'))
});

const puedeSolicitarFinanzas = (rol) => rolTienePermiso(rol, 'finanzas.ver');

module.exports = {
    normalizarModulosResumen,
    puedeSolicitarFinanzas
};
