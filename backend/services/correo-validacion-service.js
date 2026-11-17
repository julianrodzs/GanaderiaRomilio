const isEmail = require('validator/lib/isEmail');

const correoValido = (correo) => typeof correo === 'string'
    && isEmail(correo, { allow_display_name: false, require_tld: true, allow_ip_domain: false });
const MATCH_USUARIO_CON_CORREO = { estado: 'Activo', sinAccesoCorreo: { $ne: true } };

module.exports = { correoValido, MATCH_USUARIO_CON_CORREO };
